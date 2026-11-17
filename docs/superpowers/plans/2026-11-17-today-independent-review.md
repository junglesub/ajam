# Today workspace independent review

## Round 1

Codex reviewed the actual uncommitted files produced by Antigravity run `r_250c64189b9b`. Decision is **NO-GO**. The worker reports two focused DB/HTTP tests, typechecks, ESLint and diff checks passing. These tests were read and were not rerun. Authenticated browser behavior and workflow documentation were not verified by the worker.

### Required corrections

1. **Autosave can lose the latest edit.** `today-workspace.tsx` clears `dirtyRef` for every successful request. If request A is in flight, input B schedules another timer, and A succeeds first, its revision update reruns the effect and cancels B's timer after clearing dirty. B remains visible with a saved indicator while only A is stored. Serialize or version local edits, retain dirty state for newer text, settle in-flight saves before confirmation, and protect navigation and load-time input. Include a deferred-response client regression.
2. **Restoring a stale draft silently adopts a fresh baseline.** `loadForDate` always assigns `result.confirmedUpdatedAt` even when restoring a draft based on an older confirmed record. Confirmation can then replace someone else's intervening edit. Preserve the draft's baseline and surface conflict without replacing local text. Current SQL `MAX(updatedAt)` has second-resolution values and cannot reliably identify same-second edits. Use a reliable confirmed-content version/fingerprint and test rapid edits, deletion and stale draft restoration.
3. **Confirmation is not atomic and ignores draft revision.** `confirmTodayDraft` checks the baseline, reads records, saves the day and deletes the draft in separate operations. A concurrent update can intervene or a newer draft can be deleted. Make baseline validation, expected draft revision validation, merge, shared day save and matching draft cleanup consistent in one transaction. Test racing confirmations, late saves and rollback on failure. Ensure the server rejects a mismatch between `params.dateKey` and `day.dateKey`.
4. **Existing day metadata and save behavior are lost.** Confirmation constructs `shortVersion: ""` and `aiRewriteRequested: false`, discarding existing values. It bypasses the normal server action's affected-card work-hours sync, and ignores the saved day returned by the store. Preserve stored day metadata, follow shared post-save side effects and refresh canonical entries/IDs. Add the corresponding regression and preserve existing mixed vacation/work state.
5. **Default cards and shared allocation behavior are missing.** The Today client never loads weekday defaults, previous-card recommendations or previous project defaults. New tabs start empty. Wire the existing helpers/actions with guards for restored drafts and user changes. Replace custom `rebalanceEntryCards` with existing allocation logic and provide the existing automatic-allocation reset. Verify cent rounding such as 1h across 6 cards and manual overrides.
6. **Comment ownership is derived from a fabricated response shape.** `requireNotionCommentContext` always returns an empty bot ID. The fallback checks `created_by.object === "bot"`, but Notion returns a partial user with `object: "user"` and an ID. Real own comments will have edit/delete disabled, while the tests falsely use `object: "bot"`. Resolve the token bot identity and compare IDs. Check the card against this user's configured connection/data source, preserve author display names and use realistic mocked partial-user responses for own/other bot/person comments. [Comment object](https://developers.notion.com/reference/comment-object) · [Token bot identity](https://developers.notion.com/reference/get-self)
7. **Comment refresh and mutation can retarget or erase input.** The row resolves a missing edited ID with `?? latestComment`, which can update a different comment after deletion. Use the original target only and allow create-as-new if it disappeared. Successful create/update clears dirty state even if the user entered newer text while awaiting the response. Keep per-editor edit versions, shared refresh ordering and pending input. `handleLoadComments` always fetches even when its state updater returns the existing state, so its cache guard does not guard requests. Correct request deduplication and stale-response ordering.
8. **Comment pagination can silently return an incomplete latest comment.** The list loop stops after 20 pages while returning a normal complete result. Finish pagination or expose an explicit partial/error result that prevents treating an older comment as the latest. Test limits and repeated cursors.
9. **App integration and verification remain incomplete.** Add midnight handling and unsaved navigation protection. Match the existing `data-theme` styling and compact one-line comment toolbar, use accessible tab focus and a proper modal focus/Escape lifecycle. Update `docs/timesheet-workflow.md` and roadmap. Obtain authenticated browser evidence using isolated test data for two tabs, autosave restoration, confirmation/calendar readback, card defaults and layout. External comment writes stay mocked.

The implementation remains uncommitted pending correction and independent acceptance. The no-build instruction continues to apply.

## Round 2

Run `r_1f2b6c501b6f` reported completion with remaining recommendation, documentation and browser work. Codex read the updated Today store, client and comment modules. Decision remains **NO-GO**. The worker reports the same two focused tests and diff check passed. It did not report fresh typecheck or browser evidence.

Resolved in source are token-bot ID lookup, realistic partial-user ownership comparison, repeated-cursor detection, preserving the draft baseline value, and avoiding fallback from a missing edited comment ID to the latest comment.

### Persistence and server boundary work remains

- `confirmTodayDraft` still reads the baseline and draft revision before calling a separately committed `saveTimesheetDay`, followed by a separate draft deletion. The operation is not atomic. `expectedDraftRevision` is optional and only compared when a draft exists, allowing a stale nonzero expected revision to confirm after a draft disappeared.
- `saveTodayDraft` now computes its confirmed fingerprint before entering its transaction. A confirmation can occur between this read and the draft write, reviving a draft based on stale state. The draft revision resets after deletion, so an older request can also share the same expected revision as a later draft. Use a persistent generation/version or another concrete mechanism to prevent this ABA race.
- The confirmed fingerprint excludes `aiTranslation`. Concurrent changes to translations can be overwritten by an older draft. Include the persisted day data relevant to replacement, and test actual same-second edits and deletion through store entry points.
- Today confirmation still bypasses normal affected-card work-hours synchronization, including removed-card updates. Validation is client-only beyond date/kind checks. Preserve normal date/hour/allocation validation and structured error behavior server-side.
- Comment operations still accept any page ID accessible to the token, without checking the configured connection's card/data-source context. Real comment display names also fall back to a generic name because the documented `display_name.resolved_name` is not read.

### Client and UI work remains

- Autosaves are version-tagged but not serialized. Request B may still start with A's old revision and conflict with A. Confirmation awaits one save but retains closure-captured revision and does not cancel pending autosave timers. It can consume a stale revision or send another autosave during confirmation.
- Draft-load conflict feedback is immediately overwritten by the unconditional `setSaveState("idle")` at the end of `loadForDate`. Loading controls stay editable, allowing a late load result to replace newly typed content. The conflict refresh action reloads the stale saved draft and cannot reconcile it with the new confirmed record.
- Recommendations remain completely unwired, the allocation algorithm remains duplicated with incorrect independent cent rounding, and no reset to automatic allocation is offered.
- Midnight handling, application navigation protection, canonical saved-entry refresh, compact app-theme styling, accessible tab/modal focus lifecycle and workflow docs remain incomplete. Browser verification remains pending.
- Comment edit versions help but reset and history-create/delete paths can still discard text. Comment row editors unmount on switching to a tab without that card, losing unsaved input. Cache checks still do not prevent already-cached fetches. Keep the promised draft/input lifecycle consistent across tab switches and asynchronous requests.

Next bounded implementation pass targets the persistence/server boundary findings first. A following pass will address client/UI behavior and browser verification before acceptance.

## Round 3

Codex read the server changes from run `r_fa0972e72cb5` and compared them with the existing timesheet read/normalize/save paths. The implementation now performs confirmation and draft clearing in one transaction, includes translations in its fingerprint and persists cleared-row revisions. Token bot ownership and cached user-card checks are present. These are concrete improvements. The worker reports two source tests, workspace typechecks and diff checks passing. Decision remains **NO-GO** for the following server issues, with client/UI work still pending.

1. **Cleared revision is unreachable by normal callers.** `getTodayDraft` hides the cleared row but returns no current revision. Both load and successful confirm leave the client using zero. A cleared row has a nonzero monotonically increasing revision, so a normal edit after confirmation or reopening always conflicts. Return the authoritative revision in load and confirm results and consume it. Verify create draft, confirm, reload and edit again through the returned public result fields, including a fresh page with no live draft.
2. **Atomic save bypasses normalization.** The newly exported `saveTimesheetDayInTransaction` expects an already normalized day. `confirmTodayDraft` calls it with the raw merged payload. It therefore bypasses `normalizeDay`, including trimming, source/default normalization, missing IDs and shared automatic card allocation. Refactor or expose the existing normalized transaction entry point and use it. The newly written transaction reader also duplicates the existing `listTimesheetDaysInTransaction` mapping with different ghost-day and card ordering behavior. Reuse the shared canonical reader so fingerprints and returned canonical data agree with normal calendar reads.
3. **Post-confirm affected-card work-hour sync remains absent.** `confirmTodayDraftAction` still only calls `revalidatePath`, unlike normal save's `collectChangedNotionPageIdsForTimesheetSave` and work-hours sync. Refactor the shared post-save orchestration and cover removed and retained card targets, returning sync warnings without undoing committed work.
4. **Comment display name is parsed from the wrong nesting.** Notion's `display_name.resolved_name` is a top-level comment property. The code added it under `created_by`, so real display names remain ignored. Use realistic documented fixtures and verify the rendered name is preserved.
5. **Evidence does not cover required persistence failure cases.** The new test only adds a sequential old-revision assertion after confirmation. Add regressions for actual same-second content/translation edits, missing/stale required revisions, failed confirmation rollback and public post-confirm reopen/edit. Validate finite nonnegative manual card allocations and draft revision input at the server boundary, while continuing to allow incomplete draft content.

Keep the final client/UI pass deferred until these server corrections and their focused regressions pass. Existing rows created by an earlier bootstrap should also survive schema changes to the added draft table.

## Round 4

Run `r_cc691548f676` adds authoritative draftRevision in load/confirm responses, client consumption of that revision, an `isCleared` migration, post-confirm sync invocation and top-level comment display names. Codex read these changes and the new public-result post-confirm reuse test. The worker reports two source tests and diff checks passed, with typecheck and ESLint only described as launched. Their completion is not established.

Decision remains **NO-GO**. Two specific shared-path corrections are still required before client/UI work.

- `normalizeDay` and `listTimesheetDaysInTransaction` remain private and unused by today-store. Confirmation still passes raw `mergedDay` to the low-level transaction writer. Normalizing only at `saveTimesheetDay` does not cover this caller. Reuse the actual shared canonical reader and normalizer in Today, removing the duplicated `readConfirmedDayInTransaction` SQL mapping. Add a test comparing confirmation output/calendar readback and verifying automatic card allocations and trimmed content.
- The new direct `syncNotionWorkHoursForPages` call ignores its returned `errors` array. This API reports per-card failures in a successful return, so catch alone yields an empty warning. Reuse `syncNotionWorkHoursAfterTimesheetSave` or share it through a server module, preserve error aggregation and test a resolved `{ errors, failed }` response. The UI must eventually display the returned warning.

The cleared-revision/public reopen flow and top-level display-name parsing are resolved in source. Client autosave serialization, recommendations, midnight/navigation handling, shared comment edit lifecycle, app-theme layout, workflow docs and authenticated browser evidence remain outstanding from Round 2.

## Round 5

Codex reviewed run `r_87c62250e867`. The existing `normalizeDay` and canonical transaction reader are now exported and called by today-store, and its duplicate SQL mapper has been removed. This resolves the canonical storage-path finding in source.

The run reports completed error aggregation, but the actual Today action still awaits `syncNotionWorkHoursForPages` without assigning its return and has no `syncResult.errors` handling. This discrepancy is recorded for correction. Reported passing evidence remains two source tests, ESLint and diff check, with typecheck only launched. Whole-feature decision remains **NO-GO** pending client work and end-to-end evidence.

Next bounded task is client save sequencing, conflict/load handling, navigation/midnight and canonical confirm readback, together with the still-missing sync error aggregation. Recommendations, comment editor lifecycle and compact layout follow as a separate UI pass.

## Round 6

Run `r_b59fd75f3fac` added an actually used `TodayDraftLifecycle` and a deferred save-A/edit-B regression. Codex read the class, test and React callers. The Today action now really aggregates `syncResult.errors`, and its warning is rendered. The worker reports its new test, workspace typechecks, ESLint and diff check passed.

Codex independently invoked the production lifecycle with mocked load/save/confirm actions and performed `loadDate -> applyLocalEdit -> confirmDay` before autosave. The observed result was `saveCalls: 0`, `confirmCalls: 0`, and `임시 저장을 완료하지 못해 확정할 수 없습니다.` This is **NO-GO**. `confirmDay` sets `confirming: true` before `flushSave`, while `flushSave` immediately returns false when confirming. The provided test confirms only after its separate flush has already completed, so it misses the actual entry point.

Additional lifecycle corrections needed are preventing edits during load/confirmation, rejecting overlapping confirmation, preserving input during reload/conflict recovery, guarding midnight transitions while confirmation is in flight, and showing validation errors instead of silently returning from `handleConfirmDay`. Conflict refresh still reloads the same stale draft rather than resolving it. Pending recommendations/comment/UI/browser work remains as before.

## Round 7

Run `r_2716f678857b` fixes the confirming/flush guard, rejects duplicate confirmation, blocks work edits during loading/confirmation, drops stale load responses and displays specific validation errors. Codex read the production lifecycle, React callers and tests. The worker reports two lifecycle tests, workspace typechecks, ESLint and diff check passed.

Codex separately invoked the production class with a deferred save A, edit B, and two concurrent confirmations. The observed calls were saves A at revision 0 and B at revision 1, followed by exactly one confirmation of B at revision 2. The normal immediate-confirm blocker is resolved in source and this independent probe.

Conflict recovery remains incomplete. The button labelled `최신 기록 불러오기` still just calls `loadForDate`, whose server loader chooses the stale draft again. Copy is optional and its failure is ignored, so it does not make replacement safe. Implement an explicit revision-checked choice to discard the stale draft and start from latest confirmed data, with visible preservation/copy controls and cancellation, or an equally concrete recovery retaining user text. Daily recommendation, shared allocation and the missing auto-reset are next. Comment draft retention and compact layout/browser evidence remain pending. Whole-feature status is still **NO-GO**.

## Round 8

Run `r_298edef18494` uses shared `allocateNotionCardHours`, adds automatic reset and calls previous-project/card actions by stable date/clientId. It adds revision-checked draft clearing and visible clipboard success/failure. Codex read the action itself and its Today consumer. Worker reports store/comment tests, lifecycle tests, workspace typechecks, ESLint and diff checks passing.

Two source findings remain in this bounded pass. `findPreviousOpenNotionCardsAction` already returns weekday fixed-hour manual links with `source = weekday_default`, followed by previous-work automatic links. `applyDefaultsForTab` remaps every returned link to zero-hour auto and previous-work source, discarding the required fixed-hour semantics and enriched metadata. Retain the action's returned links and use the existing default-allocation helper. Its current nonempty-field guard also fails to detect user adding then removing all cards while the request is pending, so it can undo the user's explicit removal. Guard the specific target entry's request-time edit state.

The conflict recovery button ignores the `TodayDraftClearResult` and reloads even when revision checking refused to clear. This replaces the current input with another draft. Handle conflict and failure explicitly and retain text, only loading fresh data after a successful clear. Add focused tests for both findings. Comment edit retention and compact UI/browser verification remain the next pass.

## Round 9

Codex read run `r_468f24201a11` source and its allocation assertion. Returned default links now pass intact into shared allocation, including weekday fixed-hour mode/source. The asynchronous application compares the specific entry's original object as well as date/clientId, so intervening edits prevent reapplication. The discard handler now reloads only on `cleared`, retains input on conflict and catches exceptions with visible feedback. These two source blockers are resolved.

Worker evidence is three lifecycle/allocation tests, ESLint and diff checks passed. Typecheck is again only described as launched and must be awaited during final verification. Whole-feature decision remains **NO-GO** for the pending comment/UI scope, rather than the resolved default/discard corrections.

Next pass covers comment draft retention across tab unmounts, read/mutation sequencing, history editing/deletion input preservation, modal/tab accessibility, and the accepted compact layout using the real application theme. Main source defaults remain in place; avoid broad refactoring of resolved persistence paths.

## Round 10

Run `r_e8820c4b3cf6` adds production-used per-card editor state in the Today owner, dirty/target helpers, 0.25h card inputs, explicit 75px/72px heights and roving work-tab focus. Codex read the helper, tests and row/owner wiring. State is now retained when a row unmounts. The worker reports four lifecycle/comment tests, two store/comment API tests and diff check passed, while typecheck/ESLint are again only launched. Whole-feature status remains **NO-GO** for these remaining concrete items.

- `handleLoadComments` is memoized with `[]` but reads `commentsByPageId` captured from the first render, so the added cache test always checks the initial empty object. Use current cache state/ref with stable action identity or another real cache guard.
- History create unconditionally clears `historyNewText` after await and history editing/reset does not consistently advance its edit version. Deleting the currently edited comment unconditionally clears dirty state. These paths can erase new/pending text. Give both inline and history input generation-aware completion rules and preserve dirty text when its target is deleted.
- Create/update ignore the returned canonical comment. They mark the editor clean before the subsequent list refresh, so a refresh failure can leave an obsolete target/text even though publication succeeded. Apply the successful mutation response to shared data, retain newer edits and distinguish mutation failure from subsequent read failure.
- The accepted top toolbar remains `flex-wrap` with long history labels, and card columns remain roughly 44/56 instead of compact metadata plus remaining-width editor. Implement the agreed one-line toolbar and compact left column. The comment dialog only focuses close/Escape and does not trap focus or constrain total height. Use the existing ModalShell pattern or native dialog with real focus lifecycle.
- Await typecheck/ESLint completion and update workflow/roadmap with final state and accurate evidence. Authenticated visual acceptance remains unperformed and must be disclosed rather than reported passed.

## Round 11

Codex read run `r_4c6bd908a113`. The stale cache closure now reads a current cache ref, history create is edit-generation aware, the left card column is 230px, and the toolbar no longer explicitly wraps. These corrections are present in source. The worker again reports test/diff results but only launched typecheck/ESLint, and supplies no visual evidence.

Three previously requested changes remain absent. Create/update still discard their returned canonical comment, clear dirty state, and rely entirely on the subsequent list read. A failed read therefore leaves the old comment target and value cached after successful create-as-new. History delete still sets isDirty false and targetCommentId null for an edited target, so the next refresh erases pending text. History edit/reset do not consistently advance editVersion. The popup is still the same role-only overlay with no focus trap or whole-dialog viewport bound, and its trigger ref is no longer attached after removing the invalid Button ref prop. Source decision remains **NO-GO** for these specific items.

The next correction is restricted to committing actual mutation responses to shared state, preserving dirty text on deleted targets, and completing the native dialog behavior. Complete validation exits and actual workflow/roadmap updates are also required before final review.

## Round 12

Codex read run `r_0b53ef10a9cc`. Create/update responses now update shared comments immediately, stale reads are invalidated, inline completion consumes the returned canonical comment, dirty text survives target deletion, and history uses native `dialog.showModal()` with a real trigger ref and focus restoration. The requested structural fixes are present.

Codex independently completed `pnpm -r --if-present typecheck` for all six workspace projects and `pnpm exec eslint` over every changed/new TS/TSX file. Both exited 0. `git diff --check` also passed. Source tests are the worker's recorded four lifecycle/comment-state tests and two isolated store/API tests, read during review and not rerun.

One remaining state consistency defect prevents whole-feature acceptance. `handleApplyCommentMutation` updates only commentsByPageId, not a clean editor. Inline mutation handlers separately update their target with returnedComment, but history create only clears historyNewText and history delete only clears mutating. If the subsequent read fails, a clean editor therefore continues pointing to the old (or deleted) comment despite the canonical cache having the new latest result. After history create, Update may still modify the older comment while the user expects the latest. Synchronize clean editor text/target with the updated canonical shared result inside the owner mutation path, preserving dirty text/target. Verify both create and delete followed by rejected refresh through a production-used state transition. No other source blocker was identified in this review pass. Authenticated visual and real Notion credential checks remain unperformed.

## Round 13 — Independent code verification GO

Codex inspected the actual source from run `r_6c3743995874`. The production `handleApplyCommentMutation` now computes the canonical upsert/delete result, invalidates earlier reads, updates shared data and independently synchronizes the clean editor using `syncEditorWithLatestComment`. Dirty editor text and its original target survive. Inline create/update then consume the returned canonical ID with an edit-generation check. The new assertions cover clean editor target/text after both upsert and deletion. This resolves the final identified state consistency blocker.

**Decision is GO for the reviewed implementation and automated code verification.** No unresolved material source defect remains among the recorded findings. This decision covers authenticated server boundaries in source, atomic/versioned work persistence, confirmed calendar read/write integration, defaults and shared allocation, client autosave/confirmation sequencing, comment API permissions and shared editor lifecycle, and the accepted UI structure.

### Evidence

- Codex completed all six workspace `tsc --noEmit` scripts using `pnpm -r --if-present typecheck` with exit 0, and ESLint over every changed/new TS/TSX file with exit 0 during Round 12.
- After the final UI edit, Antigravity reports `pnpm --filter @timesheet/web typecheck`, targeted ESLint and `git diff --check` each completed with exit 0. Server code was unchanged by this last edit.
- Antigravity reports four lifecycle/comment-state tests passed after the final edit. Its prior isolated store/comment API verification reports two passed. Codex read the tests and actual production consumers, without rerunning the same tests.
- Codex's independent deferred-response probe verified saves A/revision 0 then B/revision 1, followed by exactly one confirmation of B/revision 2 despite duplicate confirmation calls.
- Codex rechecked `git diff --check` after the final source update. It exited 0.

### Verification limits and delivery state

- Authenticated browser E2E, visual acceptance and actual Notion credentials/permissions were not exercised. Current repository guidance assigns browser visual acceptance to the user. External mutation tests used mocked HTTP and persistence tests used temporary SQLite data.
- A product build was not requested and was not run. There was no deployment or push.
- Planning and wireframe commits are `c73bce3` and `178b9ed`. Implementation and this verification record are committed on `junglesub/feat-dashboard`.
