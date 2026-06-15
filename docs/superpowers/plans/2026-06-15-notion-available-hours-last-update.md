# Notion Available Hours And Last Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show and sync Notion card available hours, and attach a mapped aJam last-update timestamp to Notion page update requests when configured.

**Architecture:** Available hours is a domain-level working-day calculation from a card's start date to end date or today, excluding weekends, holidays, and the user's vacations. Notion page writes go through a shared page-update helper that adds the mapped aJam-update-time date field only when the user configured one.

**Tech Stack:** TypeScript, Next.js server actions, React, SQLite runtime schema bootstrap, Notion API PATCH.

---

### Task 1: Domain Available Hours Calculation

**Files:**
- Modify: `packages/domain/src/notion-cards.ts`
- Modify: `packages/domain/src/notion-cards.test.ts`

- [ ] **Step 1: Add `NotionCardAvailableHours` type**

Return `availableDays`, `availableHours`, and optional `unavailableReason: "missing_start_date"`.

- [ ] **Step 2: Add `buildNotionCardAvailableHours`**

Count date keys between `card.startDate` and `card.endDate || todayDateKey`, excluding weekends, `holidayDateKeys`, and `vacationDateKeys`. Multiply days by `8`.

- [ ] **Step 3: Add tests**

Verify missing start date, end-date fallback to today, and holiday/vacation/weekend exclusion.

### Task 2: DB Connection And Card Lookup

**Files:**
- Modify: `packages/db/src/notion-store.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add `availableHoursProperty`**

Add `availableHoursPropertyJson` to `UserNotionConnection`, schema bootstrap, row mapping, upsert, select, and exported type.

- [ ] **Step 2: Add cached card lookup by page IDs**

Create `listCachedNotionCardsByPageIds({ userId, notionPageIds })` for sync-time available-hours calculation.

### Task 3: Shared Notion Page Updates

**Files:**
- Create: `packages/db/src/notion-page-update.ts`
- Modify: `packages/db/src/notion-work-hours-sync.ts`

- [ ] **Step 1: Create page update helper**

Add `updateNotionPageProperties({ pageId, token, properties })`, with support for number and date properties.

- [ ] **Step 2: Add mapped aJam last-update support**

Add `{ date: { start: new Date().toISOString() } }` only for the user's mapped aJam-update-time Notion `date` property. Do not hard-code a property name.

- [ ] **Step 3: Move existing PATCH logic**

Replace the local PATCH function in `notion-work-hours-sync.ts` with the helper.

### Task 4: Sync Available Hours

**Files:**
- Modify: `packages/db/src/notion-work-hours-sync.ts`

- [ ] **Step 1: Include available-hours property in number properties**

When mapped and type is `number`, sync `availableHoursProperty`.

- [ ] **Step 2: Load range exclusions**

Use cached card dates to find the min start and max end/today range, then load holidays and vacations once for that range.

- [ ] **Step 3: Compute per-card available hours**

Use `buildNotionCardAvailableHours`; missing-start cards write `0`.

- [ ] **Step 4: Add mapped aJam last-update**

The shared page update helper includes the mapped aJam last-update property in page update requests when configured.

### Task 5: UI Mapping And Display

**Files:**
- Modify: `apps/web/src/components/notion-cards/notion-connection-panel.tsx`
- Modify: `apps/web/src/app/(app)/notion-cards/actions.ts`
- Modify: `apps/web/src/components/notion-cards/types.ts`
- Modify: `apps/web/src/components/notion-cards/notion-card-table.tsx`
- Modify: `apps/web/src/components/notion-cards/notion-duration-totals.tsx`

- [ ] **Step 1: Add `가용 시간 필드` mapping**

Expose an optional number-field mapping in the Notion connection popup.

- [ ] **Step 2: Add available hours to monthly analysis**

Compute available hours for cards in the selected month analysis using the selected card period, holidays, and user vacations.

- [ ] **Step 3: Display available hours**

Add a `가용 시간` column and a total tile using `3d (24h)` formatting.

### Task 6: Documentation And Verification

**Files:**
- Modify: `docs/timesheet-workflow.md`

- [ ] **Step 1: Document fields**

Document `가용 시간` and the optional mapped aJam last-update date field.

- [ ] **Step 2: Run verification**

Run domain tests and TypeScript type checks for `packages/domain`, `packages/db`, and `apps/web`.

- [ ] **Step 3: Commit**

Commit with `feat(notion): add available hours sync`.
