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

export function toHourCents(value: number): number {
  return Math.round(value * 100);
}

export function toHoursFromCents(value: number): number {
  return value / 100;
}

export function getNotionAllocationError(entry: TimesheetEntryDraft): string {
  if (entry.kind !== "WORK" || entry.notionCards.length === 0) {
    return "";
  }

  if (!Number.isFinite(entry.hours) || entry.hours < 0) {
    return "업무 시간이 올바르지 않습니다.";
  }

  if (entry.notionCards.some((link) => !Number.isFinite(link.allocatedHours) || link.allocatedHours < 0)) {
    return "카드 배분 시간이 올바르지 않습니다.";
  }

  const entryHourCents = toHourCents(entry.hours);
  const allocatedHourCents = entry.notionCards.reduce((sum, link) => sum + toHourCents(link.allocatedHours), 0);

  if (allocatedHourCents === entryHourCents) {
    return "";
  }

  return `배분 합계 ${toHoursFromCents(allocatedHourCents)}h / 업무 ${toHoursFromCents(entryHourCents)}h`;
}

export function entryHasNotionCardWarning(entry: TimesheetEntryDraft, isSaved: boolean): boolean {
  if (entry.kind !== "WORK") {
    return false;
  }

  return (isSaved && entry.notionCards.length === 0) || Boolean(getNotionAllocationError(entry));
}