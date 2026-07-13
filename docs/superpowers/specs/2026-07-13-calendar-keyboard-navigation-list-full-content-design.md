# Calendar Keyboard Navigation And List Full Content Design

## Context

The timesheet, vacation, and Notion card screens already expose date navigation through their own controls. Keyboard navigation should reuse those existing state and loading paths. The timesheet list currently shortens long work content, which makes scanning compact but prevents reading a full entry without selecting its date.

## Design

Add a small shared browser helper that decides whether a calendar shortcut is safe to handle. It must reject shortcuts when the event target is an `input`, `textarea`, `select`, or editable element, when a modal is open, or when Ctrl, Cmd, or Alt is pressed. Each screen owns its keyboard listener and calls its existing navigation behavior; there is no app-wide shortcut manager.

Keyboard behavior:

- Timesheet: `j` loads the previous month, `k` loads the next month, and `t` loads the current month and selects today.
- Vacation: `j` loads the previous year, `k` loads the next year, and `t` loads the current year and selects today through the existing date-click behavior.
- Notion cards: `j` selects the previous month, `k` selects the next month, and `t` selects the current month.
- Repeated keydown events are ignored so holding a key does not skip through multiple periods.

In the timesheet calendar, arrow keys move the selected date after a date has been selected:

- Left and right move to the previous or next visible business day.
- Up and down move by seven calendar days.
- Crossing a month boundary uses the existing month-loading and date-selection flow.
- Arrow keys follow the same editing and modal safety rules as `j`, `k`, and `t`.

The timesheet keeps the existing `캘린더 / 리스트` view selector and a browser-local `내용 전체 보기` preference:

- Off preserves the current shortened preview.
- On renders the full work content with normal wrapping and preserved line breaks.
- The toggle value is stored in browser `localStorage` under a timesheet-specific key.
- The default is off. Missing, malformed, or unavailable browser storage also falls back to off.
- The preference is browser-local and does not change server data or synchronize across devices.

The timesheet also supports switching between the two views from the keyboard:

- Plain `Tab` toggles `캘린더 / 리스트` when focus is outside the right-side daily record editor.
- The complete daily record editor, including its inputs and buttons, keeps native `Tab` behavior.
- `Shift+Tab` always keeps native backward focus navigation.
- Open popups keep native keyboard behavior through the existing shortcut suppression rule.
- Reuse the existing screen-level keyboard listener and `viewMode` state; do not add another shortcut manager.

Shortcut-connected controls expose their keys on hover with the native button tooltip:

- Previous and next month/year buttons show `J` and `K`.
- The top-level today button shows `T`.
- The timesheet calendar/list segmented buttons show `Tab`.
- Do not add arrow-key tooltips to every date or list row, and do not introduce a custom tooltip dependency.

The list view moves the full-content preference into the month header and adds row navigation:

- Replace the in-list `내용 전체 보기` checkbox with an icon-only pressed-state button immediately before the today button. Render it only in list view and keep the existing browser-local preference.
- Match header icon controls with a dedicated `36px` button, `20px` icon, and `2.4` stroke width. Do not combine the shared text button's horizontal padding with a fixed square width because flex shrinking can collapse the SVG horizontally.
- In list view, plain `F` toggles the full-content preference through the same persisted update function. It follows the existing editor, modal, modifier, composition, and repeat suppression rules, and the icon tooltip includes `F`.
- Up and down arrow keys select the previous or next rendered list row, including separate work entries on the same date.
- Missing dates remain one navigable row. Movement stops at the first and last rendered rows instead of wrapping.
- Selecting a row reuses the existing date and entry selection paths. Calendar arrow behavior remains unchanged.
- Group rendered rows under a non-interactive date summary band. It shows the date, work hours, vacation or holiday information, and spans the day-level `shortVersion` across the project, content, and AI translation columns when present.
- Remove the repeated date column from entry rows. Up and down navigation skips summary bands, so the existing entry-row target order remains unchanged.
- The full-content preference also applies to the short-version line: compact mode truncates it to one line, while full-content mode wraps within the summary band and shows the complete value.

## Implementation Boundaries

- Reuse the existing period loading, selected-date, and date-click functions.
- Add no dependency and no global keyboard registry.
- Do not change stored timesheet, vacation, or Notion data.
- Do not change compact calendar previews; full content applies only to the timesheet list.
- Mark the daily record editor as a shortcut-excluded region so its controls do not need individual exceptions.
- Extend the existing segmented-control item shape only enough to pass native button titles; add no tooltip component.

## Error Handling

- Existing month and year loading errors remain responsible for failed keyboard navigation.
- A failed `localStorage` read or write must not block the list; the toggle continues with in-memory state.
- Shortcuts do nothing while text or selection controls are being edited or while a modal is open.
- View switching does nothing for `Shift+Tab` or when focus is inside the daily record editor.
- List row arrow navigation follows the same editor, modal, modifier, composition, and repeat suppression rules as existing calendar shortcuts.

## Verification

- Add a focused check for shortcut suppression on editable targets, modifier keys, open modals, and repeated key events.
- Verify `j`, `k`, and `t` on all three screens.
- Verify arrow movement within a month and across month boundaries in the timesheet calendar.
- Verify the list toggle switches between shortened and full content and restores its browser-local value after reload.
- Verify plain `Tab` toggles the view outside the daily record editor, while `Tab` inside the editor and every `Shift+Tab` retain native focus navigation.
- Verify navigation button hover titles, the list-only full-content icon state, and up/down movement across rows on the same date and at list boundaries.
- Run the relevant TypeScript checks and focused tests. Do not run a production build unless explicitly requested.
