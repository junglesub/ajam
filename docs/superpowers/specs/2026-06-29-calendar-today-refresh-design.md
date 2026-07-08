# Calendar Today Refresh Design

## Context

The timesheet UI uses the browser timezone for visible dates and compares `selectedDateKey` with `todayKey` to decide whether a date is future-only. `todayKey` is currently corrected on initial client mount and when the user clicks the today button, but it is not refreshed while the page stays open across midnight.

## Design

Add a lightweight client interval in `apps/web/src/components/timesheet/timesheet-workspace.tsx` that checks the browser-local date about once per minute. When the computed `YYYY-MM-DD` changes, update `todayKey` without reloading the page and reload the currently visible month data so scheduled AI cleanup results can appear in the calendar/list.

The interval should not navigate the user away from the month or date they are viewing. If a selected future date becomes today, the existing `selectedDateKey > todayKey` checks should make the editor and calendar treat it as writable. If that selected date only has the default future vacation placeholder and has not been saved, replace it with the normal work draft for that date so the editor opens in the expected work-entry state. If the selected date is dirty, keep that local draft while still refreshing saved month data around it.

## Documentation

Update `docs/timesheet-workflow.md` to record that the timesheet page refreshes its browser-local today key while open, refreshes the visible month data for scheduled AI updates, and does not reload the page.

## Verification

Run `pnpm --filter @timesheet/web typecheck`. Do not run a production build unless the user asks for it.
