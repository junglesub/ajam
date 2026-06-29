# Timesheet Workflow

## Overview

The timesheet page supports multiple daily records. A day can contain work, vacation, and holiday entries, but saving is still performed at the day level. The right-side editor is the source of truth for the selected date, and the calendar/list views show saved data plus safe draft previews.

## Daily Entries

- A day can have multiple entries.
- Work entries store project, hours, content, and English translation.
- Vacation entries store vacation type and hours.
- Holiday entries store holiday name and use `0h` by default.
- The day-level short version is separate from entries and is used only for calendar summary fallback, not list rows.
- Save replaces the selected date with the full current day draft.
- Delete removes the saved date, then recreates the default editor draft for the selected date.

## Default Drafts

- Today or past missing dates open with one default work entry.
- The default work entry uses the previous work project's project when it can be predicted from loaded drafts.
- If loaded drafts do not contain a previous work project, the editor asks the server for the latest saved work project before the selected date and fills it into the draft.
- If a new unsaved `WORK` entry has no Notion cards, the editor first looks for the latest previously saved `WORK` entry with linked Notion cards in the loaded client state. If found, it computes the recommendation locally and applies it immediately. If not found, it asks the server and shows a loading skeleton while the fallback runs. Open-card checks use the card start/end dates and the user's configured done status values.
- Users can configure weekday Notion defaults in a separate `요일별 자동 카드` popup on the `Notion 카드` page. When a new `WORK` entry is drafted, enabled defaults for that weekday are applied first with fixed manual hours, and previous-date Notion cards split the remaining entry hours automatically. Links created from weekday defaults use `source = weekday_default` and are excluded from future previous-date recommendations.
- When changing months, the editor selects the first business day in the destination month and applies the same default draft and previous-project lookup behavior.
- Future dates open with one default vacation entry because only vacation or holiday can be edited for future dates.
- Future work creation is blocked; future vacation and holiday edits are allowed.
- While the page stays open, the client checks the browser-local today key about once per minute. When a future selected date becomes today, it becomes writable without a page refresh; an unsaved default future vacation placeholder is replaced by the normal work draft.
- Drafts should not count as completed until the user saves.

## Monthly Metrics

- The vacation metric counts vacation entries only; holidays are not included.
- Vacation time is displayed as days when possible, using `8h = 1 day`; remaining partial time is displayed in hours.
- Completed and missing metrics are based on visible month rows.

## Calendar View

- Saved completed work shows the `완료` tag on the right.
- If a day includes vacation and is not vacation-only, a blue dot appears before the completed/holiday tag.
- Vacation-only days show the vacation tag with text.
- If a day has more than one entry, the entry count appears at the bottom right.
- If a work day has multiple unique projects, `+N` appears next to the project name.
- Project names stay on one line.
- Calendar preview content can use up to two lines and truncates with ellipsis.
- Saved non-holiday days whose total hours are not `8h` show an orange timer icon next to the date. The icon hover text shows the current total hours.
- Saved work days with at least one `WORK` entry that has no linked Notion card show a yellow warning icon next to the date.
- Missing unselected days show `미기입`.
- A selected missing work draft with no content shows `작성 예정`.
- Saved work with empty content shows `(내용 없음)`.
- Project names are shown only when present; there is no placeholder project text.
- When a date is saved for the first time in the current session, the calendar cell for that date shows a short confetti burst that expands around the saved cell. Editing an already saved date does not replay the animation.

## List View

- The list view is row-based rather than grouped by a separate date summary row.
- Multi-entry days render one row per entry.
- Missing dates render a single yellow `입력안됨` row.
- Entry rows show type, hours, project/vacation/holiday title, content, and English translation.
- Work content is clamped to two lines and uses `(내용 없음)` when saved empty.
- Short version is not shown in the list view.
- Clicking an entry row selects that date and entry in the right editor.
- Saved non-holiday rows whose total hours are not `8h` show the same orange timer icon as the calendar view.

## Month-End AI Summary

- The app will provide a separate `AI 월말 정리` tab for monthly report preparation.
- The tab exports the selected month as JSON for use with an external LLM.
- The implementation uses a dedicated server action to build the authoritative month export payload.
- The UI owns its own month selector and defaults to the current month.
- The LLM prompt sends full source context, but the LLM must return a smaller patch JSON containing only `dateKey`, day-level `shortVersion`, work entry `id`, and work entry `aiTranslation`.
- Imported JSON is previewed before it is applied to the calendar/list data.
- Import validation rejects unknown dates, duplicate dates, unknown entry IDs, duplicate entry IDs, vacation entries, and holiday entries.
- Import apply sends the original exported JSON as a baseline, so patches are computed from that baseline instead of the current database snapshot.
- Import apply rejects stale JSON transactionally when the current saved `aiTranslation` or `shortVersion` differs from the original exported baseline for a field the import wants to change.
- Multi-day import apply checks conflicts and saves all patched days in one transaction; if any day fails or conflicts, no patched day is persisted.
- Domain tests cover export payloads, prompt markers, immutable-field rejection, and valid patch extraction.
- Vacation-only and holiday-only days do not receive work summaries.
- A revision prompt lets the user rerun the LLM with extra style instructions while preserving the same JSON rules.
- The AI summary tab also shows a manual submission list for work entries. Date, Korean content, AI translation, and day summary each have their own copy control, and each control copies only that field's raw value.

## Notion Card Mapping

- Notion cards are user-specific. Card metadata is read from Notion, and optional number properties are written back to Notion after timesheet saves.
- The `Notion 카드` menu stores each user's integration token, data source ID, field mapping, done status values, optional work-hours number property mapping, optional work-day-count number property mapping, optional available-hours number property mapping, optional last-worked-date property mapping, and optional aJam-update-time date property mapping.
- The same menu stores weekday Notion defaults for Monday through Friday. In the UI, one default row can select multiple weekdays for the same card and hour value; it is stored as weekday-specific rules with an enabled flag.
- The Notion connection popup shows the saved field mapping immediately from stored descriptors; schema refresh is needed only when selecting changed Notion properties.
- Notion field mappings are applied by Notion property ID first, with property name fallback for older or incomplete descriptors. Renaming a mapped Notion field does not require remapping after the latest schema is available.
- Connection testing uses a newly entered token when present, otherwise it reuses the saved token.
- The work-hours property must be a Notion `number` property and stores total linked work-entry hours, not day-equivalent text.
- The work-day-count property is labeled `작업일수`; it must be a Notion `number` property and stores the distinct count of saved `WORK` dates linked to the card. Any amount of linked work on a date counts as `1`.
- The available-hours property is labeled `가용 시간`; it must be a Notion `number` property and stores available hours from the card start date through the end date, or today when no end date exists. It excludes weekends, holidays, and the user's vacations, and it is not divided across overlapping cards.
- The last-worked-date property is labeled `마지막 작업일`; it must be a Notion `date` property and stores the latest saved `WORK` date linked to the card. If no saved `WORK` entries remain linked to the card, the Notion date value is cleared.
- When the optional aJam-update-time mapping is configured, every Notion page update request writes the current request timestamp to that mapped Notion `date` property. If it is not mapped, timestamp writing is skipped.
- The category mapping can use a Notion `multi_select` property; selected values are stored as one comma-separated category string such as `개발, 운영`.
- Synced cards are candidates only; time analysis includes only cards mapped to saved `WORK` entries.
- A `WORK` entry can link multiple Notion cards.
- Auto allocation evenly splits the entry hours across linked cards.
- Linked Notion card pills in the daily editor can be removed directly without reopening the card picker.
- The Notion card picker shows candidate loading beside the popup title and uses skeleton rows when no candidate data is available yet.
- The Notion card picker can refresh the selected date's candidates without closing the popup, and each candidate with a Notion URL can be opened from the list.
- The Notion card picker shows linked candidates with a checkbox-style selection mark at the start of each row, and the full row padding area toggles selection except for the Notion external-link control.
- The Notion card picker can sort candidates by latest worked date, linked work duration, work day count, available hours, or title. Candidate rows and linked-card pills show compact card metrics in smaller secondary text: linked work duration such as `1d 4h` and the last linked work date as a normal relative label such as `132일 전`. Linked-card pills use metrics loaded with the saved entry first, so they do not require opening the picker before showing work duration and last-worked-date metadata.
- Opening the Notion card picker is cache-first for the selected date. If that date has no successful date-scope sync record yet, the app syncs from Notion once; the picker refresh button always performs a fresh Notion sync.
- The Notion card picker shows the selected date's last successful sync as relative time, such as `방금 전` or `5분 전`.
- Notion sync timestamps are read from SQLite as UTC ISO strings before relative-time formatting, so the picker label is independent of the user's local timezone.
- Saved work-entry Notion links load cached card title/status/category snapshots, so linked cards do not fall back to raw Notion page IDs after refresh.
- The candidate sync control uses a candidate reference date: it syncs cards open on that date, not every card in the data source.
- Notion popups close from an explicit close button or by clicking the backdrop.
- Saving a timesheet day updates Notion only when linked-card calculation inputs change: card links, linked dates, entry kind, entry hours, or allocated card hours. Content-only edits do not send Notion update requests. Deleting a timesheet day still recalculates the previously linked cards. If the aJam save/delete succeeds but the Notion field update fails, the UI shows a non-blocking error popup with the Notion failure reason.
- After a timesheet save/delete recalculates linked Notion metrics, the app revalidates the timesheet and Notion card routes. The save response reloads the saved day from the database so linked-card pills and cached picker candidates can show updated linked hours, work day count, and last worked date without a browser refresh.
- The internal Notion daily maintenance API lets n8n refresh open-card cache data and update mapped fields for active cards at midnight, especially the available-hours value for cards without an end date. It does not need to update the last-worked-date field because that value changes only when aJam work-entry mappings are saved or deleted.
- If the `열린 카드 동기화` control syncs cards and writable mapped fields exist, the Notion card screen asks whether to update those synced card fields.
- Skipping or failing the `열린 카드 동기화` field update is non-blocking: aJam keeps the card cache sync result.
- Done cards are excluded from default candidate search, but already-linked cards remain visible when the entry is edited. The picker has a `완료 카드 포함` toggle for backfilling older work entries that need completed cards.
- Candidate sync tries Notion first and falls back to cached cards so Notion API errors do not block normal timesheet writing.
- Period-based estimates use mapped open cards as the denominator and exclude holidays and vacations.
- When a saved work date has no explicit work hours for the estimate, the default fallback remains `8h = 1 day`.
- The monthly Notion view shows work day count, available hours, period-based estimated hours, and work-entry linked hours.
- In the monthly Notion view, clicking a card title opens the Notion page in a new tab when the cached card has a URL.
- Notion duration columns use `8h = 1d` mixed display, such as `2d (16h)` or `1d 4h (12h)`.
- The Notion card table shows `작업일수`, `가용 시간`, `업무 기간`, `마지막 작업 날짜`, and `기간 추정` as separate columns. `가용 시간` and `업무 기간` use detailed duration text such as `1d 4h (12h)`. `마지막 작업 날짜` is the latest saved `WORK` date linked to the card, displays only a normal relative label such as `132일 전`, and reveals the exact date on hover.
- The Notion card table defaults to sorting by latest worked date, and the user's last selected sort is preserved in the browser.
- The monthly Notion view also shows total linked work day count, total available duration, total linked work duration, and total calculable period estimate duration for the selected month.
- The Notion connection form opens in a popup from the Notion card view, while the card table uses the full page width.

## Save-Time AI Cleanup

- The Gemini-based cleanup flow saves the timesheet day first, then runs AI separately when the user's cleanup mode is `immediate`.
- Each user configures their own Gemini API key, model, cleanup mode, previous saved WORK date context count, and previous-date backfill limits.
- AI cleanup mode can be `immediate`, `scheduled`, or `manual`. In `scheduled` mode, saving a day does not call Gemini; the editor shows that AI cleanup is waiting for n8n only when the selected day has work that scheduled cleanup can process, and Ctrl/Cmd-clicking the save button forces an immediate cleanup for that save.
- Scheduled cleanup fills missing AI fields by default. Existing AI fields are overwritten only for dates whose `TimesheetDay.aiRewriteRequested` flag was set by choosing `AI도 업데이트` in the daily editor. When that per-date request is active, the editor warns next to the `짧은 버전` and `영문 번역본` fields, and manual edits prompt the user to keep the date request, turn it off for that date, or cancel the edit.
- The AI cleanup mode control shows the user's scheduled cleanup queue count as `N개 대기중`. The count includes dates with missing AI fields and dates with per-day overwrite requests. Clicking it opens a queue modal with pending dates, labeled as fill-missing or overwrite. Pending requests are preserved if the user switches cleanup mode to `immediate` or `manual`, but n8n scheduled cleanup processes them only while the user's cleanup mode is `scheduled`.
- Scheduled per-day rewrite requests are processed independently from `backfillMissing`, `backfillLimit`, and the normal scheduled lookback window; those settings apply only to fill-missing backfill targets.
- The save shortcut is shown with OS-aware keycaps: `⌘ ↵` on macOS and `Ctrl ↵` elsewhere. It saves the current day from daily input fields such as content, English translation, short version, and Notion card hour inputs.
- Pressing `Del` outside text-editing fields opens the same confirmation flow as the bottom delete action and deletes the saved selected date only after confirmation.
- Confirmation popups support `Esc` to close/cancel and `↵` for the primary action when a safe primary action is defined. Buttons show compact shortcut keycaps for these actions.
- The internal scheduled AI cleanup API lets n8n scan recent saved work days for users in `scheduled` mode, include any older per-day rewrite requests, and fill or rewrite AI fields in a batch.
- AI settings are shown under `내 설정` because the Gemini API key and cleanup preferences are user-owned, not site-wide server settings.
- Model presets should include `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`, and custom model entry.
- AI cleanup fills only empty work-entry `aiTranslation` and empty day-level `shortVersion` by default. It overwrites existing user-written values only for the current-date immediate rewrite flow or for dates with a scheduled per-day rewrite request.
- If a saved WORK date already has `aiTranslation` or `shortVersion` and the user changes Korean content, saving asks whether AI should rewrite the current date's translation and summary.
- When the user confirms that rewrite, only the current date may overwrite existing AI fields; previous-date backfill still fills empty fields only.
- If Gemini responds but no patch can be applied, the UI reports the precise no-change reason: protected existing fields without overwrite, same text as the existing AI fields, or blank AI output.
- AI cleanup status and no-change reasons are displayed below the editor action row so long Korean reason text does not compete with the save/delete controls.
- AI cleanup targets only saved `WORK` records with non-empty Korean content.
- `작성 예정`, `미기입`, unsaved drafts, future dates, vacation-only days, holiday-only days, vacation entries, holiday entries, and empty-content work entries are excluded from both context examples and update targets.
- Previous saved WORK dates can be sent as style/context examples, defaulting to the latest 5 eligible WORK dates.
- The context count is not calendar days: vacation days, holidays, missing dates, draft-only dates, and saved work entries with empty Korean content do not consume the count.
- Previous saved WORK dates with missing AI fields can be backfilled only when the user enables it, defaulting to at most 3 previous eligible dates per save.
- AI failure must not roll back or mark the normal timesheet save as failed.

## Holiday API

- Site settings are visible only to admins and contain shared settings such as the holiday API key, holiday cache controls, and user management.
- The initial server-rendered month is tracked separately from the browser's current month. If a UTC-hosted server preloads the previous month around the user's local midnight, the client switches to the browser-local current month and fetches that month instead of treating it as already loaded.
- During that initial server/browser month sync, the app shows a full-screen loading state so the previous server-rendered month does not flash before the browser-local month is ready.
- data.go.kr holiday loading failures do not break the whole timesheet page.
- If holiday loading fails, the page still loads work, vacation, and project data and shows a warning asking the user to check the API key.
- Month navigation uses an explicit month load state so slow data.go.kr responses keep showing `불러오는 중`, and full month-load failures show a separate error message instead of silently leaving stale month data on screen.
- If vacation range save covers a month whose holiday load previously failed, that month is retried before deciding which dates are holidays.
- In development only, admins can delete all cached data.go.kr holidays for debugging.

## Vacation Range Save

- `기간 저장` is available only when the selected date has exactly one vacation entry.
- Mixed schedules such as vacation plus work do not support range save or connected vacation updates.
- The range modal defaults to the selected date as the start date.
- In the normal case, the start date is fixed and the user chooses only the end date.
- If an earlier connected vacation exists, the start date is shown as editable.
- The end date cannot be earlier than the start date.
- A range can span at most 30 calendar days.
- Range save includes weekdays only.
- Holidays are skipped and never replaced.
- Existing saved records in the target range require a warning before replacement.
- Replacement saves each target date as one vacation entry and clears work fields and short version.
- Replacement warnings use saved records only, not transient editor drafts.
- Range save shows a progress bar with completed and total date counts while saving.

## Connected Vacation Updates

- Connected vacation detection uses business-day continuity.
- Saved holiday dates are skipped while scanning, so `휴가 - 공휴일 - 휴가` is treated as connected.
- Missing, draft-only, work, or mixed-entry dates break the connection.
- A connected vacation date must have exactly one saved vacation entry.
- When a single vacation is saved and connected vacation days are found, the user can cancel, save only the selected date, or save the same vacation type and hours to all connected vacation dates.
- When a single vacation is deleted and connected vacation days are found, the user can cancel, delete only the selected date, or delete all connected vacation dates.
- Together save and together delete both show a progress bar with completed and total date counts.

## Persistence Notes

- `TimesheetDay` stores day-level metadata such as `shortVersion` and the per-date `aiRewriteRequested` flag used by scheduled AI cleanup.
- `TimesheetEntry` stores individual work, vacation, or holiday entries with `sortOrder`.
- `Vacation` remains synchronized from vacation entries for monthly vacation totals.
- `UserNotionConnection` stores the user-owned Notion token, data source, field mapping, done status values, and analysis config version.
- `UserNotionWeeklyDefaultCard` stores user-owned weekday default card rules used before previous-date Notion card recommendation.
- `NotionCardCache` stores scoped Notion card snapshots used for candidates and analysis.
- `WorkEntryNotionCard` stores mappings between saved `WORK` entries and Notion cards, including allocated hours.
- `NotionSyncRun` stores scope-specific sync results and partial/failure metadata.
- Runtime schema bootstrap is still used. The Notion card sync schema is also documented as SQL in `docs/db-migrations/2026-06-15-notion-card-sync.sql` for review and operations.

## Verification

- Run `pnpm --filter @timesheet/web typecheck` after changes.
- Check calendar, list, and editor behavior for missing dates, projectless saved work, multiple work entries, Notion card linking on work entries, mixed work and vacation days, future vacation/holiday drafts, vacation range saves with holidays and existing records, connected vacation saves and deletes across holidays, month navigation selecting an in-month business day, month navigation loading/error feedback, previous-project auto-fill across month boundaries, saved non-holiday days with totals below or above `8h`, and holiday API warning behavior.
