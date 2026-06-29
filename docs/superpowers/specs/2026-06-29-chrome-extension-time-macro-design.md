# Chrome Extension Time Macro Design

## Summary

aJam will add a Chrome extension that helps users transfer monthly timesheet data into an external company timesheet screen. The first release focuses on time entry only. Content entry remains visible as a future mode but is not implemented in this scope.

The extension uses a macro model: the user places the cursor in the external page's first time input, opens the extension popup, reviews the monthly plan, and starts execution. The extension types values and tabs through fields from the current focused position instead of depending on the target page's DOM selectors.

## Goals

- Provide a Chrome extension popup with two modes: time entry and content entry.
- Fully implement time entry mode.
- Leave content entry mode as a disabled or "coming later" entry point.
- Load monthly category/date/hour data automatically from aJam.
- Authenticate the extension through a dedicated aJam connection flow, not by reusing browser session cookies.
- Run from the user's current cursor position in the target page.
- Skip weekends without entering values.
- Move from the end of one category to the next category with five extra Tab actions.
- Let users control the category order.
- Document the integration and keep existing product decision documents current.

## Non-Goals

- The extension will not parse or depend on the external timesheet page's DOM structure in the first release.
- The extension will not submit the external company form.
- The extension will not implement content entry mode in this scope.
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
9. The popup shows the category order and an execution preview.
10. The user places the cursor on the external timesheet page's first time input.
11. The user clicks `시간 입력 실행`.
12. The content script types each value and sends Tab actions according to the macro plan.
13. The popup reports completion, cancellation, or the first blocking error.

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
        { "dateKey": "2026-06-01", "day": 1, "weekday": 1, "hours": 8, "value": "8" }
      ]
    },
    {
      "id": "vacation:휴가",
      "kind": "vacation",
      "label": "휴가",
      "days": [
        { "dateKey": "2026-06-12", "day": 12, "weekday": 5, "hours": 8, "value": "8" }
      ]
    },
    {
      "id": "holiday:공휴일",
      "kind": "holiday",
      "label": "공휴일",
      "days": [
        { "dateKey": "2026-06-06", "day": 6, "weekday": 6, "hours": 0, "value": "" }
      ]
    }
  ]
}
```

Holidays are included as categories so users can order them consistently with the external screen. If a holiday falls on a weekend, the macro still skips the weekend field because weekends are not input targets in the external screen.

## Category Construction

The server groups saved aJam entries into large categories:

- Work entries group by project name, with blank project names grouped under `프로젝트 없음`.
- Vacation entries group by vacation name, with blank vacation names grouped under `휴가`.
- Holiday entries and official holidays group under `공휴일`.

For each category, the export covers day 1 through the last day of the selected month. Days without category hours are represented in the macro plan as empty weekdays that require only Tab movement. Weekend days are represented as skipped dates and do not receive input.

When a day has multiple work entries in the same project, the category day value is the sum of those hours. When a day has multiple projects, each project category receives its own hours for that date.

## Extension UI Design

The popup should be compact and task-focused.

- Top connection state: connected username, `aJam 연결`, `다시 연결`, or disconnect action.
- Mode controls:
  - `시간 입력`: enabled.
  - `내용 입력`: disabled with short pending state.
- Month selector.
- Category order list with move up/down controls.
- Refresh action to reload the monthly export.
- Preview counters:
  - categories count.
  - filled weekday cells count.
  - skipped weekend count.
  - blank weekday tab count.
- Primary action: `시간 입력 실행`.
- Stop action while running.

The extension stores category order locally per aJam base URL and user connection. New categories not seen before appear after known categories in the default server order.

## Macro Execution Design

Execution happens in a content script injected into the active tab.

For each category in the chosen order:

1. Iterate from day 1 through the last day of the month.
2. If the date is Saturday or Sunday, do not type and do not Tab for that date.
3. If the date is a weekday with a value, type the value into the currently focused editable field.
4. Press Tab once after each weekday field, whether a value was typed or the field is blank.
5. After the last calendar day, press Tab five additional times to move to the next category's first day.
6. Repeat until all categories are complete.

The content script should support standard inputs, textareas, and contenteditable fields. Typing should dispatch input/change events so common web forms notice the update.

The macro is intentionally based on the current focus. The extension should not attempt to find or validate the external page's table structure in the first release.

## Safety And Error Handling

- Before running, the popup checks that the active tab can receive content scripts.
- Before the first input, the content script checks that an editable element is focused.
- If there is no focused editable element, execution stops with a clear message asking the user to place the cursor in the first time input.
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
- last selected month.

Tokens are stored in `chrome.storage.local`. The extension does not store the user's aJam password.

## Testing Strategy

### Domain And API Tests

- Build category exports from mixed work, vacation, and holiday records.
- Sum multiple work entries in the same project/date.
- Split multiple projects on the same date into separate category day values.
- Exclude weekend input actions from the generated macro steps.
- Reject expired and reused connection codes.
- Reject invalid or revoked refresh tokens.
- Require extension scope for monthly macro export.

### Extension Tests

- Generate macro action sequences for month lengths of 28, 29, 30, and 31 days.
- Verify weekend dates do not type or Tab.
- Verify weekday blanks Tab once.
- Verify category boundary adds five extra Tabs.
- Verify content script refuses to run without an editable focused element.
- Verify content script dispatches input/change events when setting values.

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
