# Calendar Period Loading Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an accessible loading overlay over the affected calendar card while timesheet months and vacation years load.

**Architecture:** Reuse the existing `monthLoadState` and `yearLoadState`. Extend the shared loading visual file with one absolute overlay component, then render it conditionally inside positioned timesheet and vacation calendar containers.

**Tech Stack:** React 19, TypeScript, Tailwind CSS

## Global Constraints

- Keep the calendar container mounted beneath the overlay to preserve layout; do not add a second cursor to snapshot previous-period values.
- Do not add loading state, timers, providers, dependencies, or a skeleton system.
- Keep existing error handling; hide the overlay for both `idle` and `error` states.
- Do not run a production build unless the user asks for it.

---

### Task 1: Add the shared loading overlay

**Files:**
- Modify: `apps/web/src/components/app-loading-screen.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: `AppLoadingOverlay({ description, title }: { description: string; title: string })`.
- Consumes: The existing loading spinner and text styling from `AppLoadingScreen`.

- [x] **Step 1: Extract the shared status visual and add the overlay export**

Create a private `LoadingStatus` for the common spinner and copy, keep `AppLoadingScreen` behavior unchanged, and add:

```tsx
export function AppLoadingOverlay({ description, title }: LoadingStatusProps) {
  return (
    <div
      aria-live="polite"
      className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/10 px-6"
      role="status"
    >
      <div className="rounded-lg border border-slate-200 bg-white/95 px-6 py-5 shadow-xl">
        <LoadingStatus description={description} title={title} />
      </div>
    </div>
  );
}
```

- [x] **Step 2: Keep the calendar visible in both themes**

Use the existing dark-mode mapping for `bg-white/95` on the centered panel. The full-card veil uses `bg-slate-950/10`, so it does not need a theme-specific override. Remove any obsolete `bg-white/80` override.

```css
:root[data-theme="dark"] .bg-white\/95 {
  background-color: #252526;
}
```

### Task 2: Cover period-dependent calendars

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Modify: `docs/product-brief.md`

**Interfaces:**
- Consumes: `AppLoadingOverlay`, `monthLoadState`, and `yearLoadState`.
- Produces: Busy calendar containers with repeated navigation blocked until the current load settles.

- [x] **Step 1: Add the timesheet overlay and busy state**

Import `AppLoadingOverlay`, set `aria-busy={monthLoadState === "loading"}`, and add `relative overflow-hidden` to the calendar/list section. Render this as the final child of the section:

```tsx
{monthLoadState === "loading" ? (
  <AppLoadingOverlay
    description="선택한 월의 업무 기록을 준비하고 있습니다."
    title="월 데이터를 불러오는 중"
  />
) : null}
```

Route all runtime month cursor changes through this helper so loading begins in the same event and no target-month frame can paint before the overlay:

```tsx
function updateMonthCursor(nextCursor: { monthIndex: number; year: number }) {
  if (!loadedMonthKeys.has(getMonthCacheKey(nextCursor.year, nextCursor.monthIndex))) {
    setMonthLoadState("loading");
    setMonthLoadError("");
  }

  setMonthCursor(nextCursor);
}
```

Disable the previous, next, header today, and detail-panel today buttons while loading. Add `monthLoadState === "loading"` to the early-return condition in `handleCalendarShortcut`.

- [x] **Step 2: Add the vacation overlay and busy state**

Import `AppLoadingOverlay` and wrap only `VacationYearCalendar`:

```tsx
<div aria-busy={yearLoadState === "loading"} className="relative min-w-0 overflow-hidden rounded-md">
  <VacationYearCalendar
    connectedDateKeys={connectedDateKeys}
    groups={groups}
    hoveredDateKey={hoveredDateKey}
    holidays={holidays}
    onDateClick={openDateModal}
    onDateHover={setHoveredDateKey}
    onDateLeave={() => setHoveredDateKey("")}
    todayKey={initialTodayKey}
    vacations={vacations}
    workDateKeys={workDateKeys}
    year={year}
  />
  {yearLoadState === "loading" ? (
    <AppLoadingOverlay
      description="선택한 연도의 휴가 정보를 준비하고 있습니다."
      title="연도 데이터를 불러오는 중"
    />
  ) : null}
</div>
```

- [x] **Step 3: Document period overlays**

Add this UX principle to `docs/product-brief.md`:

```markdown
- 업무 기록 월과 휴가 연도를 변경할 때는 달력 영역을 유지하고 해당 영역 위에 로딩 상태를 표시한다.
```

- [x] **Step 4: Verify**

Run:

```powershell
pnpm.cmd -r --if-present test
pnpm.cmd lint
pnpm.cmd --filter @timesheet/web typecheck
git diff --check
```

Expected: 49 domain tests pass and all commands exit with code 0. Confirm no dependency, loading provider, timer, or production build output changed.

- [x] **Step 5: Commit**

```powershell
git add -- 'apps/web/src/components/app-loading-screen.tsx' 'apps/web/src/app/globals.css' 'apps/web/src/components/timesheet/timesheet-workspace.tsx' 'apps/web/src/components/vacations/vacation-year-workspace.tsx' 'docs/product-brief.md' 'docs/superpowers/specs/2026-08-03-calendar-period-loading-overlay-design.md' 'docs/superpowers/plans/2026-08-03-calendar-period-loading-overlay.md'
git commit -m "feat(web): overlay calendars while loading"
```
