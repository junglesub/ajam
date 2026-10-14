# 설정 로그 팝업과 미읽음 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** 설정에서 개인 로그와 관리자 사이트 오류를 조회하고 사용자별 미읽음 경고·오류를 헤더에 표시한다.

**Architecture:** 기존 logger의 콘솔 출력과 독립된 sink가 안전한 event를 제한된 큐를 통해 SQLite에 저장한다. 인증된 server action이 사용자별 visibility와 읽음을 처리하고, 헤더의 공유 provider와 독립 로그 팝업이 이를 조회한다.

**Tech Stack:** 기존 Node 24.15.0, Next.js App Router, React, TypeScript, SQLite/Prisma raw SQL, node:test, tsx, BroadcastChannel.

**Spec:** [설정 로그 팝업과 미읽음 알림 기획](../specs/2026-10-07-log-viewer-design.md). 상태: 검토용 계획. 사용자 답변 3건을 반영했다. 보관/갱신 기본값 등 기획 검토 후 구현에 착수한다.

## Global Constraints

- 새 의존성을 추가하지 않는다. 기존 SQLite runtime bootstrap을 따른다.
- README 대신 관련 docs를 갱신한다. 사용자 요청 전 build를 실행하지 않는다.
- info/warn/error를 저장하고 debug를 제외한다. 콘솔 `AJAM_LOG_LEVEL`과 UI 수집 수준은 독립적이다.
- 자유 형식 error/message/stack, token/key/header/본문/DB 경로를 영속 저장하지 않는다.
- metadata 최대 UTF-8 4 KiB, 선택 문자열 최대 256자. 소유권 ID를 잘라 저장하지 않는다.
- 큐 1,000건, flush batch 100건, 수집 실패 console 요약 60초당 1회.
- info 7일, warn/error 30일, 총 50,000건. UTC cutoff 이하 삭제, info부터 수량 정리.
- list/관련 로그 page 50건, 배지 `99+`, 헤더 polling 30초, 열린 팝업 요약 polling 10초.
- 읽음은 사용자별 단건 receipt. 모두 읽음은 현재 탭의 snapshot까지이며 필터와 무관하다.
- 관리자 사이트 범위는 userId 없는 서버 공통 warn/error만이다. 관리자도 다른 사용자 로그에 접근하지 못한다.

## Review Focus

1. 예약 배치가 같은 operationId로 여러 사용자를 처리해도 일반 사용자와 관리자에게 다른 사람의 로그가 보이지 않아야 한다 — Task 1/3.
2. 모두 읽음과 새 기록이 경합하거나 두 관리자/장치가 동시에 읽어도 receipt가 섞이거나 새 오류가 사라지지 않아야 한다 — Task 1.
3. DB 장애/초기화와 로그 쓰기가 순환하거나 원래 저장·응답을 바꾸지 않아야 한다 — Task 2.
4. 숨겨진 모바일 설정 버튼이 별도 polling을 만들거나 오래된 응답/로그인 전환이 새 상태를 덮어쓰지 않아야 한다 — Task 4.
5. 접근 불가/만료/삭제된 ID와 role 회수 후 상세/관련 로그 접근은 목록과 같은 권한을 따라야 한다 — Task 1/3/4.

## 공통 계약과 파일 책임

`packages/db/src/operation-log.ts`에서 DB에 의존하지 않는 `LogLevel`, `OperationLogEvent`, sink/suppression 계약을 export한다. `LogLevel = "debug" | "info" | "warn" | "error"`. Event는 eventId/timestamp/level/component/operation/result/operationId/durationMs와 선택 userId/source/dateKey 및 scalar `fields: LogFields`를 가진다. metadata의 자유 error 필드는 event 단계에 있을 수 있지만 persistence projection에서 제거한다.

`packages/db/src/operation-log-store.ts`가 projection/schema/SQL/retention을 소유한다. 조회 DTO 타입도 여기서 export하고 client에서는 type-only import한다.

- `LogViewer = { userId: string; role: "ADMIN" | "USER" }`
- `LogScope = "mine" | "site"`; site는 ADMIN만, userId가 null인 warn/error만 접근 가능.
- `StoredLogLevel = "info" | "warn" | "error"`
- `LogQuery = { scope: LogScope; levels?: StoredLogLevel[]; component?: string; periodDays: 1 | 7 | 30; unreadOnly?: boolean; beforeId?: number }`
- `VisibleOperationLog`: id, timestamp, level, component, operation, result, operationId, durationMs, userId/source/dateKey(nullable), safe metadata, unread.
- `LogPage = { items: VisibleOperationLog[]; nextCursor: number | null; snapshotMaxId: number }`
- `LogDetail = { item: VisibleOperationLog; related: LogPage }`
- `UnreadLogSummary = { mine: number; site: number; total: number; canViewSite: boolean }`. USER의 site는 0, total은 mine이다. ADMIN total은 mine + site이며 두 집합은 겹치지 않는다.
- `LogActionResult<T> = { ok: true; viewerUserId: string; data: T } | { ok: false; code: "unauthenticated" | "forbidden" | "invalid_input" | "not_found" | "unavailable" }`. 성공 응답의 viewerUserId는 실제 세션/DB에서 결정한다.

DB store에 viewer는 신뢰된 서버만 전달한다. 브라우저 request에는 viewer/userId/role이 없다. 모든 id/cursor/snapshot은 안전한 양의 정수(snapshot 0은 허용)여야 한다.

### Task 1: 안전한 SQLite 저장소와 사용자별 읽음

**Files:** Create `packages/db/src/operation-log-store.ts`, `packages/db/src/operation-log-store.test.ts`, `docs/db-migrations/2026-10-07-operation-logs.sql`; Modify `packages/db/src/operation-log.ts`(event type만), `packages/db/src/index.ts`, `packages/db/package.json`.

**Interfaces:**

- `projectOperationLog(event: OperationLogEvent): PersistableOperationLog | null` — debug 제외, 기획의 필드 allowlist/크기 적용.
- `ensureOperationLogSchema(): Promise<void>`
- `appendOperationLogs(events: OperationLogEvent[]): Promise<void>` — projection된 row를 batch transaction으로 저장, eventId unique로 중복 삽입 방지.
- `listVisibleOperationLogs(viewer: LogViewer, query: LogQuery): Promise<LogPage>`
- `getVisibleOperationLogDetail(viewer: LogViewer, id: number, beforeRelatedId?: number): Promise<LogDetail | null>`
- `getUnreadLogSummary(viewer: LogViewer): Promise<UnreadLogSummary>`
- `markOperationLogRead(viewer: LogViewer, id: number): Promise<boolean>` — 접근 불가/만료는 false, 접근 가능한 info는 receipt 없이 true.
- `markAllOperationLogsRead(viewer: LogViewer, scope: LogScope, snapshotMaxId: number): Promise<void>`
- `pruneOperationLogs(now: Date): Promise<void>` — 7/30일 및 50,000건 정책. 테스트용 시계는 명시 인자로 고정.
- `PersistableOperationLog`는 event의 저장 가능한 기본 필드와 safe metadataJson을 가진다. SQL 내부 타입이며 client에 보내지 않는다.

- [ ] 임시 SQLite fixture에서 실패 테스트를 작성한다: 같은 operationId로 A/B/info/warn/error/공통 이벤트를 넣고 A의 목록/상세/related에는 A만, ADMIN site에는 userId null의 warn/error만 나온다고 assert한다. ADMIN도 B의 직접 ID 접근을 할 수 없고, USER site는 접근 거절이어야 한다.

  각 사용자와 공통 범위에 info/warn/error를 한 건씩 넣은 fixture의 핵심 assertion:

  ```ts
  const mine = await listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "mine", periodDays: 7 });
  assert.deepEqual(mine.items.map((log) => log.level).sort(), ["error", "info", "warn"]);
  assert.ok(mine.items.every((log) => log.userId === "A"));
  const site = await listVisibleOperationLogs({ userId: "M1", role: "ADMIN" }, { scope: "site", periodDays: 7 });
  assert.deepEqual(site.items.map((log) => log.level).sort(), ["error", "warn"]);
  assert.ok(site.items.every((log) => log.userId === null));
  ```

- [ ] `pnpm --filter @timesheet/db exec node --import tsx --test src/operation-log-store.test.ts`로 아직 구현되지 않은 계약의 실패를 확인한다.
- [ ] schema와 index를 만들고 raw SQL parameter binding/단일 visibility 조건을 재사용해 구현한다. 테이블 생성/CRUD에서는 공통 logger를 호출하지 않는다. package에 `./operational-logs` subpath와 테스트 script 항목을 추가한다.
- [ ] projection 테스트: sentinel token/body/error/path를 넣었을 때 JSON에 없고 본인의 선택 status/pageId는 남아야 한다. metadata byte length <= 4096, debug/oversize ownership ID/소유권 없는 사용자용 operation의 이벤트는 projection이 null이어야 한다. 공통 로그는 기획의 명시적 운영 단계만 허용한다.
- [ ] 읽음 테스트: 관리자 M1이 공통 오류를 읽어도 M2는 미읽음, M1 total은 본인 미읽음과 공통 미읽음의 합이어야 한다. snapshot은 필터에 가려진 동일 탭의 항목도 포함한다. snapshot S 뒤에 삽입한 S+1은 mark-all 후에도 미읽음. 두 번 호출은 멱등이다. 없는/타인 ID와 info 상세는 receipt를 만들지 않는다.
- [ ] 보관 테스트: UTC 7/30일 경계와 50,001건(info 우선 삭제), receipt 정리, 재초기화/재연결 후 로그·읽음 유지, 같은 timestamp의 cursor 페이지 중복 없음과 related pagination을 assert한다. 오래된 row는 cleanup 전에도 조회/count/read에서 제외한다.
- [ ] 위 focused test와 `pnpm --filter @timesheet/db typecheck`를 통과시키고 schema reference를 비교한다. Task 1만 범위 지정해 커밋한다.

### Task 2: 기존 logger의 console 보존과 비동기 수집

**Files:** Modify `packages/db/src/operation-log.ts`, `packages/db/src/operation-log.test.ts`, `apps/web/src/instrumentation.ts`, `packages/db/package.json`; Create `apps/web/src/server/operational-logging.ts`, `packages/db/src/log-persistence-queue.ts`, `packages/db/src/log-persistence-queue.test.ts`.

**Interfaces:**

- Logger: `setOperationLogSink(sink: ((event: OperationLogEvent) => void) | null): void`; `withoutOperationLogPersistence<T>(task: () => T): T` — async task의 ALS scope도 유지한다.
- Queue: `createLogPersistenceQueue(writeBatch: (events: OperationLogEvent[]) => Promise<void>): { enqueue(event: OperationLogEvent): void; flush(): Promise<void> }`. capacity/batch/drop/rate-limit은 Global Constraints 값으로 고정한다. write failure는 외부로 throw하지 않는다.
- Web bootstrap: `initializeOperationalLogging(): Promise<void>` — 중복 등록 방지, sink를 먼저 설치한 뒤 subpath로 store를 dynamic import, schema 초기화, 큐 drain 및 prune 연결.
- Consumes Task 1 append/schema/prune. 큐는 logger/Prisma를 import하지 않는다. store lazy loading으로 순환 import를 피한다.

- [ ] logger 테스트에서 `AJAM_LOG_LEVEL=error`일 때 info가 console에는 없고 sink에는 한 번 전달되는지 assert한다. debug는 UI queue에 전달하지 않는다. sink throw에도 기존 `.run()` 결과/원래 예외/응답 객체가 보존되는지 확인한다.
- [ ] queue 실패 테스트를 실행한 뒤 FIFO batch 최대 100, 큐 최대 1,000, info 우선 drop/없으면 oldest drop, 단일 writer, 실패 batch 폐기 후 다음 flush 재개를 구현한다. 직접 console 요약은 안전한 reason/count만 사용한다.
- [ ] sink에 console 출력 전 안전 event를 전달하고 eventId를 한 번만 생성한다. `withoutOperationLogPersistence`의 async/concurrent scope를 테스트하여 다른 요청의 수집은 중단하지 않는다고 assert한다.
- [ ] instrumentation.register에서 Node runtime에만 초기화하고 기존 startup 로그를 남긴다. sink/queue 등록 상태는 globalThis에 보관해 HMR/모듈 중복 초기화에도 중복 writer를 만들지 않는다. DB 초기화 실패를 catch해 console에 기록하되 서버 초기화 결과를 로그 기능 때문에 throw하지 않는다. 성공 batch 뒤 정리 주기/수량 상한을 적용한다.
- [ ] clock을 mock해 console 요약 60초 제한, persistence 실패가 또 persistence를 호출하지 않음, 재등록의 중복 event 방지를 테스트한다. 큐 flush는 테스트 종료 전 반드시 await한다.
- [ ] `.run()` sink 장애 테스트의 핵심 assertion은 `assert.equal(await log.run(async () => originalResult), originalResult)`와 `await assert.rejects(log.run(async () => { throw originalError; }), (error) => error === originalError)`이다. 기존 API Response는 `assert.equal(response, originalResponse)`로 참조까지 보존한다.
- [ ] `pnpm --filter @timesheet/db exec node --import tsx --test src/operation-log.test.ts src/log-persistence-queue.test.ts src/operation-log-store.test.ts`를 PASS로 만들고 DB/web typecheck 후 Task 2 범위를 커밋한다.

### Task 3: 인증된 조회/읽음 action과 소유권 연결

**Files:** Create `apps/web/src/server/log-viewer-access.ts`, `apps/web/src/app/(app)/logs/actions.ts`, `packages/db/src/log-viewer-access.test.ts`; Modify `apps/web/src/app/(app)/timesheet/actions.ts`, `apps/web/src/app/(app)/notion-cards/actions.ts`, `apps/web/src/server/timesheet-ai-cleanup.ts`, `packages/db/src/notion-webhook.ts`, `packages/db/src/operational-logging.test.ts`, `packages/db/package.json`.

**Interfaces:**

- Access: `resolveLogViewer(session: { userId: string } | null, loadUser: (id: string) => Promise<{ id: string; role: "ADMIN" | "USER" } | null>): Promise<LogViewer | null>`. actions가 `getSession()`과 `getManagedUser`를 공급한다.
- Actions: `listOperationLogsAction(query: LogQuery): Promise<LogActionResult<LogPage>>`; `getOperationLogDetailAction(id: number, beforeRelatedId?: number): Promise<LogActionResult<LogDetail>>`; `getUnreadOperationLogsAction(): Promise<LogActionResult<UnreadLogSummary>>`; `markOperationLogReadAction(id: number): Promise<LogActionResult<UnreadLogSummary>>`; `markAllOperationLogsReadAction(scope: LogScope, snapshotMaxId: number): Promise<LogActionResult<UnreadLogSummary>>`.
- Consumes Task 1 store and Task 2 suppression. 성공한 mark action은 최신 count를 반환한다. 출력은 안전한 DTO로 제한한다.

- [ ] access 테스트에서 session 없음/사용자 삭제는 null, cookie의 과거 ADMIN role과 무관하게 loadUser의 현재 USER role을 따른다고 assert한다. schema/query failure는 action에서 고정 unavailable 결과로 매핑한다.

  ```ts
  assert.equal(await resolveLogViewer(null, async () => null), null);
  assert.deepEqual(await resolveLogViewer({ userId: "A" }, async () => ({ id: "A", role: "USER" })), { userId: "A", role: "USER" });
  ```

- [ ] actions를 구현한다. action 전체(인증 확인 포함)를 persistence suppression scope에 둔다. scope/levels/period/component allowlist와 id/cursor를 검증하고, forbidden site/not-found ID를 분리하되 타인 ID와 없는 ID는 동일 결과로 반환한다.
- [ ] 기존 로그의 소유권을 검토한다. userId context가 없는 사용자 설정/공휴일 키 테스트에는 검증된 사용자 context를 연결한다. Webhook의 검증된 userId field와 배치 사용자별 logger를 projection에 반영한다. 사용자 전환 시 이전 사용자의 context를 상속하지 않도록 명시 override한다. 전역 schema/client 로그는 userId를 제거하는 방식을 고정한다. 공통 allowlist에 해당하지 않는 소유권 누락은 저장하지 않는다.
- [ ] 기존 Notion/AI 테스트에 sink를 붙여 사용자별 후보 실패, 카드 업데이트 실패와 예약 작업 오류가 올바른 사용자에게 보이는지 확인한다. 공통 인증/서버 오류의 userId는 null이며 본인으로 추정하지 않는다고 assert한다.
- [ ] focused `log-viewer-access`/`operational-logging`/store 테스트와 DB/web typecheck를 실행한다. dev 앱에서 일반 사용자의 site 접근 거절, 일반 사용자와 관리자의 타인 ID/동일 batch operationId 접근 차단을 확인하고 Task 3을 커밋한다.

### Task 4: 공유 미읽음 상태, 팝업, 데스크톱/모바일 배지

**Files:** Create `apps/web/src/components/logs/log-viewer-provider.tsx`, `apps/web/src/components/logs/log-viewer-modal.tsx`, `apps/web/src/lib/log-viewer-state.ts`, `apps/web/src/lib/log-viewer-state.test.mjs`, `apps/web/src/lib/log-presentation.ts`, `apps/web/src/lib/log-presentation.test.mjs`; Modify `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/app-settings-button.tsx`, `apps/web/src/app/(app)/mobile-app-menu.tsx`.

**Interfaces:**

- `LogViewerProvider({ userId, children }: { userId: string; children: ReactNode })` — 최초 조회를 담당하고 layout을 감싼다. 로그 조회 실패는 자식 화면과 업무 데이터 로딩을 중단시키지 않는다.
- `useLogViewer(): { summary: UnreadLogSummary | null; stale: boolean; refresh(): Promise<void>; notifyReadChanged(): void; setModalOpen(open: boolean): void }` — 팝업의 mount/unmount가 setModalOpen을 호출해 provider의 polling 간격을 전환한다.
- `LogViewerModal({ onClose }: { onClose(): void })` — action에서 목록/상세를 조회한다. 현재 탭/필터/cursor/snapshot을 모달에서 관리한다.
- Presentation: `formatLogSummary(log: VisibleOperationLog): string`; `formatUnreadBadge(count: number): string | null`. 알 수 없는 operation은 고정된 일반 처리 문구로 표시한다.
- State: `getLogPollInterval(visible: boolean, modalOpen: boolean): 10000 | 30000 | null`; `shouldApplyLogResponse(current: { userId: string; requestId: number }, incoming: { userId: string; requestId: number }): boolean`.
- Consumes Task 3 actions. unauthenticated/forbidden 응답은 해당 cache를 제거하고, unavailable 응답은 마지막 성공 count와 stale 표시를 유지한다. 성공 응답의 viewerUserId가 provider와 다르면 모든 로그 cache를 제거하고 router.refresh로 실제 사용자 정보를 다시 읽는다.

- [ ] pure helper 테스트: badge 0→null, 99→`99`, 100→`99+`; unknown/error sentinel message는 UI 문구에 포함하지 않음; info started는 성공 완료로 표시하지 않음. poll hidden→null, visible→30000, modal→10000; 이전 requestId/다른 userId 응답 적용 false를 assert한다.

  ```js
  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(100), "99+");
  assert.equal(getLogPollInterval(false, true), null);
  assert.equal(shouldApplyLogResponse({ userId: "A", requestId: 2 }, { userId: "B", requestId: 2 }), false);
  ```

- [ ] `pnpm --filter @timesheet/web exec node --experimental-strip-types --test src/lib/log-viewer-state.test.mjs src/lib/log-presentation.test.mjs`로 실패를 확인한 뒤 helper/provider를 구현한다. 한 provider만 timer를 소유하고 duplicate in-flight를 막는다. 채널 `ajam:log-read:<userId>`로 invalidation만 보내며 cleanup한다.
- [ ] 설정/헤더를 연결한다. 두 설정 버튼은 provider의 동일 count를 사용한다. 설정의 view state를 settings/logs로 전환해 활성 모달은 하나로 유지하고 입력 state를 보존한다. 모바일 메뉴 trigger에는 dot를 표시한다.
- [ ] 로그 팝업을 구현한다: 기본 7일/50건, 기능·수준·기간·미읽음 필터, 내 로그/site 탭, 더 보기/상세/related 더 보기, 읽음, snapshot 기반 모두 읽음. snapshot은 첫 페이지 기준을 유지하고 더 보기 응답으로 바꾸지 않는다. 상세가 성공한 뒤에만 mark action을 호출한다. 새 로그는 안내만 하고 스크롤을 바꾸지 않는다.
- [ ] modal DOM 접근성/포커스/scroll lock/테마를 기존 mobile menu 패턴에 맞춘다. 설정→로그→설정 전환 때 복구 대상을 정확히 유지한다. 권한 회수 응답은 site 목록을 즉시 비우고 mine으로 전환한다.
- [ ] helper 테스트와 web typecheck/변경 파일 eslint 후 dev 앱에서 desktop/mobile·라이트/다크·키보드 이동·다중 탭·조회 실패·role 회수·상세 읽음 실패를 직접 확인한다. 소스 문자열만 확인하는 UI 테스트로 검증을 대체하지 않는다. Task 4를 커밋한다.

### Task 5: 통합 확인과 운영 문서 갱신

**Files:** Modify `packages/db/src/operational-logging.test.ts`, `packages/db/package.json`, `docs/architecture.md`, 본 기획/계획(확정 정책/체크 상태).

- [ ] 통합 fixture로 Notion 후보 API 실패와 cache fallback, 업무 저장 성공+Notion 업데이트 실패, Gemini 실패, 공통 API 인증 거절을 발생시킨다. console과 저장 event, 일반 사용자 조회, 관리자 site count/receipt를 함께 assert한다. 일반 업무 성공은 유지되어야 한다.
- [ ] 로그 viewer의 목록/읽음 호출을 반복해 stored event/count가 증가하지 않는지 확인한다. 재연결 후 receipt 유지와 persistence 장애 중 원래 업무 응답 보존을 검증한다.
- [ ] `pnpm --filter @timesheet/db test`, `pnpm --filter @timesheet/db typecheck`, `pnpm --filter @timesheet/web typecheck`, Task 4 helper 테스트, 변경 파일 `pnpm exec eslint <changed-files>`, `git diff --check`를 실행해 결과를 남긴다. 기존 test script에는 새 DB 테스트를 전부 포함한다.
- [ ] architecture의 계획 링크를 구현 설명으로 갱신한다: UI 진입점/권한/보관/drop/읽음/30초 지연/DB 장애·종료 시 큐 유실/콘솔 수준과 저장 수준 차이. 최신 검증 결과와 실제 수동 확인 범위를 기록한다.
- [ ] 미읽음 경합/사용자 격리/수집 재귀/권한 회수 체크를 중심으로 최종 코드 리뷰를 진행하고 발견된 문제를 수정한 뒤 필요한 체크만 다시 실행한다. Task 5를 커밋한다.

## 계획 검토와 실행

기획의 화면·권한·저장·읽음·보관·갱신 요구사항은 Task 1–5에 대응한다. Task 1의 DTO/visibility 계약을 먼저 고정해야 Task 2–4를 안전하게 연결할 수 있다. 구현은 순서대로 현재 세션에서 직접 진행하는 방법을 권장한다. 이 요청에서는 문서까지만 작성하며 build를 실행하지 않는다.

## 2026-10-14 독립 검수 — 01c1a71, NO-GO

OpenCode run `r_87e791fa9b64`는 구현 완료와 DB 테스트 32개/web helper 5개/typecheck/eslint 통과를 보고했다. coordinator는 같은 테스트를 재실행하지 않고 실제 diff와 관련 코드를 정적으로 검수했다. 실제 브라우저 검증은 worker가 수행하지 않았다.

승인 전 수정할 사항:

1. **P1 — 운영 중 큐 drain 없음.** `operational-logging.ts`는 enqueue만 등록하며 `queue.flush()`를 호출하거나 예약하지 않는다. 큐 구현에도 자동 flush가 없다. 테스트만 수동 flush하므로 운영 로그는 저장되지 않는다. 실제 bootstrap → logger → DB 경로의 자동 저장 테스트가 필요하다.
2. **P1 — related SQL 파라미터 순서 오류.** `operation-log-store.ts`의 related query에서 제외할 row.id보다 viewerUserId/infoCutoff를 먼저 바인딩한다. 본인 관련 목록이 비고 공통 목록의 cutoff가 잘못된다. 공통 related 조건에는 warn/error 제한도 없다. 구체적 예상 related ID와 페이지 길이를 검증하고 공통 info 제외를 확인해야 한다.
3. **P1 — 팝업 응답/권한/사용자 전환 guard 없음.** `log-viewer-modal.tsx`는 모든 성공 응답의 viewerUserId를 무시하고 목록/상세/페이지 요청의 세대·선택 ID도 확인하지 않는다. role 회수로 탭 버튼이 사라져도 기존 site 목록/상세를 제거하지 않는다. identity/permission 변경과 지연 응답 시 캐시를 제거하고 오래된 결과/읽음 동작을 막아야 한다.
4. **P1 — snapshot 조회 경합.** 목록 SELECT 뒤에 별도 MAX(id)를 조회한다. 그 사이 신규 삽입이 되면 보지 않은 새 로그까지 모두 읽음의 snapshot에 들어간다. snapshot을 먼저 고정하고 목록을 그 ID 이하로 제한하거나 동일 read snapshot에서 원자적으로 읽어야 한다.
5. **P2 — 팝업 portal/진단 정보/읽음 재시도 누락.** 로그 모달을 header/drawer 아래에 직접 렌더해 기존 portal 설정과 배경/포커스 동작이 달라진다. 상세에 safe metadata·오류 코드·상태·날짜·시간이 표시되지 않아 원인 진단을 할 수 없다. 읽음 실패도 재시도 버튼이 없다. 기존 body portal 패턴과 포커스 반환, 안전 진단 필드, 재시도를 구현하고 desktop/mobile 브라우저에서 확인해야 한다.
6. **P2 — 50,000건 상한이 배치마다 보장되지 않음.** bootstrap은 1시간마다만 prune하며 append는 상한을 확인하지 않는다. 많이 수집하면 그 시간 동안 상한을 초과한다. 기간 정리 주기와 별도로 배치 후 수량 제한을 지켜야 한다. 대량 overflow를 ID placeholder 전체 배열로 삭제하지 않아 SQLite bind 상한에도 안전해야 한다.

수정은 OpenCode에 후속 dispatch한다. coordinator는 worker 변경을 직접 구현하지 않는다. 수정 결과를 받은 뒤 신규 diff와 연결 코드를 다시 독립 검수해 GO/NO-GO를 갱신한다.

### 2026-10-14 후속 수정 (worker `r_075668b54c70`, commit 01c1a71 이후)

6개 항목을 모두 수정하고 아래 회귀로 검증했다. 최종 GO 선언은 하지 않으며 독립 검수를 요청한다.

1. 운영 drain: `operational-logging.ts`가 2초 간격(unref) 단일 전역 drain을 시작한다. sink 등록·큐 생성·drain 시작은 최초 1회만 수행되어 HMR/중복 초기화에도 writer가 늘지 않는다. suppression은 writeBatch 내부에만 머물러 drain 중에도 업무 로그 수집이 계속된다. `log-bootstrap.test.ts`가 수동 flush 없이 logger → DB 저장, drain 후 수집 지속, 중복 초기화 단일 writer를 실제 시간으로 확인한다.
2. related: 파라미터를 명시적 순서(viewer → operationId → self id → user → cutoff → before)로 재작성했다. site 공통 related는 warn/error로 제한해 공통 info가 노출되지 않는다. store 테스트가 양쪽 related의 정확한 ID 집합과 길이, 공통 info 제외를 assert한다(빈 배열 `every()` 통과 방지).
3. 팝업 guard: 모든 action 결과의 `viewerUserId`를 provider identity와 비교해 불일치 시 캐시를 버리고 `router.refresh()`한다. 목록/상세/모두 읽음에 seq 세대를 두어 지연·역순 응답과 읽음을 버린다. `canViewSite` 상실·site `forbidden` 시 site 탭을 떠나 캐시를 제거한다.
4. snapshot: 목록을 snapshot(MAX) 고정 후 `id <= snapshot`으로 조회해 삽입 경합을 원천 제거한다. `markAll`은 표시 범위와 같은 snapshot을 사용한다. store 테스트가 삽입 후 구 snapshot mark-all에서 신규 warn이 미읽음으로 남음을 확인한다.
5. 모달: `document.body` portal 렌더, 열기 전 포커스 저장·닫힘 시 반환, 상세에 safe metadata·오류 코드·업무 날짜·소요 시간 표시, 읽음 실패 재시도 버튼을 추가했다. 브라우저 확인은 수행하지 못해 아래 한계에 기록한다.
6. 상한: `append`마다 count 후 1,000건 chunk `DELETE ... SELECT ... LIMIT`으로 info 우선 정리해 bind 상한에도 안전하다. `prune`도 같은 chunk 경로를 재사용한다. 보관 경계는 조회와 정리를 `cutoff 이하 제외`로 일치시켰다(조회는 `>` 유지, 정리는 `<=` 삭제). 경계 시각 row의 조회 제외·읽음 거절·정리 삭제를 테스트한다.
7. 새 로그 안내: summary에 범위별 최대 ID(`mineMaxId`/`siteMaxId`, info 포함)를 추가해 미읽음 count에 잡히지 않는 info 신규 로그도 `새 로그 있음` 안내가 뜬다. 목록 교체 없이 재조회 진입점만 제공한다.

브라우저 한계: desktop/mobile portal 크기·위치, Escape/Tab/포커스 반환 실동작, stale 표시, 권한 회수 UX는 실제 브라우저에서 확인하지 못했다. dev 서버 기동 + `/timesheet` 컴파일·리다이렉트 스모크만 수행했다.

### 2026-10-14 재검수 — 06a1053, NO-GO

자동 drain, related SQL 순서/범위, snapshot 선고정, 보관 경계와 상한은 실제 신규 diff에서 수정 확인했다. worker는 DB 37개/web helper 5개와 타입/lint 통과를 보고했다. 같은 테스트를 coordinator가 반복하지 않았다. 남은 항목:

- **P1 사용자 전환/상세 무효화:** modal의 `loadList` useCallback dependency에 expectedUserId/checkViewer가 없다. provider 사용자 ID가 바뀌어도 목록 재조회/캐시 제거가 일어나지 않으며 이전 closure의 identity로 응답을 판정한다. filter 변경 effect도 selectedId state만 초기화하고 selectedIdRef/detailSeq는 무효화하지 않아 이전 상세 응답의 읽음 action이 이어진다. 사용자/권한/탭/필터 변경 및 unmount가 모든 관련 요청 세대와 ref/cache를 무효화해야 한다.
- **P2 모바일 Escape/포커스:** mobile-app-menu의 window Escape handler는 로그 portal이 최상위여도 drawer를 닫는다. 로그 모달 handler도 동시에 닫혀 settings component가 unmount된다. 로그만 닫고 설정으로 복귀하도록 활성 모달만 키보드/스크롤 잠금을 소유해야 한다. 기존 설정의 로그 버튼은 로그 전환 시 제거되므로 modal이 저장한 document.activeElement에 focus하는 것만으로 설정 복귀 포커스를 보장할 수 없다.
- **P2 첫 로그/장애 표시:** snapshot 0인 빈 목록은 새 로그 effect가 무조건 return해 첫 신규 로그 안내를 못 한다. provider stale 값은 어느 소비 UI에서도 표시하지 않으며 initial/실패 summary null도 설정에서 `미읽음 없음`으로 표시한다. 빈 목록의 첫 로그 안내와 확인중/갱신 실패 상태를 구분해야 한다.
- **P2 HMR 상태 불일치:** initialize는 global initialized로 재등록을 차단하지만 sink 자체는 operation-log.ts의 module-local 변수다. 실제 logger module 재평가/중복 module copy에서는 sink가 null인 채 초기화가 건너뛰어질 수 있다. 같은 module의 initializer 재호출 테스트는 이 상황을 검증하지 않는다. 실제 공유 registry를 사용하거나 현재 module sink에 기존 queue를 다시 연결해야 한다.

worker에 범위를 좁혀 추가 수정·회귀 검증을 요청한다. browser 확인은 여전히 미실시로 남아 있으므로 성공을 선언하지 않는다.

### 2026-10-14 최종 coordinator 정적 검수 — 8f33837, GO

my-orch run `r_98d8ef761962` 완료 결과를 직접 조회한 뒤 coordinator가 `06a1053..8f33837` 실제 diff와 modal/provider/guard/mobile menu/logger 및 회귀 코드를 독립 검수했다. 이전 NO-GO 항목은 아래 구현으로 해결된 것을 정적으로 확인했다.

- userId 변경은 목록 callback을 재생성하고 이전 cache와 list/detail 세대를 무효화한다. filter/탭 변경과 unmount도 상세 선택 ref를 초기화하여 늦은 상세 응답이 읽음 처리를 이어가지 않게 한다.
- 모바일 drawer는 상위 로그 팝업이 열린 동안 Escape/Tab 처리를 중단한다. 로그 닫기 후 다시 생성된 설정의 실제 로그 버튼에 포커스를 반환한다.
- 첫 목록이 비어 있어도 준비 완료 후 새로운 범위 maxId로 신규 로그를 안내한다. summary의 loading/null/stale를 미읽음 없음과 구분하며 로그 팝업에 갱신 실패 안내를 제공한다.
- sink는 globalThis registry를 통해 logger module copy가 공유한다. query suffix로 별도 평가한 logger에서 동일 sink를 사용하고 한 번씩 수집하는 회귀 테스트를 확인했다.
- 앞선 재검수에서 확인한 자동 drain/related visibility/선고정 snapshot/보관 상한 수정도 유지됐다. 일반 사용자·관리자의 타 사용자 접근 차단 정책을 유지한다.

worker 보고 검증: DB 40개, web helper 9개 PASS, DB/web typecheck PASS, 변경 코드 eslint와 git diff --check PASS. 임시 DB의 인증된 dev `/timesheet` 200 및 미인증 307 확인. coordinator는 이 테스트를 재실행하지 않았다. build/push/merge는 수행하지 않았다.

**결론:** 코드 변경에 대한 독립 정적 검수 GO. 이는 실제 브라우저 E2E/레이아웃 검증 완료를 의미하지 않는다. 실제 팝업 상호작용, 모바일 레이아웃, 키보드 포커스·Escape, 권한 회수와 다중 탭 UX는 browser-driven 확인이 남아 있다. 알림은 정상 설계상 polling(30초/열린 팝업 10초)과 drain(2초)만큼 지연될 수 있다.

### 후속 수정 (worker `r_98d8ef761962`, 06a1053 이후)

4개 항목을 수정하고 아래 회귀로 검증했다. 최종 GO 선언은 하지 않으며 독립 검수를 요청한다.

1. 사용자 전환/무효화: `checkViewer`를 `useCallback`으로 고정해 `loadList` 의존성에 포함시켰다. 사용자 ID 변경·탭/필터 변경·권한 회수·unmount가 목록/상세 세대와 `selectedIdRef`/캐시를 모두 무효화한다. 요청은 `{userId, generation}` stamp(`lib/log-viewer-guards.ts`)로 판정하며, 늦은 A 응답·필터 변경 후 상세 읽음·admin→user를 막는다. guards 단위 테스트와 store의 admin→user 즉시 차단 테스트를 추가했다.
2. 모바일 Escape/포커스: drawer 키 핸들러는 로그 팝업이 열려 있을 때(`provider.modalOpen`) Escape/Tab 처리를 중단해 로그만 닫고 설정으로 복귀한다. 설정의 로그 버튼에 복귀 포커스를 명시적으로 돌려준다(팝업이 저장한 detached element 복원 대신). 로그 portal을 유지하고 다른 모달은 손대지 않았다.
3. 첫 로그/장애 표시: 새 로그 안내는 첫 로드 완료 후 snapshot과 범위 최대 ID를 비교해 빈 목록의 첫 info/warn도 잡는다. provider에 `loading/settled` 상태를 두어 설정에서 확인 중·연결 확인 필요·갱신 실패를 구분하고, 실패를 미읽음 0/없음으로 표시하지 않는다. 팝업에 stale 안내를 표시한다.
4. HMR sink: sink를 `operation-log.ts` module-local에서 `globalThis` 공유 registry로 옮겨 logger 재평가/중복 copy에서도 수집이 유지되고 단일 writer가 깨지지 않는다. 쿼리 suffix 중복 import로 실제 두 번째 평가를 만들어 공유·재등록을 검증하는 테스트를 추가했다(동일 모듈 재호출이 아님).

검증: DB 40개(신규 HMR 2·역할 전환 1 포함)·web helper 9개·양쪽 typecheck·변경 파일 eslint·`git diff --check` 통과. dev 앱에 temp DB+고정 secret으로 admin을 만들고 서명 세션 쿠키로 실제 로그인 렌더를 확인했다: `/timesheet` 200, 설정/모바일 버튼 SSR 정상, 미로그인 307 유지. 팝업 상호작용·drawer Escape 실동작·모바일 배치는 브라우저 부재로 미확인이며 risks에 둔다.
