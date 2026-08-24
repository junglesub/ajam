import type { TimesheetDayDraft, TimesheetEntryDraft } from "@timesheet/domain";

const fullDayHours = 8;

export function firstWorkEntry(day: TimesheetDayDraft): TimesheetEntryDraft | undefined {
  return day.entries.find((entry) => entry.kind === "WORK");
}

export function effectiveEntryHours(entry: TimesheetEntryDraft): number {
  return entry.kind === "HOLIDAY" && entry.hours === 0 ? fullDayHours : entry.hours;
}

export function listRowKey(dateKey: string, entryClientId: string): string {
  return `${dateKey}:${entryClientId}`;
}

export function entryTitle(entry: TimesheetEntryDraft): string {
  if (entry.kind === "VACATION") {
    return entry.vacationName || "휴가";
  }

  if (entry.kind === "HOLIDAY") {
    return entry.holidayName || "공휴일";
  }

  return entry.project;
}

export function entryKindLabel(entry: TimesheetEntryDraft): string {
  if (entry.kind === "VACATION") {
    if (entry.vacationStatus === "TEMPORARY") {
      return "임시";
    }

    return "휴가";
  }

  if (entry.kind === "HOLIDAY") {
    return "공휴일";
  }

  return "업무";
}

export function entryKindTone(entry: TimesheetEntryDraft) {
  if (entry.kind === "VACATION") {
    return "blue";
  }

  if (entry.kind === "HOLIDAY") {
    return "orange";
  }

  return "green";
}