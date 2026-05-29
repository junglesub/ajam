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
  return `You are helping prepare a concise English month-end work summary.

Return only valid JSON. Do not include Markdown, code fences, comments, or explanations.

Rules:
1. Preserve the exact JSON object shape and all existing fields.
2. Only modify WORK entry aiTranslation values and day shortVersion values.
3. Do not change schemaVersion, month, dateKey, holidayName, IDs, clientId, kind, project, content, hours, sortOrder, or vacationName.
4. For each WORK entry, write concise, professional English in aiTranslation.
5. For each day with one or more WORK entries, write a concise English shortVersion that summarizes the day.
6. Keep VACATION and HOLIDAY entry aiTranslation values empty.
7. Do not set shortVersion for days without WORK entries.
8. Do not invent unsupported facts.
9. The response must be parseable by JSON.parse.

JSON:
[PASTE_JSON_HERE]`;
}

export function buildMonthlyAiSummaryRevisionPrompt(): string {
  return `Revise the English fields in this timesheet JSON according to the instruction.

Instruction:
[WRITE_REVISION_REQUEST_HERE]

Return only valid JSON. Do not include Markdown, code fences, comments, or explanations.

Rules:
1. Preserve the exact JSON object shape and all existing fields.
2. Only modify WORK entry aiTranslation values and day shortVersion values.
3. Do not change schemaVersion, month, dateKey, holidayName, IDs, clientId, kind, project, content, hours, sortOrder, or vacationName.
4. Keep VACATION and HOLIDAY entry aiTranslation values empty.
5. Do not set shortVersion for days without WORK entries.
6. Do not invent unsupported facts.
7. The response must be parseable by JSON.parse.

Current JSON:
[PASTE_CURRENT_JSON_HERE]`;
}
