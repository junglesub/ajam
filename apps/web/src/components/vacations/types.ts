import type { VacationStatus, VacationYearRecord } from "@timesheet/domain";

export type VacationDateInput = {
  dateKey: string;
  hours: number;
  matchName?: string;
  matchStatus?: VacationStatus;
  name: string;
  preserveHours?: boolean;
  status: VacationStatus;
};

export type VacationWorkRecord = {
  content: string;
  hours: number;
  project: string;
};

export type VacationWorkDay = {
  dateKey: string;
  records: VacationWorkRecord[];
};

export type VacationBoundary = {
  dateKey: string;
  endsDay: boolean;
  name: string;
  startsDay: boolean;
  status: VacationStatus;
};

export type VacationYearData = {
  allowanceDays: number;
  holidayWarning?: string;
  holidays: Array<{ dateKey: string; name: string }>;
  savedHolidayDateKeys: string[];
  vacationBoundaries: VacationBoundary[];
  vacations: VacationYearRecord[];
  vacationOnlyDateKeys: string[];
  workDateKeys: string[];
  workRecords: VacationWorkDay[];
};
