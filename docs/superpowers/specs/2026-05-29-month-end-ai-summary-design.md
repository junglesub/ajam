# Month-End AI Summary Design

## Context

aJam already stores work content, per-entry English translations, and day-level short summaries. Phase 4 adds an AI-assisted month-end workflow without calling an LLM directly from the app. The user exports the current month as JSON, pastes it into an external LLM with a strict prompt, then pastes the resulting JSON back into a new app tab.

This keeps the app simple, avoids API key management for now, and lets the user control the LLM and any report wording before applying changes.

## Goals

- Add a new app tab for month-end AI translation and summary.
- Export the selected month as JSON that is safe to paste into an LLM.
- Provide a prompt that asks the LLM to return only valid JSON.
- Import the returned JSON and preview changes before saving.
- Update only work-entry `aiTranslation` and day-level `shortVersion`.
- Support an additional revision prompt so the user can rerun the LLM with style changes.

## Non-Goals

- Do not call an LLM API from the app in this phase.
- Do not create new projects, dates, entries, vacations, or holidays from the import.
- Do not translate vacation or holiday entries into work-report text.
- Do not build or run verification unless the user explicitly asks for implementation.

## User Flow

1. User opens the new `AI 월말 정리` tab.
2. The tab defaults to the visible/current month, such as May 2026.
3. User clicks a copy/export control to copy a JSON payload and the main LLM prompt.
4. User pastes the prompt and JSON into an external LLM.
5. The LLM returns a patch JSON object with only dates, short summaries, work entry IDs, and English translations.
6. User pastes the JSON into the app.
7. The app validates the JSON and shows a preview of changes.
8. User applies the changes, saving updated `aiTranslation` and `shortVersion` values.
9. If the wording is not right, user copies a revision prompt, adds an instruction, and reruns the LLM.

## JSON Contract

The exported JSON should contain enough context for useful reporting while preserving stable identifiers for import.

```json
{
  "schemaVersion": 1,
  "month": "2026-05",
  "days": [
    {
      "dateKey": "2026-05-01",
      "shortVersion": "",
      "entries": [
        {
          "id": "entry-id",
          "clientId": "entry-id",
          "kind": "WORK",
          "project": "Project Name",
          "hours": 8,
          "content": "Korean work content",
          "aiTranslation": ""
        }
      ]
    }
  ]
}
```

Import JSON should be smaller than export JSON. It contains only `schemaVersion`, `month`, `days[].dateKey`, `days[].shortVersion`, `days[].entries[].id`, and `days[].entries[].aiTranslation`. The app matches these patch fields against the original export baseline and rejects unknown dates, duplicate dates, unknown entry IDs, duplicate entry IDs, vacation entries, and holiday entries.

## Main Prompt

````text
You are helping me prepare a concise English monthly work report.

I will provide a JSON export of my monthly timesheet.
Return ONLY valid JSON. Do not include Markdown, comments, explanations, or extra text.

Your task:
1. Read the input JSON as source context only.
2. Return a smaller patch JSON. Do not return Korean content, project names, hours, vacation entries, holiday entries, or any other source-only fields.
3. For each WORK entry, return its id and aiTranslation in concise, natural English.
4. For each day that has one or more WORK entries, return dateKey, shortVersion, and entries.
5. Keep all English suitable for a professional monthly report.
6. Keep translations brief, context-aware, and polished.
7. If the Korean content is vague, infer the most likely business meaning from the project name and nearby entries, but do not invent specific facts.
8. If a WORK entry has empty content, set aiTranslation to an empty string unless the project name alone clearly indicates the work.
9. Exclude VACATION and HOLIDAY entries from the output.
10. Use past-tense or noun-phrase style consistently, such as:
    - "Implemented user login flow."
    - "Updated monthly timesheet UI."
    - "Reviewed deployment configuration."
11. shortVersion must be shorter than aiTranslation and should summarize the day, not repeat every detail.
12. If a day has multiple WORK entries, shortVersion should summarize the combined work in one concise sentence or phrase.

Output requirements:
- Return only this patch JSON shape:
{
  "schemaVersion": 1,
  "month": "YYYY-MM",
  "days": [
    {
      "dateKey": "YYYY-MM-DD",
      "shortVersion": "Short English day summary.",
      "entries": [
        {
          "id": "entry-id",
          "aiTranslation": "Concise English work translation."
        }
      ]
    }
  ]
}
- The output must be parseable by JSON.parse.
- Include only days that have WORK entries.
- Include only WORK entries.
- Do not include content, project, hours, kind, clientId, holidayName, vacationName, sortOrder, or any fields not shown above.
- Do not wrap the JSON in ```json fences.

Here is the JSON export:

[PASTE_JSON_HERE]
````

## Revision Prompt

````text
Revise the English fields in this timesheet JSON according to my instruction.

Instruction:
[WRITE_REVISION_REQUEST_HERE]

Rules:
1. Return ONLY valid JSON.
2. Preserve the same patch JSON structure.
3. Do not add content, project, hours, kind, clientId, holidayName, vacationName, sortOrder, vacation entries, holiday entries, or any fields outside the patch shape.
4. Only revise aiTranslation and shortVersion values.
5. Keep the English concise, professional, context-aware, and suitable for a monthly report.
6. Do not invent specific facts that are not supported by the Korean source content or project name.
7. The output must be parseable by JSON.parse.
8. Do not include Markdown, comments, explanations, or code fences.

Current JSON:

[PASTE_CURRENT_JSON_HERE]
````

## Components

- Navigation item: add `AI 월말 정리` next to timesheet and project management.
- Server page: load the selected month's timesheet data for the current user.
- Client workspace: render export prompt, JSON textarea, import textarea, validation messages, preview, and apply action.
- Server actions: load month data and save validated day updates using existing timesheet persistence.
- Validation helper: compare imported patch JSON against the original exported baseline and allow only known work entry IDs and work-day summaries.

## Data Flow

The new tab loads monthly data through the same server-side session checks as the timesheet page. The client builds or receives an export payload. After the user pastes LLM output, the client parses JSON, validates immutable fields, displays the diff, and sends only approved updates to a server action. The server revalidates ownership and structural consistency before saving each affected day.

## Error Handling

- Invalid JSON shows a parse error and blocks preview.
- Schema version mismatch blocks apply.
- Month mismatch blocks apply.
- Missing or unknown dates/entries blocks apply.
- Changed immutable fields block apply and identify the first changed field.
- Empty English fields are allowed but shown in preview.
- Save failures show a recoverable error; the pasted JSON remains available.

## Testing

Implementation should add focused tests for JSON export shape, import validation, immutable-field rejection, and allowed updates. Manual verification should cover a month with multiple work entries, vacation-only days, holidays, missing days, empty content, and revised JSON pasted after an initial generation.

## Implementation Decisions

- Use a dedicated server action to return the export payload for a requested month. This keeps the payload authoritative and avoids relying on whichever data happens to be loaded in the timesheet UI.
- Apply updates through one server action that validates the imported payload against the current server-side month data, then saves only changed days through the existing day persistence logic.
- Give the new tab its own month selector. It defaults to the current month so month-end work is one click away, but it can be used for prior months without navigating the timesheet page.
