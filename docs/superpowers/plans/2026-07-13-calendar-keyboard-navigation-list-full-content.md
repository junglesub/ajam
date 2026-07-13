# Calendar Keyboard Navigation And List Full Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe keyboard date navigation to three screens, a browser-persisted full-content toggle, and `Tab` view switching outside the timesheet editor.

**Architecture:** A small web helper owns shortcut suppression and month/date arithmetic. Each mounted workspace handles its own keys and calls existing loading and selection functions. The timesheet marks its daily editor as one shortcut-excluded region and toggles its existing view state for plain `Tab` elsewhere.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, Node test runner, pnpm.

## Global Constraints

- Do not add dependencies or an app-wide shortcut registry.
- Ignore shortcuts in editable controls, with Ctrl/Cmd/Alt, during composition, on repeated keydown, and while a modal is open.
- Do not change server data or synchronize the list preference across browsers.
- Do not run a production build unless explicitly requested.
- Preserve the unrelated `apps/web/next.config.ts` worktree change.

---

### Task 1: Shared Shortcut Helper

**Files:**
- Create: `apps/web/src/lib/calendar-shortcuts.ts`
- Create: `apps/web/src/lib/calendar-shortcuts.test.mjs`

**Interfaces:**
- Produces: `shouldIgnoreCalendarShortcut(event: CalendarShortcutEvent, modalOpen?: boolean): boolean`
- Produces: `shiftMonth(month: string, delta: number): string`
- Produces: `browserMonth(): string`

- [x] Write Node tests proving editable targets, modifiers, composition, repeats, and open modals are ignored and month shifting handles year boundaries.
- [x] Run `node --test apps/web/src/lib/calendar-shortcuts.test.mjs` and confirm it fails before the helper exists.
- [x] Implement the three minimal helper functions with native `Date` and `Element.closest` behavior.
- [x] Run `node --test apps/web/src/lib/calendar-shortcuts.test.mjs` and confirm all tests pass.

### Task 2: Workspace Keyboard Navigation

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Modify: `apps/web/src/components/notion-cards/notion-card-workspace.tsx`

**Interfaces:**
- Consumes: `shouldIgnoreCalendarShortcut`, `shiftMonth`, and `browserMonth` from Task 1.

- [x] Add a window keydown listener to timesheet: `j` and `k` call existing month navigation, `t` calls existing today navigation, left/right select the adjacent visible business day, and up/down select `selectedDateKey` plus `-7` or `7` days only in calendar mode.
- [x] Ensure timesheet navigation continues through `requestNavigation`, preserving dirty-edit confirmation and existing cross-month loading.
- [x] Add a window keydown listener to vacation: `j`/`k` load adjacent years and `t` loads the current year then calls `openDateModal(initialTodayKey)`.
- [x] Add a window keydown listener to Notion cards: `j`/`k` shift the selected month and `t` selects the browser's current month through `monthState.setMonth`.
- [x] Pass each screen's modal state to the shared suppression helper.
- [x] Run `pnpm.cmd --filter @timesheet/web typecheck` and resolve every reported error.

### Task 3: Persisted Full-Content List Toggle

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`

**Interfaces:**
- Produces local state `showFullListContent: boolean` stored under `timesheet:list:show-full-content`.
- Passes `showFullContent: boolean` into `ListView`.

- [x] Initialize the preference as `false`, then restore only the exact stored value `"true"` after mount.
- [x] Add the `내용 전체 보기` checkbox inside the list view header and persist changes with a guarded `localStorage.setItem`.
- [x] Render work content and AI translation with `whitespace-pre-wrap` when enabled; retain existing two-line clamps when disabled.
- [x] Keep empty/missing rows and calendar previews unchanged.
- [x] Run `pnpm.cmd --filter @timesheet/web typecheck` and the shortcut helper tests.

### Task 4: Documentation, Review, And Merge Readiness

**Files:**
- Modify: `docs/timesheet-workflow.md`
- Modify: `docs/superpowers/plans/2026-07-13-calendar-keyboard-navigation-list-full-content.md`

**Interfaces:** None.

- [x] Document the three screens' shortcuts, arrow behavior, input/modal suppression, and browser-local list preference in `docs/timesheet-workflow.md`.
- [x] Review the complete diff for correctness, regressions, accessibility, stale closures, cross-month behavior, and accidental inclusion of `apps/web/next.config.ts`; fix every finding.
- [x] Run `node --test apps/web/src/lib/calendar-shortcuts.test.mjs`, `pnpm.cmd --filter @timesheet/web typecheck`, and `git diff --check` fresh.
- [x] Confirm every requirement in the design has direct code or test evidence and mark this checklist complete.
- [x] Commit only the feature, tests, plan, and documentation with Angular-style messages; report whether the result is suitable to remain on `main`.

### Task 5: Timesheet Tab View Switching

**Files:**
- Modify: `apps/web/src/lib/calendar-shortcuts.ts`
- Test: `apps/web/src/lib/calendar-shortcuts.test.mjs`
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `docs/timesheet-workflow.md`

**Interfaces:**
- Extends: `shouldIgnoreCalendarShortcut` to ignore ancestors marked with `data-calendar-shortcuts-ignore`.
- Consumes: existing `viewMode` and `setViewMode` state in the timesheet workspace.

- [x] Add a failing helper test whose target returns a match for `[data-calendar-shortcuts-ignore]` and assert shortcut suppression is `true`.
- [x] Run `node --test apps/web/src/lib/calendar-shortcuts.test.mjs` and confirm the new assertion fails.
- [x] Add `[data-calendar-shortcuts-ignore]` to the existing `editableSelector` and mark the right-side `<aside>` with `data-calendar-shortcuts-ignore`.
- [x] In the existing timesheet keydown listener, handle plain `Tab` before month and arrow keys:

```tsx
if (event.key === "Tab" && !event.shiftKey) {
  event.preventDefault();
  setViewMode((current) => current === "calendar" ? "list" : "calendar");
  return;
}
```

- [x] Document that plain `Tab` switches views only outside the daily editor, while `Shift+Tab` and editor-local Tab navigation retain native behavior.
- [x] Run the focused helper tests, web typecheck, and `git diff --check`; manually verify the three Tab behaviors in the browser without running a production build.
- [x] Commit the feature, test, plan completion, and workflow documentation without staging `apps/web/next.config.ts`.

### Task 6: Shortcut Hints And List Row Navigation

**Files:**
- Modify: `apps/web/src/lib/calendar-shortcuts.ts`
- Test: `apps/web/src/lib/calendar-shortcuts.test.mjs`
- Modify: `packages/ui/src/segmented-control.tsx`
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Modify: `docs/timesheet-workflow.md`

**Interfaces:**
- Produces: `adjacentListTarget(targets, selectedDateKey, selectedEntryId, direction)` returning the adjacent target or `undefined` at a boundary.
- Extends: segmented-control items with optional `title?: string` passed to the underlying button.
- Reuses: `updateShowFullListContent`, `selectDate`, `selectDateEntry`, and existing list row order.

- [x] Add failing tests proving adjacent list navigation crosses entries on the same date, stops at both boundaries, and enters the list from the appropriate edge when the selected date is absent.
- [x] Run `node --test apps/web/src/lib/calendar-shortcuts.test.mjs` and confirm the new tests fail before `adjacentListTarget` exists.
- [x] Implement `adjacentListTarget` with `findIndex` and array bounds only; add no component-specific row parser.
- [x] Add optional `title` support to segmented-control items and assign native titles to timesheet previous/next/today/view buttons and vacation previous/next/current-year buttons.
- [x] Move the list full-content preference to an icon-only `WrapText` button before the today button, with `aria-pressed`, a state-aware title, and the existing persisted update function; remove the in-list checkbox and callback prop.
- [x] Build navigation targets in rendered list order. On list-view ArrowUp/ArrowDown, call `adjacentListTarget`, then reuse `selectDateEntry` for entry rows or `selectDate` for missing rows.
- [x] Keep list row button refs in `ListView` and focus the newly selected row with `preventScroll`, matching calendar focus behavior.
- [x] Update `docs/timesheet-workflow.md` with hover hints, icon placement, and list row arrow behavior.
- [x] Run focused shortcut tests, the web and UI typechecks, and `git diff --check`; manually verify hover titles, list icon persistence, row movement, boundaries, and focus in the browser without running a production build.
- [x] Commit the feature and then mark this task complete without staging `apps/web/next.config.ts`.

### Task 7: Full-Content Keyboard Toggle

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `docs/timesheet-workflow.md`

**Interfaces:**
- Reuses: `updateShowFullListContent(checked: boolean)` and the existing screen-level keydown listener.

- [x] In the existing listener, handle unmodified lowercase `f` only while `viewMode === "list"`, call `preventDefault()`, and toggle through `updateShowFullListContent(!showFullListContent)`.
- [x] Keep editor, modal, modifier, composition, and repeat suppression unchanged by placing the branch after `shouldIgnoreCalendarShortcut`.
- [x] Add `(F)` to both state-aware full-content icon titles and document the shortcut in `docs/timesheet-workflow.md`.
- [x] Run focused shortcut tests, web typecheck, and `git diff --check`; manually verify `F` toggles and persists in list view but does nothing in calendar view and the right-side editor.
- [x] Commit the feature and mark this task complete without staging `apps/web/next.config.ts`.

### Task 8: Date Summary Bands

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `docs/timesheet-workflow.md`

- [x] Group list rows under a non-interactive date band showing date, work hours, leave or holiday information, and the day-level short version across the project, content, and AI translation columns when present.
- [x] Keep the short version to one line in compact mode and wrap it within the summary band in full-content mode.
- [x] Remove the repeated date column while preserving entry-row click selection, focus refs, and ArrowUp/ArrowDown target order.
- [x] Run the focused shortcut tests, web typecheck, and `git diff --check` without running a production build.
