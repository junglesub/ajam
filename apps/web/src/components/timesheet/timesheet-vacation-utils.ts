import { isMatchingVacationEntry, type TimesheetDayDraft, type VacationStatus } from "@timesheet/domain";
import { addBusinessDays } from "./timesheet-date-utils";

export function getVacationBoundary(day: TimesheetDayDraft | undefined, status?: VacationStatus, name?: string) {
  const index = day?.entries.findIndex((entry) => isMatchingVacationEntry(entry, { status, name })) ?? -1;
  return !day || index < 0 ? null : { startsDay: index === 0, endsDay: index === day.entries.length - 1 };
}

export function findConnectedVacationDates(
  dateKey: string,
  direction: -1 | 1,
  getDay: (key: string) => TimesheetDayDraft | undefined,
  isHoliday: (key: string) => boolean,
  status?: VacationStatus,
  name?: string
): string[] {
  const dates: string[] = [];
  let cursor = addBusinessDays(dateKey, direction);
  while (true) {
    if (isHoliday(cursor)) {
      cursor = addBusinessDays(cursor, direction);
      continue;
    }
    const boundary = getVacationBoundary(getDay(cursor), status, name);
    if (!boundary || !(direction === 1 ? boundary.startsDay : boundary.endsDay)) break;
    dates.push(cursor);
    if (!(direction === 1 ? boundary.endsDay : boundary.startsDay)) break;
    cursor = addBusinessDays(cursor, direction);
  }
  return dates;
}

export function updateVacationEntryForConnectedSave(
  day: TimesheetDayDraft,
  vacationName: string,
  matchName: string,
  matchStatus: VacationStatus,
  vacationStatus: VacationStatus
): TimesheetDayDraft {
  return {
    ...day,
    entries: day.entries.map((entry) =>
      isMatchingVacationEntry(entry, { name: matchName, status: matchStatus })
        ? { ...entry, vacationName, vacationStatus }
        : entry
    )
  };
}
