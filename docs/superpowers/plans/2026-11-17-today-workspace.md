# Today Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user selected Antigravity implementation with independent Codex verification.

**Goal:** Provide `/today` with multiple work tabs, persistent automatic drafts, existing Notion recommendations and allocations, and editable Notion comments.

**Architecture:** Reuse the existing daily work representation, recommendation helpers, card picker, date save rules and themed components. Persist incomplete drafts separately from confirmed work. Send comments directly to Notion through authenticated server actions.

**Tech Stack:** Next.js, React, TypeScript, Prisma and SQLite, existing pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-11-11-today-planning-design.md`

**Execution status (2026-11-17):** Antigravity implemented the feature and corrections. Codex independently reviewed the actual code and recorded GO for code verification in `2026-11-17-today-independent-review.md` Round 13. Authenticated visual acceptance and real Notion credentials are unverified. The checklists below retain the original implementation plan. Final evidence and limitations are maintained in the review record and workflow document.

## Global Constraints

- Antigravity implements. Codex coordinates, documents and independently reviews the actual changes.
- No product build without a user request. Use typechecks, targeted ESLint and relevant source tests.
- Keep package installation local with the shared pnpm store or uv environment.
- Reuse existing logic and preserve existing work, vacation, card allocation and AI behavior.
- Do not use real user data for verification or publish real Notion comments while testing. Use temporary fixtures and mocked HTTP for external writes.
- The HTML is a reference prototype. Production behavior follows the spec and existing repository conventions.

## Review Focus

- A late autosave must not revive a confirmed draft or overwrite a more recent revision.
- Confirming today's draft must preserve existing vacation entries and detect intervening confirmed-record edits.
- Browser-local dates and midnight transitions must keep draft writes attached to the date being edited.
- Comment mutations must verify session ownership, permitted connection, target card and the Notion author's permission.
- Comment refreshes across cards or tabs must preserve unsaved text and the original edited comment target.

## Task 1 — Persistent work drafts and confirmation

Primary files are `packages/db/src/today-store.ts`, its focused regression tests, `packages/db/src/index.ts`, `apps/web/src/app/(app)/today/actions.ts` and the existing timesheet save path. Adjust names to repository conventions where necessary and record the final boundaries.

- [ ] Read `timesheet-store.ts`, runtime schema bootstrap, `TimesheetDayDraft` and `saveTimesheetEntryAction` before selecting the persistence interface.
- [ ] Store incomplete user/date drafts with a stable revision or generation and confirmed-record baseline. Return explicit save/conflict results to the caller. Authentication supplies the user ID on every server action.
- [ ] Confirm a day through shared existing save logic, preserving nonedited records, card links, hours, AI behavior and cache invalidation. Clear the matching draft consistently with confirmation. Do not duplicate business validation.
- [ ] Add and run regression cases for incomplete restore, user/date isolation, out-of-order saves, saves racing confirmation, confirmation failure and preservation of an existing mixed work/vacation day. Use temporary SQLite data.

## Task 2 — Today page and work tabs

Primary files are `apps/web/src/app/(app)/today/page.tsx`, `apps/web/src/components/today/today-workspace.tsx`, `apps/web/src/app/(app)/app-nav.tsx` and existing card/recommendation components.

- [ ] Load the authenticated user's confirmed record or saved draft for the browser-local today. Start with one tab on an empty day, support `+`, and preserve input on keyboard or pointer tab navigation.
- [ ] Reuse project selection, weekday defaults, previous-work recommendations, `NotionCardPickerModal` and allocation helpers. A late recommendation must respect user edits. Restore saved links as written.
- [ ] Wire debounced autosave, visible save/failure/conflict feedback, retry and safe navigation. Capture the date and revision with each write, including midnight transitions.
- [ ] Confirm the full day after validation and select the tab containing any error. Show all tabs' project, content, hours and allocated cards in the right summary. Use the compact wireframe layout, 75px initial content height, existing theme and mobile drawer.
- [ ] Exercise two distinct work tabs, autosave/restore, allocation changes, failed saves, confirmation and readback from the regular calendar. Keep drafts excluded from confirmed metrics and exports.

## Task 3 — Notion comments and compact card layout

Primary files are `packages/db/src/notion-comments.ts`, its HTTP regression tests, `packages/db/src/notion-api.ts`, today server actions and `apps/web/src/components/today/notion-card-comments.tsx`. Share existing API errors and token handling.

- [ ] Implement paginated unresolved comment reads and create/update/delete calls using the existing Notion API version. Enforce the current connection's authorship for update/delete and authenticate each target through the user's connection.
- [ ] Render card removal at top left, title/status/hours in the left column, and an editable latest-comment box in the right column. Keep author/time, history, reset, create and update in one compact toolbar. Stack columns on mobile.
- [ ] Offer inline update or create-as-new and a full history dialog. Keep typed content on failed requests, refresh shared card data after success, and retain dirty editors and original targets. Never automatically retry an ambiguous create request.
- [ ] Mock HTTP to verify pagination, authorship denial, API errors, ambiguous creates and success refresh. Check empty threads, comments by other authors, deletion fallback, two tabs sharing a card and failed mutations preserving text.

## Task 4 — Verification and handback

- [ ] Run the relevant existing domain/store tests and any new regression tests. Run workspace `tsc --noEmit` scripts, targeted ESLint and `git diff --check`. Record exact commands, results and failures.
- [ ] Use an isolated verification database for browser checks if practical. Record routes, temporary-data isolation, screenshots and any external-credential-dependent checks that remain unavailable. Never substitute mocked production behavior.
- [ ] Update `docs/timesheet-workflow.md` and the roadmap with final behavior and verification evidence. Report all changed files and any remaining risks through the supplied my-orch completion command.
- [ ] Codex reads actual diff and connected read/write paths, resolves every material finding with Antigravity, and records its independent GO / NO-GO decision. Implementation completion alone does not establish acceptance.
