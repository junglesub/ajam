# Save-Time AI Cleanup Design

## Goal

aJam should help users keep daily work records ready for monthly reporting without waiting until the end of the month. When a user saves a work day, the app saves the record first, then runs Gemini-based AI cleanup in the background-like flow to fill missing English translations and short day summaries.

The first implementation supports Gemini only, uses each user's own API key, and preserves user-written fields by default.

## User Settings

The settings modal should add an `AI 자동 정리` section with these user-owned settings:

- `enabled`: master switch for AI cleanup.
- `geminiApiKey`: user-entered Gemini API key. Store encrypted and never show the raw value after save.
- `model`: Gemini model string.
- `contextDays`: number of previous saved workdays to send as style/context examples. Options: `0`, `3`, `5`, `10`; default `5`.
- `backfillMissing`: whether to also fill missing AI fields on previous saved workdays.
- `backfillLimit`: maximum number of previous dates to backfill per save. Options: `1`, `3`, `5`; default `3`.

Overwrite behavior is not user-configurable in the first version. The fixed policy is: fill only empty `aiTranslation` and empty day-level `shortVersion`.

## Gemini Model Choices

The UI should offer presets plus direct entry:

- Fast/cheap default: `gemini-3.1-flash-lite`
- Balanced: `gemini-3.5-flash`
- Stable fallback: `gemini-2.5-flash`
- Quality-first: `gemini-2.5-pro`
- Custom model string

The saved value is the model string. This lets the app support new Gemini models without a deploy when the user selects custom entry.

## Save Flow

1. User clicks `저장`.
2. `saveTimesheetEntryAction` saves the day exactly as today.
3. The UI immediately shows the saved state.
4. If AI cleanup is enabled and the user has an API key, the client starts a separate AI server action without blocking the save.
5. The UI shows `AI 정리 중` while the action runs.
6. The AI action reloads authoritative server-side data, generates missing fields, persists only allowed fields, and returns changed dates.
7. The client merges returned days into the visible month state.
8. If AI fails, the saved work remains saved and the UI shows a small AI-only failure message.

This is a background-like UX, not a durable job queue. A later version can replace the client-triggered server action with a queue while preserving the same action boundary.

## Eligible Data

AI cleanup must only use explicit saved work records.

Included as update targets:

- saved dates in the current user's data
- `WORK` entries only
- entries with non-empty Korean `content`
- current saved date first
- previous dates in the same month only when `backfillMissing` is enabled
- previous dates whose `aiTranslation` or day-level `shortVersion` is empty

Included as context examples:

- previous saved `WORK` entries
- entries with non-empty Korean `content`
- preferably entries with existing `aiTranslation` or day-level `shortVersion`
- no more than `contextDays` previous workdays

Excluded from both update targets and context examples:

- `작성 예정`
- `미기입`
- future dates
- unsaved drafts
- vacation-only days
- holiday-only days
- holiday entries
- vacation entries
- work entries with empty Korean content

AI must never invent missing work records. It only translates and summarizes saved user input.

## Backfill Policy

After the current date is processed, the action may scan previous dates in the same month in reverse chronological order. It processes at most `backfillLimit` dates per save.

Backfill fills missing fields only:

- missing entry-level `aiTranslation`
- missing day-level `shortVersion`

If a date has multiple work entries, the day summary should summarize the combined work for that date. If some entries already have translations, keep them unchanged and use them only as context.

## Prompt Contract

The AI request should send compact JSON:

- target dates and work entries requiring missing fields
- previous saved workday examples for style and terminology
- model-independent output schema

The response should be strict JSON with only:

- `dateKey`
- `shortVersion`
- `entries[].id`
- `entries[].aiTranslation`

The server validates the response against the saved data before applying changes. Unknown dates, unknown entry IDs, vacation/holiday entries, unsupported fields, or non-empty field overwrites are rejected.

## Error Handling

Timesheet save and AI cleanup have separate outcomes.

- Save failure: show the existing save error and do not run AI.
- Missing API key: save succeeds and AI is skipped.
- Gemini request failure: save succeeds and AI status shows failure.
- Partial AI failure: apply valid dates if the response can be safely split; otherwise apply none and show failure.
- Stale data: reject AI updates for fields that became non-empty after the action loaded its baseline.

## Persistence

Use a user-scoped AI settings table rather than adding all AI columns to `User`.

Suggested shape:

- `userId`
- `provider`: `GEMINI`
- `apiKeyEncrypted`
- `model`
- `enabled`
- `contextDays`
- `backfillMissing`
- `backfillLimit`
- `createdAt`
- `updatedAt`

API keys must be encrypted at rest using an app-level secret. The UI should only show whether a key is saved and allow replacing or clearing it.

## UI Notes

The settings modal should keep the section compact:

- AI automatic cleanup toggle
- Gemini API key password field
- API key test button
- model select with custom input
- previous workday context selector
- previous missing-field backfill toggle
- backfill limit selector

The editor save area should display AI status separately from save status:

- `AI 정리 중`
- `AI 정리 완료`
- `이전 N일 보정됨`
- `AI 실패: API key 또는 네트워크 확인 필요`

## Non-Goals

- No OpenAI support in the first version.
- No durable background queue in the first version.
- No automatic creation of missing work records.
- No AI processing for drafts, missing dates, future dates, vacation-only days, or holiday-only days.
- No overwrite of user-written `aiTranslation` or `shortVersion` in the first version.
