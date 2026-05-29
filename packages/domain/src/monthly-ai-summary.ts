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
  imported: MonthlyAiSummaryPayload;
}): MonthlyAiSummaryValidationResult {
  const errors: string[] = [];
  const { baseline, imported } = params;

  if (imported.schemaVersion !== baseline.schemaVersion) {
    errors.push(`schemaVersion must be ${baseline.schemaVersion}.`);
  }

  if (imported.month !== baseline.month) {
    errors.push(`month must be ${baseline.month}.`);
  }

  if (imported.days.length !== baseline.days.length) {
    errors.push("days length changed.");
  }

  for (const baselineDay of baseline.days) {
    const importedDay = imported.days.find((day) => day.dateKey === baselineDay.dateKey);

    if (!importedDay) {
      errors.push(`${baselineDay.dateKey} is missing.`);
      continue;
    }

    if (importedDay.holidayName !== baselineDay.holidayName) {
      errors.push(`${baselineDay.dateKey} changed immutable field holidayName.`);
    }

    const hasWorkEntries = baselineDay.entries.some((entry) => entry.kind === "WORK");

    if (!hasWorkEntries && importedDay.shortVersion !== baselineDay.shortVersion) {
      errors.push(`${baselineDay.dateKey} cannot set shortVersion because it has no WORK entries.`);
    }

    if (importedDay.entries.length !== baselineDay.entries.length) {
      errors.push(`${baselineDay.dateKey} entries length changed.`);
    }

    for (const baselineEntry of baselineDay.entries) {
      const entryId = getEntryId(baselineEntry);
      const importedEntry = importedDay.entries.find((entry) => getEntryId(entry) === entryId);

      if (!importedEntry) {
        errors.push(`${baselineDay.dateKey} entry ${entryId} is missing.`);
        continue;
      }

      for (const field of immutableEntryFields) {
        if (importedEntry[field] !== baselineEntry[field]) {
          errors.push(`${baselineDay.dateKey} entry ${entryId} changed immutable field ${field}.`);
        }
      }

      if (baselineEntry.kind !== "WORK" && importedEntry.aiTranslation !== "") {
        errors.push(`${baselineDay.dateKey} entry ${entryId} cannot set aiTranslation for ${baselineEntry.kind}.`);
      }
    }
  }

  return { errors };
}

export function getMonthlyAiSummaryPatches(params: {
  baseline: MonthlyAiSummaryPayload;
  imported: MonthlyAiSummaryPayload;
}): MonthlyAiSummaryPatch[] {
  const patches: MonthlyAiSummaryPatch[] = [];

  for (const baselineDay of params.baseline.days) {
    const importedDay = params.imported.days.find((day) => day.dateKey === baselineDay.dateKey);

    if (!importedDay) {
      continue;
    }

    const entries: MonthlyAiSummaryPatch["entries"] = [];

    for (const baselineEntry of baselineDay.entries) {
      if (baselineEntry.kind !== "WORK") {
        continue;
      }

      const entryId = getEntryId(baselineEntry);
      const importedEntry = importedDay.entries.find((entry) => getEntryId(entry) === entryId);

      if (importedEntry && importedEntry.aiTranslation !== baselineEntry.aiTranslation) {
        entries.push({ id: entryId, aiTranslation: importedEntry.aiTranslation });
      }
    }

    const shortVersionChanged = importedDay.shortVersion !== baselineDay.shortVersion;

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
1. Preserve the exact JSON structure.
2. Do not change any IDs, dateKey values, kind values, project names, hours, vacation entries, holiday entries, or Korean source content.
3. For each WORK entry, fill or rewrite aiTranslation in concise, natural English.
4. For each day that has one or more WORK entries, fill shortVersion with a short English summary for calendar display.
5. Keep all English suitable for a professional monthly report.
6. Keep translations brief, context-aware, and polished.
7. If the Korean content is vague, infer the most likely business meaning from the project name and nearby entries, but do not invent specific facts.
8. If a WORK entry has empty content, set aiTranslation to an empty string unless the project name alone clearly indicates the work.
9. For VACATION and HOLIDAY entries, keep aiTranslation empty and do not create a work summary from them.
10. Use past-tense or noun-phrase style consistently, such as:
    - "Implemented user login flow."
    - "Updated monthly timesheet UI."
    - "Reviewed deployment configuration."
11. shortVersion must be shorter than aiTranslation and should summarize the day, not repeat every detail.
12. If a day has multiple WORK entries, shortVersion should summarize the combined work in one concise sentence or phrase.

Output requirements:
- Return the full JSON object.
- The output must be parseable by JSON.parse.
- Keep all existing fields.
- Only modify aiTranslation and shortVersion.
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
2. Preserve the exact JSON structure.
3. Do not change IDs, dateKey values, kind values, project names, hours, Korean content, vacation entries, or holiday entries.
4. Only modify aiTranslation and shortVersion.
5. Keep the English concise, professional, context-aware, and suitable for a monthly report.
6. Do not invent specific facts that are not supported by the Korean source content or project name.
7. The output must be parseable by JSON.parse.
8. Do not include Markdown, comments, explanations, or code fences.

Current JSON:

[PASTE_CURRENT_JSON_HERE]`;
}
