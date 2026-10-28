# Timesheet Logic Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all four approved follow-up candidates: vacation calculations, saved-day application, shared Notion editing transformations, and AI queue/overwrite/cleanup flow, preserving existing product behavior and integrating into local main.

**Architecture:** Move React-independent calculations into focused pure helpers, reuse existing domain functions, centralize repeated saved-record state application, and give AI workflow state a focused owner. Workspace keeps selection, navigation, save orchestration and domain commands. No global store, generic CRUD engine, setter bag or arbitrary file-length target.

**Tech Stack:** Existing Next.js/React/TypeScript/pnpm, node:test and workspace tsx with `apps/web/tsconfig.test.json`.

**Spec:** The approved four candidates under `docs/decisions.md` / 2026-10-28 additional refactoring review, and the user's instruction to implement all candidates.

## Global Constraints

- Preserve current main behavior, server action contracts, schema and dependencies. Do not change vacation grouping semantics incidentally.
- No product build, browser automation, global installs, my-orch or Astra. Use native Codex subagents.
- Reuse existing workspace dependencies and pnpm store. No new dependency is expected.
- Keep current user documentation changes. Parent owns docs and branch integration; one implementer owns all product edits to avoid shared-workspace conflicts.
- Preserve selected entry, unsaved drafts, card metadata, manual allocation, allowance flags, partial-save results, AI queue semantics and saved-versus-draft distinctions.
- Verify with direct tests, changed-file lint, typechecks and an independent whole-change review. Do not claim mounted/browser behavior was verified by pure or SSR tests.
- Integrate verified commits into local main and remove the temporary local branch. Do not push or mutate remote branches.

## Review Focus

- Mixed work/vacation days, holiday/weekend gaps, same-name temporary/confirmed vacations and allowance-exempt entries retain their existing connection rules and boundaries.
- Single/multiple saved days update all three record representations consistently while each caller retains its own selected-entry/AI/notification behavior, including partial failure.
- Card toggle/manual/reset/time changes preserve metadata and existing failure fallback; shared logic is truly identical across timesheet and year-end editing.
- AI queue reconciliation removes obsolete requests; overwrite confirm/revert/disable and immediate/manual/scheduled cleanup preserve current save ordering and flags.
- Delayed async results and changing selected dates do not acquire stale-state bugs through extraction. Tests should exercise actual extracted production logic with deterministic promises where relevant; mounted React/Strict Mode gaps require explicit review/limits.

## Task 1: Extract vacation calculations

**Files:** New `components/timesheet/timesheet-vacation-utils.ts` and tests; existing workspace; existing `packages/domain/src/vacation-year.ts` reused where compatible.

**Interfaces:** Extract entry matching, entry/day boundary calculation, directional connected-date search and connected-save entry transformation as React-independent functions. Use explicit input values/maps/predicates; preserve current workspace fallback precedence. Reuse `isMatchingVacationEntry` rather than duplicating its compatible logic. The domain vacation-only search is not equivalent to workspace mixed-day boundary search and must not replace it blindly.

- [x] Add behavioral checks for mixed-entry boundaries, holiday/weekend traversal, status/name matching, hour/allowance/hidden-entry preservation and input immutability.
- [x] Extract and wire helpers; leave async preloading/save orchestration in workspace.
- [x] Run focused tests and record exact checks/results.

## Task 2: Centralize saved-day application

**Files:** Existing workspace and a small pure helper only if it reduces real duplication; related focused tests if there is new transformation logic.

**Interfaces:** One small saved-day application path owns records, savedRecords and savedEntryDateKeys updates. Callers retain their selected-entry policies, AI queue updates, Notion candidate updates, notifications and dirty/save status. Avoid an options-heavy save engine or a hook that merely forwards many state setters.

- [x] Identify each duplicate application site and record the caller-specific differences.
- [x] Route normal save, range save, connected save and AI saved days through the shared application path.
- [x] Verify stable client IDs, multiple days, partial success and selection policies; retain existing persistence tests.

## Task 3: Share Notion editing transformations

**Files:** New `apps/web/src/lib/timesheet-notion-editing.ts` and tests; existing workspace and `components/year-end-review/timesheet-day-edit-modal.tsx`.

**Interfaces:** Small pure transformations atop existing `allocateNotionCardHours` for real shared allocation/editing behavior. Preserve each caller's entry identity, candidate metadata enrichment, deduplication and error policy. Do not combine the two editor UIs or create a generic entry mutation framework.

- [x] Add tests for automatic/manual allocation, changing hours, toggle removal/addition, metadata preservation, resetting allocations and invalid-input fallback as applicable to shared operations.
- [x] Wire both editors into the shared operations and remove duplicates.
- [x] Run focused tests and record exact checks/results.

## Task 4: Give AI flow a focused owner and verify integration

**Files:** New `components/timesheet/use-timesheet-ai.ts` and/or minimal `timesheet-ai-utils.ts` plus tests; existing workspace and related type imports.

**Interfaces:** Own queue reconciliation, overwrite prompt state/decisions and cleanup execution/status. Consume domain commands for applying days and editing selected draft; do not accept arbitrary root state setters. Keep general save and navigation orchestration in workspace. Extract testable pure/async production logic where it genuinely improves testing; do not add a controller framework only to test React.

- [x] Add tests for request generation/reconciliation, cleanup skip/success/failure with delayed promises, overwrite decisions and manual/scheduled conditions. Preserve current semantics rather than introduce unrelated concurrency changes.
- [x] Extract and wire AI flow, removing replaced workspace types/functions/state and unused exports.
- [x] Run all component/helper tests, existing web helper/domain/DB tests, web/domain/DB typechecks, changed-file ESLint and diff checks without build.
- [x] Obtain independent spec/quality review; address material findings and document remaining runtime limits.
- [x] Update architecture/workflow/decisions with actual boundaries, tests and completion status.
- [x] Commit, fast-forward local main to verified code and retire the temporary local branch.

## Execution Record

- Start: local main `a4a0b36`, workspace 3,062 lines. Pending `docs/decisions.md` edit from the immediately preceding review belongs to this conversation and is retained.
- All four tasks share workspace state and callbacks; one implementation worker executes them sequentially. A separate reviewer checks the whole result. This avoids concurrent edits to the same file.
- Completed on local main in `47b86a3`; the fast-forward result is identical to the verified branch and the temporary local branch is deleted. Remote refs remain unchanged.
- Verification: 179 tests passed (focused10, web helpers21, domain102, DB46), web/domain/DB typechecks and changed-file lint passed. Independent review: spec PASS, quality APPROVE, severity findings0. No product build or browser automation.
