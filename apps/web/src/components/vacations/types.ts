import type { VacationBoundary, VacationColor, VacationDateInput, VacationYearRecord } from "@timesheet/domain";

export type { VacationBoundary, VacationDateInput };

export type VacationWorkRecord = {
  content: string;
  hours: number;
  project: string;
};

export type VacationWorkDay = {
  dateKey: string;
  records: VacationWorkRecord[];
};

export type VacationYearData = {
  allowanceDays: number;
  holidayWarning?: string;
  holidays: Array<{ dateKey: string; name: string }>;
  savedHolidayDateKeys: string[];
  vacationBoundaries: VacationBoundary[];
  colorPreferences: Record<string, VacationColor>;
  vacations: VacationYearRecord[];
  vacationOnlyDateKeys: string[];
  workDateKeys: string[];
  workRecords: VacationWorkDay[];
};
