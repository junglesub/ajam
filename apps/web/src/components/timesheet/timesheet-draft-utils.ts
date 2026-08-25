import {
  allocateNotionCardHours,
  createEmptyDraft,
  createEmptyEntryDraft,
  resolveStatus,
  type TimesheetDayDraft,
  type TimesheetEntryDraft,
  type TimesheetRow,
  type VacationColor,
  type VacationStatus,
  type WorkRecordKind
} from "@timesheet/domain";
import { effectiveEntryHours, entryHasNotionCardWarning, firstWorkEntry } from "./timesheet-entry-display";

export type TimesheetMonthData = {
  entries: TimesheetDayDraft[];
  holidayWarning?: string;
  holidays: Array<{ dateKey: string; name: string }>;
  projects: string[];
  vacationColors: Record<string, VacationColor>;
  vacations: Array<{ dateKey: string; hours: number; name: string }>;
};

export function createClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `entry-${Date.now()}-${Math.random()}`;
}

export function createVacationDay(dateKey: string, vacationName: string, hours: number, vacationStatus: VacationStatus = "CONFIRMED"): TimesheetDayDraft {
  return {
    ...createEmptyDraft(dateKey),
    entries: [
      {
        ...createEmptyEntryDraft(0),
        clientId: createClientId(),
        hours,
        kind: "VACATION",
        vacationName,
        vacationStatus
      }
    ]
  };
}

export function withClientIds(day: TimesheetDayDraft): TimesheetDayDraft {
  return {
    ...day,
    entries: day.entries
      .map((entry, index) => ({
        ...entry,
        clientId: entry.clientId || entry.id || createClientId(),
        hoursTouched: entry.hoursTouched ?? (entry.kind === "WORK" && day.entries.length === 1 && entry.hours !== 8),
        sortOrder: index
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  };
}

export function buildDraftsFromMonthData(monthData: TimesheetMonthData): Record<string, TimesheetDayDraft> {
  const drafts: Record<string, TimesheetDayDraft> = {};

  for (const holiday of monthData.holidays) {
    drafts[holiday.dateKey] = {
      ...createEmptyDraft(holiday.dateKey),
      holidayName: holiday.name
    };
  }

  for (const entry of monthData.entries) {
    const current = drafts[entry.dateKey] ?? createEmptyDraft(entry.dateKey);
    drafts[entry.dateKey] = withClientIds({
      ...current,
      ...entry,
      holidayName: current.holidayName || entry.holidayName
    });
  }

  return drafts;
}

export function buildInitialDrafts(monthData: TimesheetMonthData, todayKey: string): Record<string, TimesheetDayDraft> {
  const drafts = buildDraftsFromMonthData(monthData);

  if (drafts[todayKey]) {
    return drafts;
  }

  const todayDraft = createDraftForDate(todayKey, drafts);

  if (!todayDraft.entries[0]?.project) {
    return drafts;
  }

  return {
    ...drafts,
    [todayKey]: todayDraft
  };
}

export function buildSelectedEntryIds(drafts: Record<string, TimesheetDayDraft>): Record<string, string> {
  return Object.fromEntries(Object.values(drafts).flatMap((day) => day.entries[0] ? [[day.dateKey, day.entries[0].clientId]] : []));
}

export function findPreviousProject(dateKey: string, records: Record<string, TimesheetDayDraft>): string {
  const previousRecord = Object.values(records)
    .flatMap((record) => record.entries.map((entry) => ({ dateKey: record.dateKey, entry })))
    .filter((record) => record.dateKey < dateKey && record.entry.kind === "WORK" && record.entry.project.trim())
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))[0];

  return previousRecord?.entry.project ?? "";
}

export function createEntryForDate(dateKey: string, records: Record<string, TimesheetDayDraft>, kind: WorkRecordKind = "WORK"): TimesheetEntryDraft {
  const entry = createEmptyEntryDraft(0);

  return {
    ...entry,
    clientId: createClientId(),
    hours: kind === "HOLIDAY" ? 0 : 8,
    hoursTouched: false,
    kind,
    project: kind === "WORK" ? findPreviousProject(dateKey, records) : ""
  };
}

export function rebalanceDefaultWorkHours(entries: TimesheetEntryDraft[], newEntry: TimesheetEntryDraft): TimesheetEntryDraft[] {
  if (newEntry.kind !== "WORK") {
    return [...entries, newEntry];
  }

  const fixedWorkHours = entries
    .filter((entry) => entry.kind === "WORK" && entry.hoursTouched)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const flexibleWorkCount = entries.filter((entry) => entry.kind === "WORK" && !entry.hoursTouched).length + 1;
  const sharedHours = Math.max(8 - fixedWorkHours, 0) / flexibleWorkCount;
  const normalizedSharedHours = Number(sharedHours.toFixed(2));

  return [
    ...entries.map((entry) => entry.kind === "WORK" && !entry.hoursTouched ? withRebalancedNotionCards(entry, normalizedSharedHours) : entry),
    withRebalancedNotionCards(newEntry, normalizedSharedHours)
  ];
}

function withRebalancedNotionCards(entry: TimesheetEntryDraft, hours: number): TimesheetEntryDraft {
  const nextEntry = {
    ...entry,
    hours,
    hoursTouched: false
  };

  if (entry.kind !== "WORK" || entry.notionCards.length === 0) {
    return nextEntry;
  }

  try {
    return {
      ...nextEntry,
      notionCards: allocateNotionCardHours({
        entryHours: hours,
        links: entry.notionCards
      })
    };
  } catch {
    return nextEntry;
  }
}

export function createDraftForDate(dateKey: string, records: Record<string, TimesheetDayDraft>): TimesheetDayDraft {
  const entry = createEntryForDate(dateKey, records);

  return {
    ...createEmptyDraft(dateKey),
    entries: [entry]
  };
}

export function createFutureDraftForDate(dateKey: string): TimesheetDayDraft {
  return createVacationDay(dateKey, "휴가", 8);
}

function firstHolidayEntry(day: TimesheetDayDraft): TimesheetEntryDraft | undefined {
  return day.entries.find((entry) => entry.kind === "HOLIDAY");
}

export function hasHolidayMarker(day: TimesheetDayDraft | undefined): boolean {
  return Boolean(day?.holidayName || day?.entries.some((entry) => entry.kind === "HOLIDAY"));
}

function uniqueWorkProjectCount(day: TimesheetDayDraft): number {
  return new Set(day.entries.filter((entry) => entry.kind === "WORK").map((entry) => entry.project.trim()).filter(Boolean)).size;
}

export function rowFromDraft(dateKey: string, todayKey: string, draft: TimesheetDayDraft | undefined, isSaved: boolean): TimesheetRow {
  const row = draft ?? createEmptyDraft(dateKey);
  const firstWork = firstWorkEntry(row);
  const firstHoliday = firstHolidayEntry(row);
  const previewContent = firstWork ? row.shortVersion || firstWork.content : "";
  const hasContent = isSaved && row.entries.length > 0;
  const firstVacation = row.entries.find((entry) => entry.kind === "VACATION");
  const hasVacation = Boolean(firstVacation);
  const hasHoliday = Boolean(firstHoliday || row.holidayName);
  const isVacationOnly = hasVacation && !firstWork && !hasHoliday;
  const shouldWarnForMissingNotionCards = isSaved || !isAutoProjectOnlyDraft(row);
  const hasUnlinkedNotionWork = shouldWarnForMissingNotionCards && row.entries.some((entry) => entry.kind === "WORK" && entry.notionCards.length === 0);
  const hasNotionCardWarning = row.entries.some((entry) => entryHasNotionCardWarning(entry, shouldWarnForMissingNotionCards));

  return {
    ...row,
    aiTranslation: firstWork?.aiTranslation ?? "",
    content: firstWork?.content ?? "",
    entryCount: row.entries.length,
    hasNotionCardWarning,
    hasUnlinkedNotionWork,
    hasVacation,
    hours: row.entries.reduce((sum, entry) => sum + effectiveEntryHours(entry), 0),
    kind: firstWork?.kind ?? (hasHoliday ? "HOLIDAY" : hasVacation ? "VACATION" : "WORK"),
    previewContent,
    project: firstWork?.project ?? "",
    projectCount: uniqueWorkProjectCount(row),
    status: isVacationOnly
      ? "VACATION"
      : resolveStatus({
          dateKey,
          hasContent: hasContent || Boolean(row.shortVersion.trim()),
          kind: hasHoliday ? "HOLIDAY" : "WORK",
          todayKey
        }),
    holidayName: row.holidayName || firstHoliday?.holidayName || "",
    vacationName: firstVacation?.vacationName ?? "",
    vacationStatus: firstVacation?.vacationStatus ?? "CONFIRMED"
  };
}

export function isAutoProjectOnlyDraft(draft: TimesheetDayDraft | undefined): boolean {
  if (!draft) {
    return false;
  }

  const [entry] = draft.entries;

  return (
    draft.entries.length === 1 &&
    entry !== undefined &&
    entry.kind === "WORK" &&
    entry.hours === 8 &&
    Boolean(entry.project.trim()) &&
    !entry.content.trim() &&
    !entry.aiTranslation.trim() &&
    !draft.shortVersion.trim()
  );
}

export function sanitizeDayForSave(day: TimesheetDayDraft): TimesheetDayDraft {
  const hasWork = day.entries.some((entry) => entry.kind === "WORK");

  return {
    ...day,
    shortVersion: hasWork ? day.shortVersion : "",
    entries: day.entries.map((entry, index) => ({
      ...entry,
      aiTranslation: entry.kind === "WORK" ? entry.aiTranslation : "",
      content: entry.kind === "WORK" ? entry.content : "",
      holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
      hoursTouched: undefined,
      project: entry.kind === "WORK" ? entry.project : "",
      sortOrder: index,
      vacationName: entry.kind === "VACATION" ? entry.vacationName : ""
    }))
  };
}

function entryKey(entry: TimesheetEntryDraft): string {
  return entry.id || entry.clientId;
}

export function hasExistingAiFields(day: TimesheetDayDraft): boolean {
  return Boolean(day.shortVersion.trim() || day.entries.some((entry) => entry.kind === "WORK" && entry.aiTranslation.trim()));
}

export function hasWorkContent(day: TimesheetDayDraft): boolean {
  return day.entries.some((entry) => entry.kind === "WORK" && entry.content.trim());
}

export function hasMissingAiFields(day: TimesheetDayDraft): boolean {
  const workEntries = day.entries.filter((entry) => entry.kind === "WORK" && entry.content.trim());

  return workEntries.length > 0 && (workEntries.some((entry) => !entry.aiTranslation.trim()) || !day.shortVersion.trim());
}

export function hasWorkContentChange(savedDay: TimesheetDayDraft | undefined, currentDay: TimesheetDayDraft): boolean {
  if (!savedDay) {
    return false;
  }

  const savedWorkEntries = new Map(savedDay.entries.filter((entry) => entry.kind === "WORK").map((entry) => [entryKey(entry), entry]));

  return currentDay.entries.some((entry) => {
    if (entry.kind !== "WORK") {
      return false;
    }

    const savedEntry = savedWorkEntries.get(entryKey(entry));

    return !savedEntry || savedEntry.content.trim() !== entry.content.trim();
  });
}

export function isDefaultFutureVacationDraft(draft: TimesheetDayDraft | undefined): boolean {
  if (!draft) {
    return false;
  }

  const [entry] = draft.entries;

  return (
    draft.entries.length === 1 &&
    entry !== undefined &&
    entry.kind === "VACATION" &&
    entry.hours === 8 &&
    entry.vacationName === "휴가" &&
    !entry.content.trim() &&
    !entry.aiTranslation.trim() &&
    !draft.shortVersion.trim()
  );
}
