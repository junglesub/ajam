# Vacation Type Bulk Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택한 연도에서 같은 이름으로 묶인 휴가를 휴가 유형 목록에서 한 번에 새 이름으로 변경한다.

**Architecture:** 기존 연도별 휴가 그룹 UI에 인라인 이름 편집기를 추가하고, 서버 액션이 DB의 현재 `TimesheetEntry`와 레거시 `Vacation` 저장 경로를 단일 트랜잭션으로 갱신한다. 갱신 후 기존 `loadVacationYearAction` 결과를 반환해 클라이언트 상태와 관련 화면을 새로고침한다.

**Tech Stack:** TypeScript, React 19, Next.js server actions, Prisma raw SQLite queries, Node.js test runner, pnpm workspace

## Global Constraints

- 이름 변경 범위는 선택한 연도와 현재 사용자로 제한한다.
- 공백 저장 이름과 실제 `휴가` 이름은 화면 그룹과 동일하게 하나의 `휴가` 이름으로 취급한다.
- 휴가 시간, 상태, 날짜, 업무 기록과 색상 설정은 변경하지 않는다.
- 새 이름이 기존 유형과 같으면 두 그룹을 합친다.
- 새 의존성이나 별도 휴가 유형 엔터티를 추가하지 않는다.
- 빌드는 실행하지 않는다.

---

### Task 1: 원자적 연도별 이름 변경 저장 함수

**Files:**
- Create: `packages/db/src/vacation-name-store.test.ts`
- Modify: `packages/db/src/timesheet-store.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: 기존 `ensureTimesheetSchema()`, `prisma.$transaction()`, SQLite `trim()`.
- Produces: `renameVacationTypeForYear(params: { endDateKey: string; newName: string; oldName: string; startDateKey: string; userId: string }): Promise<number>`.

- [x] **Step 1: 실패하는 DB 테스트 작성**

  임시 SQLite DB에 두 사용자와 현재/다른 연도의 `TimesheetEntry`, 레거시 `Vacation` 행을 넣는다. `oldName: "휴가"`, `newName: "대체 휴가"`로 실행한 뒤 현재 사용자의 선택 연도에서 공백 및 `휴가` 이름만 바뀌고 다른 사용자·다른 연도는 유지되는지 검증한다. `newName: "   "`은 reject 되는지도 확인한다.

```ts
const changed = await store.renameVacationTypeForYear({
  endDateKey: "2026-12-31",
  newName: " 대체 휴가 ",
  oldName: "휴가",
  startDateKey: "2026-01-01",
  userId: "user-1"
});
assert.equal(changed, 3);
assert.deepEqual(currentUserRows.map((row) => row.name), ["대체 휴가", "대체 휴가", "대체 휴가"]);
await assert.rejects(() => store.renameVacationTypeForYear({ ...params, newName: "   " }), /이름/);
```

- [x] **Step 2: 테스트 실패 확인**

  Run: `pnpm --filter @timesheet/db exec node --import tsx --test src/vacation-name-store.test.ts`
  Expected: `renameVacationTypeForYear`가 없어 FAIL.

- [x] **Step 3: 최소 저장 함수 구현 및 export**

  새 이름을 trim하고 빈 값이면 거부한다. 기존 이름은 `normalizeVacationName()`으로 정규화하고, 아래 조건을 두 테이블에 적용한다.

```sql
CASE WHEN trim("vacationName") = '' THEN '휴가' ELSE trim("vacationName") END = ?
```

  `TimesheetEntry`에는 `kind = 'VACATION'` 조건도 적용하며 두 UPDATE를 하나의 `prisma.$transaction()`에서 실행한다. 변경 행 수 합계를 반환하고 `packages/db/src/index.ts`에서 export한다. DB test script에는 새 테스트 파일을 명시적으로 추가한다.

- [x] **Step 4: DB 테스트 통과 확인**

  Run: `pnpm --filter @timesheet/db test`
  Expected: 기존 색상 테스트와 새 이름 변경 테스트가 모두 PASS.

- [x] **Step 5: 저장 계층 커밋**

```bash
git add packages/db/src/timesheet-store.ts packages/db/src/index.ts packages/db/src/vacation-name-store.test.ts packages/db/package.json
git commit -m "feat(db): rename vacation types by year"
```

### Task 2: 서버 액션과 인라인 이름 편집 UI

**Files:**
- Modify: `apps/web/src/app/(app)/vacations/actions.ts`
- Modify: `apps/web/src/app/(app)/vacations/page.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Modify: `apps/web/src/components/vacations/vacation-summary-panel.tsx`

**Interfaces:**
- Consumes: Task 1의 `renameVacationTypeForYear(...)`, 기존 `loadVacationYearAction(year)`와 `broadcastViewRefresh(...)`.
- Produces: `saveVacationTypeNameAction(year: number, oldName: string, newName: string): Promise<VacationYearData>` 및 `onNameSave(oldName: string, newName: string): Promise<void>`.

- [x] **Step 1: 서버 액션 연결**

  `saveVacationTypeNameAction`에서 세션 사용자와 연도를 검증하고, `newName.trim()`이 비면 `휴가 유형 이름을 확인해 주세요.`를 throw한다. `getYearRange(year)`로 범위를 만들고 저장 함수를 호출한다. 변경 수가 0이면 `변경할 휴가를 찾지 못했습니다.`를 throw한다. 성공 시 `/timesheet`, `/vacations`를 revalidate하고 연도 데이터를 반환한다.

```ts
export async function saveVacationTypeNameAction(year: number, oldName: string, newName: string): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidYear(year);
  const name = newName.trim();
  if (!name) throw new Error("휴가 유형 이름을 확인해 주세요.");
  if (normalizeVacationName(oldName) === name) return loadVacationYearAction(year);
  const changed = await renameVacationTypeForYear({ ...getYearRange(year), newName: name, oldName, userId: user.id });
  if (changed === 0) throw new Error("변경할 휴가를 찾지 못했습니다.");
  revalidatePath("/timesheet");
  revalidatePath("/vacations");
  return loadVacationYearAction(year);
}
```

- [x] **Step 2: 페이지와 워크스페이스에 액션 전달**

  페이지에서 액션을 import해 `VacationYearWorkspace` prop으로 넘긴다. 워크스페이스의 `saveVacationTypeName`은 반환된 전체 연도 데이터를 `applyVacationYearData(data, { preserveAllowanceDraft: true })`로 적용하고 `vacations`, `timesheet`, `ai-summary`, `projects` scope에 mutation refresh를 보낸다.

- [x] **Step 3: 휴가 이름 인라인 편집기 구현**

  유형 이름을 `<button type="button">`으로 바꾸고 클릭 시 현재 이름으로 draft를 초기화한다. 해당 행 아래에 `<form>`과 기존 `Input`, `Button`을 사용한 이름 입력·취소·변경 버튼을 표시한다. submit 시 빈 값과 변경 중 상태를 검사하고, 성공 시 닫으며 실패 시 `휴가 유형 이름을 변경하지 못했습니다.`를 `aria-live="polite"` 영역에 표시한다. 색상 편집 state는 그대로 독립 유지한다.

- [x] **Step 4: 앱과 패키지 타입 검사**

  Run: `pnpm --filter @timesheet/db typecheck`
  Expected: exit 0.

  Run: `pnpm --filter @timesheet/web typecheck`
  Expected: exit 0.

- [x] **Step 5: UI·액션 커밋**

```bash
git add "apps/web/src/app/(app)/vacations/actions.ts" "apps/web/src/app/(app)/vacations/page.tsx" apps/web/src/components/vacations/vacation-year-workspace.tsx apps/web/src/components/vacations/vacation-summary-panel.tsx
git commit -m "feat(vacation): rename types for selected year"
```

### Task 3: 제품 문서와 최종 검증

**Files:**
- Modify: `docs/product-brief.md`
- Modify: `docs/architecture.md`
- Modify: `docs/decisions.md`

**Interfaces:**
- Consumes: Task 1~2의 최종 동작.
- Produces: 선택 연도 일괄 이름 변경 범위와 색상 미이전 정책의 최신 문서.

- [x] **Step 1: 기존 문서 갱신**

  제품 범위에 휴가 유형 이름 일괄 변경을 추가한다. 아키텍처의 `/vacations` 데이터 흐름에 선택 연도·현재 사용자 제한과 양쪽 저장 테이블의 트랜잭션 갱신을 기록한다. 결정 문서에는 색상 설정을 이동하지 않고 기존 대상 설정 또는 자동 색상을 사용한다는 결정을 추가한다.

- [x] **Step 2: 전체 관련 테스트와 타입 검사**

  Run: `pnpm --filter @timesheet/db test`
  Expected: 모든 테스트 PASS.

  Run: `pnpm --filter @timesheet/domain test`
  Expected: 모든 테스트 PASS.

  Run: `pnpm --filter @timesheet/db typecheck`
  Expected: exit 0.

  Run: `pnpm --filter @timesheet/web typecheck`
  Expected: exit 0.

  Run: `git diff --check`
  Expected: exit 0, 출력 없음.

- [x] **Step 3: 요구사항 대조 검토**

  설계 문서의 범위, UI, 데이터 흐름, 오류 처리, 검증 항목마다 구현 파일 또는 테스트 결과가 있는지 확인한다. 빌드 명령이 실행되지 않았는지도 명령 기록으로 확인한다.

- [x] **Step 4: 문서와 계획 체크 상태 커밋**

```bash
git add docs/product-brief.md docs/architecture.md docs/decisions.md docs/superpowers/plans/2026-08-05-vacation-type-bulk-rename.md
git commit -m "docs(vacation): document bulk type rename"
```
