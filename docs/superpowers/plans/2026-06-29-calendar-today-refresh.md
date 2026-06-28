# Calendar Today Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the timesheet calendar's browser-local today state while the page stays open across midnight.

**Architecture:** Keep the behavior in the existing timesheet workspace component because `todayKey`, selected date state, drafts, and calendar/list rows already live there. Add a small interval effect that only updates state when the browser-local date key changes, and preserve the user's current month/date instead of forcing navigation.

**Tech Stack:** Next.js App Router, React client component state/effects, TypeScript, pnpm workspace.

---

### Task 1: Add Today Refresh Logic

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`

- [ ] **Step 1: Add interval constants and helper**

Add a one-minute interval constant near the existing module constants, plus a helper that detects the default future vacation placeholder created by `createFutureDraftForDate`.

- [ ] **Step 2: Add the interval effect**

In `TimesheetWorkspace`, add a `useEffect` that computes `toBrowserDateKey(new Date())` every minute. If the value differs from the current `todayKey`, call `setTodayKey`.

- [ ] **Step 3: Normalize an unlocked default future draft**

When the new today key matches the selected date and the selected draft is an unsaved default future vacation placeholder, replace it with `createDraftForDate(newTodayKey, currentRecords)` and update `selectedEntryIdByDate` to the new work entry.

### Task 2: Document Workflow

**Files:**
- Modify: `docs/timesheet-workflow.md`

- [ ] **Step 1: Update Default Drafts**

Add a bullet explaining that the page checks the browser-local today key while open, and that when a future selected date becomes today it becomes writable without a page refresh.

### Task 3: Verify

**Files:**
- Read: `apps/web/package.json`

- [ ] **Step 1: Typecheck the web app**

Run: `pnpm --filter @timesheet/web typecheck`

Expected: TypeScript completes without errors.

- [ ] **Step 2: Avoid build**

Do not run `pnpm build` or `pnpm --filter @timesheet/web build` because the user instructed not to build unless explicitly requested.
