# Today Workspace Implementation Plan

**2026-11-24 code acceptance is GO.** The checklist below records the earlier correction scope. The [independent verification record](2026-11-17-today-independent-review.md) records the completed checks and the remaining browser and live Notion acceptance.

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user selected Antigravity implementation with independent Codex verification.

**Goal:** Provide `/today` with multiple work tabs, persistent automatic drafts, existing Notion recommendations and allocations, and editable Notion comments.

**Architecture:** Reuse the existing daily work representation, recommendation helpers, card picker, date save rules and themed components. Persist incomplete drafts separately from confirmed work. Send comments directly to Notion through authenticated server actions.

**Tech Stack:** Next.js, React, TypeScript, Prisma and SQLite, existing pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-11-11-today-planning-design.md`

**Execution status (2026-11-18):** The expanded Today/timesheet draft integration is **NO-GO**. Round 13 accepted an earlier implementation; Rounds 14–23 record the later corrections and outstanding issues. Latest source is `b89c12e`, which arrived while this remaining-work summary was prepared. Codex inspected its diff for this summary, but its completed verification report and final connected-path acceptance remain pending. The current checklist below supersedes the historical unchecked implementation tasks later in this document.

## 남은 수정·검증 체크리스트 (2026-11-18)

기준은 `d22664e`까지의 독립 검수와 `b89c12e`의 추가 변경 확인이다. 실제 개발은 Antigravity, 기획·문서와 독립 판정은 Codex가 담당한다. 사용자 요청에 따라 수정 단위별 커밋을 유지한다.

### 1. 휴가 저장 완료 처리에서 새 입력 보호 유지 — 코드 수정 필요

- [ ] `timesheet-workspace.tsx`의 `applyVacationRange`와 `saveConnectedVacationPrompt` 성공 처리에 남은 무조건적인 `setIsDirty(false)`를 제거하거나, 실제 확정 결과의 원본 비교 판정에 따르도록 바꾼다.
- [ ] 하위 `recordConfirmedDraftResult`가 저장 중 입력을 보존한 경우 상위 함수가 그 결정을 뒤집지 않게 한다. 확정한 원본 그대로라면 canonical 항목·ID를 반영하고 저장 완료로 처리하며, 이후 입력이 있으면 화면과 미저장 경고를 유지한다.
- [ ] 기간·연결 휴가의 일부 날짜만 성공했을 때 성공 날짜와 나머지 초안·오류 상태를 구분해 보존한다.

완료 기준은 휴가 저장 대기 중 업무 내용·요약문을 수정한 뒤 성공 응답이 와도 새 입력과 dirty 상태가 남고, 변경이 없으면 정상적으로 저장 완료가 되는 것이다.

### 2. 저장 전 원본과 요청용 변경값의 비교 분리 — 일부 반영, 보완 필요

- [x] `b89c12e`에서 일반 업무 저장은 정규화된 payload 대신 원본 signature를 별도 전달하고, 반환된 main canonical day에 `withClientIds`를 적용했다. `hoursTouched=false`가 정규화 과정에서 빠지는 경우의 회귀 assertion도 추가됐다. 최종 판정은 아직 하지 않았다.
- [ ] main `saveSelectedDraft`는 현재 `dayToSave`의 signature를 전달한다. `dayToSave`에는 `options.vacationStatus`가 이미 반영될 수 있으므로, 실제 화면 원본 `selectedDay`를 요청 전용 상태 변경·정규화·비동기 대기 전에 캡처해 비교한다. 요청으로 바꾸려는 휴가 상태와 사용자가 대기 중 추가로 고친 입력을 구분한다.
- [ ] 기간·연결 휴가에서 비교한 원본과 실제 payload를 만든 원본이 동일한 시점의 같은 day인지 확인한다. 특히 이전 `sourceDay`로 요청을 만들면서 최신 ref로 signature만 캡처해 새 입력을 덮어쓰지 않도록 한다.
- [ ] `saveEntryAndNotify`의 원본 signature 누락 시 sanitized entry로 되돌아가는 기본값이 잘못 사용될 호출 경로가 없는지 확인하고, 필요하면 원본 인자를 필수로 만든다.

완료 기준은 `hoursTouched`의 true/false, 요청에만 반영한 휴가 상태·AI 옵션, 새로 생성한 휴가 항목 ID 때문에 변경 없는 저장을 새 입력으로 오인하지 않으며, 실제 대기 중 입력은 보존하는 것이다.

### 3. 공통 함수와 실제 화면 호출을 잇는 회귀 검증 — 검증 필요

- [ ] 일반 업무 저장에서 원본과 payload가 실제로 다름을 확인한 뒤, 추가 입력이 없으면 canonical ID 반영·dirty 해제·pending badge 제거·초안 재생성 방지까지 검증한다.
- [ ] 요청 전용 휴가 상태 변경 및 기간·연결 휴가에서 생성된 새 항목 ID가 있어도, 변경 없는 원본은 정상 반영되는지 검증한다.
- [ ] 실제 저장 대기 중 새 업무 내용·요약문·휴가 수정이 생긴 경우, 하위 helper와 상위 성공 처리 전체를 지난 뒤에도 입력과 dirty가 유지되는지 검증한다. helper callback을 모두 mock해 실제 workspace 연결 오류를 가리지 않는다.
- [ ] 확정 후 pending draft의 ref와 React 상태가 함께 없어지고, 반환된 tombstone revision/fingerprint로 다음 편집·자동 저장이 이어지는지 main/range/connected 경로를 확인한다.
- [ ] 새 수정에 맞는 테스트, 영향받은 패키지의 `tsc --noEmit`, 변경 파일 ESLint, `git diff --check`의 완료 결과를 남긴다. 시작만 한 검사는 통과로 기록하지 않는다. Codex는 worker의 동일 검사를 반복 실행하지 않고 결과·실제 diff·관련 호출 경로를 독립 검토한다.

### 4. 최종 인수와 문서 마감 — 판정 대기

- [ ] 최신 worker 완료 결과를 my-orch에 정상 등록하고, 최신 커밋 전체를 Codex가 독립 검수한다. 남은 차단 결함이 없어야 GO로 바꾼다.
- [ ] 검수 문서, 이 계획, `docs/timesheet-workflow.md`, `docs/roadmap.md`의 상태와 검증 근거를 최종 커밋 기준으로 맞추고 커밋한다. 이전 라운드는 이력으로 보존한다.
- [ ] 로그인 후 시각·브라우저 상호작용과 실제 Notion 계정의 권한/댓글 동작은 사용자 확인 항목으로 남긴다. 이 확인을 수행한 것처럼 기록하지 않는다.

제품 build, 배포, push는 이번 인수 작업으로 실행하지 않는다. 브라우저 자동화는 사용자 담당 정책을 유지하고, DB 검증은 임시 SQLite·합성 계정, 외부 댓글 쓰기는 mock으로 진행한다.

### 이미 반영된 주요 수정

- 저장된 업무 초안 복원 시 기존 휴가·공휴일·하루 메타데이터 보존.
- 확정본 fingerprint와 draft revision을 확인하는 원자적 full-day 저장 및 matching draft clear.
- 버전 확인 없는 일반 서버 초안 삭제 제거, 확정/삭제 반환 버전 보관과 실제 호출 연결.
- 삭제 대기 중 최신 전체 day를 다시 읽어 업무·요약문 입력 보존.
- 순차 자동 저장, 일부 필드 미저장 상태 유지, 동일 업무의 반복 자동 저장 방지, 미저장 day 필드가 남으면 이동 확인.
- AI 결과 반영 시 최신 선택 날짜·dirty·draft 참조 사용.

이 목록은 반영된 수정의 요약이며, 전체 GO 판정을 뜻하지 않는다. 상세 근거는 [독립 검수 기록](2026-11-17-today-independent-review.md)의 Round 14 이후를 따른다.

## Global Constraints

- Antigravity implements. Codex coordinates, documents and independently reviews the actual changes.
- No product build without a user request. Use typechecks, targeted ESLint and relevant source tests.
- Keep package installation local with the shared pnpm store or uv environment.
- Reuse existing logic and preserve existing work, vacation, card allocation and AI behavior.
- Do not use real user data for verification or publish real Notion comments while testing. Use temporary fixtures and mocked HTTP for external writes.
- The HTML is a reference prototype. Production behavior follows the spec and existing repository conventions.

## Review Focus

- A late autosave must not revive a confirmed draft or overwrite a more recent revision.
- Confirming today's draft must preserve existing vacation entries and detect intervening confirmed-record edits.
- Browser-local dates and midnight transitions must keep draft writes attached to the date being edited.
- Comment mutations must verify session ownership, permitted connection, target card and the Notion author's permission.
- Comment refreshes across cards or tabs must preserve unsaved text and the original edited comment target.

## Task 1 — Persistent work drafts and confirmation

Primary files are `packages/db/src/today-store.ts`, its focused regression tests, `packages/db/src/index.ts`, `apps/web/src/app/(app)/today/actions.ts` and the existing timesheet save path. Adjust names to repository conventions where necessary and record the final boundaries.

- [ ] Read `timesheet-store.ts`, runtime schema bootstrap, `TimesheetDayDraft` and `saveTimesheetEntryAction` before selecting the persistence interface.
- [ ] Store incomplete user/date drafts with a stable revision or generation and confirmed-record baseline. Return explicit save/conflict results to the caller. Authentication supplies the user ID on every server action.
- [ ] Confirm a day through shared existing save logic, preserving nonedited records, card links, hours, AI behavior and cache invalidation. Clear the matching draft consistently with confirmation. Do not duplicate business validation.
- [ ] Add and run regression cases for incomplete restore, user/date isolation, out-of-order saves, saves racing confirmation, confirmation failure and preservation of an existing mixed work/vacation day. Use temporary SQLite data.

## Task 2 — Today page and work tabs

Primary files are `apps/web/src/app/(app)/today/page.tsx`, `apps/web/src/components/today/today-workspace.tsx`, `apps/web/src/app/(app)/app-nav.tsx` and existing card/recommendation components.

- [ ] Load the authenticated user's confirmed record or saved draft for the browser-local today. Start with one tab on an empty day, support `+`, and preserve input on keyboard or pointer tab navigation.
- [ ] Reuse project selection, weekday defaults, previous-work recommendations, `NotionCardPickerModal` and allocation helpers. A late recommendation must respect user edits. Restore saved links as written.
- [ ] Wire debounced autosave, visible save/failure/conflict feedback, retry and safe navigation. Capture the date and revision with each write, including midnight transitions.
- [ ] Confirm the full day after validation and select the tab containing any error. Show all tabs' project, content, hours and allocated cards in the right summary. Use the compact wireframe layout, 75px initial content height, existing theme and mobile drawer.
- [ ] Exercise two distinct work tabs, autosave/restore, allocation changes, failed saves, confirmation and readback from the regular calendar. Keep drafts excluded from confirmed metrics and exports.

## Task 3 — Notion comments and compact card layout

Primary files are `packages/db/src/notion-comments.ts`, its HTTP regression tests, `packages/db/src/notion-api.ts`, today server actions and `apps/web/src/components/today/notion-card-comments.tsx`. Share existing API errors and token handling.

- [ ] Implement paginated unresolved comment reads and create/update/delete calls using the existing Notion API version. Enforce the current connection's authorship for update/delete and authenticate each target through the user's connection.
- [ ] Render card removal at top left, title/status/hours in the left column, and an editable latest-comment box in the right column. Keep author/time, history, reset, create and update in one compact toolbar. Stack columns on mobile.
- [ ] Offer inline update or create-as-new and a full history dialog. Keep typed content on failed requests, refresh shared card data after success, and retain dirty editors and original targets. Never automatically retry an ambiguous create request.
- [ ] Mock HTTP to verify pagination, authorship denial, API errors, ambiguous creates and success refresh. Check empty threads, comments by other authors, deletion fallback, two tabs sharing a card and failed mutations preserving text.

## Task 4 — Verification and handback

- [ ] Run the relevant existing domain/store tests and any new regression tests. Run workspace `tsc --noEmit` scripts, targeted ESLint and `git diff --check`. Record exact commands, results and failures.
- [ ] Use an isolated verification database for browser checks if practical. Record routes, temporary-data isolation, screenshots and any external-credential-dependent checks that remain unavailable. Never substitute mocked production behavior.
- [ ] Update `docs/timesheet-workflow.md` and the roadmap with final behavior and verification evidence. Report all changed files and any remaining risks through the supplied my-orch completion command.
- [ ] Codex reads actual diff and connected read/write paths, resolves every material finding with Antigravity, and records its independent GO / NO-GO decision. Implementation completion alone does not establish acceptance.
