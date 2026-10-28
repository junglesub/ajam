# Timesheet Refactor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve current main behavior while integrating useful timesheet responsibility extraction, then update local main and retire the merged local refactor branch.

**Architecture:** Reuse the component, helper and hook boundaries from refactor rather than repeat the extraction. Current main defines behavior. Workspace owns coordination; views render their own UI, focused hooks own settings/loading/recommendations, and existing shared draft/domain helpers remain authoritative. Avoid further speculative abstractions.

**Tech Stack:** Existing Next.js, React, TypeScript and pnpm workspace; no new dependencies.

**Spec:** `docs/decisions.md`, 2026-10-28 refactor review, together with the user's subsequent authorization to integrate into main and delete refactor.

## Global Constraints

- Preserve current main features, especially allowance-exempt vacation creation/range editing/calendar markers and safe project recommendation effects.
- Do not run a product build or browser automation. Use static checks and focused automated regression tests.
- Do not install packages globally; reuse current workspace dependencies and pnpm store if needed.
- Use native Codex subagents, exclude Astra, and do not use my-orch.
- Preserve existing worktree files and unrelated changes. Do not push or delete remote branches as an incidental cleanup operation.
- Record implementation decisions, validation results and limitations in existing documentation.

## Review Focus

- Allowance-exempt and mixed vacations preserve their flags and outlined calendar presentation, including temporary status.
- Existing main shared draft helpers remain the single implementation used by timesheet and year-end editing.
- Project recommendation starts outside state updater/render, deduplicates per entry and does not overwrite user input.
- Month navigation, refresh, settings and Notion recommendation retain their previous state and async guards.
- JSX extraction preserves interactions and avoids new callback/type layers without a useful boundary.

## Task 1: Integrate and verify the timesheet extraction

**Files:** Existing `apps/web/src/components/timesheet/timesheet-workspace.tsx`, the 17 extracted files in refactor, existing draft tests and focused new tests as justified.

**Interfaces:** Consume current main actions/domain contracts and `@/lib/timesheet-drafts`. Preserve the public `TimesheetWorkspace` props consumed by the route. Render views and modals through the extracted components.

- [x] Merge refactor into `codex/refactor-timesheet-integration` without finalizing the merge until conflicts and main behavior have been reconciled.
- [x] Reuse current main shared/domain helpers; migrate vacation UI/flow and project recommendation fixes into their new owners.
- [x] Review every hunk of `dccd873..be48b6e` for the original workspace to ensure no main behavior was dropped. Keep all main changes outside that file.
- [x] Add and execute focused behavioral checks for changed extraction paths; use a failing-before/fixed-after check where new logic is needed.
- [x] Run changed-file ESLint, web/domain/DB typechecks, existing domain/DB tests and web helper tests without build.
- [x] Obtain an independent whole-change review and address material findings; record remaining limits.
- [x] Update architecture/workflow/decision documentation with final structure and validation evidence.
- [x] Commit the integrated result, fast-forward local main, detach the old refactor worktree without deleting files, then delete the merged local refactor branch.

## Execution Record

- Started from main `be48b6e`; refactor is `b90b54a`, merge base `dccd873`. The pre-existing working-tree documentation edit was produced during this conversation and is retained.
- Single coordinated implementation task: draft imports, workspace, views and recommendation hook share interfaces, so one implementer owns product edits; a separate reviewer checks the whole result.
- Local branch retirement is in scope. Remote push/deletion is not part of the implementation unless the user explicitly requests it; the distinction will be reported.
- Completed: merge commit `5af1216` retains both main/refactor ancestry and is on local main. Local refactor and temporary integration branches are deleted; old refactor worktree files remain at detached `b90b54a`.
- Verification: domain 102, DB 46, web helper 21 and calendar SSR 2 tests passed; web/domain/DB typechecks and changed-file lint passed. Independent review: spec pass, quality approve, no severity findings. The fast-forward main tree is identical to the verified integration tree. Build/browser/live-service checks were not run.
