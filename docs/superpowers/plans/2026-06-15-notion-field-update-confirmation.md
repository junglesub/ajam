# Notion Open Card Field Update Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask for user confirmation before writing calculated Notion number fields from the `열린 카드 동기화` flow only.

**Architecture:** Timesheet save/delete keeps automatic non-blocking Notion field writes. The Notion card sync action returns synced cards plus an optional field-update prompt, and the Notion card screen calls a separate server action to write fields only when the user approves.

**Tech Stack:** Next.js server actions, React client state, existing SQLite-backed stores, Notion page PATCH helper in `@timesheet/db`.

---

### Task 1: Restore Timesheet Save/Delete Auto Writes

**Files:**
- Modify: `apps/web/src/app/(app)/timesheet/actions.ts`
- Modify: `apps/web/src/app/(app)/timesheet/page.tsx`
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`

- [ ] **Step 1: Restore server action return values**

`saveTimesheetEntryAction` returns `StoredTimesheetDraft` again. `deleteTimesheetEntryAction` returns `void` again.

- [ ] **Step 2: Restore automatic Notion field writes**

After save/delete, call `syncNotionWorkHoursAfterTimesheetSave` with affected Notion page IDs. The helper catches Notion write errors so aJam persistence remains successful.

- [ ] **Step 3: Remove daily-screen confirmation state**

Remove `TimesheetNotionFieldUpdatePrompt`, `TimesheetSaveResult`, `TimesheetDeleteResult`, `syncNotionFieldsAction`, and the daily screen confirmation modal.

### Task 2: Add Confirmation To Open Card Sync

**Files:**
- Modify: `apps/web/src/app/(app)/notion-cards/actions.ts`
- Modify: `apps/web/src/app/(app)/notion-cards/page.tsx`
- Modify: `apps/web/src/components/notion-cards/types.ts`
- Modify: `apps/web/src/components/notion-cards/notion-card-workspace.tsx`
- Create: `apps/web/src/components/notion-cards/notion-field-update-modal.tsx`

- [ ] **Step 1: Return field-update prompt from sync**

`syncNotionDateCandidatesAction` returns `{ cards, notionFieldUpdate }`. The prompt is present only when synced cards exist, a token is stored, and at least one writable mapped number field exists.

- [ ] **Step 2: Add explicit field update action**

Expose `syncNotionCardFieldsAction(notionPageIds)` from the Notion card actions module. It validates the logged-in user and calls `syncNotionWorkHoursForPages`.

- [ ] **Step 3: Render Notion card modal**

Add `NotionFieldUpdateModal` with `건너뛰기` and `업데이트` buttons. The modal lists affected card count and field labels.

- [ ] **Step 4: Wire approval**

When the user confirms, call `syncCardFieldsAction(prompt.notionPageIds)`, close on success, show an inline error on failure, and reload the monthly analysis.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/timesheet-workflow.md`

- [ ] **Step 1: Document corrected behavior**

State that timesheet save/delete writes Notion fields automatically, while `열린 카드 동기화` asks before writing synced card fields.

- [ ] **Step 2: Run type checks**

Run:

```powershell
& "C:\Users\RyooJungsub\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ..\..\node_modules\typescript\bin\tsc --noEmit
```

from `apps/web` and `packages/db`.

- [ ] **Step 3: Commit**

Commit with:

```bash
git commit -m "fix(notion): move field prompt to card sync"
```
