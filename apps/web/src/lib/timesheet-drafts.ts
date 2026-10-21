import { createVacationDay } from "@timesheet/domain/timesheet";
import type { TimesheetDayDraft, TimesheetEntryDraft, VacationStatus } from "@timesheet/domain";

export function createClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function withClientIds<T extends TimesheetDayDraft>(day: T): T {
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

export function createFutureDraftForDate(
  dateKey: string,
  vacationName = "휴가",
  hours = 8,
  vacationStatus: VacationStatus = "CONFIRMED",
  vacationDeductsAllowance = true
): TimesheetDayDraft {
  return withClientIds(createVacationDay(dateKey, vacationName, hours, vacationStatus, vacationDeductsAllowance));
}

export function extractVacationRangeInitialState(selectedEntry?: TimesheetEntryDraft | null): {
  hours: number;
  vacationDeductsAllowance: boolean;
  vacationName: string;
  vacationStatus: VacationStatus;
} {
  const isVacation = selectedEntry?.kind === "VACATION";

  return {
    hours: isVacation ? selectedEntry.hours || 8 : 8,
    vacationDeductsAllowance: isVacation ? selectedEntry.vacationDeductsAllowance !== false : true,
    vacationName: isVacation ? selectedEntry.vacationName : "",
    vacationStatus: isVacation ? selectedEntry.vacationStatus : "CONFIRMED"
  };
}
