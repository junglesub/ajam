# Notion Card Display And Sorting Design

## Context

The Notion card tab already calculates mapped card metrics: linked work hours, work day count, available hours, and period estimates. The current table shows duration values as `1.5d (12h)` and has no user-controlled sorting. The timesheet card picker and linked-card pills also contain clickable rows, buttons, links, and inputs where accidental text selection can make selection feel noisy.

## Design

Notion card duration display should use a mixed day/hour format for the primary value. For example, `12h` becomes `1d 4h`; the Notion card tab should show detailed durations as `1d 4h (12h)` so users can scan both normalized work duration and raw hours. The card table should keep `작업일수`, `가용 시간`, `업무 기간`, `마지막 작업 날짜`, and `기간 추정` as separate columns. The last worked date should display only relative text and expose the exact date on hover.

The monthly analysis server action should add the latest saved `WORK` date linked to each mapped card. The relative text for this value should be calendar-relative, such as `132일 전`, because the stored last-worked date is an actual date and should match normal relative-date expectations.

The Notion card picker should sort in the client. Default sort is latest worked date descending. Users can change sort by a compact select control, and the last choice should persist in `localStorage`. Supported sort keys are last worked date, linked work duration, work day count, available hours, and title. Picker rows and linked-card pills should show compact metrics using the candidate payload.

The Notion card table should also keep the detailed duration format change so the tab displays values such as `1d 4h (12h)`.

Clickable Notion card connection surfaces should be non-selectable. Apply `select-none` to picker rows and linked-card controls while preserving normal input behavior for numeric hour editing.

## Verification

Run domain tests and TypeScript checks for the touched packages. Do not run a production build unless explicitly requested.
