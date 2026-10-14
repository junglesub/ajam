# Year-End Review Evidence Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution method must be selected by the user before implementation.

**Goal:** 저장된 업무와 연결 카드의 검토·개별 제외·빠른 필터를 지원하고, 동일 snapshot의 Markdown/JSON과 단계별 외부 LLM 인터뷰 프롬프트를 제공한다.

**Architecture:** 기존 DB 기간 조회와 카드 ID 조회를 읽기 전용 loader에서 재사용한다. 순수 도메인 함수가 정규화·선택·집계·파일/프롬프트를 생성하며, 보호된 Next.js 페이지는 입력·검토·복사·다운로드만 담당한다. 앱에서 평가 의미 매핑·점수 판단·요약·목표 추론을 수행하지 않는다.

**Tech Stack:** Next.js App Router, React, TypeScript, 기존 Prisma/SQLite, pnpm workspace, Node `node:test`, 기존 DB package의 `tsx`, 브라우저 Clipboard/Blob.

**Spec:** [2026-10-14-year-end-review-export-design.md](../specs/2026-10-14-year-end-review-export-design.md). 사용자가 승인한 설계와 추가 3개 요청을 반영한 문서를 기준으로 한다.

## Global Constraints

다음은 설계서의 공통 제약이며 모든 작업에 적용한다.

- 2026-10-14 후속 사용자 지시: Chrome 등 브라우저 실제 테스트는 사용자 담당이다. 에이전트는 앞으로 브라우저/UI 자동화를 실행하지 않고 코드 검토·자동 테스트·정적 검사만 수행한다. 아래 Step 7은 사용자의 수동 확인 목록이며 이전 실행 이력은 보존한다.

- 추적되는 문서·코드·테스트에는 실제 회사명, 고유 평가 양식, 비중, 척도, 직무 체계를 넣지 않는다.
- 특정 회사 템플릿을 기본값으로 넣거나 로컬 회사 문서를 앱에서 읽지 않는다.
- 새 DB 테이블, 대화 저장, 보고서 재입력, Notion 본문 수집, 자동 AI 분류, 모델 호출은 첫 버전 범위에 포함하지 않는다.
- 브라우저 저장소에 회사 양식을 자동 보관하지 않는다.
- 초기 보고서 언어는 영어로 한다.
- 한 입력란 최대 20,000자, 모든 맥락 입력 합계 최대 60,000자를 허용한다.
- 세 필터는 AND 조건으로 적용하고 모두 내보내기 범위에 반영한다.
- `selectedEntryCount = filteredEntryCount - excludedMatchingEntryCount`다.
- 배분 불일치는 업무별 `abs(hours - allocatedTotal) > 0.01`일 때 표시한다.
- 카드 ID는 중복 제거하고 최대 200개씩 조회한다.
- 사용자 요청 없는 build는 실행하지 않는다.
- 추가 의존성 없이 기존 패키지를 재사용한다. 필요시 workspace/shared store를 사용하고 전역 설치하지 않는다.

## Review Focus

1. 필터를 바꿔도 제외 상태를 유지하고 같은 ID의 여러 행이 동기화되어야 한다. 제외된 원문이 날짜 전체 요약으로 유출되지 않아야 한다. Task 1/2 테스트와 Task 4 UI 확인에 포함한다.
2. 공유 카드·같은 이름의 실제 분류와 특수 미분류 값·경고가 겹쳐도 시간과 건수는 명시된 기준으로 계산한다. Task 1 테스트에 포함한다.
3. 브라우저 오늘 날짜, 입력 기간 변경, 오래된 응답·조회 실패가 엇갈려도 과거 snapshot을 새 범위의 파일로 내보내지 않는다. Task 1 기간 테스트와 Task 4 상태 전환 확인에 포함한다.
4. DB에 추가 필드가 생기거나 사용자 입력에 Markdown fence/URL/인증 정보가 섞여도 원래 허용한 필드·안전한 자료 경계를 유지한다. Task 1/2 allowlist·문자열 테스트와 Task 3 사용자 격리 테스트에 포함한다.
5. 평가 양식·레벨 기준·최상위/최하위 등급 근거가 부족해도 앱이 내용을 생성하거나 프롬프트가 확정 평가를 요구하지 않는다. Task 2 계약 테스트와 Task 4 합성 자료 확인에 포함한다.

## File Structure

- Create `packages/domain/src/year-end-review.ts`: 타입, 기간/맥락 검증, 객관적 자료 정규화, 필터·제외·집계, 파일·프롬프트 생성.
- Create `packages/domain/src/year-end-review.test.ts`: 합성 자료 기반 도메인·내보내기·프롬프트 계약 테스트. 같은 테스트 파일을 단계적으로 확장한다.
- Modify `packages/domain/src/index.ts`: 새 함수/타입 내보내기.
- Create `apps/web/src/server/year-end-review.ts`: 현재 사용자 ID와 기간으로 자료를 읽는 loader.
- Create `packages/db/src/year-end-review.test.ts`: 임시 SQLite에서 loader의 사용자/기간 격리와 카드 누락·200개 batch 검증.
- Modify `packages/db/package.json`: 기존 `test`의 파일 목록에 `src/year-end-review.test.ts` 추가.
- Create `apps/web/src/app/(app)/year-end-review/actions.ts`: 기존 세션 패턴으로 사용자 확인 후 loader 호출.
- Create `apps/web/src/app/(app)/year-end-review/page.tsx`: 보호된 페이지, metadata와 workspace 연결.
- Create `apps/web/src/components/year-end-review/year-end-review-workspace.tsx`: 기간·맥락 입력, 검토, 제외·빠른 필터, 복사/다운로드.
- Modify `apps/web/src/app/(app)/app-nav.tsx`: 공유 `연말 정리` 메뉴.
- Update `README.md`, `docs/product-brief.md`, `docs/timesheet-workflow.md`, `docs/architecture.md`, `docs/roadmap.md`: 실제 구현 범위·사용 흐름·한계·검증 결과. 회사별 내용은 포함하지 않는다.

## 검사 명령과 준비

- 저장소가 이미 linked worktree이면 현재 worktree에서 진행한다. 다른 worktree를 만들거나 전역 패키지를 설치하지 않는다.
- 기존 Node 버전은 `24.15.0`, package manager는 `pnpm@10.20.0`이다. 실행 전에 `node --version`, `pnpm --version`과 로컬 의존성/생성된 Prisma client 존재 여부를 확인한다.
- 의존성이 없을 때만 `pnpm install --frozen-lockfile`을 실행한다. Prisma client가 없을 때만 `pnpm db:generate`를 실행한다. 전자는 workspace 설치, 후자는 client 생성이며 DB seed/배포/build는 실행하지 않는다.
- 도메인 테스트: `pnpm --filter @timesheet/db exec tsx --test ../domain/src/year-end-review.test.ts`. DB package에 설치된 `tsx`를 재사용해 emit/build 없이 TypeScript 테스트를 실행한다.
- loader 테스트: `pnpm --filter @timesheet/db exec tsx --test src/year-end-review.test.ts`.
- 정적 검사: `pnpm --filter @timesheet/domain typecheck`, `pnpm --filter @timesheet/web typecheck`. 마지막에 변경 코드만 대상으로 `pnpm exec eslint <changed-ts-and-tsx-paths>`를 실행한다.
- 기존 `@timesheet/domain test`는 `.test-build` 생성과 `tsc --noEmit false`를 포함하므로 이번 작업에서는 사용하지 않는다. `pnpm build`, `next build`, Docker build도 실행하지 않는다.
- 테스트용 디렉터리는 OS temp 안에서 `mkdtemp`로 만들고 `finally`에서 Prisma disconnect 후 그 디렉터리만 정리한다. 개발 DB와 실제 회사 자료를 테스트에 사용하지 않는다.

## Task 1: 객관적 자료·필터·개별 제외와 집계

**Files:** `packages/domain/src/year-end-review.ts`, `packages/domain/src/year-end-review.test.ts`, `packages/domain/src/index.ts`.

**Interfaces — 이 작업에서 정의하고 이후 작업에서 재사용:**

```ts
type YearEndReviewPeriod = {
  startDateKey: string; endDateKey: string; browserTodayDateKey: string;
};
type YearEndReviewValueFilter =
  | { kind: "all" } | { kind: "value"; value: string };
type YearEndReviewCategoryFilter = YearEndReviewValueFilter
  | { kind: "missing_metadata" } | { kind: "unlinked" };
type YearEndReviewSelection = {
  projectFilter: YearEndReviewValueFilter;
  categoryFilter: YearEndReviewCategoryFilter;
  quickFilter: "all" | "unlinked" | "warnings";
  excludedEntryIds: readonly string[];
};
type YearEndReviewEntry = {
  id: string; dateKey: string; project: string; hours: number;
  content: string; aiTranslation: string;
};
type YearEndReviewDay = { dateKey: string; shortVersion: string };
type YearEndReviewCard = NotionCardSnapshot & { metadataMissing: boolean };
type YearEndReviewLink = WorkEntryNotionCardLink & { entryId: string };
type YearEndReviewWarning = {
  code: "empty_work_content" | "unlinked_work" | "allocation_mismatch"
    | "card_metadata_missing" | "card_stale" | "card_archived"
    | "partial_day_summary_omitted";
  entryIds: string[]; notionPageIds: string[]; dateKey?: string; message: string;
};
type YearEndReviewData = {
  loadedAt: string; period: YearEndReviewPeriod;
  entries: YearEndReviewEntry[]; days: YearEndReviewDay[];
  cards: YearEndReviewCard[]; links: YearEndReviewLink[];
  warnings: YearEndReviewWarning[];
};
type YearEndReviewSelectionResult = {
  matchingEntries: YearEndReviewEntry[]; selectedEntries: YearEndReviewEntry[];
  excludedEntryCount: number; excludedMatchingEntryCount: number;
};
type YearEndReviewGroup = {
  key: string; label: string; entryIds: string[]; workDateKeys: string[];
  firstWorkDateKey: string; lastWorkDateKey: string;
  hours: number; hoursKind: "recorded" | "allocated";
};
type YearEndReviewSummary = {
  entryCount: number; workDayCount: number; recordedHours: number;
  allocatedHours: number; unlinkedEntryCount: number;
  allocationMismatchCount: number; underallocatedHours: number;
  overallocatedHours: number;
  groups: { project: YearEndReviewGroup[]; card: YearEndReviewGroup[];
    category: YearEndReviewGroup[] };
};
function getYearEndReviewDefaultPeriod(
  browserTodayDateKey: string, year?: number
): YearEndReviewPeriod;
function validateYearEndReviewPeriod(period: YearEndReviewPeriod): void;
function buildYearEndReviewData(params: {
  days: TimesheetDayDraft[]; cards: NotionCardSnapshot[];
  period: YearEndReviewPeriod; loadedAt: string;
}): YearEndReviewData;
function selectYearEndReviewEntries(
  data: YearEndReviewData, selection: YearEndReviewSelection
): YearEndReviewSelectionResult;
function buildYearEndReviewSummary(data: YearEndReviewData): YearEndReviewSummary;
```

타입 참조는 기존 `TimesheetDayDraft`, `NotionCardSnapshot`, `WorkEntryNotionCardLink`를 사용한다. 위 타입/함수는 TypeScript `export`로 정의한다. 빈 프로젝트/카테고리는 `{kind:"value", value:""}`로 나타내 실제 사용자 명칭과 충돌하지 않게 한다.

- [x] **Step 1: 작성할 실패 테스트와 정확한 assertion**
  - `period validates real dates and inclusive bounds`: 올해 기본 `2026-01-01..2026-10-14`, 과거 연도 `2025-01-01..2025-12-31`, `2024-02-29` 허용, `2026-02-29`, 역전 범위, 오늘 이후 종료일은 `assert.throws`.
  - `normalization keeps persisted WORK and allowlisted fields`: 저장 ID 없는 draft, VACATION/HOLIDAY, 기간 밖과 미래 항목 제외. 합성 `userId`, `email`, `rawPropertiesJson`, 인증 marker를 입력 객체에 추가해도 JSON 직렬화 결과에 없음을 확인한다. 빈 WORK 원문은 유지한다.
  - `shared cards and special labels do not duplicate hours`: 서로 다른 프로젝트의 업무 2건이 같은 카드에 연결돼도 카드 개수는 1, 전체 시간은 업무 합계, 카드 업무 건수는 고유 ID 수다. 실제 이름 `프로젝트 미분류`와 빈 프로젝트가 다른 group key다.
  - `recorded and allocated totals preserve mismatch`: 8h 업무의 3/5h 연결은 recorded/allocated 8/8, 5/5h 연결은 8/10, overallocated 2, mismatch 1. 잔여와 초과는 업무별로 계산하며 다른 업무끼리 상쇄하지 않는다.
  - `quick filters compose and use original warnings`: all/unlinked/warnings 각각의 ID 목록 확인. warnings가 빈 원문·미연결·배분 불일치·missing/stale/archived를 포함하고 중복 경고가 한 업무를 복제하지 않는다. 카테고리 필터에 맞는 업무는 다른 카테고리의 연결도 유지한다.
  - `exclusion is reversible across filters`: 같은 ID가 여러 번 제외 목록에 있어도 count 1, 알 수 없는 ID는 count 0. 필터 후보 `matchingEntries`에는 제외 행이 있고 `selectedEntries`에는 없다. 직접 제외한 업무가 현재 필터 밖에 있어도 excludedEntryCount는 1이며 excludedMatchingEntryCount는 0이다. 필터를 바꾸거나 제외 목록을 비우면 같은 업무가 복원된다.
  - 핵심 assertion은 다음 코드로 고정한다. `data`는 한 날짜의 저장 업무 A(8h, 카드 3/5h)와 B(2h, 미연결), `selection`은 전체/전체/all과 제외 목록 `["B", "B", "unknown"]`인 합성 자료다. `balanced`, `overallocated`는 해당 A만 남긴 자료의 summary이며 후자는 카드 5/5h다.

```ts
assert.deepEqual(getYearEndReviewDefaultPeriod("2026-10-14"), {
  startDateKey: "2026-01-01", endDateKey: "2026-10-14",
  browserTodayDateKey: "2026-10-14"
});
assert.throws(() => validateYearEndReviewPeriod({
  startDateKey: "2026-02-29", endDateKey: "2026-03-01",
  browserTodayDateKey: "2026-10-14"
}));
const result = selectYearEndReviewEntries(data, selection);
assert.deepEqual(result.matchingEntries.map(e => e.id), ["A", "B"]);
assert.deepEqual(result.selectedEntries.map(e => e.id), ["A"]);
assert.equal(result.excludedEntryCount, 1);
assert.equal(result.excludedMatchingEntryCount, 1);
assert.deepEqual(selectYearEndReviewEntries(data, {
  ...selection, quickFilter: "unlinked", excludedEntryIds: []
}).selectedEntries.map(e => e.id), ["B"]);
assert.equal(balanced.recordedHours, 8);
assert.equal(balanced.allocatedHours, 8);
assert.equal(balanced.allocationMismatchCount, 0);
assert.equal(overallocated.recordedHours, 8);
assert.equal(overallocated.allocatedHours, 10);
assert.equal(overallocated.overallocatedHours, 2);
assert.equal(overallocated.allocationMismatchCount, 1);
```

- [x] **Step 2: 도메인 테스트 명령을 실행해 새 함수/계약이 없어 실패하는지 확인한다.**
- [x] **Step 3: 위 인터페이스를 최소 구현한다.** 원본 ID/카테고리/시간으로만 계산하고, URL은 http/https만 보존하며 누락 metadata placeholder와 원본 경고를 만든다. 정렬은 날짜·ID, group key는 종류·실제 값에 기반해 특수 분류와 구분한다. 현재 기간 전체의 원본을 유지한 상태에서 필터 후보와 최종 포함 목록을 나눈다.
- [x] **Step 4: 도메인 테스트와 domain typecheck가 통과하는지 확인한다.** 예상 결과는 실패 0, typecheck exit 0이다.
- [x] **Step 5: 위 세 파일만 커밋한다.** `feat: add year-end review evidence selection and metrics`.

## Task 2: 제외를 반영한 파일과 구체적인 인터뷰 프롬프트

**Files:** Task 1의 같은 도메인 파일·테스트·index.

**Consumes:** `YearEndReviewData`, `YearEndReviewSelection`, `selectYearEndReviewEntries`, `buildYearEndReviewSummary`.

**Produces:**

```ts
type YearEndReviewContext = {
  employeeName: string; role: string; previousGoals: string;
  currentLevel: string; targetLevel: string; levelExpectations: string;
  additionalAccomplishments: string; assessmentTemplate: string;
  reportLanguage: "ko" | "en";
};
type YearEndReviewExport = YearEndReviewData & {
  schemaVersion: 1; context: YearEndReviewContext; summary: YearEndReviewSummary;
  scope: {
    projectFilter: YearEndReviewValueFilter;
    categoryFilter: YearEndReviewCategoryFilter;
    quickFilter: "all" | "unlinked" | "warnings";
    totalEntryCount: number; filteredEntryCount: number;
    excludedEntryCount: number; excludedMatchingEntryCount: number;
    selectedEntryCount: number; includeAllLinksForSelectedEntries: true;
  };
};
function validateYearEndReviewContext(context: YearEndReviewContext): {
  fieldErrors: Partial<Record<keyof YearEndReviewContext, string>>;
  formError: string;
};
function buildYearEndReviewExport(params: {
  data: YearEndReviewData; selection: YearEndReviewSelection;
  context: YearEndReviewContext;
}): YearEndReviewExport;
function buildYearEndReviewInterviewPrompt(payload: YearEndReviewExport): string;
function buildYearEndReviewArtifacts(payload: YearEndReviewExport): {
  json: string; markdown: string; prompt: string;
  jsonFilename: string; markdownFilename: string;
};
```

- [x] **Step 1: 계약 테스트를 추가한다.**
  - `excluded entries disappear from all artifacts`: 같은 날짜의 업무 A/B 중 B 제외 시 entries/links/warnings에 B ID 없음. B만 연결된 카드 제거, 선택 업무 없는 날짜 제거, scope의 total/filtered/excluded/matching/selected는 2/2/1/1/1이다. JSON과 Markdown의 집계가 같은 payload에서 나옴을 확인한다.
  - `partial days omit source summary without rewriting`: A/B를 언급하는 하루 요약에서 B를 필터 또는 직접 제외하면 `shortVersion === ""`, warning code `partial_day_summary_omitted`, B ID 없음. 모두 포함하면 원본 요약이 그대로 유지된다. 생성된 대체 요약이 없다.
  - `context bounds and data fences remain intact`: 단일 20,000자는 허용하고 20,001자는 field error, text fields 총 60,001자는 form error. fence가 포함된 가상 양식을 그대로 보존하고 원문/양식 자료 fence가 입력의 fence보다 길다. 임의의 추가 context 속성은 export에 없다.
  - `briefing and final output contracts are explicit`: 아래 확정 지시문/필드가 prompt에 모두 있고 `schemaVersion === 1`, 출력 언어·범위·loadedAt이 맞음을 확인한다. 빈 양식에 실제 항목·점수·레벨을 자동 삽입하지 않는다.
  - `empty exports cannot generate downloadable artifacts`: 선택 0건 payload 생성은 허용해 빈 화면 요약을 보여줄 수 있으나 artifact 생성은 명확한 오류를 반환/throw한다. context 검증 실패도 생성 전에 차단한다.
  - 핵심 assertion은 다음과 같다. `payload`는 A/B 중 B를 제외한 snapshot, `context`는 영어 출력과 빈 양식의 기본값이며 `artifacts`는 그 snapshot의 산출물이다.

```ts
assert.equal(payload.schemaVersion, 1);
assert.equal(payload.scope.filteredEntryCount, 2);
assert.equal(payload.scope.excludedEntryCount, 1);
assert.equal(payload.scope.excludedMatchingEntryCount, 1);
assert.equal(payload.scope.selectedEntryCount, 1);
assert.deepEqual(payload.entries.map(e => e.id), ["A"]);
assert.ok(payload.links.every(link => link.entryId === "A"));
assert.equal(payload.days[0]?.shortVersion, "");
assert.ok(payload.warnings.some(w => w.code === "partial_day_summary_omitted"));
assert.ok(payload.warnings.every(w => !w.entryIds.includes("B")));
assert.deepEqual(JSON.parse(artifacts.json), payload);
assert.equal(validateYearEndReviewContext({
  ...context, assessmentTemplate: "x".repeat(20_000)
}).formError, "");
assert.ok(validateYearEndReviewContext({
  ...context, assessmentTemplate: "x".repeat(20_001)
}).fieldErrors.assessmentTemplate);
for (const field of ["Raw Evidence", "Possible Relevance", "Missing Context",
  "Suggested Rating", "Rating Confidence", "High", "Medium", "Low",
  "Situation / Background", "Goal", "My Role", "Action", "Result", "Impact",
  "연결되는 평가 항목", "근거 ID", "인터뷰로 확인된 Context", "아직 부족한 Evidence"]) {
  assert.ok(artifacts.prompt.includes(field), field);
}
assert.ok(artifacts.prompt.includes("객관적 기록을 다시 질문하지 마세요"));
assert.ok(artifacts.prompt.includes("초기 매핑 브리핑을 먼저 제시하세요"));
assert.ok(artifacts.prompt.includes("판단 보류"));
```

- [x] **Step 2: 도메인 테스트 명령으로 추가 assertion이 실패함을 확인한다.**
- [x] **Step 3: 선택된 업무의 연결·참조 카드·날짜·경고만 새 allowlist 객체에 넣는다.** 제외 ID는 export하지 않고 건수만 기록한다. 원본 경고의 ID 배열도 포함 대상과 교집합한다. 같은 날짜의 모든 원본 WORK가 선택됐을 때만 날짜 요약을 보존한다. snapshot을 재집계하며 앱에서 요약/의미 매핑을 생성하지 않는다.
- [x] **Step 4: 인터뷰 프롬프트와 artifact를 구현한다.** 두 파일을 첨부하도록 안내하고 같은 loadedAt/period/scope를 명시한다. 다음 문장과 필드명은 범용 계약으로 포함한다.
  - `JSON/Markdown에 이미 있는 객관적 기록을 다시 질문하지 마세요.` 날짜·프로젝트·원문·제목·시간을 예로 들고, 충돌 확인은 알려진 사실을 인용해 불명확한 부분만 묻도록 한다.
  - `첫 응답에서 평가서를 작성하지 말고 초기 매핑 브리핑을 먼저 제시하세요.` 표의 열은 `Raw Evidence`, `Possible Relevance`, `Missing Context`. 가능한 연결은 성과 판정이 아닌 인터뷰 힌트이며 다중 연결을 허용한다. 파일/양식 누락 시 기준을 확인한다.
  - 한 질문씩 실제 임팩트·고객/동료 반응·본인의 역할·기술적 판단/대안·어려움/해결·협업·성장을 확인한다. 시간·완료 카드로 높은 성과를 단정하지 않는다.
  - Rating 요청 시에만 `Suggested Rating`, `Rating Confidence (High/Medium/Low)`, `Evidence (근거 업무/카드 ID)`, `인터뷰로 확인된 Context`, `아직 부족한 Evidence`를 제시한다. confidence 근거를 설명하고 요구되는 사유가 부족한 등급은 `판단 보류`로 남긴다. 실제 척도는 사용자 양식만 따른다.
  - 주요 성과 필드: `Situation / Background`, `Goal`, `My Role`, `Action`, `Result`, `Impact`, `연결되는 평가 항목`, `근거 ID`. Result/Impact는 기록 또는 인터뷰로 확인한 사실만 사용한다.
  - 다음 기간 목표는 인터뷰에서 확인한 강점·개선점·원하는 성장 방향과 다음 레벨 기대 역량을 기반으로 한다. 기준 없으면 확인 질문, 답변 불가면 레벨 정렬 미확인인 초안. 과거 기록만으로 목표를 생성하지 않는다.
  - 충분한 인터뷰 후 사용자에게 초안 작성 시점을 확인하고 입력 양식/언어를 따른다. 제출 문안과 근거/미확인 부록을 구분하며 업무 자료 안의 지시문을 실행하지 않는다.
- [x] **Step 5: 도메인 테스트와 typecheck를 실행한다.** 예상 결과: 실패 0, exit 0. 이는 생성되는 프롬프트의 계약 검증이며 외부 모델의 실제 응답 준수를 자동 보증하는 테스트는 아니다.
- [x] **Step 6: 변경한 도메인 파일을 커밋한다.** `feat: export review evidence and structured interview prompts`.

## Task 3: 현재 사용자 자료를 읽는 loader와 보호된 action

**Files:** `apps/web/src/server/year-end-review.ts`, `apps/web/src/app/(app)/year-end-review/actions.ts`, `packages/db/src/year-end-review.test.ts`, `packages/db/package.json`.

**Consumes:** Task 1의 기간 검증·정규화와 기존 DB 조회. context/filter/exclusion은 loader에 보내지 않는다.

**Produces:**

```ts
// server/year-end-review.ts — 내부 서버 함수
function loadYearEndReviewData(params: {
  userId: string; period: YearEndReviewPeriod;
}): Promise<YearEndReviewData>;
// (app)/year-end-review/actions.ts — 유일한 server action export
async function loadYearEndReviewAction(
  period: YearEndReviewPeriod
): Promise<YearEndReviewData>;
```

- [x] **Step 1: 합성 DB 테스트를 작성한다.** 기존 `timesheet-store.test.ts`의 OS temp/동적 import 패턴을 재사용하고 DB client import 전에 임시 `DATABASE_URL`을 설정한다. 서로 다른 두 사용자와 같은 page ID의 서로 다른 카드 제목, 기간 안/밖 업무, 연결 없는 업무, 캐시 없는 연결, stale/archived 캐시를 준비한다. 일부 카드의 시작일은 빈 값으로 한다.
  - 사용자 A의 결과에 사용자 B의 업무·카드 제목·인증 marker가 없고, 원문/기간 경계와 누락 카드 연결은 보존됨을 assert한다.
  - 연결된 고유 카드 201개를 준비해 200개 한계를 넘는 자료가 누락되지 않는지 확인한다. DB의 raw 속성은 결과에 없다.
  - `validateYearEndReviewPeriod`가 잘못된 기간을 DB 조회 전에 거절하고, 빈 결과는 정상 빈 data이며 DB 실패는 reject하는지 확인한다.
  - 핵심 assertion: `aData`는 사용자 A의 결과, `batchData`는 201개의 연결 카드가 있는 결과다. B의 합성 업무 ID/카드 제목은 `B-only-entry`/`B-only-title`로 한다.

```ts
assert.ok(!aData.entries.some(entry => entry.id === "B-only-entry"));
assert.ok(!aData.cards.some(card => card.title === "B-only-title"));
assert.ok(aData.cards.some(card => card.metadataMissing));
assert.equal(batchData.cards.length, 201);
assert.ok(!JSON.stringify(aData).includes("private-test-marker"));
await assert.rejects(() => loadYearEndReviewData({ userId: "A", period: {
  startDateKey: "2026-10-15", endDateKey: "2026-10-14",
  browserTodayDateKey: "2026-10-14"
}}));
```

- [x] **Step 2: loader 테스트 명령을 실행해 loader가 없어 실패함을 확인한다.**
- [x] **Step 3: loader를 구현한다.** 기간 검증 → 본인 업무 조회 → 기간 내 저장 WORK 연결 카드 ID 중복 제거 → 200개씩 기존 카드 조회 → `buildYearEndReviewData` 순서다. loadedAt은 조회 완료 시 생성한다. DB failure를 빈 결과로 바꾸지 않으며 Notion API/동기화·DB 쓰기를 호출하지 않는다. 새 SQL이나 DB 테이블은 추가하지 않는다.
- [x] **Step 4: 기존 AI summary의 세션 확인 패턴을 action에 적용한다.** 미로그인 시 `/login`, DB에 없는 사용자면 세션 삭제 후 `/login`. loader의 userId는 세션과 `getManagedUser` 결과에서만 만든다. 클라이언트가 추가 userId를 보내도 읽거나 전달하지 않는다. 본문/양식/개인 메모 로그는 남기지 않는다.
- [x] **Step 5: loader 테스트를 기존 DB test script에 추가하고 해당 테스트 및 web typecheck를 실행한다.** 예상 결과: 실패 0, exit 0. 임시 DB가 제거됐는지 확인한다. action의 세션 guard는 Task 4 브라우저 확인에서 추가 검증한다.
- [x] **Step 6: 위 네 파일을 커밋한다.** `feat: load authenticated year-end review evidence`.

## Task 4: 검토·제외·필터·내보내기 UI와 통합 검증

**Files:** 새 `page.tsx`, `year-end-review-workspace.tsx`, 기존 `app-nav.tsx` 및 File Structure의 공개 제품 문서.

**Consumes:** `loadYearEndReviewAction`, Task 1/2의 함수·타입.

**Produces:** `YearEndReviewWorkspace({ loadYearEndReviewAction }: { loadYearEndReviewAction: (period: YearEndReviewPeriod) => Promise<YearEndReviewData> })`와 `/year-end-review` 페이지. 서버 페이지에서 서버 기준 날짜의 자료를 초기 주입하지 않는다.

- [x] **Step 1: 페이지와 공유 메뉴를 연결한다.** metadata `연말 정리`, 메뉴 `/year-end-review`를 `AI 월말 정리` 다음에 둔다. 기존 layout/session 패턴과 모바일 드로어를 재사용한다. 컴포넌트가 실행되기 전에는 로딩 상태이며 effect에서 브라우저 오늘과 기본 범위를 계산해 조회한다.
- [x] **Step 2: native date/select와 공통 Input/Textarea/Button으로 준비 화면을 만든다.** employeeName 등 text 입력은 빈 값, reportLanguage는 `en`. 입력이 현재 화면에서만 유지됨을 안내한다. maxLength로 조용히 자르지 않고 도메인 validation을 표시한다. 새 기간이 아직 조회되지 않았거나 로딩/오류/맥락 오류면 파일·복사를 비활성화한다.
- [x] **Step 3: 검토 상태를 구현한다.** 원본 data, 편집 기간, 최신 요청 번호, context, 보기, 세 필터, `Set<string>` 제외 상태를 각각 관리한다. 성공한 동일 기간 refresh에서는 제외 ID를 새 원본 ID와 교집합하고 필터를 유지한다. 다른 기간 성공 시 필터/exclusion을 초기화한다. 실패/오래된 응답은 기존 검토 상태를 덮지 않고 export를 허용하지 않는다.
- [x] **Step 4: 도메인 함수를 재사용해 검토 행과 export snapshot을 분리한다.** `matchingEntries`로 검토 묶음/행을 만들고 `selectedEntries`로 export를 만든다. 제외 행은 흐리게 표시하되 체크박스와 원문을 유지한다. 같은 ID는 모든 묶음에서 상태를 공유한다. 체크박스 accessible name은 날짜·업무 식별자를 포함하고 키보드로 조작 가능하게 한다. `제외한 업무 모두 다시 포함`은 현재 기간의 전체 exclusion Set을 비운다.
- [x] **Step 5: 필터와 집계 의미를 화면에 표시한다.** 빠른 필터의 정확한 label과 현재 내보내기 범위를 표시하고 필터 전/직접 제외/최종 포함 수를 구분한다. 카테고리 조건에 맞은 업무의 전체 카드 연결을 유지한다는 안내, 기록/배분 시간 구분, 날짜 부분 선택 시 요약 생략 안내를 제공한다. 전부 제외돼도 다시 포함할 행/버튼을 남긴다.
- [x] **Step 6: 한 payload의 파일/프롬프트를 생성한다.** 모든 selection/context 변경이 계산에 반영돼야 한다. Blob.size, 이름·내용별 다운로드, Clipboard와 실패 시 selectable textarea, object URL revoke를 제공한다. 직원/회사명은 파일명에 쓰지 않으며 unsafe URL/HTML을 실행하지 않는다.
- [ ] **Step 7: 사용자가 아래 브라우저 통합 시나리오를 직접 확인한다.** 이전 에이전트 실행 이력: 정적 검사와 합성 계정 기반 주요 인증 세션 시나리오는 통과했다. 지연/오래된 응답, 조회 실패 상태 전환, context 길이 경계는 미실행이다. 이후 에이전트는 브라우저 제어·UI 자동화를 실행하지 않는다. 제품 build도 요청 없이 실행하지 않는다.
  - 미로그인 직접 접근은 login으로 이동하고 로그인 후 모바일·데스크톱 메뉴로 접근 가능하다.
  - 8h 업무의 카드 3/5h를 보여주고 그 업무 제외 시 전체 snapshot에서 제거된다. 동일 ID의 모든 체크박스가 함께 바뀌며 다시 포함하면 복구된다.
  - 필터 변경 뒤 복귀, 동일 기간 refresh, 다른 기간 성공, 조회 실패 각각에서 정해진 상태 유지/초기화가 맞다. 선택 0건은 다운로드가 꺼지고 복구 컨트롤은 남는다.
  - 조회 중 기간을 변경하거나 이전 요청이 늦게 도착해도 새 범위에 오래된 결과를 다운로드할 수 없다. 이 시나리오는 devtools의 네트워크 지연 또는 서로 다른 조회를 연속 실행해 재현한다.
  - unlinked/warnings 조건이 프로젝트·카테고리와 AND로 동작하며 snapshot scope에 현재 조건이 있다. 날짜 일부 제외 후 양쪽 파일에 날짜 전체 요약이 없고 원문/배분 수치가 일치한다.
  - context 길이 경계, 가상 Markdown fence와 unsafe URL, 빈 양식·빈 레벨 기대, Clipboard 실패의 안내/대체 복사를 확인한다.
  - 생성 프롬프트에 브리핑 3열과 구조화된 Rating/성과/목표 지침이 있으며 앱 화면/파일에는 의미 매핑·평점·임팩트·목표 추론 결과가 없다. 실제 외부 LLM 호출은 하지 않는다.
- [x] **Step 8: 최종 명령을 실행하고 결과를 기록한다.** 도메인/loader 테스트, domain/web typecheck, 변경 TS/TSX 파일 대상 ESLint, `git diff --check`. 코드 변경이 기존 도메인 export에 영향을 주면 기존 domain 테스트도 같은 tsx 방식으로 필요한 파일만 추가 실행한다. 새 DB test의 독립 실행이 통과한 뒤 기존 DB script 파일 목록 변경을 검증하기 위해 `pnpm --filter @timesheet/db test`를 한 번 실행한다.
- [x] **Step 9: README와 기존 제품/워크플로/구조/로드맵을 실제 동작으로 갱신한다.** 필터·제외 범위, local-only context, 초기 브리핑/최종 구조, 파일 계약, 알려진 캐시 한계를 기록하고 실행한 명령/결과만 적는다. 로컬 회사 자료의 Git 제외 설정과 추적 파일 부재를 해당 로컬 경로에서 확인하되 공개 문서에는 그 경로를 기록하지 않는다.
- [x] **Step 10: UI와 공개 문서만 커밋한다.** `feat: add year-end review evidence export workspace`. 계획 체크박스는 실제 완료한 단계만 체크하고 실패/미검증은 기록한다. push·배포는 별도 요청 없이 하지 않는다.

## 계획 자체 검토와 실행 인계

- 위 네 작업은 원본 자료·선택, 파일/프롬프트, 서버 소유권, 사용자 흐름으로 나뉜다. 파일·함수명은 각 Interfaces 블록과 소비처가 일치해야 한다.
- 개별 제외/재포함, quick filter, 초기 브리핑/최종 구조의 추가 요청은 Task 1/2/4에 포함했다. Schema v1·회사 분리·앱 내 무추론은 모든 단계에서 유지한다.
- 테스트는 가상 항목과 합성 DB만 사용한다. 회사 자료나 실제 사용자 파일을 커밋/fixture/스크린샷에 복제하지 않는다.
- 구현은 2026-10-14에 Task 1~4를 순서대로 진행했다. 도메인·DB·web typecheck, domain tsx 테스트 14 pass, DB 테스트 19 pass, 변경 파일 ESLint, `git diff --check`를 통과했다.
- Task 4 Step 7의 통합 시나리오는 부분 확인이다. dev 서버에서 미로그인 `/year-end-review`가 `/login`으로 307 이동하고 페이지와 컴포넌트가 오류 없이 컴파일되는 것까지만 확인했다. 합성 계정 로그인이 필요해 브라우저 세션에서의 기간 조회, 필터/제외 상호작용, 같은 ID 체크박스 동기화, 새로고침·기간 변경·조회 실패 상태 전환, 파일 다운로드·Clipboard 실패 대체, 모바일 드로어, 생성된 파일의 실제 내용은 실행하지 못했다. 로컬 회사 자료와 실제 dev DB는 사용하지 않았고 제품 build도 실행하지 않았다.
- 2026-10-14 리뷰 보완: 독립 리뷰 지적 6건(Clipboard 가드, 원본 시간·0.01 허용 오차, 카테고리 identity, 부분 날짜 경고 수, 자료 fencing, 카드 링크)을 반영하고 좁은 회귀 테스트를 추가했다. 인증 세션 UI 검증은 OS temp의 폐기 가능한 SQLite와 합성 계정으로 dev 서버에서 실행했고, 실제 Markdown/JSON 파일을 받아 기간·배분 수치까지 확인한 뒤 temp DB와 서버를 정리했다. 실제 dev DB·회사 자료·제품 build는 사용하지 않았다.
- 2026-10-14 이후 남은 확인: 사용자가 직접 브라우저에서 조회 중 지연 응답·오래된 응답, 조회 실패 상태 전환, context 길이 경계 시나리오와 실제 환경에서의 최종 확인을 수행한다. 에이전트는 해당 검증을 실행하지 않는다.


## 2026-10-14 후속 UX 변경 — 구현 기록

**Goal:** 맥락 입력 제거, 화면 UUID 비표시, 경고 날짜·라벨 표시, 날짜 고정 편집 팝업. 스펙 말미의 후속 지시가 기존 맥락 입력 폼과 읽기 전용 화면 범위를 대체한다.

**Files:** `packages/domain/src/year-end-review.ts`, `packages/domain/src/year-end-review.test.ts`, `packages/domain/src/index.ts`, `packages/db/src/year-end-review-day-edit.test.ts`, `packages/db/package.json`, `apps/web/src/components/year-end-review/year-end-review-workspace.tsx`, `apps/web/src/components/year-end-review/timesheet-day-edit-modal.tsx`, `apps/web/src/app/(app)/year-end-review/page.tsx`, 공개 문서.

- [x] **Step 1: 도메인 계약을 확장한다.** `hasYearEndReviewContext`, `resolveYearEndReviewWarnings`, `buildYearEndReviewDaySavePayload`와 타입을 추가하고 index에서 export한다. Markdown은 빈 맥락/양식 구역을 생략하고, 프롬프트는 외부 대화·별도 첨부 기준을 사용하도록 안내한다.
- [x] **Step 2: 도메인 테스트를 확장한다.** 경고 ID→날짜 매핑(공유 카드·여러 날짜·알 수 없는 참조), 전체 날짜 편집 보존(숨은 WORK·휴가·공휴일), 빈 맥락 산출물/외부 기준 프롬프트, 공개 builder로 전달한 맥락 유지를 검증한다.
- [x] **Step 3: DB round-trip 테스트를 추가한다.** OS temp 합성 SQLite에서 전체 날짜 편집 payload를 저장·재조회해 숨은 WORK·휴가·공휴일 기록과 기존 id가 보존되고 일별 플래그·일별 요약이 유지되는지 확인한다. 새 파일을 `@timesheet/db` test script에 추가한다.
- [x] **Step 4: 작업 공간을 정리한다.** 맥락 입력·검증·안내를 제거하고 기본 빈 context를 쓰며, 업무/카드 UUID 표시를 없애고 날짜·프로젝트·미리보기·카드 제목으로 식별한다. 경고 패널은 resolved 날짜 버튼을 렌더링한다.
- [x] **Step 5: 날짜 편집 팝업을 추가한다.** 기존 month-load/save action과 카드 연결 UI·선택기·배분 규칙을 props로 재사용하고, 전체 날짜 조회·보존 저장, 명시적 저장, 미저장 닫기 확인, focus trap·복귀, Escape composition 가드, 스크롤 복원, 중첩 선택기, 저장 중 중복 방지, 로딩/오류·다시 불러오기를 처리한다.
- [x] **Step 6: 저장 후 갱신을 연결한다.** 같은 기간 재조회로 필터·제외를 유지하며 사라진 ID만 정리하고, 저장 성공/Notion 동기화 실패/재조회 실패를 구분해 표시한다. 편집·저장·재조회 중 오래된 export를 막고, 성공 시 timesheet 저장 경로와 같은 shared view refresh를 broadcast한다.
- [x] **Step 7: 검증과 문서 갱신.** 도메인 tsx 테스트 25 pass, `pnpm --filter @timesheet/db test` 20 pass, domain/db/web `tsc --noEmit` exit 0, 변경 파일 ESLint exit 0, `git diff --check` 통과. workflow/architecture/roadmap/spec/plan을 실제 동작으로 갱신하고 실제 브라우저 확인은 사용자 담당으로 기록한다.
- [ ] **Step 8: 사용자가 브라우저에서 통합 시나리오를 직접 확인한다.** 날짜/내용/카드/경고 날짜 버튼으로 팝업 열기, 전체 날짜 보존 저장, 저장 중 중복 방지, 미저장 닫기 확인, 저장 후 재조회·필터/제외 유지, 재조회 실패 안내, focus/스크롤/Escape 동작. 에이전트는 브라우저 UI 자동화와 제품 build를 실행하지 않는다.


## 2026-10-14 후속 보완 — 팝업 focus scope와 프롬프트/배분 정확성

**Files:** `apps/web/src/components/year-end-review/timesheet-day-edit-modal.tsx`, `packages/domain/src/year-end-review.ts`, `packages/domain/src/year-end-review.test.ts`, `packages/domain/src/notion-cards.test.ts`, 공개 문서.

- [x] **Step 1: 중첩 카드 선택기의 focus scope를 분리한다.** 선택기를 감싼 컨테이너에 ref와 tabIndex를 두고, 열릴 때 그 컨테이너로 focus를 옮기며 닫을 때 열었던 요소로 되돌린다. Tab 트랩은 활성 scope(선택기가 열려 있으면 선택기, 아니면 dialog)에서만 순환하고 Escape는 선택기를 먼저 닫는다. 공유 picker 컴포넌트는 재사용 가능한 상태로 유지한다.
- [x] **Step 2: 프롬프트의 맥락 정책을 출처 우선순위로 통일한다.** 대화 → 별도 첨부 → 파일 맥락/양식 순으로 사용하고 세 출처에 없는 값만 질문한다. reportLanguage 기본값은 확정 언어 선호가 아니며 대화·첨부의 언어 요청이 우선한다. 초기 매핑 브리핑과 한 번에 한 질문은 그대로 둔다.
- [x] **Step 3: 좁은 회귀 검증을 추가한다.** 프롬프트의 출처 우선순위·언어 정책·all-source/missing-only 규칙과 브리핑/단일 질문 유지, 그리고 시간 변경 시 자동 배분 재계산(수동 1h+자동 5h → 3h에서 수동 1h+자동 2h)을 단언한다.
- [x] **Step 4: 업무 시간 변경 시 자동 배분을 즉시 재계산한다.** 저장 경로와 같은 `allocateNotionCardHours`를 재사용해 자동 배분만 갱신하고 수동 배분·source/카드 메타데이터는 보존한다. 수동 초과는 조용히 수정하지 않는다.
- [x] **Step 5: 검증과 문서 갱신.** 도메인 tsx 테스트 56 pass, domain/db/web typecheck exit 0, 변경 파일 ESLint exit 0, `git diff --check` 통과. workflow/architecture/roadmap/spec/plan을 실제 동작으로 갱신하고 focus 동작은 정적 검토까지만 기록한다.
- [ ] **Step 6: 사용자가 브라우저에서 선택기 Tab 순환·초기 focus·focus 복귀·Escape 순서와 시간 변경 배분 미리보기를 직접 확인한다.** 에이전트는 브라우저 UI 자동화와 제품 build를 실행하지 않는다.


## 2026-10-14 추가 요청 — 프로젝트 전체 포함/제외와 경고 표

**Goal:** 프로젝트 헤더의 전체 포함 체크박스와 경고 표를 추가한다. 스펙 말미의 추가 요청이 경고 목록 표현과 프로젝트 단위 선택 범위를 대체한다.

**Files:** `apps/web/src/components/year-end-review/year-end-review-workspace.tsx`, `packages/domain/src/year-end-review.ts`, `packages/domain/src/year-end-review.test.ts`, 공개 문서.

- [x] **Step 1: 프로젝트 헤더 전체 포함 체크박스를 추가한다.** 펼치기 버튼과 형제인 컨테이너에 native `input[type=checkbox]`를 두고 전체 포함·일부 포함(indeterminate)·전체 제외를 구분한다. indeterminate는 DOM 속성이라 ref effect로 반영하고, 일부 포함 상태에서 클릭하면 브라우저가 checked=true로 바꾸므로 전체 포함이 된다. 프로젝트 이름과 포함/전체 건수를 포함한 `aria-label`과 눈에 보이는 카운트를 함께 제공하며, 개별 업무 체크박스가 바뀌면 헤더 상태가 즉시 다시 계산된다.
- [x] **Step 2: 범위를 원본 기간 전체로 잡고 기존 제외 Set을 재사용한다.** `data.entries`로 `project:${entry.project}` 키마다 로드된 업무 ID를 모아 프로젝트·카테고리·빠른 필터에 가려진 업무까지 포함한다. identity는 원본 프로젝트 값이라 빈 프로젝트와 `프로젝트 미분류`라는 실제 프로젝트가 구분된다. 전체 제외는 그 프로젝트 ID만 Set에 추가하고, 전체 포함은 개별 제외까지 해제하며 다른 프로젝트는 건드리지 않는다. 새 저장 상태·schema·도메인 함수를 만들지 않아 snapshot·파일·연결·집계·scope 제외 건수가 기존 규칙을 그대로 따른다.
- [x] **Step 3: 화면에서 범위를 짧게 설명한다.** 프로젝트 보기의 검토 패널에 헤더 체크박스가 현재 조회 기간의 해당 프로젝트 업무 전체(필터에 가려진 업무 포함)를 다루고 개별 제외와 같은 상태를 공유한다는 안내를 둔다.
- [x] **Step 4: 경고 목록을 표로 바꾼다.** `resolveYearEndReviewWarnings` 결과를 그대로 써서 `날짜` | `관련 업무/카드` | `경고 내용` | `수정` 열과 caption·열 헤더를 가진 표를 만든다. 경고가 여러 날짜를 가지면 resolver가 만든 결정적 순서대로 날짜마다 행을 만들고, 각 행의 수정 버튼이 `setEditDateKey`로 그 날짜 팝업을 연다. 날짜를 찾지 못한 경고는 `날짜 미확인`·`관련 기록 없음`·수정 불가로 남기고 UUID를 표시하지 않는다. 긴 내용은 줄바꿈되고 좁은 화면은 표를 가로로 스크롤한다. 경고는 원본 `data`에서 계산하므로 제외한 업무의 문제도 남는다.
- [x] **Step 5: 좁은 도메인 회귀 테스트를 추가한다.** 프로젝트 전체 제외로 추가한 ID가 그 업무를 가리는 필터에서도 `excludedEntryCount`에 유지되고(`excludedMatchingEntryCount` 0), 필터를 풀어도 다시 포함되지 않으며, export에서 그 프로젝트 업무·연결이 빠지고 다른 프로젝트만 남는지 단언한다. `project:` 키와 `프로젝트 미분류` 이름 충돌은 기존 요약 테스트가 이미 다룬다.
- [x] **Step 6: 검증과 문서 갱신.** `packages/domain`에서 `pnpm dlx tsx@4 --test src/year-end-review.test.ts src/notion-cards.test.ts` 57 pass(이전 56 pass), `@timesheet/domain`·`@timesheet/web` `tsc --noEmit` exit 0, 변경 파일 ESLint exit 0, `git diff --check` 통과. 이 환경에서 `npx tsx`가 동작하지 않아 pnpm 러너를 사용했고, DB 영속화 경로를 바꾸지 않아 DB 테스트는 실행하지 않았다. workflow/roadmap/spec/plan을 실제 동작으로 갱신하고 브라우저 확인은 사용자 담당으로 기록한다.
- [ ] **Step 7: 사용자가 브라우저에서 프로젝트 헤더 체크박스와 경고 표를 직접 확인한다.** indeterminate 표시와 클릭 시 전체 포함, 접힌 묶음에서의 조작, 카운트 즉시 갱신, 경고 행별 수정 버튼·가로 스크롤·긴 내용 줄바꿈. 에이전트는 브라우저 UI 자동화와 제품 build를 실행하지 않았고 확인 방식은 정적 코드 검토까지다.

## 2026-10-14 명칭 변경 — 연말 정리

- [x] 사용자 요청으로 코디네이터가 직접 메뉴·metadata·화면 제목·안내·오류 문구·Markdown 제목·프롬프트 도입을 정리 중심으로 수정했다. 평가 양식 관련 인터뷰 규칙과 모든 기능·데이터 계약은 유지한다.
- [x] README와 제품 문서·workflow·roadmap·spec의 제품 이름을 갱신했다. 기존 도메인 회귀 테스트 27/27과 변경 코드 4개 파일 ESLint, web `tsc --noEmit`, `git diff --check` 통과. 빌드·브라우저 테스트는 실행하지 않았다.
