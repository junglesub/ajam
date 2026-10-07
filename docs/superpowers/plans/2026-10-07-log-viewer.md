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
