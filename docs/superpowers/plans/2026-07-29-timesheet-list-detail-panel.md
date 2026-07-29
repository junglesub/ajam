# Timesheet List Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timesheet list full width until the user explicitly opens the daily record editor, while preserving that intent across view changes.

**Architecture:** Add one local React boolean beside the existing view state. Existing user-driven date and entry selection paths set it, editor focus sets it, and the list-only close button clears it; rendering and grid columns derive directly from the boolean and current view.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, Tailwind CSS, pnpm.

## Global Constraints

- Keep the calendar editor always visible.
- Do not clear the selected date when the list editor closes. Route dirty drafts through the existing unsaved-change confirmation and discard path.
- Do not persist editor intent to browser storage or the server.
- Add no dependency or new abstraction.
- Do not run a production build.

---

### Task 1: User-Intent-Driven List Editor

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `docs/timesheet-workflow.md`
- Modify: `docs/superpowers/plans/2026-07-29-timesheet-list-detail-panel.md`

**Interfaces:**
- Produces local state `isDailyEditorRequested: boolean`.
- Reuses `selectDate(dateKey)`, `selectDateEntry(dateKey, entryClientId)`, and the existing editor `<aside>`.

- [x] **Step 1: Add the intent state and user-driven transitions**

Add `isDailyEditorRequested` with an initial value of `false`. Set it to `true` in `selectDate`, `selectDateEntry`, and the editor's `onFocusCapture`; set it to `false` from the list-only close button.

- [x] **Step 2: Derive layout and rendering**

Use `viewMode === "calendar" || isDailyEditorRequested` to select the existing two-column responsive classes and render the editor. With a closed list editor, keep the same outer container and render only the full-width list section.

- [x] **Step 3: Add the accessible close control**

Import the existing Lucide `X` icon. In the editor header, render an icon-only button only in list view with `aria-label="상세 패널 닫기"` and `type="button"`.

- [x] **Step 4: Update the workflow documentation**

Document initial full-width list behavior, the interactions that preserve editor intent, view switching, and the non-destructive close action in `docs/timesheet-workflow.md`.

- [x] **Step 5: Verify without building**

Run:

```powershell
pnpm.cmd --filter @timesheet/web typecheck
git diff --check
```

Expected: both commands exit with code `0`; no production build runs.

- [x] **Step 6: Review and commit**

Compare the diff with `docs/superpowers/specs/2026-07-29-timesheet-list-detail-panel-design.md`, mark completed checkboxes, and commit with:

```powershell
git add apps/web/src/components/timesheet/timesheet-workspace.tsx docs/timesheet-workflow.md docs/superpowers/plans/2026-07-29-timesheet-list-detail-panel.md
git commit -m "feat(timesheet): collapse list detail panel by default"
```
