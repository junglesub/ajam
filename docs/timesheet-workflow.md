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
- When changing months, the editor selects the first business day in the destination month and applies the same default draft and previous-project lookup behavior.
- Future dates open with one default vacation entry because only vacation or holiday can be edited for future dates.
- Future work creation is blocked; future vacation and holiday edits are allowed.
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
- Calendar text is one line and truncates with ellipsis.
- Saved non-holiday days whose total hours are not `8h` show an orange timer icon next to the date. The icon hover text shows the current total hours.
- Missing unselected days show `미기입`.
- A selected missing work draft with no content shows `작성 예정`.
- Saved work with empty content shows `(내용 없음)`.
- Project names are shown only when present; there is no placeholder project text.

## List View

- The list view is row-based rather than grouped by a separate date summary row.
- Multi-entry days render one row per entry.
- Missing dates render a single yellow `입력안됨` row.
- Entry rows show type, hours, project/vacation/holiday title, content, and English translation.
- Work content is clamped to two lines and uses `(내용 없음)` when saved empty.
- Short version is not shown in the list view.
- Clicking an entry row selects that date and entry in the right editor.
- Saved non-holiday rows whose total hours are not `8h` show the same orange timer icon as the calendar view.

## Vacation Range Save

- `기간 저장` is available only when the selected date has exactly one vacation entry.
- Mixed schedules such as vacation plus work do not support range save or connected vacation updates.
- The range modal defaults to the selected date as the start date.
- In the normal case, the start date is fixed and the user chooses only the end date.
- If an earlier connected vacation exists, the start date is shown as editable.
- The end date cannot be earlier than the start date.
- Range save includes weekdays only.
- Holidays are skipped and never replaced.
- Existing saved records in the target range require a warning before replacement.
- Replacement saves each target date as one vacation entry and clears work fields and short version.
- Replacement warnings use saved records only, not transient editor drafts.

## Connected Vacation Updates

- Connected vacation detection uses business-day continuity.
- Saved holiday dates are skipped while scanning, so `휴가 - 공휴일 - 휴가` is treated as connected.
- Missing, draft-only, work, or mixed-entry dates break the connection.
- A connected vacation date must have exactly one saved vacation entry.
- When a single vacation is saved and connected vacation days are found, the user can cancel, save only the selected date, or save the same vacation type and hours to all connected vacation dates.

## Persistence Notes

- `TimesheetDay` stores day-level metadata such as `shortVersion`.
- `TimesheetEntry` stores individual work, vacation, or holiday entries with `sortOrder`.
- `Vacation` remains synchronized from vacation entries for monthly vacation totals.
- Runtime schema bootstrap is still used; there is no Prisma migration file for this feature set.

## Verification

- Run `pnpm --filter @timesheet/web typecheck` after changes.
- Check calendar, list, and editor behavior for missing dates, projectless saved work, multiple work entries, mixed work and vacation days, future vacation/holiday drafts, vacation range saves with holidays and existing records, connected vacation saves across holidays, month navigation selecting an in-month business day, previous-project auto-fill across month boundaries, and saved non-holiday days with totals below or above `8h`.
