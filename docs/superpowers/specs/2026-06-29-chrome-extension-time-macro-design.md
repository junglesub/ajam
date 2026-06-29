# Chrome Extension Time Macro Design

## Summary

aJam will add a Chrome extension that helps users transfer monthly timesheet data into an external company timesheet screen. The first release focuses on time entry only. Content entry remains visible as a future mode but is not implemented in this scope.

The extension uses a macro model: the user places the cursor in the external page's first time input, opens the extension popup, reviews the monthly plan, and starts execution. The extension types values and tabs through fields from the current focused position instead of depending on the target page's DOM selectors.

## Goals

- Provide a Chrome extension popup with two modes: time entry and content entry.
- Fully implement time entry mode.
- Implement content entry mode for one selected category at a time.
- Load monthly category/date/hour data automatically from aJam.
- Authenticate the extension through a dedicated aJam connection flow, not by reusing browser session cookies.
- Run from the user's current cursor position in the target page.
- Move through weekend cells without entering values.
- Move from the end of one category to the next category with four extra Tab actions, and do not send the final day Tab or extra trailing Tabs after the final category.
- Let users control category activation and order.
- Document the integration and keep existing product decision documents current.

## Non-Goals

- The extension will not parse or depend on the external timesheet page's DOM structure in the first release.
- The extension will not submit the external company form.
- The extension will not submit content entry results automatically.
- The extension will not use aJam's normal session cookie for extension API calls.
- The extension will not store the user's aJam password.

## User Flow

1. The user opens the extension popup.
2. If the extension is not connected, the popup shows `aJam 연결`.
3. Clicking `aJam 연결` opens an aJam connection page in a browser tab.
4. The user logs in to aJam if needed and approves extension access.
5. aJam issues a one-time connection code.
6. The extension exchanges that code for a short-lived access token and a long-lived refresh token.
7. The user chooses the target month in the extension popup.
8. The extension requests the monthly time macro export from aJam.
9. The popup shows category activation, category order, and an execution preview.
10. The user clicks `시간 입력 실행`.
11. The user clicks the starting input, grid cell, or spreadsheet cell on the external timesheet page.
12. The extension sends Debugger keyboard input and Tab actions according to the macro plan.
13. The popup reports completion, cancellation, or the first blocking error.

For content entry mode, the user switches to `내용 입력`, selects one category, clicks `내용 입력 실행`, then clicks the first external content cell. The macro enters only dates in that category that have hours, skips dates without hours, and uses two Tab actions after each target date.

## Terminology

- User-facing connection action: `aJam 연결`.
- User-facing connected state: `연결됨`.
- User-facing expired state: `연결 만료`.
- User-facing reconnect action: `다시 연결`.
- Internal auth feature name: `extension auth`.
- Internal monthly export feature name: `monthly macro export`.
- Internal extension connection model: `ExtensionConnection`.

The UI should avoid exposing JWT terminology to users. Tokens are an implementation detail.

## Authentication Design

The extension uses an aJam-specific connection code flow.

### Connection Code Flow

1. The extension opens an aJam URL such as `/extension/connect/start`.
2. aJam checks the normal web session and redirects to login if needed.
3. The connection page explains the requested access: reading monthly macro export data.
4. On approval, aJam creates a short-lived one-time connection code.
5. The extension calls a token exchange endpoint with the code.
6. aJam returns:
   - access token: short-lived JWT for extension API reads.
   - refresh token: long-lived opaque token stored hashed in the DB.
   - token metadata such as expiry time and connected username.
7. The extension stores tokens in `chrome.storage.local`.

### Token Behavior

- Access tokens should be read-only and scoped to monthly macro export APIs.
- Access tokens should expire quickly, for example in 15 minutes.
- Refresh tokens should be revocable by deleting the extension connection record.
- Refresh tokens should be rotated on every successful refresh.
- Token exchange should reject expired, reused, or unknown connection codes.
- The extension should refresh the access token before calling the monthly export when needed.

### Why Not Session Cookies

Chrome extension requests can technically send cookies in some setups, but SameSite, Secure, CORS, and local development constraints make this fragile. A dedicated extension token flow gives a clearer permission boundary and lets users revoke extension access independently from normal web login sessions.

## aJam API Design

### Extension Auth Endpoints

- `GET /extension/connect/start`
  - Browser page used for login and approval.
  - Requires normal aJam web session.
- `POST /api/extension/auth/exchange`
  - Exchanges a one-time connection code for extension tokens.
- `POST /api/extension/auth/refresh`
  - Exchanges a refresh token for a new access token.
- `POST /api/extension/auth/revoke`
  - Revokes the current extension connection.

### Monthly Macro Export Endpoint

- `GET /api/extension/monthly-time-macro?month=YYYY-MM`
  - Requires extension access token.
  - Returns the current user's monthly category/date/hour plan.

The export should include only the data needed by the extension:

```json
{
  "month": "2026-06",
  "daysInMonth": 30,
  "categories": [
    {
      "id": "work:Project A",
      "kind": "work",
      "label": "Project A",
      "days": [
        { "contentValue": "짧은 버전", "dateKey": "2026-06-01", "day": 1, "weekday": 1, "hours": 8, "value": "8" }
      ]
    },
    {
      "id": "vacation:휴가",
      "kind": "vacation",
      "label": "휴가",
      "days": [
        { "contentValue": "", "dateKey": "2026-06-12", "day": 12, "weekday": 5, "hours": 8, "value": "8" }
      ]
    },
    {
      "id": "holiday:공휴일",
      "kind": "holiday",
      "label": "공휴일",
      "days": [
        { "contentValue": "", "dateKey": "2026-06-06", "day": 6, "weekday": 6, "hours": 8, "value": "8" }
      ]
    }
  ]
}
```

Holidays are included as categories so users can order them consistently with the external screen. Weekend fields are treated as present in the external screen, so they receive Tab movement even when they do not receive typed values.

## Category Construction

The server groups saved aJam entries into large categories:

- Work entries group by project name, with blank project names grouped under `프로젝트 없음`.
- The saved day-level `짧은 버전` is copied into each work category day with hours as `contentValue`.
- Vacation entries group by vacation name, with blank vacation names grouped under `휴가`.
- Holiday entries and official holidays group under `공휴일`.
- Zero-hour holiday entries and official holidays export as `8` hours for the holiday category.

For each category, the export covers day 1 through the last day of the selected month. Days without category hours, including weekends, are represented in the macro plan as empty dates that require only Tab movement.

When a day has multiple work entries in the same project, the category day value is the sum of those hours. When a day has multiple projects, each project category receives its own hours for that date.

## Extension UI Design

The popup should be compact and task-focused.

- Top connection state: connected username, `aJam 연결`, `다시 연결`, or disconnect action.
- Mode controls:
  - `시간 입력`: enabled.
  - `내용 입력`: enabled.
- Month selector.
- Category list with activation checkboxes and move up/down controls.
- Refresh action to reload the monthly export.
- Optional checkbox `실행 시 최대 축소 후 복구` for targets that benefit from seeing more columns while the macro runs.
- Preview counters:
  - categories count.
  - filled cells count.
  - weekend tab count.
  - blank tab count.
- Primary action: `시간 입력 실행`.
- Stop action while running.

In content entry mode, the category list behaves as a single-choice selector. The selected category controls the content macro; category order and activation preferences remain available for time entry mode.

The extension stores category order and disabled category IDs locally per aJam base URL and user connection. New categories not seen before appear after known categories in the default server order and are active by default.

## Macro Execution Design

Execution is coordinated by a content script injected into the active tab and performed through Chrome Debugger keyboard input.

For each active category in the chosen order:

1. Iterate from day 1 through the last day of the month.
2. If the date has a value, type the value into the currently focused page target.
3. Press Tab once after each date, including weekends and blank dates.
5. After the last calendar day of a non-final category, press Tab four additional times to move to the next category's first day.
6. For the final category, do not press Tab after its last calendar day.
7. Repeat until all categories are complete.

The content script should show the waiting/progress overlay and wait for the user's start click. The background service worker sends text and Tab key events through Chrome Debugger; the old DOM/event input fallback is intentionally disabled.

The macro is intentionally based on the current focus. The extension should not attempt to find or validate the external page's table structure.

When the zoom-out option is enabled, the background service worker records the active tab's current zoom factor, tries to set Chrome tab zoom to the minimum supported factor before Debugger typing begins, and restores the original zoom in the macro cleanup path after success, failure, or user stop.

Content entry uses the same execution bridge. For the selected category only, it iterates through days that have a time value. For each target day, it types the day-level `짧은 버전` exposed as `contentValue` when non-empty, then sends two Tab actions before moving to the next target day. Days without a time value are not represented in the content macro.

## Safety And Error Handling

- Before running, the popup checks that the active tab can receive content scripts.
- Before the first input, the content script waits for the user to click the starting input, grid cell, or spreadsheet cell.
- If Chrome Debugger input cannot run, execution stops with a clear error instead of falling back to DOM writes.
- The user can stop execution from the popup.
- Macro execution should use a small delay between actions so the target page can react to key events.
- The extension never submits the external page automatically.
- The extension never overwrites aJam data.
- API failures should distinguish unauthenticated, expired connection, and server errors.

## Data Storage

### aJam Server

aJam stores extension connection records with:

- user ID.
- connection label or browser name if available.
- hashed refresh token.
- granted scopes.
- created timestamp.
- last used timestamp.
- revoked timestamp.

One-time connection codes are short-lived and single-use. Store them in a separate server-side table from refresh-token connection records so expiry and used-at state can be managed independently.

### Chrome Extension

The extension stores:

- aJam base URL.
- access token and expiry.
- refresh token.
- connected username.
- category order preferences.
- disabled category preferences.
- last selected month.
- zoom-out-before-macro preference.

Tokens are stored in `chrome.storage.local`. The extension does not store the user's aJam password.

## Testing Strategy

### Domain And API Tests

- Build category exports from mixed work, vacation, and holiday records.
- Sum multiple work entries in the same project/date.
- Split multiple projects on the same date into separate category day values.
- Include weekend Tab actions in the generated macro steps.
- Reject expired and reused connection codes.
- Reject invalid or revoked refresh tokens.
- Require extension scope for monthly macro export.

### Extension Tests

- Generate macro action sequences for month lengths of 28, 29, 30, and 31 days.
- Generate content macro action sequences that skip no-hour dates and send two Tabs per entered date.
- Verify weekend dates Tab once.
- Verify blank dates Tab once.
- Verify category boundary adds four extra Tabs only between categories and omits the final category's last-day Tab.
- Verify content script waits for a user start click before requesting Debugger input.
- Verify Debugger input failure does not fall back to DOM/event input.

### Manual Verification

- Load the unpacked extension in Chrome.
- Connect it to a local or deployed aJam instance.
- Open a simple test page with monthly input fields.
- Place the cursor in the first field and run time entry mode.
- Confirm the typed values and focus movement match the preview.
- Confirm stop interrupts execution.

## Documentation Updates

- `docs/product-brief.md` should move the Chrome extension from out-of-scope to active scope for the time-entry MVP.
- `docs/decisions.md` should record the decision to use an extension connection code flow instead of normal session cookies.
- This design document is the source for the implementation plan that follows after review.

## Terminology Review Note

The initial implementation should use `aJam 연결` as the user-facing term. Before final UI polish, the wording can be reviewed against the rest of the Korean UI.
