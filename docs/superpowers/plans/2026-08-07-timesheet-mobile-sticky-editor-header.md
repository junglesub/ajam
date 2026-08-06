# Timesheet Mobile Sticky Editor Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the daily editor header visible while its mobile popup scrolls.

**Architecture:** Reuse the existing header inside the editor's overflow container. Tailwind responsive utilities make it sticky below `lg` and static on desktop, while the existing bottom action area's sticky behavior remains independent.

**Tech Stack:** React 19, Next.js 16, TypeScript 5.9, Tailwind CSS 4

## Global Constraints

- Do not add dependencies or restructure the popup.
- Preserve the desktop right-side editor layout from `lg` upward.
- Preserve the existing mobile sticky save/action area.
- Do not run a build.

---

### Task 1: Pin the mobile editor header

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `docs/timesheet-workflow.md`

**Interfaces:**
- Consumes: the existing daily-editor `<aside>` scroll container and header wrapper.
- Produces: a mobile-only sticky editor header with unchanged controls and DOM order.

- [ ] **Step 1: Apply the responsive sticky classes**

Change the existing header wrapper to:

```tsx
<div className="sticky top-0 z-30 border-b border-slate-200 bg-white px-5 py-4 lg:static">
```

- [ ] **Step 2: Reset mobile popup scroll after date changes**

Add a mobile-modal-only effect keyed by `selectedDateKey`:

```tsx
useEffect(() => {
  if (!isDailyEditorModalActive) return;
  const frameId = requestAnimationFrame(() => dailyEditorRef.current?.scrollTo({ top: 0 }));
  return () => cancelAnimationFrame(frameId);
}, [isDailyEditorModalActive, selectedDateKey]);
```

- [ ] **Step 3: Document the behavior**

Update the calendar popup description in `docs/timesheet-workflow.md` to state that both the header and save/action area remain pinned while the form scrolls, and that changing dates resets the mobile popup to the top.

- [ ] **Step 4: Run static verification**

Run:

```powershell
node node_modules/eslint/bin/eslint.js apps/web/src/components/timesheet/timesheet-workspace.tsx
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --declaration false --declarationMap false
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 5: Verify in the existing 425px browser tab**

Open the daily editor, record the header rectangle, scroll the dialog to its midpoint and bottom, and verify the header top coordinate is unchanged. While scrolled down, move to the next date and verify `scrollTop` returns to `0`. Confirm the save/action area's bottom coordinate stays aligned with the dialog bottom and the document width does not overflow.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/components/timesheet/timesheet-workspace.tsx docs/timesheet-workflow.md docs/superpowers/specs/2026-08-07-timesheet-mobile-sticky-editor-header-design.md docs/superpowers/plans/2026-08-07-timesheet-mobile-sticky-editor-header.md
git commit -m "fix(timesheet): pin mobile editor header"
```
