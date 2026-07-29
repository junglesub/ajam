# Timesheet List Detail Panel Design

## Context

The timesheet workspace currently renders the daily record editor beside both the calendar and list views. Because the workspace selects today automatically on entry, switching directly to the list view keeps an editor open even though the user has not expressed an intent to inspect or edit a record.

## Design

Track whether the user has explicitly requested the daily record editor separately from the automatically selected date.

- Initial page entry has no explicit editor intent.
- The calendar keeps showing the editor as it does today.
- Switching directly from the initial calendar to the list shows the list at full width with no editor.
- Selecting a calendar date or list row records explicit editor intent.
- Focusing an editor control to start editing also records explicit editor intent.
- Once recorded, editor intent survives calendar/list view changes.
- In the list view, the editor header includes an accessible `X` button that closes the editor and clears the intent.
- After closing, the list returns to full width. Selecting another row opens the editor again.
- Closing the list editor keeps the selected date. If its draft has unsaved changes, the existing confirmation appears; confirming restores the last saved draft before closing, while canceling keeps the editor open.

Use one local React boolean for this intent. Do not persist it to browser storage or the server.

## Layout

The workspace grid uses two columns only when the calendar is active or explicit editor intent is present. Otherwise it uses one full-width column. The editor is rendered under the same condition, so the list does not reserve empty space when it is closed.

The existing responsive breakpoints, list table sizing, and editor contents remain unchanged.

## Interaction Boundaries

- Existing date and entry selection functions remain responsible for draft preparation and dirty-navigation checks; successful user selection additionally opens the editor. Closing reuses the same dirty-change confirmation and discard path.
- Automatic date selection during initial load, month navigation, today refresh, and background updates does not create editor intent.
- Editor focus marks intent only when the editor is already available in the calendar view; it does not introduce a separate editing mode.
- The close button is available only in the list view because the calendar retains its existing always-visible editor.
- Existing keyboard navigation continues to select list rows and therefore opens the editor as an explicit user action.

## Verification

- Enter the page and switch immediately to the list: the list fills the workspace and the editor is absent.
- Select a list row: the editor opens and the list returns to the two-column layout.
- Close a clean editor with `X`: the editor disappears without losing the selected date.
- Edit a draft and press `X`: the unsaved-change confirmation appears. Cancel keeps the editor and draft open; confirm restores the last saved draft and closes the editor.
- Select a row again: the editor reopens.
- Select a calendar date or focus an editor field, switch to the list, and confirm the editor remains open.
- Switch between views without prior interaction and confirm the list remains full width.
- Run the relevant TypeScript check without running a production build.
