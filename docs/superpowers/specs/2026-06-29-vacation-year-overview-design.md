# Vacation Year Overview Design

## Context

aJam already stores vacation data through the timesheet flow. A saved vacation entry is synchronized into the `Vacation` table by `dateKey`, `name`, and `hours`, and the timesheet UI already has logic for connected vacation ranges. The new 휴가 tab should build on that data instead of creating a separate vacation source.

The user approved the calendar-first direction: a compact full-year view where January through December are visible together, with each workday represented by a small circular date marker inside a square hit area. Weekday headers use `M T W T F`.

## Goals

- Add a new authenticated 휴가 tab in the app navigation.
- Let each user enter the number of annual leave days for a specific year, such as `2026`.
- Show annual leave usage metrics: total allowance, used days, remaining days, used hours, and consumption ratio, with confirmed and temporary-inclusive values visible together.
- Show a compact full-year weekday calendar from January through December.
- Fill each vacation date marker by `hours / 8`; for example, `8h` fills the circle, `4h` fills half, and `2h` fills one quarter.
- Group vacation records only within the selected year by vacation type/name, using a stable color per type.
- Support vacation input and edit from the 휴가 page through a modal.
- When hovering a vacation date, reuse the existing connected-vacation behavior to highlight adjacent connected vacation dates.

## Non-Goals

- Do not add approval workflow, external HR integration, or company leave balance synchronization.
- Do not change how work entries, holidays, or Notion card metrics behave.
- Do not replace the current timesheet vacation editing flow; the new tab is another focused entry point for vacation overview and maintenance.
- Do not group same-name vacations across non-adjacent dates as the "same vacation" hover group.

## UX Design

The page uses a work-focused dashboard layout consistent with the existing app. The first row contains the year selector, annual allowance input, used amount, remaining amount, and consumption ratio. Usage metric cards show confirmed values as the primary numbers and temporary-inclusive values as secondary text; confirmed values exclude vacation records whose status is `TEMPORARY`. The main area gives priority to the annual calendar. A side panel lists vacation groups for the selected year by type/name with matching color swatches and totals.

Each month is compact:

- Month title at the top.
- Wide desktop layouts show six months per row so January through June fit on the first row.
- Weekday header is `M T W T F`.
- Weekends are omitted, matching the existing business-day calendar pattern.
- Empty leading cells keep the weekday alignment.
- Each date has a dense square clickable hitbox with a circular date marker centered inside.
- Plain dates do not paint a circle background; dates with a saved work record use the subtle circle background.
- Today's date has a distinct static thick outline regardless of work, vacation, or holiday state.
- The circular marker contains the day number and a bottom-up fill showing the vacation-hour ratio against an 8-hour day.
- Vacation fill colors and side-panel swatches use a softer tone so dense year-calendar labels stay readable.
- Vacation records can have `CONFIRMED` or `TEMPORARY` status. Temporary vacation date fills use a bright, low-contrast diagonal hatch overlay, while grouping and color assignment continue to use the visible vacation type/name. Vacation type totals show confirmed values first with temporary-inclusive values as secondary text.
- The vacation tab reads vacation records from underlying timesheet vacation entries rather than the date-level aggregate row, so a single date can contribute separate confirmed and temporary records to metrics and editing.
- Legacy date-level `Vacation` rows are used only when no underlying timesheet vacation entry exists for that date, preserving older data without overriding entry-level records.
- The vacation input modal exposes temporary status through a badge and status-specific save buttons instead of a checkbox: new vacations show `저장` and `임시저장`; temporary vacations show `임시저장` and `등록`; confirmed vacations show `저장` and a text-style `임시로 변경` action.
- Weekday holidays render the day number in red while preserving any vacation fill color underneath.
- API holidays and user-entered holiday entries both render as red holiday dates. User-entered holiday entries saved with `0` hours are treated as full-day holidays for display in both the vacation tab and timesheet list, using `8` hours as the effective value and falling back to `공휴일` when no name is set. Hovering a holiday date shows the holiday name. If API holiday loading fails, the page shows a compact warning instead of silently hiding the reason.

Hover behavior:

- Hovering a vacation date computes the connected vacation range using the same shared helper as the timesheet workspace. A connected vacation date is a saved vacation date; saved holidays are skipped while walking adjacent business days.
- In the vacation tab, hover grouping uses saved vacation records rather than full-day-only markers, so partially used vacation dates also participate in connected hover highlighting.
- Temporary and confirmed vacations do not connect to each other. Connected-vacation hover, edit, delete, and range auto-fill only include vacation dates with the same explicit status as the selected vacation. Mixed work+vacation dates connect only when the vacation entry touches the adjacent boundary: `WORK -> VACATION` can connect to the next business day, while `VACATION -> WORK` can connect to the previous business day.
- Vacation-tab boundary data is keyed by date, status, and original vacation name so same-status different-name entries on one day can connect according to their own position.
- In the vacation tab, creating a new vacation next to exactly one adjacent connected range opens the same connected-action confirmation as editing an existing vacation. Creating a new date between two separate ranges does not automatically bridge both sides.
- In the timesheet editor, connected-vacation lookup uses the vacation's current status before a save action. The chosen action status is applied only after the connected range is found, so `등록` can find existing temporary vacations and `임시로 변경` can find existing confirmed vacations.
- Timesheet connected save/delete actions target the selected vacation's original status and name, matching the vacation tab's record-level targeting.
- Connected-vacation save actions apply vacation type and status across the connected range but preserve each date's existing vacation hours. Server actions receive the matched status and original vacation name separately from the target status/name so mixed temporary/confirmed or same-status different-name entries on one date are not rewritten together.
- Connected-vacation delete actions remove only vacation entries matching the selected vacation status and original name so mixed temporary/confirmed or same-status different-name entries on one date are not deleted together.
- Connected dates receive a medium-strength static emphasis: outline and soft glow.
- Non-connected date markers become dimmer while the hover group is active.
- No hover animation is used.

Modal behavior:

- Clicking an empty date opens a vacation input modal for that date. The vacation type input starts empty and uses `휴가` as placeholder text.
- Clicking a date with saved work entries and no vacation opens a work-record confirmation modal first.
- The work-record confirmation modal shows project, hours, and the first content line for that date.
- Vacation can be added only after deleting the date's WORK entries; HOLIDAY and VACATION entries are preserved.
- Clicking a vacation date opens an edit modal prefilled with date, vacation type, and hours.
- The modal supports saving only the selected date.
- The vacation edit modal keeps delete as a left-aligned text action and status save actions as right-aligned buttons. Connected vacation actions are not exposed as extra buttons in the edit modal.
- Adding a new vacation always saves only the selected date and does not open the connected-vacation confirmation modal.
- If connected vacation dates are detected while editing an existing vacation, pressing save or delete opens a confirmation modal matching the timesheet flow, with "current date only" and "together" choices.
- Deleting follows the same single-date vs connected-vacation confirmation choice.
- The timesheet calendar also reads explicit vacation status. Vacation entry saves in the timesheet editor use the same status-specific buttons as the vacation tab. Temporary vacation-only badges render as `임시`; mixed work+vacation badges keep the compact dot-only treatment, with temporary dots outlined and confirmed dots filled. Work+vacation date cards use a diagonal split whose order follows the entry order, but only the vacation side is colored; the work side stays transparent. Temporary hatching is clipped to the vacation side for mixed cells.
- In the timesheet calendar, a vacation-only date under `8h` fills only the `hours / 8` diagonal portion. The remainder keeps the normal cell background, such as white for regular dates or gray for future scheduled dates.
- In the timesheet editor footer, the single-vacation `기간 설정` action is a right-aligned text action on the first footer row. Save, temporary-save, register, and delete actions remain on the lower row.

## Data Model

Add a per-user annual allowance model, conceptually:

```prisma
model VacationAllowance {
  id        String   @id @default(cuid())
  userId    String
  year      Int
  days      Float    @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, year])
}
```

The existing runtime schema bootstrap in `packages/db/src/timesheet-store.ts` should create this table defensively, following the current SQLite migration pattern. Prisma schema and generated client should be updated through the repo's pnpm workflow when implementation begins.

Vacation records remain sourced from the existing `Vacation` and `TimesheetEntry` flow. The new page should not duplicate per-date vacation data in a new table. Blank vacation names are allowed because `kind: "VACATION"` is the source of vacation classification; display labels can fall back to `휴가`, but saved `TimesheetEntry.vacationName` and synchronized `Vacation.name` values should preserve blank input. Vacation status is stored explicitly as `CONFIRMED` or `TEMPORARY` on vacation entries and synchronized vacation records; temporary status is not inferred from text prefixes.

## Server Data Flow

Add DB helpers for:

- Loading vacation allowance by `userId` and `year`.
- Upserting vacation allowance by `userId` and `year`.
- Listing vacations for a full selected year.

Add `/vacations` server page and server actions:

- `loadVacationYearAction(year)` returns allowance, vacations, and any holiday data needed to apply connected-vacation rules across adjacent business days.
- `saveVacationAllowanceAction(year, days)` validates non-negative numeric allowance and upserts it.
- `saveVacationDateAction(input)` saves or updates a single vacation date through the same underlying day-save path used by timesheet and returns refreshed year data so the vacation tab uses server-calculated work, holiday, and vacation-boundary state after each save.
- `deleteVacationDateAction(dateKey)` deletes the selected vacation date through the existing delete path and returns refreshed year data for the same reason.

Connected vacation calculations should live in shared client/domain helpers rather than remaining private to the timesheet workspace. The timesheet workspace and vacation overview must call the same helper for the adjacent-date walk. The implementation can extract the existing behavior:

- `isSavedHolidayDate`
- `isSavedVacationOnlyDate`
- `findConnectedVacationDateKeysInDirection`
- `findConnectedVacationPrompt`

The extracted helper should preserve current behavior: walk adjacent business days, include vacation-only days, skip saved holidays, and stop at the first non-holiday non-vacation business day.

## Components

Create a vacation feature area under `apps/web/src/components/vacations`:

- `vacation-year-workspace.tsx`: client workspace for selected year, allowance editing, metrics, hover state, modal state, and action calls.
- `vacation-year-calendar.tsx`: renders 12 compact business-month calendars.
- `vacation-date-cell.tsx`: square hitbox plus circular fill marker.
- `vacation-summary-panel.tsx`: annual metrics and grouped type totals.
- `vacation-edit-modal.tsx`: create/edit/delete modal with single-date and connected-date actions.

Use existing shared UI components from `@timesheet/ui` where they fit, especially `Button`, `Input`, `Label`, and `Badge`.

## Metrics

Normalize vacation usage by hours:

- `usedHours = sum(vacation.hours)` for vacations in the selected year.
- `usedDays = usedHours / 8`.
- `remainingDays = allowanceDays - usedDays`.
- `consumptionRatio = allowanceDays > 0 ? usedDays / allowanceDays : 0`.

Display days with compact decimal formatting. Avoid hiding hours entirely because half-day and quarter-day usage matter.

## Error Handling

- If allowance save fails, keep the previous allowance visible and show an inline error near the allowance input.
- If a vacation date save fails, keep the modal open and show the error inside the modal.
- If connected-vacation detection fails, allow single-date editing and show a non-blocking message that connected dates could not be checked.
- Server actions must validate year, date key, hours, and type/name input.

## Testing

Add focused coverage for pure helpers and server data behavior:

- Connected vacation helper returns adjacent vacation-only dates and skips holidays.
- Connected vacation helper does not group non-adjacent same-name vacations.
- Annual metrics convert hours to days and ratios correctly.
- Calendar date fill clamps to `0%..100%` for display.
- Allowance upsert preserves one row per `userId + year`.

UI verification should be done with the dev server and browser screenshots during implementation, but no build is run during this design step.

## Documentation Updates During Implementation

When implementing, update:

- `README.md` feature list to include the 휴가 annual overview tab.
- `docs/product-brief.md` current scope to include annual vacation allowance and year overview.
- `docs/architecture.md` data model and data flow sections for `VacationAllowance` and `/vacations`.

## Approved Decisions

- Use calendar-first layout.
- Use `M T W T F` weekday headers.
- Use square date hitboxes with circular date markers.
- Support modal-based input and editing.
- Preserve existing connected-vacation logic for hover/edit grouping.
- Use medium hover emphasis: static outline and soft glow, with no animation.
- Allow single-date edit/save even when connected vacation dates exist.
