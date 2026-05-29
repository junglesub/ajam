import type { TimesheetDayDraft, TimesheetEntryDraft } from "./timesheet";

export const monthlyAiSummarySchemaVersion = 1;

export type MonthlyAiSummaryEntry = Pick<
  TimesheetEntryDraft,
  | "aiTranslation"
  | "clientId"
  | "content"
  | "holidayName"
  | "hours"
  | "id"
  | "kind"
  | "project"
  | "sortOrder"
  | "vacationName"
>;

export type MonthlyAiSummaryDay = {
  dateKey: string;
  entries: MonthlyAiSummaryEntry[];
  holidayName: string;
  shortVersion: string;
};

export type MonthlyAiSummaryPayload = {
  days: MonthlyAiSummaryDay[];
  month: string;
  schemaVersion: typeof monthlyAiSummarySchemaVersion;
};

export type MonthlyAiSummaryPatch = {
  dateKey: string;
  entries: Array<{ aiTranslation: string; id: string }>;
  shortVersion: string;
};

export type MonthlyAiSummaryImportEntry = {
  aiTranslation: string;
  id: string;
};

export type MonthlyAiSummaryImportDay = {
  dateKey: string;
  entries: MonthlyAiSummaryImportEntry[];
  shortVersion: string;
};

export type MonthlyAiSummaryImportPayload = {
  days: MonthlyAiSummaryImportDay[];
  month: string;
  schemaVersion: typeof monthlyAiSummarySchemaVersion;
};

export type MonthlyAiSummaryValidationResult = {
  errors: string[];
};

const immutableEntryFields = [
  "clientId",
  "content",
  "holidayName",
  "hours",
  "id",
  "kind",
  "project",
  "sortOrder",
  "vacationName"
] as const satisfies ReadonlyArray<keyof MonthlyAiSummaryEntry>;

const importPayloadFields = ["days", "month", "schemaVersion"] as const;
const importDayFields = ["dateKey", "entries", "shortVersion"] as const;
const importEntryFields = ["aiTranslation", "id"] as const;

export function buildMonthlyAiSummaryExport(params: {
  days: TimesheetDayDraft[];
  month: string;
}): MonthlyAiSummaryPayload {
  return {
    schemaVersion: monthlyAiSummarySchemaVersion,
    month: params.month,
    days: params.days.map((day) => ({
      dateKey: day.dateKey,
      holidayName: day.holidayName,
      shortVersion: day.shortVersion,
      entries: day.entries.map(toMonthlyAiSummaryEntry)
    }))
  };
}

function toMonthlyAiSummaryEntry(entry: TimesheetEntryDraft): MonthlyAiSummaryEntry {
  if (entry.kind === "WORK") {
    return {
      aiTranslation: entry.aiTranslation,
      clientId: entry.clientId,
      content: entry.content,
      holidayName: "",
      hours: entry.hours,
      id: entry.id,
      kind: entry.kind,
      project: entry.project,
      sortOrder: entry.sortOrder,
      vacationName: ""
    };
  }

  if (entry.kind === "VACATION") {
    return {
      aiTranslation: "",
      clientId: entry.clientId,
      content: "",
      holidayName: "",
      hours: entry.hours,
      id: entry.id,
      kind: entry.kind,
      project: "",
      sortOrder: entry.sortOrder,
      vacationName: entry.vacationName
    };
  }

  return {
    aiTranslation: "",
    clientId: entry.clientId,
    content: "",
    holidayName: entry.holidayName,
    hours: entry.hours,
    id: entry.id,
    kind: entry.kind,
    project: "",
    sortOrder: entry.sortOrder,
    vacationName: ""
  };
}

export function validateMonthlyAiSummaryImport(params: {
  baseline: MonthlyAiSummaryPayload;
  imported: MonthlyAiSummaryImportPayload;
}): MonthlyAiSummaryValidationResult {
  const errors: string[] = [];
  const { baseline, imported } = params;

  if (imported.schemaVersion !== baseline.schemaVersion) {
    errors.push(`schemaVersion must be ${baseline.schemaVersion}.`);
  }

  if (imported.month !== baseline.month) {
    errors.push(`month must be ${baseline.month}.`);
  }

  pushUnknownFieldErrors({ errors, fields: importPayloadFields, label: "payload", value: imported });

  const seenDateKeys = new Set<string>();

  for (const importedDay of imported.days) {
    pushUnknownFieldErrors({ errors, fields: importDayFields, label: importedDay.dateKey, value: importedDay });

    if (seenDateKeys.has(importedDay.dateKey)) {
      errors.push(`${importedDay.dateKey} is duplicated.`);
      continue;
    }

    seenDateKeys.add(importedDay.dateKey);

    const baselineDay = baseline.days.find((day) => day.dateKey === importedDay.dateKey);

    if (!baselineDay) {
      errors.push(`${importedDay.dateKey} is unknown.`);
      continue;
    }

    const hasWorkEntries = baselineDay.entries.some((entry) => entry.kind === "WORK");

    if (!hasWorkEntries) {
      errors.push(`${baselineDay.dateKey} cannot set shortVersion because it has no WORK entries.`);
    }

    const seenEntryIds = new Set<string>();

    for (const importedEntry of importedDay.entries) {
      pushUnknownFieldErrors({ errors, fields: importEntryFields, label: `${baselineDay.dateKey} entry ${importedEntry.id}`, value: importedEntry });

      if (seenEntryIds.has(importedEntry.id)) {
        errors.push(`${baselineDay.dateKey} entry ${importedEntry.id} is duplicated.`);
        continue;
      }

      seenEntryIds.add(importedEntry.id);

      const baselineEntry = baselineDay.entries.find((entry) => getEntryId(entry) === importedEntry.id);

      if (!baselineEntry) {
        errors.push(`${baselineDay.dateKey} entry ${importedEntry.id} is unknown.`);
        continue;
      }

      if (baselineEntry.kind !== "WORK") {
        errors.push(`${baselineDay.dateKey} entry ${importedEntry.id} cannot set aiTranslation for ${baselineEntry.kind}.`);
      }
    }
  }

  return { errors };
}

function pushUnknownFieldErrors(params: {
  errors: string[];
  fields: readonly string[];
  label: string;
  value: object;
}) {
  const allowedFields = new Set(params.fields);

  for (const field of Object.keys(params.value)) {
    if (!allowedFields.has(field)) {
      params.errors.push(`${params.label} contains unsupported field ${field}.`);
    }
  }
}

export function validateMonthlyAiSummaryBaseline(params: {
  baseline: MonthlyAiSummaryPayload;
  current: MonthlyAiSummaryPayload;
}): MonthlyAiSummaryValidationResult {
  const errors: string[] = [];
  const { baseline, current } = params;

  if (current.schemaVersion !== baseline.schemaVersion) {
    errors.push(`schemaVersion must be ${baseline.schemaVersion}.`);
  }

  if (current.month !== baseline.month) {
    errors.push(`month must be ${baseline.month}.`);
  }

  if (current.days.length !== baseline.days.length) {
    errors.push("days length changed.");
  }

  for (const baselineDay of baseline.days) {
    const currentDay = current.days.find((day) => day.dateKey === baselineDay.dateKey);

    if (!currentDay) {
      errors.push(`${baselineDay.dateKey} is missing.`);
      continue;
    }

    if (currentDay.holidayName !== baselineDay.holidayName) {
      errors.push(`${baselineDay.dateKey} changed immutable field holidayName.`);
    }

    if (currentDay.entries.length !== baselineDay.entries.length) {
      errors.push(`${baselineDay.dateKey} entries length changed.`);
    }

    for (const baselineEntry of baselineDay.entries) {
      const entryId = getEntryId(baselineEntry);
      const currentEntry = currentDay.entries.find((entry) => getEntryId(entry) === entryId);

      if (!currentEntry) {
        errors.push(`${baselineDay.dateKey} entry ${entryId} is missing.`);
        continue;
      }

      for (const field of immutableEntryFields) {
        if (currentEntry[field] !== baselineEntry[field]) {
          errors.push(`${baselineDay.dateKey} entry ${entryId} changed immutable field ${field}.`);
        }
      }
    }
  }

  return { errors };
}

export function getMonthlyAiSummaryPatches(params: {
  baseline: MonthlyAiSummaryPayload;
  imported: MonthlyAiSummaryImportPayload;
}): MonthlyAiSummaryPatch[] {
  const patches: MonthlyAiSummaryPatch[] = [];

  for (const importedDay of params.imported.days) {
    const baselineDay = params.baseline.days.find((day) => day.dateKey === importedDay.dateKey);

    if (!baselineDay) {
      continue;
    }

    const entries: MonthlyAiSummaryPatch["entries"] = [];

    for (const importedEntry of importedDay.entries) {
      const baselineEntry = baselineDay.entries.find((entry) => getEntryId(entry) === importedEntry.id);

      if (baselineEntry?.kind === "WORK" && importedEntry.aiTranslation !== baselineEntry.aiTranslation) {
        entries.push({ id: importedEntry.id, aiTranslation: importedEntry.aiTranslation });
      }
    }

    const hasWorkEntries = baselineDay.entries.some((entry) => entry.kind === "WORK");
    const shortVersionChanged = hasWorkEntries && importedDay.shortVersion !== baselineDay.shortVersion;

    if (entries.length > 0 || shortVersionChanged) {
      patches.push({
        dateKey: baselineDay.dateKey,
        shortVersion: importedDay.shortVersion,
        entries
      });
    }
  }

  return patches;
}

function getEntryId(entry: Pick<MonthlyAiSummaryEntry, "clientId" | "id">): string {
  return entry.id || entry.clientId;
}

export function buildMonthlyAiSummaryPrompt(): string {
  return `You are helping me prepare a concise English monthly work report.

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
- Do not wrap the JSON in code fences.

Here is the JSON export:

[PASTE_JSON_HERE]`;
}

export function buildMonthlyAiSummaryRevisionPrompt(): string {
  return `Revise the English fields in this timesheet JSON according to my instruction.

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

[PASTE_CURRENT_JSON_HERE]`;
}
