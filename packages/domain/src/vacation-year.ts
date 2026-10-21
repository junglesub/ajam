import { addBusinessDays } from "./date.js";
import type { VacationStatus } from "./status.js";
import { createEmptyEntryDraft, type TimesheetDayDraft, type TimesheetEntryDraft } from "./timesheet";

export type VacationYearRecord = {
  dateKey: string;
  deductsAllowance?: boolean;
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
  color: VacationColor;
  confirmedDays: number;
  confirmedHours: number;
  dateKeys: string[];
  days: number;
  hours: number;
  name: string;
  nonDeductingDays: number;
  nonDeductingHours: number;
  status: VacationStatus;
  withTemporaryDays: number;
  withTemporaryHours: number;
};

export const VACATION_COLOR_PRESETS = ["blue", "amber", "emerald", "rose", "violet", "cyan"] as const;

export type VacationColorPreset = (typeof VACATION_COLOR_PRESETS)[number];
export type VacationColor = VacationColorPreset | `#${string}`;

function roundVacationNumber(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeVacationName(name: string): string {
  return name.trim() || "휴가";
}

export function normalizeVacationColor(value: string): VacationColor | null {
  const color = value.trim().toLowerCase();

  if ((VACATION_COLOR_PRESETS as readonly string[]).includes(color) || /^#[0-9a-f]{6}$/.test(color)) {
    return color as VacationColor;
  }

  return null;
}

export function isTemporaryVacationStatus(status: VacationStatus): boolean {
  return status === "TEMPORARY";
}

export function isVacationAllowanceDeducted(vacation: Pick<VacationYearRecord, "deductsAllowance">): boolean {
  return vacation.deductsAllowance !== false;
}

export function clampVacationFillRatio(hours: number): number {
  return Math.min(Math.max(hours / 8, 0), 1);
}

export function buildVacationYearMetrics(params: {
  allowanceDays: number;
  vacations: VacationYearRecord[];
}): VacationYearMetrics {
  const allowanceVacations = params.vacations.filter(isVacationAllowanceDeducted);
  const usedHours = roundVacationNumber(allowanceVacations.reduce((sum, vacation) => sum + vacation.hours, 0));
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

export function groupVacationRecordsByName(
  vacations: VacationYearRecord[],
  colorPreferences: Readonly<Record<string, VacationColor>> = {}
): VacationYearGroup[] {
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
      const nonDeductingHours = roundVacationNumber(
        records.filter((record) => !isVacationAllowanceDeducted(record)).reduce((sum, vacation) => sum + vacation.hours, 0)
      );
      const status: VacationStatus = records.some((record) => isTemporaryVacationStatus(record.status)) ? "TEMPORARY" : "CONFIRMED";

      return {
        confirmedDays: roundVacationNumber(confirmedHours / 8),
        confirmedHours,
        dateKeys: records.map((record) => record.dateKey).sort(),
        days: roundVacationNumber(hours / 8),
        hours,
        name,
        nonDeductingDays: roundVacationNumber(nonDeductingHours / 8),
        nonDeductingHours,
        status,
        withTemporaryDays: roundVacationNumber(hours / 8),
        withTemporaryHours: hours
      };
    })
    .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, "ko-KR"));

  return sortedGroups.map((group, index) => {
    const { confirmedDays, confirmedHours, dateKeys, days, hours, name, nonDeductingDays, nonDeductingHours, status, withTemporaryDays, withTemporaryHours } = group;

    return {
      color: colorPreferences[normalizeVacationName(name)] ?? VACATION_COLOR_PRESETS[index % VACATION_COLOR_PRESETS.length]!,
      confirmedDays,
      confirmedHours,
      dateKeys,
      days,
      hours,
      name,
      nonDeductingDays,
      nonDeductingHours,
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

export type VacationDateInput = {
  dateKey: string;
  deductsAllowance: boolean;
  hours: number;
  matchDeductsAllowance?: boolean;
  matchName?: string;
  matchStatus?: VacationStatus;
  name: string;
  preserveHours?: boolean;
  status: VacationStatus;
};

export function isMatchingVacationEntry(
  entry: Pick<TimesheetEntryDraft, "kind" | "vacationDeductsAllowance" | "vacationName" | "vacationStatus">,
  target: { deductsAllowance?: boolean; name?: string; status?: VacationStatus }
): boolean {
  return (
    entry.kind === "VACATION" &&
    (!target.status || entry.vacationStatus === target.status) &&
    (target.name === undefined || entry.vacationName.trim() === target.name.trim()) &&
    (target.deductsAllowance === undefined || (entry.vacationDeductsAllowance !== false) === target.deductsAllowance)
  );
}

export function createVacationEntry(input: VacationDateInput, sortOrder: number): TimesheetEntryDraft {
  const entry = createEmptyEntryDraft(sortOrder);

  return {
    ...entry,
    hours: input.hours,
    kind: "VACATION",
    vacationDeductsAllowance: input.deductsAllowance,
    vacationName: input.name.trim(),
    vacationStatus: input.status
  };
}

export function replaceVacationEntries(existingDay: TimesheetDayDraft, input: VacationDateInput): TimesheetEntryDraft[] {
  const existingVacationEntries = existingDay.entries.filter((entry) => entry.kind === "VACATION");
  const matchesInputStatus = (entry: TimesheetEntryDraft) =>
    isMatchingVacationEntry(entry, {
      deductsAllowance: input.matchDeductsAllowance,
      name: input.matchName,
      status: input.matchStatus
    });
  const targetVacationEntries = existingVacationEntries.filter(matchesInputStatus);

  if (existingVacationEntries.length === 0) {
    return [...existingDay.entries, createVacationEntry(input, existingDay.entries.length)];
  }

  if (input.matchStatus && targetVacationEntries.length === 0) {
    return existingDay.entries;
  }

  if (targetVacationEntries.length === 1) {
    return existingDay.entries.map((entry) =>
      matchesInputStatus(entry)
        ? {
            ...entry,
            hours: input.preserveHours ? entry.hours : input.hours,
            vacationDeductsAllowance: input.deductsAllowance,
            vacationName: input.name.trim(),
            vacationStatus: input.status
          }
        : entry
    );
  }

  const existingTotalHours = targetVacationEntries.reduce((sum, entry) => sum + entry.hours, 0);
  let vacationIndex = 0;
  let allocatedHours = 0;

  return existingDay.entries.map((entry) => {
    if (!matchesInputStatus(entry)) {
      return entry;
    }

    const isLastVacationEntry = vacationIndex === targetVacationEntries.length - 1;
    const nextHours = isLastVacationEntry
      ? Number((input.hours - allocatedHours).toFixed(2))
      : Number((existingTotalHours > 0 ? input.hours * (entry.hours / existingTotalHours) : input.hours / targetVacationEntries.length).toFixed(2));

    vacationIndex += 1;
    allocatedHours += nextHours;

    return {
      ...entry,
      hours: input.preserveHours ? entry.hours : nextHours,
      vacationDeductsAllowance: input.deductsAllowance,
      vacationName: input.name.trim(),
      vacationStatus: input.status
    };
  });
}

export type VacationBoundary = {
  dateKey: string;
  deductsAllowance: boolean;
  endsDay: boolean;
  name: string;
  startsDay: boolean;
  status: VacationStatus;
};

export function buildVacationBoundaries(
  timesheetEntries: TimesheetDayDraft[],
  vacations: VacationYearRecord[]
): VacationBoundary[] {
  const boundariesByDate = new Map<string, VacationBoundary>();

  for (const day of timesheetEntries) {
    for (const [index, entry] of day.entries.entries()) {
      if (entry.kind !== "VACATION") {
        continue;
      }

      const name = entry.vacationName.trim();
      const status = entry.vacationStatus;
      const deductsAllowance = entry.vacationDeductsAllowance !== false;
      const key = `${day.dateKey}:${status}:${name}:${deductsAllowance}`;
      const existing = boundariesByDate.get(key);
      const startsDay = index === 0;
      const endsDay = index === day.entries.length - 1;

      if (!existing) {
        boundariesByDate.set(key, {
          dateKey: day.dateKey,
          deductsAllowance,
          endsDay,
          name,
          startsDay,
          status
        });
      } else {
        existing.startsDay = existing.startsDay || startsDay;
        existing.endsDay = existing.endsDay || endsDay;
      }
    }
  }

  for (const vacation of vacations) {
    const name = vacation.name.trim();
    const deductsAllowance = vacation.deductsAllowance !== false;
    const key = `${vacation.dateKey}:${vacation.status}:${name}:${deductsAllowance}`;

    if (!boundariesByDate.has(key)) {
      boundariesByDate.set(key, {
        dateKey: vacation.dateKey,
        deductsAllowance,
        endsDay: true,
        name,
        startsDay: true,
        status: vacation.status
      });
    }
  }

  return Array.from(boundariesByDate.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

export function deleteVacationFromDay<T extends TimesheetDayDraft>(
  day: T,
  target: { deductsAllowance?: boolean; name?: string; status?: VacationStatus }
): T {
  return {
    ...day,
    entries: day.entries.filter((entry) => !isMatchingVacationEntry(entry, target))
  };
}
