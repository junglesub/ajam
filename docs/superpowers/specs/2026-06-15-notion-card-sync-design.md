# Notion Card Sync Design

## Goal

aJam should let each user connect their own Notion kanban database, map daily work entries to Notion cards, and estimate how much time completed cards consumed.

The first implementation uses user-entered Notion internal integration tokens, stores Notion card snapshots in the aJam database, and keeps the Notion integration read-only. The design should leave room for a later OAuth connection flow without changing the card sync and analysis concepts.

## Product Flow

Add a new top-level app menu named `Notion 카드`.

The `Notion 카드` screen uses a user-selected month, defaulting to the current month. It shows:

- Notion connection status.
- Last successful sync time.
- Last sync error when present.
- Manual refresh for the current screen scope.
- Category and status filters.
- Category summary.
- Completed card list.

The completed card list shows both estimates and direct work-log evidence:

- title
- status
- category
- start date
- end date
- period-based estimate: total business days, allocated estimate hours, and day equivalent
- timesheet-linked hours

The same screen also includes connection settings:

- user-specific Notion token
- Notion database/data source URL or ID
- title property mapping
- status property mapping
- category property mapping
- start date property mapping
- end date property mapping
- done status values
- connection/sync test

Daily work remains centered on the existing `업무 기록` screen. Each `WORK` entry can link zero or more Notion cards. Linked cards appear as compact chips next to the entry controls, with an add/edit action.

When adding cards to a work entry, the candidate list is limited to cards open on the selected work date:

- card start date is on or before the work date
- card end date is empty or on or after the work date
- card is not in a done status by default

Candidate cards are suggestions only. aJam must not automatically treat every synced Notion card as work the user performed. A card contributes to linked-hours or period-based analysis only after the user maps it to at least one `WORK` entry.

Already-linked cards should remain visible even if they are now done or no longer match the default candidate filter. A later UI can offer an `완료 카드 포함` toggle when users need to search completed cards manually.

New work entries should default to the previous business day's selected Notion cards, similar to the existing previous-project default behavior.

## Recommended Approach

Use cache-first, need-scoped sync.

The screen reads cached Notion card snapshots from aJam first. When cache is missing or stale, the app attempts to sync the current scope from Notion. If Notion fails, the UI keeps using the last cached snapshots and shows the failure near the Notion controls.

This fits aJam's daily workflow because external API latency or failure should not block writing a timesheet.

## Notion Authentication

The first version uses a user-entered Notion internal integration token. Each user owns their own token and database mapping.

The connection model should include an auth type so a later OAuth implementation can reuse the same sync and analysis pipeline.

Suggested fields:

- `userId`
- `authType`: initially `internal_token`
- `notionApiVersion`: initially `2026-03-11`
- `accessTokenEncrypted`
- `refreshTokenEncrypted`: reserved for OAuth
- `tokenExpiresAt`: reserved for OAuth
- `databaseId`: optional source/container ID or parsed value from the user input
- `dataSourceId`: the resolved query target
- mapped property descriptors
- `dateMappingMode`: `separate_properties` or `single_range_property`
- done status values JSON
- `tokenLastValidatedAt`
- `schemaLastFetchedAt`
- `analysisConfigVersion`
- `lastSyncedAt`
- `lastSyncError`

Tokens must be encrypted at rest. The UI should only show whether a token is saved and allow replacing or clearing it.

The UI can still ask for a familiar `Notion database URL or ID`, but the server should resolve and store a `dataSourceId` before querying rows. The sync implementation should query `/v1/data_sources/{data_source_id}/query` with the configured Notion API version rather than relying on deprecated database query endpoints.

Data source resolution policy:

- If the user enters a data source ID directly, validate it by retrieving the data source schema.
- If the user enters a database URL or database ID and it has exactly one data source, select that data source automatically.
- If the database has multiple data sources, show a data source selector and store the selected `dataSourceId` and display name.
- Store the original user input only for diagnostics; queries should use the resolved `dataSourceId`.

## Field Mapping

Notion properties are user-configurable because each Notion database can use different names and property shapes.

The settings UI should read the Notion data source schema and let the user choose which property represents each aJam field:

- title
- status
- category
- start date
- end date

Store property mappings as descriptors, not names only:

```text
{
  id: string
  name: string
  type: string
}
```

Property IDs are the stable lookup key. Names are kept for display and diagnostics.

MVP-supported property types:

- title: `title`
- status: `status` or `select`
- category: `select`
- date fields: `date`

`multi_select`, formula dates, rollups, and relation-derived values are out of scope for the first version. They can be added after the core flow is stable.

Done status values are selected by the user from observed status values. More than one value can count as done, such as `완료`, `Done`, `Released`, or `Archived`.

The category field is used for both filtering and summary grouping.

When a user changes field mapping, date mapping mode, category mapping, or done status values, increment `analysisConfigVersion`. Cached cards keep the config version used when their normalized fields were derived so the app can identify snapshots that should be reinterpreted from `rawPropertiesJson`.

Date mapping supports two modes:

- `separate_properties`: separate Notion date properties for start date and end date.
- `single_range_property`: one Notion date property whose `date.start` is the start date and `date.end` is the end date.

The UI should support both modes in the first version because many Notion boards use a single `기간` date range property.

## Card Cache

The cache is not a full copy of the Notion database. It is a set of Notion card snapshots that aJam has needed for a date, month, or recent sync scope.

Suggested card cache fields:

- `userId`
- `notionPageId`
- `title`
- `status`
- `category`
- `startDate`
- `endDate`
- `url`
- `lastEditedTime`
- `rawPropertiesJson`
- `archived`
- `stale`
- `lastSeenAt`
- `analysisConfigVersionUsed`
- `syncedAt`

`rawPropertiesJson` lets aJam reinterpret cached cards if the user changes field mappings later. It should not store the full Notion page properties by default. Store only raw values needed for configured mappings and diagnostics:

- mapped title property
- mapped status property
- mapped category property
- mapped date property or properties
- page-level metadata needed for sync, such as page ID, URL, archived flag, and last edited time

Cards should be upserted by `userId + notionPageId`. Cards that disappear from a scoped sync should not be immediately deleted or globally marked stale, because they may be outside the current sync scope or temporarily inaccessible.

Keep `archived` and `stale` separate:

- `archived`: Notion says the page is archived.
- `stale`: aJam has evidence the card itself is no longer accessible or valid for this connection.

Do not mark a card globally `stale` only because it was absent from one date or month scoped query. Scoped absence belongs in sync-run or future observation records. Global `stale` should be reserved for stronger signals such as page-id refresh failure, permission/access loss, or an explicit archived/deleted state.

Do not store a single `syncScopeKey` on the card cache row. One card can appear in many date and month scopes. Scope status belongs in sync-run records instead of the card snapshot.

## Sync Runs

The first version should include sync-run records. The UI needs scope-specific sync status for selected-date candidates, selected-month analysis, and last-cache estimate labels, so a single connection-level `lastSyncedAt` is not enough.

Suggested fields:

- `id`
- `userId`
- `scopeType`: `date`, `month`, `schema`, `manual_recent`, or `full`
- `scopeStartDate`
- `scopeEndDate`
- `status`: `success` or `failed`
- `startedAt`
- `finishedAt`
- `cardsFetched`
- `errorCode`
- `errorMessage`
- `analysisConfigVersionUsed`
- `partial`

Use the latest successful sync run for the current scope when showing `last successful sync` and deciding whether analysis is based on synced-month data or last-cache data.

All Notion data source queries must paginate until `next_cursor` is empty or a configured safety limit is reached. If pagination stops early, mark the sync run as `partial`. Partial month syncs must not be labeled as fully synced-month estimates; show them as partial or last-cache estimates instead.

## Sync Scope

Do not fetch the entire Notion database on every sync.

The app syncs the cards needed for the current user action:

- `업무 기록` screen: cards open on the selected date, used as candidate suggestions.
- `Notion 카드` analysis screen: mapped cards in the selected month, plus enough candidate cards to let the user add or inspect missing mappings.
- Manual refresh on the analysis screen: refreshes the selected month scope.
- Manual refresh on the daily work screen: refreshes the selected date candidate scope.

Monthly analysis should attempt a selected-month overlap sync before presenting normal estimates. If that sync succeeds, show estimates as synced-month estimates. If it fails, keep the screen usable with cached data and label the numbers as last-cache estimates so users know the allocation denominator may be incomplete.

Date-based candidate sync also uses cache fallback. If the selected-date sync fails, the add-card UI can show cached candidates with a clear warning.

Future advanced actions can include:

- resync recent six months
- full database resync as an advanced option

## Work Entry Card Mapping

Link Notion cards at the `WORK` entry level, not only at the day level.

Suggested join fields:

- `userId`
- `timesheetEntryId`
- `dateKey`
- `notionPageId`
- `allocatedHours`
- `allocationMode`: `auto` or `manual`
- `source`: `manual` or `previous_business_day_default`
- `createdAt`
- `updatedAt`

If one work entry links one card, that card receives the full entry hours. If one work entry links multiple cards, the default allocation is even split. Users can manually adjust per-card allocation for important entries.

Example:

```text
4h 로그인/권한 정리
- 로그인 개선: 2h
- 권한 정리: 2h
```

If the user changes the allocation:

```text
4h 로그인/권한 정리
- 로그인 개선: 3h
- 권한 정리: 1h
```

Manual allocation values are used for card analysis before automatic splits.

For the first version, the sum of linked-card `allocatedHours` for a `WORK` entry must equal the entry's `hours`. If the sum does not match, block saving the card allocation and ask the user to correct the values. This keeps card-level analysis consistent with the saved work entry total.

The mapping table is the source of truth for analysis participation. Synced cards without any mapping remain selectable candidates, not analyzed work.

When a `WORK` entry's hours or linked card count changes:

- If all links are `auto`, recalculate `allocatedHours` evenly from the current entry hours and linked card count.
- If any link is `manual`, require the allocation UI to revalidate before saving.
- If manual allocations no longer sum to the entry hours, block saving until the user corrects the allocation.

## Period-Based Estimate Rules

Card analysis is month-based.

Exclude these dates from period-based estimates:

- Saturdays and Sundays.
- Saved holidays.
- The current user's vacations.

The completed card list uses user-configured done status values.

Cards shown in the final list are completed cards relevant to the selected month. A completed card is relevant when at least one of these is true:

- It is linked from a `WORK` entry inside the selected month.
- It was linked from a `WORK` entry before the selected month and its card period overlaps the selected month.

Do not include every synced Notion card just because its period overlaps the selected month. Period-based estimates are shown for mapped cards only, because the mapping is the user's confirmation that the card was actually part of their work.

Allocation denominators include mapped cards that were open on the same dates. They may include incomplete mapped cards because those cards still competed for the same available work time, but they must not include unmapped candidate-only cards.

Date-field policy:

- Missing `startDate`: exclude from date candidate lists and period-based estimates.
- Missing `endDate`: treat as open for candidate filtering and overlap denominator purposes.
- Done status with missing `endDate`: show in the completed card list only when the card is mapped through at least one `WORK` entry and is relevant to the selected month, but mark the period-based estimate as unavailable.
- Done status with missing `endDate`: do not include it in overlap denominators for other cards.
- Do not use `lastEditedTime` as a fallback end date. It is an edit timestamp, not a completion timestamp.

An open mapped card participates in overlap denominators only when all of these are true:

- `startDate` is present.
- The card is not archived.
- The card is not stale.
- The date being evaluated is on or after `startDate`.
- Either `endDate` is present and the evaluated date is on or before `endDate`, or `endDate` is missing and the card is not in a done status.

For each completed card:

1. Clamp the card period to the selected month.
2. Count total business days in the clamped period.
3. For each eligible date, find every mapped card open on that date.
4. Divide that date's available work hours by the number of open mapped cards.
5. Sum the card's shares across the month.

Available work hours for a date:

1. Use the saved total `WORK` entry hours for that date when present.
2. Fall back to `8h` when there is no saved work time.

Day values are display equivalents only. Use `8h = 1일` when presenting day equivalents.

Example display:

```text
기간 기반 추정: 전체 5영업일 / 분배 후 약 25h (3.1일)
업무기록 연결: 17h (2.1일)
```

The UI should explain the two metrics in short helper text:

- `기간 기반 추정`: an estimate that divides the selected month's available work time or saved total `WORK` hours across mapped cards that were open on the same dates.
- `업무기록 연결`: hours the user explicitly linked from saved work entries.

If a mapped card has no period-based estimate because its dates are incomplete, still show its timesheet-linked hours.

If more than half of the dates used in a period-based estimate fall back to the default `8h`, show a reliability warning such as `저장된 업무시간이 부족해 기본 8h 기준을 많이 사용했습니다.`

## Category Summary

Category summary should support both filtering and grouped metrics.

For the selected month, show per-category:

- completed card count
- period-based estimated hours
- period-based day equivalent
- timesheet-linked hours
- timesheet-linked day equivalent

Cards without a category should be grouped under a clear fallback label such as `미분류`.

## Persistence Constraints

Use database constraints and indexes to protect the most important invariants:

`NotionCardCache`:

- unique `userId + notionPageId`
- index `userId + startDate + endDate`
- index `userId + status`
- index `userId + category`

`WorkEntryNotionCard`:

- unique `userId + timesheetEntryId + notionPageId`
- index `userId + dateKey`
- index `userId + notionPageId`
- check `allocatedHours >= 0`

`NotionSyncRun`:

- index `userId + scopeType + scopeStartDate + scopeEndDate + finishedAt`
- index `userId + status + finishedAt`

The sum of manual allocations is validated in application code because it depends on sibling rows and the parent work entry's current hours.

## Error Handling

Notion integration failures must not block normal timesheet work.

- Missing token: show Notion card features as disconnected.
- Invalid token or database ID: show failure in settings test/sync.
- Broken field mapping: stop sync and identify the missing or invalid mapping.
- Notion API failure or rate limiting: preserve existing cache and show the latest error.
- Candidate-card fetch failure: keep the work editor usable and show cached candidates if available.
- Timesheet save: remains independent from Notion sync outcomes.

Use specific messages for common Notion permission failures:

- `404`: the data source was not found or the integration was not added to the database. Ask the user to check `Add connections` in Notion.
- `403`: the integration does not have read content capability. Ask the user to check the integration capabilities.
- `429`: rate limited. Keep cached data and ask the user to try again later.

The first version should not write changes back to Notion.

## Date And Timezone Policy

aJam uses `YYYY-MM-DD` date keys for daily work. The first version should recommend date-only Notion date values for mapped start/end fields.

When Notion returns datetime values, normalize them to the user's aJam date using the same browser-local/Asia-Seoul daily work semantics used by the timesheet flow. Tests must cover UTC boundary cases so a datetime near midnight does not accidentally shift to the wrong work date.

## Testing

Domain tests should cover:

- weekend, holiday, and vacation exclusion
- overlapping card allocation
- saved work hours replacing the `8h` fallback
- `8h` fallback when a date has no saved work hours
- `8h = 1일` display conversion
- multiple done status values
- category grouping and filtering
- automatic even split for multiple cards on one work entry
- manual allocated hours overriding automatic splits
- date candidate filtering by start/end dates
- done cards excluded from default candidates while already-linked done cards stay visible
- done cards with missing end date excluded from overlap denominators
- automatic allocation recalculation when entry hours or card count changes
- manual allocation revalidation when entry hours changes
- single date range property mapping
- separate start/end date property mapping
- date-only Notion values
- datetime Notion values with timezone
- UTC boundary normalization to aJam date keys
- property mapping by property ID and type
- sync-run status selection for synced-month versus last-cache estimates
- partial sync run handling when pagination stops before completion
- analysis config version increment when done status values change
- raw Notion property storage limited to mapped properties
- global stale not set from one scoped-query absence
- default `8h` fallback reliability warning

App-level verification should cover:

- user-specific Notion settings save
- database with one data source resolving automatically
- database with multiple data sources requiring selection
- direct data source ID validation through schema retrieval
- field mapping save
- selected-month refresh
- Notion card summary and list rendering
- adding and editing linked cards on a work entry
- previous business day's cards becoming the default selection
- Notion API failure preserving existing cached cards
- unmapped synced cards staying out of analysis totals
- `404`, `403`, and `429` Notion errors showing actionable messages

## Implementation Order

Implement in small slices so the daily work flow is useful before advanced analysis is complete:

1. Notion API version and data source query boundary.
2. Notion database/data source URL or ID parsing and `dataSourceId` resolve.
3. User-specific Notion connection storage.
4. Notion data source schema read.
5. Property ID/type based field mapping save.
6. Sync-run recording.
7. Selected-date candidate sync.
8. `WORK` entry card linking.
9. Previous business day's cards as the default selection.
10. Linked-hours calculation.
11. `Notion 카드` monthly screen shell.
12. Selected-month sync.
13. Period-based estimates as pure domain functions with tests.
14. Category filtering and summary.

## Out Of Scope For The First Version

- OAuth connection flow.
- Webhook-driven real-time sync.
- Writing updates back to Notion.
- Full database sync by default.
- Durable background job queue.
- Multi-select category aggregation.
- Formula, rollup, and relation-derived Notion properties.
