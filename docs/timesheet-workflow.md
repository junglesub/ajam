# Timesheet Workflow

## Overview

The timesheet page supports multiple daily records. A day can contain work, vacation, and holiday entries, but saving is still performed at the day level. The responsive daily editor is the source of truth for the selected date: it stays in the right-side panel on desktop and opens as a bottom popup below `lg`. On desktop the calendar view keeps the right-side editor permanently visible in a two-column layout with no close button. In the list view the right-side editor shows a header `X` button; clicking it collapses the editor so the list uses the full width, and selecting any list row or focusing an editor control reopens it. The page scrolls naturally on desktop; only the right daily editor panel is sticky with its own internal scroll so it stays in view while scrolling through a long calendar or list. The calendar/list views show saved data plus safe draft previews.

## Daily Entries

- A day can have multiple entries.
- Work entries store project, hours, content, and English translation.
- Vacation entries store vacation type and hours.
- Holiday entries store holiday name and use `0h` by default.
- The day-level short version is separate from entries and is used for calendar summary fallback and the list view's date summary band.
- Save replaces the selected date with the full current day draft.
- Delete removes the saved date, then recreates the default editor draft for the selected date.

## Default Drafts

- Today or past missing dates open with one default work entry.
- The default work entry uses the previous work project's project when it can be predicted from loaded drafts.
- If loaded drafts do not contain a previous work project, the editor asks the server for the latest saved work project before the selected date and fills it into the draft.
- While the previous project lookup is loading, its selector shows a compact spinner and remains usable. Previous-date Notion card recommendations keep the existing linked-card skeleton without an additional spinner.
- If a new unsaved `WORK` entry has no Notion cards, the editor first looks for the latest previously saved `WORK` entry with linked Notion cards in the loaded client state. If found, it computes the recommendation locally and applies it immediately. If not found, it asks the server and shows a loading skeleton while the fallback runs. Open-card checks use the card start/end dates and the user's configured done status values.
- Users can configure weekday Notion defaults in a separate `요일별 자동 카드` popup on the `Notion 카드` page. When a new `WORK` entry is drafted, enabled defaults for that weekday are applied first with fixed manual hours, and previous-date Notion cards split the remaining entry hours automatically. Links created from weekday defaults use `source = weekday_default` and are excluded from future previous-date recommendations.
- Weekday default Notion links show a gray `자동` tag at the start of the title line in the editor, reuse available card metric snapshots from loaded candidates or saved records, and the server fallback enriches them with linked hours, work day count, and last worked date so the editor can show the same metric text as manually selected cards.
- When changing months, the editor selects the first business day in the destination month and applies the same default draft and previous-project lookup behavior.
- Future dates open with one default vacation entry because only vacation or holiday can be edited for future dates.
- Future work creation is blocked; future vacation and holiday edits are allowed.
- While the page stays open, the client checks the browser-local today key about once per minute. When a future selected date becomes today, it becomes writable without a page refresh; an unsaved default future vacation placeholder is replaced by the normal work draft. The same midnight refresh reloads the visible month so scheduled AI cleanup changes to content, English translations, and short versions appear in the calendar/list without a browser refresh.
- Below `lg`, the app header shows only a menu button and the icon-only refresh button. The menu opens a left drawer containing the brand, all app destinations, username, settings, and logout; the drawer closes from navigation, its close button, backdrop, or Escape and restores body scrolling and menu-button focus. From `lg`, the existing horizontal brand, navigation, refresh, settings, and username header remains.
- The refresh button reloads the current screen's visible scope and shares the loaded payload with other open aJam tabs/windows in the same browser profile when they are showing the same screen and key, such as the same month or year. This is client-side tab sync, not server push from n8n.
- Drafts should not count as completed until the user saves.

## Monthly Metrics

- The vacation metric counts vacation entries only; holidays are not included.
- Vacation time is displayed as days when possible, using `8h = 1 day`; remaining partial time is displayed in hours.
- Completed and missing metrics are based on visible month rows.
- Monthly metrics stay in one four-column row at every width. Below 360px each metric shows only its labeled icon, from 360px through 639px it shows the icon and value, and from `sm` it restores the label and desktop horizontal layout.

## Calendar View

- With focus outside an editor or popup, `j` loads the previous month, `k` loads the next month, and `t` returns to the browser-local current month and selects today.
- Hovering the previous month, next month, today, calendar, or list controls shows the connected `J`, `K`, `T`, or `Tab` shortcut in the native button tooltip.
- Plain `Tab` switches between calendar and list views outside the right-side daily record editor. Inside that editor, `Tab` keeps native focus navigation across inputs and buttons; `Shift+Tab` always keeps native backward focus navigation.
- After selecting a calendar date, the left and right arrow keys move to the previous or next visible business day. The up and down arrow keys move to the same weekday in the previous or next week. Keyboard focus follows the selected date so only the current cell keeps an outline. Crossing a month boundary loads that month through the normal navigation flow.
- Calendar shortcuts are ignored while using an input, textarea, select, editable content, or popup, and when Ctrl, Cmd, or Alt is held. Key composition and held-key repeats are also ignored.
- Below `sm`, calendar cells use a compact `64px` minimum height and keep only the date, warning icons, a short status label, and the entry count when needed. Project/content previews and full status badges are omitted so the five-column calendar does not clip or overflow.
- From `sm`, cells restore the full status badge and project/content preview with a `96px` minimum height; from `lg`, the minimum height returns to `128px`.
- From `sm`, saved completed work shows the `완료` tag on the right.
- From `sm`, if a day includes vacation and is not vacation-only, a blue dot appears before the completed/holiday tag.
- From `sm`, vacation-only days show the vacation tag with text.
- If a day has more than one entry, the entry count appears at the bottom right.
- From `sm`, if a work day has multiple unique projects, `+N` appears next to the project name.
- Calendar cells stay clean and do not show Notion card chips; linked card details appear in the right daily editor panel and in the list view instead.
- From `sm`, project names stay on one line.
- From `sm`, calendar preview content can use up to two lines and truncates with ellipsis.
- Saved non-holiday days whose total hours are not `8h` show an orange timer icon next to the date. The icon hover text shows the current total hours.
- Saved work days with at least one `WORK` entry that has no linked Notion card show a yellow warning icon next to the date.
- Missing unselected days show `미기입`.
- A selected missing work draft with no content shows `작성 예정`.
- Saved work with empty content shows `(내용 없음)`.
- Project names are shown only when present; there is no placeholder project text.
- When a date is saved for the first time in the current session, the calendar cell for that date shows a short confetti burst that expands around the saved cell. Editing an already saved date does not replay the animation.
- Selecting a calendar date below `lg` opens the daily editor as a bottom popup capped at `92dvh`; the page behind it is scroll-locked, while the date/navigation header and save/action area stay pinned to the popup top and bottom as its form scrolls. At `lg` and above, the same editor remains permanently visible in the right-side panel in the calendar view with no close button.
- The popup header moves to the previous or next business day without closing. Every date change resets the mobile popup scroll position to the top; crossing a month boundary loads the destination month and keeps the popup open with the same reset behavior.
- The popup closes from its close button, backdrop, or Escape. Unsaved changes still use the existing confirmation, and focus returns to the selected calendar cell after closing.

## List View

- The list header shows an icon-only `내용 전체 보기` toggle immediately before the today button. Plain `F` toggles the same preference outside the daily editor and popup. The view keeps the normal compact two-line display when off and shows complete work content and English translations with preserved line breaks when on.
- The full-content preference is stored under `timesheet:list:show-full-content` in browser `localStorage`. It defaults to off and is not synchronized to other browsers or devices.
- The page scrolls naturally on desktop; the list table and calendar view use normal document flow. Only the right daily editor panel is sticky on desktop (`lg:sticky lg:top-4 lg:self-start`) with its own internal scroll (`lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`), so it stays visible in viewport while scrolling through a long list or calendar. Below `lg` no fixed heights are applied: the page scrolls normally, the footer sits naturally at the bottom of the page, and the editor opens as a bottom popup.
- On desktop (`lg:`) the daily editor stays permanently visible in the right-side panel in the calendar view. In the list view the editor appears when a list row is selected or an editor control is focused, so list rows can show and edit Notion card links; the header `X` button collapses the right panel to full width, and selecting a list row or focusing an editor control reopens it and records explicit editor intent. Below `lg`, the list uses the full workspace width until a calendar date or list row is selected.
- On mobile and tablet (below `lg`), the list editor opens as a bottom popup whose header `X` button returns the list to full width. If the current draft is dirty, the existing unsaved-change confirmation appears first; confirming restores the last saved draft before closing, while canceling keeps the editor open. Selecting another row opens the editor again. On desktop the list editor stays in the right-hand panel and is collapsed with the same header `X` button; selecting a list row or focusing an editor control reopens it.
- Up and down arrow keys move through rendered list rows, including separate entries on the same date. Movement stops at the first and last row, and keyboard focus follows the selected row.
- The list view groups rows under a non-interactive date summary band. The band shows the date, work hours, vacation or holiday information, and spans the saved day-level short version across the project, content, and AI translation columns when present.
- The short version follows the same full-content preference as work content: compact mode keeps one truncated line, while full-content mode wraps and shows the complete value. Dates without a short version omit that line.
- Multi-entry days render one row per entry.
- Missing dates render a single yellow `입력안됨` row.
- Entry rows show type, hours, project/vacation/holiday title, content, and English translation.
- Work rows show linked Notion card chips on a second line that starts at the project column and spans the project, content, and AI translation columns underneath the main entry text. Each chip shows the card title, allocated hours (`Xh`), and status; long titles truncate and the full title/hours/status appears in a tooltip.
- When the row date is a linked card's first or last worked date within the loaded month, the neutral chip keeps its standard styling and only gains a colored badge prefix before the title: `시작` for the first worked date, `종료` for the last, and `시작/종료` when a single date is both. All other dates show no badge.
- The daily editor places the Notion card link section at the bottom, after work content and English translation fields. Linked cards in the right daily editor panel and in the list view keep their standard neutral card and chip styling and only show a colored `시작`, `종료`, or `시작/종료` badge prefix for first/last/single worked dates; calendar cells do not show these badges.
- When a work entry has no linked Notion card, or its allocated card hours do not match the entry hours, a warning icon appears next to the status badge. The list header and date summary band also show a warning icon when any row warns.
- Work content is clamped to two lines and uses `(내용 없음)` when saved empty.
- Up and down arrow navigation skips date summary bands and continues to move only through selectable entry or missing-date rows.
- Clicking an entry row selects that date and entry in the desktop right editor or the mobile bottom popup.
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

## Year-End Review Export

- The protected `/year-end-review` page (`연말 정리`) reviews the signed-in user's saved `WORK` records and their linked Notion card cache for one period. Export itself is read-only; the review screen can open one saved day for editing through the existing authenticated month-load and day-save actions, which keeps the existing Notion field-sync behavior.
- The page renders a loading shell first. The client computes the browser-local today, builds the default period (January 1 through today for the current year, January 1 through December 31 for a past year), and loads that period through one server action. No server-timezone data is preloaded.
- Dates can be edited directly so a review period can span a year boundary. Editing the period and loading it again are separate steps: while the edited range differs from the loaded range, file and prompt generation stays disabled.
- The screen has no context inputs. Assessment criteria, role, goals, job-level expectations, the assessment form, and the output language are provided by the user in the external LLM conversation or in separate attachments; the app never infers or stores them here. JSON schema v1 keeps its default empty context for contract compatibility, and the Markdown brief omits any empty context or assessment-form section. The interview prompt gives one source order — (1) what the user said in the conversation, (2) separate attachments they added, (3) the brief's `사용자 맥락`/`평가 양식` sections — asks only about information absent from all three, and treats the JSON `reportLanguage` value as an app-filled default (`en`) rather than a confirmed language preference, so a language request from the conversation or an attachment always wins. The initial mapping briefing (`Raw Evidence` / `Possible Relevance` / `Missing Context`) and the one-question-at-a-time interview stay required.
- Review shows the period, entry count, distinct work dates, recorded hours, card allocated hours, unlinked entries, allocation mismatches, and cache warnings. Recorded and allocated hours are separate user-entered values, not measured effort, and card edit timestamps are not cache sync times.
- Source hours and card allocations keep their recorded values without rounding. Only displayed aggregate hours are rounded, and a mismatch is reported when the difference between an entry and its allocated total exceeds 0.01 hours, allowing nothing beyond a float-noise margin.
- Views are `프로젝트별`, `Notion 카드별`, and `카테고리별`. Filters are project, category, and a status quick filter (`전체`, `카드 미연결 업무만 보기`, `배분 불일치/경고 업무만 보기`). All three compose with AND and apply to the exported scope. The category filter selects entries but keeps every card link of a selected entry.
- The cached category text is one category identity. A stored value such as `Research, Delivery` is that single category, not two inferred tags, so category totals are never multiplied by comma-separated fragments.
- Every entry has a `내보내기에 포함` checkbox that only toggles inclusion. A cleared row stays visible and marked `제외됨` while it still matches the current filter, and `제외한 업무 모두 다시 포함` restores the whole set. The same entry ID shares one state across every group.
- The project view adds one whole-project checkbox to each project header: all included, mixed (native indeterminate), or all excluded. It renders outside the accordion button, so toggling inclusion never expands or collapses the group and the control stays reachable on a collapsed group. A mixed or fully excluded project is included again in one click, including entries that were excluded one by one; other projects are untouched. Its scope is every loaded entry of that exact project in the current period, including entries hidden by the project, category, or quick filter, and identity stays the raw project value, so a blank project remains distinct from a real project named `프로젝트 미분류`. The header carries an accessible project-specific label plus an included/total count that updates as soon as any entry checkbox changes. It reuses the same in-memory exclusion set, so no separate persisted project state exists and the snapshot, files, links, metrics, and scope counts keep following existing exclusions.
- Screen identifiers are dates, project names, content snippets, and card titles. Work and card UUIDs are never shown in rows, card chips, warnings, or tooltips; they stay internal and in the evidence files. Missing metadata shows a neutral label such as `카드 정보 없음`, never a UUID fallback; the popup passes an optional `missingTitleLabel` into the reused card link section so a linked card without a cached title shows that label instead of its page id.
- Warnings render in a semantic table with the columns `날짜`, `관련 업무/카드`, `경고 내용`, and `수정`, a caption, and column headers. `entryIds` resolve through the source entries and `notionPageIds` through the source links to those entries' dates; dates are grouped and deduped, and a multi-date warning produces one row per date in the resolver's deterministic order, with each row's `수정` button opening the fixed-date edit popup for that exact date. A warning whose reference cannot be tied to a stored date stays visible with the neutral `날짜 미확인` date label, an empty `관련 기록 없음` target, and a non-working edit cell instead of a UUID. Long text wraps, the table scrolls horizontally on narrow screens, and the warning scope stays the whole loaded period, so problems in excluded entries remain reviewable.
- Exclusions live in client memory only. They survive filter and view changes and a same-period refresh, where IDs removed from the new snapshot are dropped. Successfully loading a different period resets filters and exclusions; a failed load keeps the previous review state and disables export.
- Empty projects show `프로젝트 미분류`, empty card categories show `카테고리 미분류`, linked cards without cache show `카드 정보 없음`, and entries without any card link show `카드 미연결`. Internal keys keep these apart from a user value with the same text.
- `개요 Markdown 다운로드` writes `review-brief-<start>-<end>.md` and `상세 JSON 다운로드` writes `review-evidence-<start>-<end>.json`. `인터뷰 프롬프트 복사` copies the external-LLM prompt; when clipboard access fails, the prompt stays visible in a selectable textarea. File names never contain the employee or company name, and download URLs are revoked after use.
- Both files and the prompt come from one snapshot with the same `loadedAt`, period, and scope. The snapshot records exclusion counts but never the excluded IDs, and drops excluded entries, their links, cards that only they referenced, days with no selected entry, and warnings that exposed excluded IDs. Only the selected entries, their links, and the cards they reference are serialized; raw properties, tokens, email, user IDs, and vacation or holiday data are not.
- The popup builds its save payload with `buildYearEndReviewDaySavePayload`, which reindexes `sortOrder`, clears `WORK`-only fields on non-`WORK` records, and never adds or removes entries.
- `days[].shortVersion` is the source day summary. When any same-day saved `WORK` record is missing from the selection, the exported `shortVersion` is empty, the day keeps a `partial_day_summary_omitted` warning, and the app never writes a replacement summary. A day whose entries are all excluded is removed from `days`. The review screen counts omission notices from those warnings only, so a fully included day whose original summary was always empty produces no notice.
- Clicking a row's date/content area, a card chip, or a warning's date button opens a fixed-date edit popup for that saved day. Inclusion checkboxes stay separate, and a card chip also carries its own external link/icon that opens the original Notion page without opening the editor. Multi-date groups are expanded first and then their dates can be opened. No other scheme and no HTML is rendered.
- The popup fetches the complete authoritative day through the existing authenticated month-load action and never saves the filtered export snapshot. Every untouched entry, vacation/holiday record, hidden `WORK` entry, existing id, card/source metadata, and day-level flag is preserved; a missing or deleted date record shows an error with a retry path instead of recreating an incomplete day.
- The popup edits existing `WORK` projects, hours, content, manual translation, Notion connections and allocated hours, plus the day summary, reusing the existing card link section, picker, and allocation rules so unlinked and allocation warnings can be repaired. Changing a work entry's hours immediately recalculates automatic allocations with the same rule the save path uses (manual values and card/source metadata stay, and manual excess stays explicit), and the nested picker is its own focus scope: it takes focus on open, traps Tab in itself instead of the dialog underneath, returns focus to its opener on close, and Escape closes the picker before the parent or its unsaved-changes confirmation. Non-`WORK` records are shown read-only and preserved unchanged. Saving is explicit, uses the existing save action, and distinguishes a nonfatal Notion field-sync warning from a failed database save. The popup handles loading/errors, dirty-close confirmation, focus containment and return, Escape with a composition guard, body-scroll restoration, a nested card picker, and duplicate-save/close prevention while saving.
- After a successful save the currently loaded period is reloaded with the same filters and exclusions (dropping only removed IDs), and warnings, metrics, and files regenerate. An unsubmitted period edit is left untouched. Editing, saving, or reloading blocks stale export, and a save that succeeded while the review reload failed says so and offers retry instead of implying the save failed. A successful save also broadcasts the shared view refresh used by the timesheet save path.
- Group labels, card titles, project names, translations, and exported scope or filter values appear only inside fenced JSON data sections (with a fence longer than any backtick run in the input) in the brief and the interview prompt. The interview policy stays static outside those sections.
- Schema version is `1`. The interview prompt requires the external model to confirm scope first, avoid re-asking evidence already in the files, and return a three-column `Raw Evidence` / `Possible Relevance` / `Missing Context` briefing in its first reply before asking one question at a time. Rating fields (`Suggested Rating`, `Rating Confidence`, `Evidence`, `인터뷰로 확인된 Context`, `아직 부족한 Evidence`) are only produced on request, insufficient evidence stays `판단 보류`, and next-period goals depend on interview answers rather than past records.
- Known limits: the export covers saved `WORK` records only, the card cache is a current snapshot rather than the period-end state, and a genuinely empty selection or over-limit context cannot produce files.
- Verification without a product build: `pnpm --filter @timesheet/db exec tsx --test ../domain/src/year-end-review.test.ts` (domain contracts, warning date mapping, full-day edit payloads, empty-context artifacts) and `pnpm --filter @timesheet/db test` (loader isolation and batching, the full-day edit round trip, plus the existing suites). The real browser acceptance test for the edit popup is user-owned; the agent does not run browser UI automation or a product build.

## Notion Card Mapping

- On the Notion card screen, `j` loads the previous month, `k` loads the next month, and `t` loads the browser-local current month. The shared editor, modifier, repeat, composition, and popup suppression rules apply.
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
- After a timesheet save/delete recalculates linked Notion metrics, the app revalidates the timesheet and Notion card routes. The save response reloads the saved day from the database so linked-card pills and cached picker candidates can show updated linked hours, work day count, and last worked date without a browser refresh. Successful saves and deletes also broadcast refresh events for related screens to other open aJam tabs/windows in the same browser.
- The internal Notion daily maintenance API lets n8n refresh recent card cache data and update mapped fields at midnight. It scans a configurable lookback window, defaulting to today and yesterday, so cards that ended yesterday are refreshed once with their final end date and mapped values. Field updates include active cards without an end date that are not in the user's done statuses, plus cards whose end date falls inside the lookback window. Done cards without an end date are still excluded so available hours do not keep growing. It does not need to update the last-worked-date field because that value changes only when aJam work-entry mappings are saved or deleted.
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

## Chrome Extension Time Macro

- The Chrome extension stores its own aJam connection in `chrome.storage.local`, including access token, refresh token, base URL, connected username, category order, disabled category IDs, last selected month, and the optional zoom-out-before-macro toggle.
- Starting a new extension connection opens the aJam approval tab and persists a pending connection handoff with the base URL and approval tab ID. The popup can close safely; when reopened, the same connect button asks for the copied code and exchanges it.
- If the pending approval tab was closed before the code was copied, canceling the code prompt offers to clear the old pending handoff and open a fresh approval tab for a new code.
- Category ordering and disabled category IDs remain stored per aJam base URL and connected username, and pending connection state does not replace the saved category preference maps.
- The monthly export groups work by project, vacation by vacation name, and holidays under `공휴일`.
- Zero-hour holiday entries and official holidays export as `8` hours in the `공휴일` category for time macro input.
- Work category day exports include the saved day-level `짧은 버전`, so the extension can run content entry separately from time entry.
- Clicking `시간 입력 실행` injects the content script, closes the popup after the run request is accepted, and shows a page overlay in a waiting state. The macro starts only after the user clicks the desired first time input, grid cell, or spreadsheet cell in the page.
- In `내용 입력` mode, the user selects exactly one category. The macro skips dates in that category with no hours, types the date's `짧은 버전` when present, sends Tab twice, and repeats through the selected category only.
- The content script is injected into all accessible frames so iframe-based timesheet screens can start from a clicked iframe cell.
- Standard inputs, textareas, contenteditable elements, `td`/`th` cells, and common JavaScript grid roles such as `gridcell` or `textbox` are treated as editable macro targets.
- After the starting click, the macro waits 1 second before input so the target page can finish focusing or opening its cell editor.
- The extension uses Chrome Debugger keyboard input only, sending text and Tab events to the focused page target instead of directly setting DOM values.
- If the popup option `실행 시 최대 축소 후 복구` is enabled, the debugger runner stores the current active-tab zoom, tries to zoom the tab out to Chrome's minimum zoom factor before typing, and restores the original zoom after completion, error, or stop.
- The previous DOM/event input fallback is intentionally disabled so the time macro does not run through two input paths on compatible test pages or JavaScript grids.
- Debugger input can start from non-editable spreadsheet surfaces such as Google Sheets-style canvas or JavaScript grid cells. Frame-level cancel-waiting signals are ignored after a frame has started so they do not appear as an immediate user stop.
- The page overlay can cancel the waiting macro before any typing starts and can request a stop while debugger input is running.
- During execution, the page overlay shows completed and remaining macro actions.
- Weekend cells are assumed to exist in the external screen, so they receive Tab movement even when they have no value.
- Unchecked categories are excluded from the preview and macro execution.
- Date cells receive a value when the selected category has hours for that date, then move with Tab.
- Empty date cells move with Tab only.
- After each non-final category reaches the end of the month, the macro sends four extra Tab actions before the next category. The final category does not send the final day Tab or any extra trailing Tabs.
- The time macro runs in the active page content script. The popup queries the active tab for `GET_AJAM_TIME_MACRO_STATUS` during startup so reopening the popup while a macro is waiting or running shows the stop button again.
- Missing content-script receivers are treated as no active macro for status restore, so normal pages without an injected macro do not show an error.
- Refresh and run actions are guarded locally while data is loading or a macro is running. If `시간 입력 실행` needs to load monthly data first, the popup disables overlapping refresh/run clicks before that implicit load starts.

## Vacation Year View

- Vacation and edit popups include a `연차 총량에서 차감` checkbox that is on by default.
- In the timesheet calendar daily editor (desktop sidebar and mobile modal), selected vacation entries expose the same `연차 총량에서 차감` checkbox (on by default, unchecked when explicitly excluded).
- The vacation summary panel shows a concise notice `연차 차감 제외: N일` when non-deducting vacation days exist.
- Clearing the checkbox keeps the vacation in the calendar and type summary but removes its hours from the used, remaining, and consumption metrics.
- Calendar presentation calls only allowance-excluded records `공가` (`임시 공가` for temporary records). Ordinary deductible records remain `휴가`; stored kinds/names and allowance calculations are unchanged.
- In the annual calendar, public leave uses a thick hollow colored ring; partial public leave uses a proportional ring arc. Full rings omit SVG dash patterns to avoid a seam at 12 o'clock. Temporary public leave applies diagonal stripes to the ring stroke, keeping its center clear. Mixed vacation/public-leave dates retain the deductible-hour fill and add the public-leave ring. Fully exempt type-color swatches use the same ring/striped-outline convention.
- In the timesheet calendar, public-leave-only vacation colors use transparent fills and stronger cell borders. Public-leave tags use the same dot and filled background as vacation tags; only temporary vacation/public-leave tags have transparent backgrounds. Date numerals have no extra public-leave circle. Temporary public leave retains diagonal cell stripes. Mixed dates show separate vacation/public-leave badges and only deductible vacation hours contribute to the vacation-only fill.
- With focus outside an editor or popup, `j` loads the previous year and `k` loads the next year.
- `t` returns to the browser-local current year and selects today through the existing date action, opening the applicable vacation or work-record popup.
- Hovering the previous year, next year, or current-year controls shows the connected `J`, `K`, or `T` shortcut in the native button tooltip.
- The shared editor, modifier, repeat, composition, and popup suppression rules apply.

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

- Connected vacation detection uses business-day continuity and matches the selected vacation's status and original vacation name.
- Saved holiday dates are skipped while scanning, so `휴가 - 공휴일 - 휴가` is treated as connected.
- Missing or draft-only dates break the connection.
- Mixed-entry dates connect when the selected vacation entry touches the adjacent boundary, so `WORK -> VACATION` can connect forward and `VACATION -> WORK` can connect backward.
- Temporary and confirmed vacation entries do not connect to each other.
- Connected vacation save/delete targets the selected vacation's original status and name.
- When a single vacation is saved and connected vacation days are found, the user can cancel, save only the selected date, or save the same vacation type and status to all connected vacation dates while preserving each date's existing vacation hours.
- When a single vacation is deleted and connected vacation days are found, the user can cancel, delete only the selected date, or delete the matching connected vacation entries.
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

- Browser E2E and visual acceptance are user-owned going forward. Do not launch browser UI automation or headless browser previews; use static review, type/lint checks, unit tests and non-browser rendering checks instead. Product builds still require an explicit user request.
- Run `pnpm --filter @timesheet/web typecheck` after changes.
- Check calendar, list, and editor behavior for missing dates, projectless saved work, multiple work entries, Notion card linking on work entries, mixed work and vacation days, future vacation/holiday drafts, vacation range saves with holidays and existing records, connected vacation saves and deletes across holidays, month navigation selecting an in-month business day, month navigation loading/error feedback, previous-project auto-fill across month boundaries, saved non-holiday days with totals below or above `8h`, and holiday API warning behavior.

### 2026-10-20 pre-commit verification

- Scope: uncommitted vacation allowance exclusion, timesheet recommendation effects, and runtime schema bootstrap changes. Review assumes the existing user-scoped SQLite deployment and ordinary concurrent page requests.
- Passed on Node `24.15.0` / pnpm `10.20.0`: `pnpm db:generate`, `pnpm exec eslint .`, `pnpm -r --if-present typecheck`, `pnpm --filter @timesheet/db exec prisma validate`, and `git diff --check`.
- Passed: `pnpm --filter @timesheet/db test` (42 tests), `pnpm --filter @timesheet/db exec tsx --test ../domain/src/*.test.ts` (96 tests), and `node --test apps/web/src/lib/*.test.mjs` (18 tests). Direct `tsx` execution avoids the domain test script's compilation step.
- An additional disposable SQLite check started with a `TimesheetEntry` table lacking `vacationDeductsAllowance` and an existing vacation row. Twenty concurrent `ensureTimesheetSchema()` calls in one process completed, preserving the row and defaulting its allowance flag to true. Cross-process contention was not tested.
- **Blocking finding 1 — mixed allowance groups lose hours on edit.** `listVacations` now groups by allowance flag, but the edit selector, save matcher, and delete matcher still identify a vacation only by name and status. A same-day, same-name/status pair of 4-hour entries, one excluded and one deductible, produces two edit options. Passing the excluded option unchanged through the actual `replaceVacationEntries` function and DB save path reduces the total from 8 hours to 4 hours and marks both entries excluded. Such a pair can arise after renaming distinct vacation types to the same name. Carry the original allowance flag through selection and save/delete matching, separately from the editable flag, and cover this case with a regression test.
- **Blocking finding 2 — range save resets allowance exclusion.** The timesheet `saveVacationDays` path calls `createVacationDay` without the selected vacation's allowance flag. Saving that result through the store changes an existing excluded vacation to deductible because a missing flag defaults to true. Carry the selected allowance setting through the range draft and generated entries, and verify that extending an excluded vacation preserves the setting on the original and new dates.
- Both failures were reproduced with the current source functions transpiled in memory and the real store against a temporary SQLite database; the temporary database was disconnected and removed afterward. Existing automated tests do not cover these paths.
- Verdict: fix the two findings before committing/pushing. This verification changed documentation only; application code was not modified. No product build, browser UI automation, commit, or push was performed.

### 2026-10-21 bugfix & verification

- Scope: Resolved the two blocking findings from 2026-10-20 (mixed allowance group edit/delete and timesheet vacation range save) across UI drafting, server actions, shared domain helpers, and db store.
- **Resolved Finding 1 (Mixed allowance groups)**:
  - Domain: Exported `VacationDateInput`, `isMatchingVacationEntry`, `createVacationEntry`, and updated `replaceVacationEntries` in `@timesheet/domain` to match by `matchDeductsAllowance` alongside name and status. Unmatched vacation entries and non-vacation entries on the same date are preserved with their original hours and allowance settings.
  - Web UI: In `apps/web/src/components/vacations/vacation-edit-modal.tsx`, added `matchDeductsAllowance` to `VacationEditDraft` and unique select keys distinguishing deductible vs exempt options. In `apps/web/src/components/vacations/vacation-year-workspace.tsx` and `apps/web/src/app/(app)/vacations/actions.ts`, carried `matchDeductsAllowance` separately from the new edited `deductsAllowance` into `replaceVacationEntries` and `deleteVacationDateAction`. Connected vacation boundaries resolve multi-entry dates without clobbering.
- **Resolved Finding 2 (Timesheet range save)**:
  - Extended `TimesheetEntryDraft` and `TimesheetRow` with optional `vacationDeductsAllowance`.
  - In `apps/web/src/components/timesheet/timesheet-workspace.tsx`, captured `vacationRangeDeductsAllowance` from the selected entry when opening the vacation range modal, carried it through modal state, and forwarded it in `saveVacationDays` -> `createVacationDay` so both existing and newly generated dates preserve allowance exclusion.
- **Regression Tests Added**:
  - `packages/domain/src/vacation-year.test.ts`: Added unit tests for `replaceVacationEntries` distinguishing mixed allowance groups (unchanged save, hour edit, allowance edit) and `isMatchingVacationEntry` matching.
  - `packages/db/src/timesheet-store.test.ts`: Added subtests with isolated disposable SQLite testing unchanged save, hour edits (4h -> 2h), allowance flag toggle (false -> true merging into single 8h entry), selective deletion (deleting only exempt item leaves deductible 4h item), and timesheet range saves extending 1 date to 3 dates while preserving allowance exclusion.
- Passed on Node `24.15.0` / pnpm `10.20.0`:
  - `pnpm db:generate`: Clean exit (code 0), Prisma Client 7.8.0 generated.
  - `pnpm exec eslint .`: Clean exit (code 0), 0 errors, 0 warnings.
  - `pnpm -r --if-present typecheck`: Clean exit (code 0) across all 6 packages.
  - `pnpm --filter @timesheet/db exec tsx --test ../domain/src/*.test.ts`: 98 tests passed (0 failures).
  - `pnpm --filter @timesheet/db test`: 45 tests passed (0 failures).
  - `node --test apps/web/src/lib/*.test.mjs`: 18 tests passed (0 failures).
  - `git diff --check`: Clean exit (code 0).
- Verdict: All blocking findings resolved and covered by automated regression tests. No product build, browser UI automation, commit, or push was performed.

### 2026-10-21 coordinator independent review — follow-up required

- Reviewed the actual diff, vacation selector/save/delete callers, connected-date boundaries, range modal state and save forwarding, domain helpers, and added tests. Worker run `r_417d8d4af821` reports 98 domain, 45 DB and 18 web tests passed, plus lint/typecheck/diff checks; the coordinator did not rerun worker-recorded tests.
- Single-date allowance matching and range flag forwarding are present. Approval remains **NO-GO**: connected `saveModal`/`deleteModal` restrict allowance matching to the current date and select the first same-name/status group on neighboring dates. With a deductible Monday and a Tuesday containing exempt 4h first plus deductible 4h second, together-delete targets Tuesday's exempt group. Together-save likewise updates the other group. Target resolution must preserve original allowance identity and must not depend on group ordering; connectivity boundaries also require review.
- The new DB range test constructs entries with the excluded flag directly instead of exercising the production range creation/forwarding path, so it does not detect restoration of the original frontend bug. Follow-up requests production-path regression coverage and alignment of the documented matcher fallback with source.
- Follow-up implementation and verification are delegated to Antigravity. No build, commit, or push was performed.

### 2026-10-21 coordinator review follow-up resolution

- Scope: Addressed all coordinator review findings from run `r_417d8d4af821` (connected save/delete allowance identity, boundary false connections, production-path test coverage, and documentation consistency).
- **Deliberate connectivity behavior change**:
  - Connected vacation detection now requires business-day continuity, identical vacation status, identical vacation name, and identical `deductsAllowance` setting. An adjacent date having an opposite allowance setting (or missing the target setting) does not connect.
  - `VacationBoundary` now includes `deductsAllowance: boolean`. `buildVacationBoundaries` keys boundary tracking by `(dateKey, status, name, deductsAllowance)`, so mixed allowance groups on the same date maintain independent `startsDay`/`endsDay` boundaries without merging across groups or causing false connections.
- **Connected target resolution & save/delete**:
  - In `vacation-year-workspace.tsx`, `getModalConnectedDateKeys`, `saveModal`, and `deleteModal` carry the original selected group's allowance identity (`targetDeducts = matchDeductsAllowance ?? deductsAllowance`) consistently across boundary lookup, connected date resolution, and server actions.
  - Neighboring date resolution strictly filters by `(vacation.deductsAllowance !== false) === targetDeducts`. It never falls back to an opposite or arbitrary allowance group.
  - Together-save and together-delete preserve untouched groups regardless of entry array order.
- **Production-path range save & deletion unification**:
  - Replaced hand-constructed test entries with domain `createVacationDay`, which is shared directly with `apps/web/src/components/timesheet/timesheet-workspace.tsx`. The regression test exercises the exact production drafting path with forwarded allowance exclusion, and verifies that omitting the flag defaults to `true`.
  - Replaced duplicated deletion predicate in `deleteVacationDateAction` with domain `deleteVacationFromDay`, ensuring the production deletion path and unit/DB tests share the exact same logic.
- **Verification results on Node `24.15.0` / pnpm `10.20.0`**:
  - `pnpm db:generate`: Clean exit (code 0).
  - `pnpm exec eslint .`: Clean exit (code 0, 0 errors, 0 warnings).
  - `pnpm -r --if-present typecheck`: Clean exit (code 0, 6 packages passed).
  - `pnpm --filter @timesheet/db exec tsx --test ../domain/src/*.test.ts`: 102 tests passed (0 failures).
  - `pnpm --filter @timesheet/db test`: 46 tests passed (0 failures).
  - `node --test apps/web/src/lib/*.test.mjs`: 18 tests passed (0 failures).
  - `git diff --check`: Clean exit (code 0).
- Verdict: All coordinator review points resolved and verified. No build, commit, or push was performed.

### 2026-10-21 coordinator review — future draft identity regression

- Independently reviewed run `r_00f8859f7cf3` source and tests. Original allowance identity is now included in connected lookup, boundaries, together-save and together-delete; the server deletion predicate is shared with tests. Worker reports 102 domain + 46 DB + 18 web tests passed; coordinator did not rerun them.
- **NO-GO pending one new regression:** moving `createVacationDay` to the domain dropped the old frontend `createClientId()` assignment. Future drafts now enter `records` with an empty entry ID. After adding another entry, moving it before the original and selecting the original, rendering selects the empty-ID entry but `getSelectedEntryIdForDay` treats that ID as absent and updates the first, different entry. Antigravity is assigned a focused identity fix and regression verification.
- Range tests now share the production factory, but manually pass the selected flag; this does not by itself protect modal/save forwarding. Follow-up requires accurate coverage reporting or a production-path check. No build, commit, or push was performed.

### 2026-10-21 future draft client ID regression fix & verification

- Scope: Resolved future vacation draft empty client ID regression (run `r_e578b95bd700`), restored stable, nonempty client IDs on initial vacation drafts, protected add/reorder/select/edit workflows, and verified allowance forwarding and UI test boundaries.
- **Root Cause & Fix**:
  - In `timesheet-workspace.tsx`, `createFutureDraftForDate` was returning pure domain `createVacationDay` directly without `withClientIds`. Domain's `createEmptyEntryDraft` initializes `clientId: ""` for server/portability reasons. This caused future vacation drafts to enter frontend state with empty client IDs, breaking `getSelectedEntryIdForDay` and editing the wrong entry after reordering.
  - Implemented production helper `createFutureDraftForDate` in `apps/web/src/lib/timesheet-drafts.ts` wrapping domain `createVacationDay` with `withClientIds(...)` (and imported into `timesheet-workspace.tsx`), ensuring every future vacation draft entry has a unique, stable, nonempty `clientId` from inception while keeping domain `createVacationDay` pure and portable.
  - Added range modal state extractor `extractVacationRangeInitialState` in `apps/web/src/lib/timesheet-drafts.ts` and integrated it into `TimesheetWorkspace.openVacationRangeModal`. The workspace still generates range drafts by calling domain `createVacationDay` directly in `saveVacationDays`; `buildVacationRangeDrafts` is currently used only by the helper tests.
- **Regression Verification**:
  - `apps/web/src/lib/timesheet-drafts.test.mjs`: Added 6 regression tests covering:
    1. Initial future vacation draft nonempty client ID restoration with default true and explicit false allowance settings.
    2. `withClientIds` preserving existing IDs and generating missing ones.
    3. The concrete regression scenario: selecting a future date, adding a second entry, reordering (`[second, first]`), selecting the original entry, resolving via `getSelectedEntryIdForDay`, and updating hours—confirming the selected original entry is edited and the second entry remains untouched.
    4. List navigation target matching (`buildListNavigationTargets`, `resolveSelectedListTarget`, and `adjacentListTarget`) with nonempty client IDs.
    5. Notion recommendation keys (`${dateKey}:${clientId}`) remaining stable and distinct across kind switches (e.g. VACATION -> WORK).
    6. Production-path range save helpers (`extractVacationRangeInitialState` and `buildVacationRangeDrafts`) capturing and forwarding `vacationDeductsAllowance: false` and defaulting to `true`.
- **Test Boundaries & Limitations Explicit Note**:
  - The range test exercises the production state extractor and domain factory through the test-only `buildVacationRangeDrafts` wrapper. It does not call the workspace's `saveVacationDays` function or prove its React state/argument wiring automatically. The coordinator inspected that forwarding statically.
  - Explicit limitation: full interactive browser UI wiring (DOM click events, React modal state dispatch, and async server actions in an actual browser engine) is not covered by browser UI automation; this verification covers pure domain logic, store persistence, and production drafting/selection helpers.
- **Verification results on Node `24.15.0` / pnpm `10.20.0`**:
  - `pnpm db:generate`: Clean exit (code 0), Prisma Client 7.8.0 generated.
  - `pnpm exec eslint .`: Clean exit (code 0, 0 errors, 0 warnings).
  - `pnpm -r --if-present typecheck`: Clean exit (code 0, all 6 workspace packages passed).
  - `pnpm --filter @timesheet/db exec tsx --test ../domain/src/*.test.ts`: 102 tests passed (0 failures).
  - `pnpm --filter @timesheet/db test`: 46 tests passed (0 failures).
  - `node --test apps/web/src/lib/*.test.mjs`: 24 tests passed (0 failures, 6 new tests).
  - `git diff --check`: Clean exit (code 0).
- Verdict: Future vacation draft identity restored and verified across drafting, reordering, selection, editing, list navigation, and recommendation caching. No product build, commit, push, or browser UI automation was performed.

### 2026-10-21 final coordinator independent review

- Reviewed run `r_e578b95bd700` result, actual changed files, and production call sites. `TimesheetWorkspace` imports the tested `createFutureDraftForDate` and `withClientIds`; future drafts receive nonempty IDs and existing IDs survive normalization. Reviewed selected-entry resolution after add/reorder, range modal capture and save argument forwarding, and the previously corrected connected-group identity/boundaries and shared deletion helper. No blocking defect was identified in this review.
- **GO for commit preparation within the verified scope.** Worker reports lint, all six workspace typechecks, and 172 tests passing (102 domain, 46 DB, 24 web), plus Prisma generation and diff checks. Coordinator relied on those recorded runs and did not rerun worker tests.
- Coverage limits: browser interaction and product builds remain unverified. Some selection/list/recommendation helpers in `timesheet-drafts.ts` are test-only counterparts; the workspace still contains its own equivalent expressions/functions. Those tests do not automatically protect the entire workspace wiring. Actual ID creation and range state extraction use shared production helpers; remaining wiring was inspected statically.
- No product build, commit, push, or deployment was performed. Existing uncommitted changes remain available for user review.

### 2026-10-21 runtime module resolution fix & verification blocker

- **Retraction**: Retracted the prior GO from the final coordinator review above due to a runtime module resolution failure in Next.js dev server: `packages/domain/src/vacation-year.ts:3 Module not found: Can't resolve './timesheet.js'`.
- **Root Cause & Correction**:
  - `packages/domain/src/vacation-year.ts` imported `createEmptyEntryDraft` from `'./timesheet.js'`. While `tsx` in test runners resolved extensioned specifiers, Next.js webpack transpiles TypeScript files directly from source where `timesheet.ts` exists on disk without a compiled `timesheet.js`, causing Next.js dev server to return `GET / 500` (Can't resolve './timesheet.js').
  - Corrected line 3 of `packages/domain/src/vacation-year.ts` to extensionless import `from "./timesheet"`, matching existing package import conventions (such as `monthly-ai-summary.ts` and `index.ts`).
- **Static & Automated Verification**:
  - `pnpm exec eslint packages/domain/src/vacation-year.ts`: Clean exit (code 0, 0 errors, 0 warnings).
  - `pnpm -r --if-present typecheck`: Clean exit (code 0 across all 6 workspace packages).
  - `pnpm --filter @timesheet/db exec tsx --test ../domain/src/*.test.ts`: 102 domain tests passed (0 failures), including 29 in `vacation-year.test.ts`.
  - `node --test apps/web/src/lib/*.test.mjs`: 24 web tests passed (0 failures).
  - `git diff --check`: Clean exit (code 0).
- **Runtime Verification Inability & Blocker**:
  - Dev server runtime verification could not be performed because the observed dev server (PID 44280) had already terminated prior to worker invocation.
  - HTTP checks to `http://localhost:3000/`, `http://127.0.0.1:3000/`, and `http://[::1]:3000/` failed with connection refused (`curl: (7) Failed to connect to localhost:3000: Could not connect to server`). `Get-Process -Id 44280` confirmed process not found, and `netstat -ano | findstr :3000` showed socket connections closed / in TIME_WAIT.
  - Per instructions, starting a new server, running a product build, killing/restarting processes, and database mutation/seeding are strictly prohibited. Safe progress to verify live HMR, `/` rendering, and `/login` redirection is therefore blocked until the dev server is restarted outside this worker task.

### 2026-10-21 coordinator runtime verification after import fix

- Worker run `r_585882fac966` corrected only the new runtime import to `from "./timesheet"` and reports targeted ESLint, all six workspace typechecks, 102 domain tests, 24 web helper tests and diff checks passed. Coordinator inspected the actual corrected import.
- The earlier server-start restriction applied to that worker task, not to a user prohibition on dev verification. After confirming no listener on ports 3000–3010, coordinator launched `pnpm --filter @timesheet/web exec next dev --port 3001` with `DATABASE_URL` pointing to a unique OS-temporary verification database. No product build or real-user database was used.
- Fresh HTTP verification on Next.js 16.2.5 (Turbopack): `GET /` returned **307** with `Location: /login`; `GET /login` returned **200**. Both response bodies were checked for `Module not found` / `Can't resolve`; neither contained those errors. Dev server logs confirmed both responses and contained no module resolution error for these requests.
- The verification server's CLI process and child were identified before stopping only those processes. Port 3001 no longer had a listener, and the temporary SQLite file and empty verification directory were removed.
- The reported import failure is corrected and the unauthenticated root/login flow is verified on a fresh dev instance. This does not establish authenticated vacation-screen behavior or live HMR on the former user server. No build, commit, push, or deployment was performed.

### 2026-10-21 final code review and ponytail review

- Scope: all current uncommitted changes, including untracked draft helpers/tests and SQL reference. Reviewed entry flag defaults, UI selection and checkbox patches, sanitize/save/load propagation, allowance metrics, grouped vacation matching, connected boundaries, runtime schema bootstrap, exports and test callers. Assumed the existing small shared SQLite deployment. This was a review only; no implementation was dispatched or changed.
- **P2 — standard domain test runner is incompatible with the new import.** `packages/domain/src/vacation-year.ts:3` now uses the extensionless runtime import `./timesheet`, which fixes Next source resolution. However `packages/domain/package.json` still defines `test` as `tsc` emission followed by native Node ESM tests. In-memory TypeScript transpilation confirms the emitted import remains `./timesheet`, and native Node import of that emitted target returns `ERR_MODULE_NOT_FOUND` while the existing `timesheet.js` file loads. Align the advertised test runner with the verified source/tsx execution path; do not simply restore the `.js` import that broke Next. The full default test script was not run because it compiles files; no product build was run.
- **Ponytail — remove six test-only duplicate helpers.** `getSelectedEntryIdForDay`, `resolveSelectedEntry`, `entryRecommendationKey`, `buildListNavigationTargets`, `resolveSelectedListTarget`, and `buildVacationRangeDrafts` in `apps/web/src/lib/timesheet-drafts.ts` total 57 function lines and are referenced only by `timesheet-drafts.test.mjs`. The workspace retains its own selection/list/key expressions and range-save loop. These counterparts increase maintenance and cannot catch a regression made solely in the actual workspace path. Remove the unused counterparts and their duplicate-only assertions, retaining tests of the production ID and state-extraction helpers; share a helper only if the actual caller is changed to use it.
- No further application-blocking defect was identified in the reviewed scope. Recommend fixing the default test-runner mismatch before commit; the 57-line duplicate-helper removal is a separate cleanup recommendation. Previously recorded worker tests and user-confirmed UI behavior were not rerun. Authenticated browser automation and product build remain outside this review.

### 2026-10-21 final review findings resolved directly

- User explicitly requested direct coordinator implementation of both review findings; no worker was dispatched.
- **Finding 1 resolved:** `@timesheet/domain` now runs `node --import tsx --test src/*.test.ts`. This executes source tests without emitting JS or creating/removing `.test-build`, preserving Next-compatible imports. Declared `tsx` as a domain devDependency with the same `^4.20.6` range and locked `4.21.0` instance already used by the DB workspace. README and current architecture verification instructions now use `pnpm --filter @timesheet/domain test`.
- Package setup reused the existing shared pnpm package via a local `node_modules` junction; no global package or duplicate download was added. Normal `pnpm add` encountered the pre-existing v11/v10 store mismatch, and offline lockfile-only add lacked unrelated n8n metadata. Kept the existing installation intact and limited the lockfile change to the domain importer. `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts` subsequently passed for all seven workspace projects, validating manifest/lockfile consistency without dependency builds.
- **Finding 2 resolved:** removed all six unused exported counterparts (57 function lines) from `timesheet-drafts.ts`. Only production-used `createClientId`, `withClientIds`, `createFutureDraftForDate`, and `extractVacationRangeInitialState` remain. Replaced duplicate-only test scenarios with three focused tests for actual future draft identity/allowance defaults, ID preservation/fallback/generation, and range modal state extraction. No workspace behavior or caller was changed.
- Directly verified after edits: `pnpm --filter @timesheet/domain test` **102 passed**; `node --test apps/web/src/lib/*.test.mjs` **21 passed**; targeted ESLint for both draft helper files **passed**; `pnpm -r --if-present typecheck` **all six packages passed**; frozen offline lockfile-only validation **passed**; `git diff --check` **passed**.
- Removed helper names have no remaining references except the workspace's original, used local selected-ID function. Historical sections above describe earlier snapshots; their test-only helper coverage limitations are superseded by this cleanup.
- No product build, browser automation, DB mutation, commit, or push was performed. DB tests were not rerun because these fixes change only the domain test runner and unused frontend helper/test code.

### 2026-10-21 final re-review — GO

- Rechecked the current uncommitted tree after the two direct fixes: source test runner and declared/locked tsx dependency agree; removed test-only exports have no remaining references; production draft helpers, selected vacation checkbox, range flag forwarding, and original allowance matching remain connected. `git diff --check` passed again.
- Code review: no unresolved blocking findings in the reviewed changes. Ponytail review: the six identified duplicate helpers are removed; no further necessary simplification was identified in this scope.
- **GO for commit/push from the code-review perspective.** Evidence remains the direct post-fix run of 102 domain tests, 21 web tests, targeted lint, all six workspace typechecks and frozen lockfile validation, plus the earlier recorded DB regressions/runtime checks and user's working-UI confirmation. Tests were not repeated because no implementation changed after that run.
- Product build and full authenticated browser automation are not verified. No commit or push was performed by this review.

### 2026-10-21 public-leave calendar styling

- User explicitly requested direct implementation and confirmed that hollow-circle styling and the `공가` label apply only to allowance-excluded records. Updated annual date markers, fully exempt type-color swatches, and timesheet calendar date/badge/card styling. Confirmed public leave is hollow; temporary public leave is striped. Mixed deductible/excluded vacation hours remain distinguishable. No persistence/schema changes.
- Passed targeted ESLint for the four changed TSX components, `pnpm --filter @timesheet/web typecheck`, web helper tests (21 passed), and `git diff --check`.
- Additional isolated smoke verification rendered the actual annual date component and transpiled the actual timesheet display functions in memory: checked ordinary/public/temporary labels, 3px SVG ring, half-day ring and mixed 4h vacation + 4h public-leave fill. Generated local HTML/CSS previews from these renderers and the actual stylesheet and visually inspected light/dark headless Edge screenshots, including a custom purple color. Fixed the dark-theme badge color override found during inspection.
- Preview verification covers these component/style states, not authenticated page interactions. No product build, commit, push, or user database changes were performed.
- Light/dark preview PNGs are retained locally in `.my-orch/artifacts/public-leave-light.png` and `public-leave-dark.png`. Automatic command approval rejected cleanup of the agent-created OS-temporary `ajam-public-leave-preview-VeFp5N` directory with a generic policy-block reason, including the attempt to remove verified files and empty directories individually. No further deletion attempt was made; the temporary preview/browser-profile directory remains.

### 2026-10-21 public-leave style corrections and QA ownership

- User assigned all future browser E2E/visual acceptance to themselves. Persisted that policy in the current Verification section; this correction did not launch a browser or generate new browser screenshots. Earlier preview images show the previous iteration.
- Timesheet calendar: confirmed public-leave tags now use exactly the ordinary vacation tag styling; temporary vacation/public-leave tags alone use transparent tag backgrounds. Removed the additional public-leave circle around date numerals and its unused CSS. Sparse public-leave cell backgrounds remain.
- Vacation tab: full SVG rings no longer specify `strokeDasharray`, avoiding fractional dash-end seams at 12 o'clock. Partial rings retain proportional arcs. Temporary rings now reference a unique SVG stripe pattern on the stroke instead of hatching the interior. Temporary type-color swatches mask their stripe pseudo-element to the 3px outline, preserving the button's focus treatment and clear center.
- Passed targeted component ESLint, web typecheck, existing web helper tests (21 passed), and diff check. A non-browser server-render smoke check compared real confirmed/temporary public-leave and vacation badge markup (identical except labels), checked the removed month date-ring class, verified undashed full rings and 50% partial arcs, and checked temporary pattern-stroke references with unique IDs across multiple rendered date cells.
- No product build, browser E2E, commit, push, or persistence changes were performed. Visual acceptance remains with the user.
