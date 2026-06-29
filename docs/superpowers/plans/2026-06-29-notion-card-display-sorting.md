# Notion Card Display And Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Notion card duration display, add picker last-worked-date sorting, show card metrics in the picker and linked-card pills, and make clickable Notion card connection surfaces non-selectable.

**Architecture:** Keep duration formatting in the existing Notion card component formatter so the Notion tab and timesheet card-link UI share one display rule. Extend the timesheet candidate server action with compact card metrics, then keep sorting fully client-side in `NotionCardPickerModal` using `localStorage` for persistence. Limit selection-behavior changes to the picker and linked-card section classes.

**Tech Stack:** Next.js App Router server actions, React client components, TypeScript, pnpm workspace.

---

### Task 1: Shared Duration Formatting

**Files:**
- Modify: `apps/web/src/components/notion-cards/duration-format.ts`

- [ ] **Step 1: Replace decimal day display**

Implement a mixed `Xd Yh` formatter and keep raw hours in parentheses when requested. Use `8h = 1d`. Examples: `12 -> 1d 4h (12h)`, `8 -> 1d (8h)`, `4 -> 4h (4h)`, `0 -> 0h (0h)`.

### Task 2: Candidate Card Metrics

**Files:**
- Modify: `apps/web/src/app/(app)/notion-cards/actions.ts`
- Modify: `apps/web/src/app/(app)/timesheet/actions.ts`
- Modify: `apps/web/src/components/notion-cards/types.ts`
- Modify: `apps/web/src/components/timesheet/use-notion-card-candidates.ts`

- [ ] **Step 1: Add candidate metric fields**

Add linked work duration, work day count, available hours, and last worked date to the timesheet Notion candidate result.

- [ ] **Step 2: Compute latest linked WORK date**

Use existing Notion work-hour sync helpers to compute linked hours, distinct linked work dates, latest linked work date, and available hours for the candidate cards.

### Task 3: Sortable Notion Card Picker

**Files:**
- Modify: `apps/web/src/components/timesheet/notion-card-picker-modal.tsx`

- [ ] **Step 1: Add persisted sort state**

Use `useState` and `useEffect` with a `localStorage` key such as `ajam:notion-card-picker-sort`. Default to `lastWorkedDesc`.

- [ ] **Step 2: Add sort control**

Render a compact labeled `select` above the candidate list with options for latest worked date, linked work duration, work day count, available hours, and title.

- [ ] **Step 3: Sort cards before rendering**

Use a memoized sorted copy. Numeric sorts fall back to `0`, date sorts fall back to the oldest value, and title sort uses Korean locale comparison.

- [ ] **Step 4: Add compact candidate metrics**

Show `업무 1d 4h` and `마지막 132일 전` in each candidate row.

### Task 4: Non-Selectable Clickable Connection Surfaces

**Files:**
- Modify: `apps/web/src/components/timesheet/notion-card-picker-modal.tsx`
- Modify: `apps/web/src/components/timesheet/notion-card-link-section.tsx`

- [ ] **Step 1: Make picker rows non-selectable**

Add `select-none` to card picker rows, labels, and icon buttons. Preserve the existing external-link `stopPropagation`.

- [ ] **Step 2: Make linked-card controls non-selectable**

Add `select-none` to linked-card containers, labels, add/remove buttons, and allocation summary. Do not add `select-none` directly to the numeric input so editing remains normal.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/timesheet-workflow.md`
- Create: `docs/superpowers/specs/2026-06-29-notion-card-display-sorting-design.md`
- Create: `docs/superpowers/plans/2026-06-29-notion-card-display-sorting.md`

- [ ] **Step 1: Update workflow docs**

Document the new duration format, last-worked-date column, calendar-relative text, and persisted sort choice.

- [ ] **Step 2: Run verification**

Run `pnpm.cmd --filter @timesheet/domain test`, `pnpm.cmd --filter @timesheet/web typecheck`, and `pnpm.cmd --filter @timesheet/db typecheck`. Do not run build.
