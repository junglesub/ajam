# Vacation Calendar Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the annual vacation calendar compact and readable from mobile widths through wide desktop layouts.

**Architecture:** Reuse the existing Tailwind grid and breakpoint system. Increase month columns progressively from two to six, use fixed-height date rows below `xl`, and delay the summary side rail until `2xl` so it does not compete with the six-column calendar.

**Tech Stack:** React, Next.js, Tailwind CSS

## Global Constraints

- Add no dependency, component, JavaScript measurement, or horizontal scrolling.
- Preserve the existing calendar interactions, date semantics, and calendar-first order.
- Update the existing vacation overview design document.
- Run tests and lint only after all implementation and documentation edits are complete.
- Do not run a production build.

---

### Task 1: Responsive annual calendar layout

**Files:**
- Modify: `apps/web/src/components/vacations/vacation-year-calendar.tsx`
- Modify: `apps/web/src/components/vacations/vacation-year-workspace.tsx`
- Modify: `docs/superpowers/specs/2026-06-29-vacation-year-overview-design.md`

**Interfaces:**
- Consumes: existing `VacationYearCalendar` rendering and Tailwind breakpoints.
- Produces: a 2/3/4/5/6 month grid, compact date rows below `xl`, and a summary side rail that begins at `2xl`.

- [x] **Step 1: Compact the mobile grid**

Change the calendar grid to start at two columns with smaller mobile padding and gaps, while preserving the existing `lg` and `xl` column counts:

```tsx
<div className="grid grid-cols-2 gap-1.5 p-2 min-[550px]:grid-cols-3 sm:gap-2 sm:p-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
```

Use `p-1 sm:p-1.5` on each month card so date cells retain enough room at narrow widths.

- [x] **Step 1b: Compress date rows below `xl`**

Use `h-7 xl:aspect-square xl:h-auto` for both empty and interactive date cells so month height does not grow with card width on small and medium screens.

- [x] **Step 2: Prevent the summary rail from squeezing the calendar**

Move the workspace side-rail breakpoint from `xl` to `2xl`:

```tsx
<div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
```

- [x] **Step 3: Run final verification**

After every code and documentation edit is complete, run the focused web tests, lint, typecheck, whitespace validation, and visually inspect `/vacations` at mobile and desktop widths against the running local server. Do not run `pnpm build`.

- [x] **Step 4: Review and commit**

Review the final diff for scope and responsive regressions, then commit the implementation and documentation together.

## Verification Results

- Workspace tests: 53 passed, 0 failed.
- Lint: passed.
- Focused web source typecheck: passed on the required Node 24.15.0 with declaration output disabled.
- Repository typecheck: blocked by existing `TS2742` declaration portability errors in generated Prisma code and unchanged React components; the shared base config enables declarations during `--noEmit` checks.
- Whitespace validation: passed.
- Local server: `/vacations` responded and redirected unauthenticated access to `/login` as expected.
- Visual browser smoke test: unavailable because no browser backend was connected; final code review found no responsive or accessibility regression in the breakpoint changes.
