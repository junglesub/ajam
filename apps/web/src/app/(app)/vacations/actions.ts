"use server";

import {
  deleteTimesheetEntry,
  getManagedUser,
  getVacationAllowance,
  listVacationTypeColorPreferences,
  listHolidays,
  listTimesheetEntries,
  listVacations,
  renameVacationTypeForYear,
  saveTimesheetDay,
  setVacationTypeColorPreference,
  upsertVacationAllowance,
  type StoredTimesheetDraft,
  type VacationRecord
} from "@timesheet/db";
import {
  buildVacationBoundaries,
  createEmptyDraft,
  deleteVacationFromDay,
  getYearRange,
  isWeekendDateKey,
  normalizeVacationColor,
  normalizeVacationName,
  parseDateKey,
  replaceVacationEntries,
  toBrowserDateKey,
  type VacationStatus
} from "@timesheet/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { VacationDateInput, VacationWorkDay, VacationYearData } from "@/components/vacations/types";
import { destroySession, getSession } from "@/server/session";

const FULL_DAY_HOURS = 8;

async function requireSessionUser() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await getManagedUser(session.userId);

  if (!user) {
    await destroySession();
    redirect("/login");
  }

  return user;
}

function assertValidYear(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("연도가 올바르지 않습니다.");
  }
}

function assertValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || toBrowserDateKey(parseDateKey(dateKey)) !== dateKey) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  if (isWeekendDateKey(dateKey)) {
    throw new Error("휴가는 평일에만 입력할 수 있습니다.");
  }
}



async function getExistingDay(params: { dateKey: string; userId: string }): Promise<StoredTimesheetDraft> {
  const [existingDay] = await listTimesheetEntries({
    endDateKey: params.dateKey,
    startDateKey: params.dateKey,
    userId: params.userId
  });

  return existingDay ?? {
    ...createEmptyDraft(params.dateKey),
    aiRewriteRequested: false
  };
}

function isEffectivelyEmptyDay(day: StoredTimesheetDraft): boolean {
  return day.entries.length === 0 && !day.shortVersion.trim() && !day.aiRewriteRequested;
}

async function getLegacyVacationRecord(params: { dateKey: string; existingDay: StoredTimesheetDraft; userId: string }): Promise<VacationRecord | undefined> {
  const existingDay = params.existingDay;
  if (existingDay.entries.some((entry) => entry.kind === "VACATION")) {
    return undefined;
  }

  const vacations = await listVacations({
    endDateKey: params.dateKey,
    startDateKey: params.dateKey,
    userId: params.userId
  });

  return vacations.find((vacation) => vacation.dateKey === params.dateKey);
}

function matchesVacationTarget(
  vacation: VacationRecord,
  params: { deductsAllowance?: boolean; name?: string; status?: VacationStatus }
): boolean {
  return (
    (!params.status || vacation.status === params.status) &&
    (params.name === undefined || vacation.name.trim() === params.name.trim()) &&
    (params.deductsAllowance === undefined || vacation.deductsAllowance === params.deductsAllowance)
  );
}

async function loadVacationHolidays(range: { endDateKey: string; startDateKey: string }) {
  try {
    const holidays = await listHolidays(range);

    return {
      holidayWarning: undefined,
      holidays
    };
  } catch (error) {
    return {
      holidayWarning: error instanceof Error ? error.message : "공휴일 정보를 불러오지 못했습니다.",
      holidays: []
    };
  }
}

function mergeManualHolidays(
  holidays: Array<{ dateKey: string; name: string }>,
  timesheetEntries: StoredTimesheetDraft[]
): Array<{ dateKey: string; name: string }> {
  const holidaysByDate = new Map(holidays.map((holiday) => [holiday.dateKey, holiday.name]));

  for (const day of timesheetEntries) {
    const holidayEntry = day.entries.find((entry) => entry.kind === "HOLIDAY");
    const effectiveHolidayHours = holidayEntry ? (holidayEntry.hours === 0 ? FULL_DAY_HOURS : holidayEntry.hours) : 0;
    const hasManualHoliday = Boolean(day.holidayName.trim()) || effectiveHolidayHours > 0;
    const holidayName = holidayEntry?.holidayName.trim() || day.holidayName.trim() || "공휴일";

    if (hasManualHoliday) {
      holidaysByDate.set(day.dateKey, holidayName);
    }
  }

  return Array.from(holidaysByDate.entries())
    .map(([dateKey, name]) => ({ dateKey, name }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function buildWorkRecords(timesheetEntries: StoredTimesheetDraft[]): VacationWorkDay[] {
  return timesheetEntries.flatMap((day) => {
    const records = day.entries
      .filter((entry) => entry.kind === "WORK")
      .map((entry) => ({
        content: entry.content,
        hours: entry.hours,
        project: entry.project
      }));

    return records.length > 0 ? [{ dateKey: day.dateKey, records }] : [];
  });
}

function buildSavedHolidayDateKeys(timesheetEntries: StoredTimesheetDraft[]): string[] {
  return [
    ...new Set(
      timesheetEntries
        .filter((day) => day.holidayName.trim() || day.entries.some((entry) => entry.kind === "HOLIDAY"))
        .map((day) => day.dateKey)
    )
  ];
}

function buildVacationOnlyDateKeys(timesheetEntries: StoredTimesheetDraft[], vacations: VacationRecord[]): string[] {
  const timesheetEntriesByDate = new Map(timesheetEntries.map((day) => [day.dateKey, day]));
  const dateKeys = new Set(
    timesheetEntries
      .filter((day) => day.entries.length === 1 && day.entries[0]?.kind === "VACATION")
      .map((day) => day.dateKey)
  );

  for (const vacation of vacations) {
    if (!timesheetEntriesByDate.has(vacation.dateKey)) {
      dateKeys.add(vacation.dateKey);
    }
  }

  return Array.from(dateKeys).sort();
}

export async function loadVacationYearAction(year: number): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidYear(year);

  const range = getYearRange(year);
  const [allowance, colorPreferences, holidayResult, timesheetEntries, vacations] = await Promise.all([
    getVacationAllowance({ userId: user.id, year }),
    listVacationTypeColorPreferences(user.id),
    loadVacationHolidays(range),
    listTimesheetEntries({ ...range, userId: user.id }),
    listVacations({ ...range, userId: user.id })
  ]);
  const workDateKeys = [
    ...new Set(
      timesheetEntries
        .filter((day) => day.entries.some((entry) => entry.kind === "WORK"))
        .map((day) => day.dateKey)
    )
  ];
  const workRecords = buildWorkRecords(timesheetEntries);

  return {
    allowanceDays: allowance?.days ?? 0,
    colorPreferences: Object.fromEntries(colorPreferences.map((preference) => [preference.name, preference.color])),
    holidayWarning: holidayResult.holidayWarning,
    holidays: mergeManualHolidays(holidayResult.holidays, timesheetEntries),
    savedHolidayDateKeys: buildSavedHolidayDateKeys(timesheetEntries),
    vacationBoundaries: buildVacationBoundaries(timesheetEntries, vacations),
    vacations,
    vacationOnlyDateKeys: buildVacationOnlyDateKeys(timesheetEntries, vacations),
    workDateKeys,
    workRecords
  };
}

export async function saveVacationTypeColorAction(year: number, name: string, color: string | null): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidYear(year);

  if (!name.trim()) {
    throw new Error("휴가 유형 이름을 확인해 주세요.");
  }

  const normalizedColor = color === null ? null : normalizeVacationColor(color);
  if (color !== null && !normalizedColor) {
    throw new Error("휴가 유형 색상을 확인해 주세요.");
  }

  await setVacationTypeColorPreference({ color: normalizedColor, name, userId: user.id });
  revalidatePath("/vacations");

  return loadVacationYearAction(year);
}

export async function saveVacationTypeNameAction(year: number, oldName: string, newName: string): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidYear(year);

  const name = newName.trim();
  if (!name) {
    throw new Error("휴가 유형 이름을 확인해 주세요.");
  }

  if (normalizeVacationName(oldName) === name) {
    return loadVacationYearAction(year);
  }

  const changed = await renameVacationTypeForYear({
    ...getYearRange(year),
    newName: name,
    oldName,
    userId: user.id
  });
  if (changed === 0) {
    throw new Error("변경할 휴가를 찾지 못했습니다.");
  }

  revalidatePath("/timesheet");
  revalidatePath("/vacations");

  return loadVacationYearAction(year);
}

export async function saveVacationAllowanceAction(year: number, days: number): Promise<number> {
  const user = await requireSessionUser();
  assertValidYear(year);

  if (!Number.isFinite(days) || days < 0 || days > 366) {
    throw new Error("연차 개수가 올바르지 않습니다.");
  }

  const allowance = await upsertVacationAllowance({
    days,
    userId: user.id,
    year
  });

  revalidatePath("/vacations");

  return allowance.days;
}

export async function saveVacationDateAction(input: VacationDateInput): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidDateKey(input.dateKey);

  if (!Number.isFinite(input.hours) || input.hours < 0 || input.hours > 24) {
    throw new Error("휴가 시간이 올바르지 않습니다.");
  }

  const existingDay = await getExistingDay({ dateKey: input.dateKey, userId: user.id });
  const hasExistingVacation = existingDay.entries.some((entry) => entry.kind === "VACATION");
  const legacyVacation = hasExistingVacation ? undefined : await getLegacyVacationRecord({ dateKey: input.dateKey, existingDay, userId: user.id });

  if (!hasExistingVacation && existingDay.entries.some((entry) => entry.kind === "WORK")) {
    throw new Error("업무 기록이 있는 날짜에는 먼저 업무 기록을 삭제해야 휴가를 추가할 수 있습니다.");
  }

  if (legacyVacation && !matchesVacationTarget(legacyVacation, { deductsAllowance: input.matchDeductsAllowance, name: input.matchName, status: input.matchStatus })) {
    return loadVacationYearAction(Number(input.dateKey.slice(0, 4)));
  }

  const vacationInput: VacationDateInput =
    legacyVacation && input.preserveHours
      ? {
          ...input,
          hours: legacyVacation.hours
        }
      : input;
  const day: StoredTimesheetDraft = {
    ...existingDay,
    entries: replaceVacationEntries(existingDay, vacationInput)
  };

  await saveTimesheetDay({
    day,
    userId: user.id
  });

  revalidatePath("/timesheet");
  revalidatePath("/vacations");

  return loadVacationYearAction(Number(input.dateKey.slice(0, 4)));
}

export async function deleteVacationWorkDateAction(dateKey: string): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidDateKey(dateKey);

  const existingDay = await getExistingDay({ dateKey, userId: user.id });
  const day: StoredTimesheetDraft = {
    ...existingDay,
    entries: existingDay.entries.filter((entry) => entry.kind !== "WORK")
  };

  if (isEffectivelyEmptyDay(day)) {
    await deleteTimesheetEntry({ dateKey, userId: user.id });
  } else {
    await saveTimesheetDay({
      day,
      userId: user.id
    });
  }

  revalidatePath("/timesheet");
  revalidatePath("/vacations");

  return loadVacationYearAction(Number(dateKey.slice(0, 4)));
}

export async function deleteVacationDateAction(
  dateKey: string,
  status: VacationStatus,
  name: string,
  deductsAllowance?: boolean
): Promise<VacationYearData> {
  const user = await requireSessionUser();
  assertValidDateKey(dateKey);

  const existingDay = await getExistingDay({ dateKey, userId: user.id });
  const hasExistingVacation = existingDay.entries.some((entry) => entry.kind === "VACATION");
  const legacyVacation = hasExistingVacation ? undefined : await getLegacyVacationRecord({ dateKey, existingDay, userId: user.id });

  if (legacyVacation && !matchesVacationTarget(legacyVacation, { deductsAllowance, name, status })) {
    return loadVacationYearAction(Number(dateKey.slice(0, 4)));
  }

  const day: StoredTimesheetDraft = deleteVacationFromDay(existingDay, { deductsAllowance, name, status });

  if (isEffectivelyEmptyDay(day)) {
    await deleteTimesheetEntry({ dateKey, userId: user.id });
  } else {
    await saveTimesheetDay({
      day,
      userId: user.id
    });
  }

  revalidatePath("/timesheet");
  revalidatePath("/vacations");

  return loadVacationYearAction(Number(dateKey.slice(0, 4)));
}
