import { addBusinessDays } from "./date.js";
import type { VacationStatus } from "./status.js";

export type VacationYearRecord = {
  dateKey: string;
  hours: number;
  name: string;
  status: VacationStatus;
};

export type VacationYearMetrics = {
  allowanceDays: number;
  consumptionRatio: number;
  remainingDays: number;
  usedDays: number;
  usedHours: number;
};

export type VacationYearMetricSummary = {
  confirmed: VacationYearMetrics;
  withTemporary: VacationYearMetrics;
};

export type VacationYearGroup = {
  colorClass: VacationYearColorClass;
  confirmedDays: number;
  confirmedHours: number;
  dateKeys: string[];
  days: number;
  hours: number;
  name: string;
  status: VacationStatus;
  withTemporaryDays: number;
  withTemporaryHours: number;
};

export type VacationYearColorClass = "blue" | "amber" | "emerald" | "rose" | "violet" | "cyan";

const colorClasses: VacationYearColorClass[] = ["blue", "amber", "emerald", "rose", "violet", "cyan"];

function roundVacationNumber(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeVacationName(name: string): string {
  return name.trim() || "휴가";
}

export function isTemporaryVacationStatus(status: VacationStatus): boolean {
  return status === "TEMPORARY";
}

export function clampVacationFillRatio(hours: number): number {
  return Math.min(Math.max(hours / 8, 0), 1);
}

export function buildVacationYearMetrics(params: {
  allowanceDays: number;
  vacations: VacationYearRecord[];
}): VacationYearMetrics {
  const usedHours = roundVacationNumber(params.vacations.reduce((sum, vacation) => sum + vacation.hours, 0));
  const usedDays = roundVacationNumber(usedHours / 8);
  const allowanceDays = roundVacationNumber(Math.max(params.allowanceDays, 0));
  const remainingDays = roundVacationNumber(allowanceDays - usedDays);
  const consumptionRatio = allowanceDays > 0 ? roundVacationNumber(usedDays / allowanceDays) : 0;

  return {
    allowanceDays,
    consumptionRatio,
    remainingDays,
    usedDays,
    usedHours
  };
}

export function buildVacationYearMetricSummary(params: {
  allowanceDays: number;
  vacations: VacationYearRecord[];
}): VacationYearMetricSummary {
  return {
    confirmed: buildVacationYearMetrics({
      allowanceDays: params.allowanceDays,
      vacations: params.vacations.filter((vacation) => !isTemporaryVacationStatus(vacation.status))
    }),
    withTemporary: buildVacationYearMetrics(params)
  };
}

export function groupVacationRecordsByName(vacations: VacationYearRecord[]): VacationYearGroup[] {
  const groups = new Map<string, VacationYearRecord[]>();

  for (const vacation of vacations) {
    const name = normalizeVacationName(vacation.name);
    groups.set(name, [...(groups.get(name) ?? []), vacation]);
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([name, records]) => {
      const hours = roundVacationNumber(records.reduce((sum, vacation) => sum + vacation.hours, 0));
      const confirmedHours = roundVacationNumber(
        records.filter((record) => !isTemporaryVacationStatus(record.status)).reduce((sum, vacation) => sum + vacation.hours, 0)
      );
      const status: VacationStatus = records.some((record) => isTemporaryVacationStatus(record.status)) ? "TEMPORARY" : "CONFIRMED";

      return {
        confirmedDays: roundVacationNumber(confirmedHours / 8),
        confirmedHours,
        dateKeys: records.map((record) => record.dateKey).sort(),
        days: roundVacationNumber(hours / 8),
        hours,
        name,
        status,
        withTemporaryDays: roundVacationNumber(hours / 8),
        withTemporaryHours: hours
      };
    })
    .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, "ko-KR"));

  return sortedGroups.map((group, index) => {
    const colorClass = colorClasses[index % colorClasses.length]!;
    const { confirmedDays, confirmedHours, dateKeys, days, hours, name, status, withTemporaryDays, withTemporaryHours } = group;

    return {
      colorClass,
      confirmedDays,
      confirmedHours,
      dateKeys,
      days,
      hours,
      name,
      status,
      withTemporaryDays,
      withTemporaryHours
    };
  });
}

export type ConnectedVacationDatePredicateParams = {
  dateKey: string;
  getVacationStatus?: (dateKey: string) => VacationStatus | undefined;
  isSavedHolidayDate: (dateKey: string) => boolean;
  isSavedVacationOnlyDate: (dateKey: string) => boolean;
  vacationStatus?: VacationStatus;
};

function matchesConnectedVacationStatus(params: ConnectedVacationDatePredicateParams, dateKey: string): boolean {
  if (!params.isSavedVacationOnlyDate(dateKey)) {
    return false;
  }

  const targetStatus = params.vacationStatus ?? params.getVacationStatus?.(params.dateKey);

  if (!targetStatus) {
    return true;
  }

  return params.getVacationStatus?.(dateKey) === targetStatus;
}

export function findConnectedVacationDateKeysInDirection(params: ConnectedVacationDatePredicateParams & {
  direction: -1 | 1;
}): string[] {
  const dateKeys: string[] = [];
  let cursor = addBusinessDays(params.dateKey, params.direction);

  while (params.isSavedHolidayDate(cursor) || matchesConnectedVacationStatus(params, cursor)) {
    if (matchesConnectedVacationStatus(params, cursor)) {
      dateKeys.push(cursor);
    }

    cursor = addBusinessDays(cursor, params.direction);
  }

  return dateKeys;
}

export function findConnectedVacationDateKeys(params: ConnectedVacationDatePredicateParams): string[] {
  const connected = new Set<string>(matchesConnectedVacationStatus(params, params.dateKey) ? [params.dateKey] : []);

  for (const direction of [-1, 1] as const) {
    findConnectedVacationDateKeysInDirection({ ...params, direction }).forEach((dateKey) => connected.add(dateKey));
  }

  return Array.from(connected).sort();
}
