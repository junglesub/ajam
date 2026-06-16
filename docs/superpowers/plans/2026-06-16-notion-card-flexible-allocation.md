# Notion Card Flexible Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Notion card time allocation behave like work-entry time splitting: preserve manually edited values and evenly divide only the remaining time among automatic values.

**Architecture:** Keep `allocationMode` as the single source of intent. `manual` card links keep their user-entered hours; `auto` card links receive the remaining entry hours split evenly. The existing UI stays thin and delegates allocation math to `allocateNotionCardHours`.

**Tech Stack:** React 19, Next.js server actions, TypeScript domain helpers, Node test runner.

---

### Task 1: Domain Allocation Rule

**Files:**
- Modify: `packages/domain/src/notion-cards.ts`
- Modify: `packages/domain/src/notion-cards.test.ts`

- [x] Update `allocateNotionCardHours` so manual links are preserved and auto links split the remaining entry hours.
- [x] Preserve manual allocated hours even when they exceed entry hours so the UI can warn without blocking save.
- [x] Preserve every manual link even when the manual total differs from entry hours.
- [x] Add tests for mixed manual/auto allocation and manual overflow.

### Task 2: Timesheet UI Integration

**Files:**
- Modify: `apps/web/src/components/timesheet/timesheet-workspace.tsx`
- Modify: `apps/web/src/components/timesheet/notion-card-link-section.tsx`

- [x] When a card hour input changes, set only that card to `manual` and recompute auto cards with `allocateNotionCardHours`.
- [x] When a card is added or removed, preserve manual cards and recompute auto cards.
- [x] When a work entry hour changes, preserve manual card hours and recompute auto cards.
- [x] Keep the existing `자동 배분` button as the way to reset all cards to auto.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/architecture.md`

- [x] Document that Notion card allocation follows the same preserve-edited/divide-unedited principle as work-entry hours.
- [x] Run domain tests and web typecheck. Do not run production build unless explicitly requested.
