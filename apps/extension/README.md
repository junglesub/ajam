# aJam Chrome Extension

This package contains the unpacked Chrome extension for the monthly time-entry macro.

## Local Build

```bash
pnpm --filter @timesheet/extension build
```

Load `apps/extension/dist` from `chrome://extensions` with developer mode enabled.

The extension icon uses the same source artwork as the web app favicon at `apps/web/src/app/icon.svg`, rendered into Chrome extension PNG sizes under `apps/extension/src/icons`.

## Time Entry Flow

1. Open the extension popup.
2. Set the aJam base URL.
3. Click `aJam 연결`.
4. Approve the connection in the aJam tab.
5. Reopen the popup and click `연결 code 입력`.
6. Paste the displayed connection code.
7. Select a month and refresh data.
8. Check the categories to include and adjust their order if the external timesheet screen uses a different order.
9. Optionally check `실행 시 최대 축소 후 복구` if the target page should zoom out before typing.
10. Open the external timesheet page.
11. Click `시간 입력 실행`.
12. The popup closes and the browser overlay waits on the page.
13. In the browser overlay, click the first time input or grid cell to start from that field.

The macro waits on the active page until you click the starting input, grid cell, or spreadsheet cell. It does not submit the external page.
After the click, it waits 1 second, then runs only Chrome Debugger keyboard input against the focused page target.

For `내용 입력`, choose one category in the popup. The macro visits only days in that category that have hours, types that day's saved `짧은 버전` when present, sends Tab twice, and repeats. Days without hours, such as weekends for that category, are excluded.

If the approval tab was closed before copying the code, click `연결 code 입력`, cancel the code prompt, and confirm that you want a new code. The extension clears the old pending handoff and opens a fresh approval tab.

## Macro Rules

- Weekend cells are assumed to exist in the external screen, so they receive Tab movement even when they have no value.
- Unchecked categories are excluded from the preview and macro execution.
- Date cells receive a value when the category has hours for that date.
- Empty date cells move with Tab only.
- After each non-final category reaches the end of the month, the macro sends four extra Tab actions before the next category.
- The final category does not send the last day Tab or any extra trailing Tabs.
- The content script is injected into all accessible frames, so iframe-based timesheet grids can start from a clicked iframe cell.
- Standard inputs, textareas, contenteditable elements, table cells, and common `role="gridcell"`/`role="textbox"` cells are treated as editable targets.
- Debugger input can start from non-editable spreadsheet surfaces, including Google Sheets-style canvas or JavaScript grid cells, because the typed values are sent to the focused page rather than written through DOM setters.
- The extension requests the Chrome `debugger` permission so it can send user-like text and Tab key input to JavaScript grids after the starting click.
- The old DOM/event input fallback is intentionally disabled so the macro cannot run through two input paths on the same page.
- The page overlay can cancel before typing starts and can request a stop while debugger input is running.
- During execution, the page overlay shows completed and remaining macro actions.
- When `실행 시 최대 축소 후 복구` is enabled, the background debugger runner stores the active tab's current zoom, tries to set the tab zoom to Chrome's maximum zoom-out factor before typing, and restores the original zoom after completion, error, or stop.
- The popup can be reopened while the macro is waiting or running and still show the stop control when the active tab reports an active macro.
- Content entry mode uses the same overlay, Debugger input, iframe coordination, stop control, and optional zoom-out behavior as time entry mode.

## Manual Verification

1. Build the extension.
2. Load `apps/extension/dist` as an unpacked extension.
3. Connect the extension to a local or deployed aJam instance.
4. Open `apps/extension/dist/test-page.html` in Chrome.
5. Run `시간 입력 실행`.
6. Click the first input when the overlay appears.
7. Confirm typed values and focus movement match the popup preview.
8. Run again and use `중지` to confirm interruption.
