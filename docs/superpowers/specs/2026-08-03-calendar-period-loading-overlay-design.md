# Calendar Period Loading Overlay Design

## Context

The timesheet and vacation workspaces already track period fetches with `monthLoadState` and `yearLoadState`. During a month or year change, their visible calendar area can change without a loading indication.

## Design

Keep the calendar container mounted to preserve layout and cover the affected card with a translucent loading overlay until the new data is applied. Exact previous-period values are not snapshotted; target labels or cached values may update underneath the overlay.

Extend `apps/web/src/components/app-loading-screen.tsx` with a shared `AppLoadingOverlay` that reuses the same spinner and accessible status text as `AppLoadingScreen`. The overlay is absolutely positioned and blocks pointer interaction, but uses only a subtle veil plus a centered loading panel so the calendar remains clearly visible underneath in both themes.

In `TimesheetWorkspace`, make the calendar/list section a positioned, clipped container, expose `aria-busy` while `monthLoadState === "loading"`, and cover the whole section. This includes its month controls, metrics, warning area, and currently selected calendar or list view. Set the loading state in the same event that changes to an uncached month so the target UI cannot paint before the overlay. Disable the visible month navigation buttons and ignore calendar shortcuts while the overlay is active so covered controls cannot start another transition.

In `VacationYearWorkspace`, wrap only `VacationYearCalendar` in a positioned container, expose `aria-busy` while `yearLoadState === "loading"`, and render the overlay there. Keep the summary panel visible. Existing year buttons remain disabled during loading.

Do not add new loading state, timers, providers, or dependencies. Existing error UI remains responsible for failed loads, and the overlay disappears when the state changes to `idle` or `error`.

## Accessibility

The covered container uses `aria-busy`. The overlay uses `role="status"` and `aria-live="polite"`; its spinner is decorative. Disabled navigation buttons and keyboard guards prevent repeated period changes during loading.

## Documentation

Update `docs/product-brief.md` to state that month/year calendar changes retain the calendar area and display a loading overlay over it.

## Verification

Run all available package tests, workspace lint, and the web typecheck. Do not run a production build unless the user asks for it.
