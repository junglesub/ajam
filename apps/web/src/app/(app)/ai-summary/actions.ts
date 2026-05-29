"use server";

import {
  getMonthlyAiSummaryPatches,
  buildMonthlyAiSummaryExport,
  validateMonthlyAiSummaryImport,
  type MonthlyAiSummaryPayload
} from "@timesheet/domain";
import {
  getManagedUser,
  listHolidays,
  listProjects,
  listTimesheetEntries,
  listVacations,
  saveTimesheetDay,
  type StoredTimesheetDraft,
  type StoredTimesheetEntry
} from "@timesheet/db";
import { redirect } from "next/navigation";

import { destroySession, getSession } from "@/server/session";

export type MonthlyAiSummaryLoadResult = {
  payload: MonthlyAiSummaryPayload;
  projects: string[];
};

export type MonthlyAiSummaryApplyResult = {
  appliedDateKeys: string[];
};

type MonthData = {
  days: StoredTimesheetDraft[];
  month: string;
  projects: string[];
};

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthRange(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    endDateKey: toDateKey(year, monthIndex, lastDay),
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    startDateKey: toDateKey(year, monthIndex, 1)
  };
}

async function requireSession() {
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

function mergeLegacyVacations(entries: StoredTimesheetDraft[], vacations: Array<{ dateKey: string; hours: number; name: string }>): StoredTimesheetDraft[] {
  const days = new Map(entries.map((entry) => [entry.dateKey, { ...entry, entries: [...entry.entries] }]));

  for (const vacation of vacations) {
    const day = days.get(vacation.dateKey) ?? {
      dateKey: vacation.dateKey,
      entries: [],
      holidayName: "",
      shortVersion: ""
    };

    if (day.entries.some((entry) => entry.kind === "VACATION")) {
      days.set(vacation.dateKey, day);
      continue;
    }

    const vacationEntry: StoredTimesheetEntry = {
      aiTranslation: "",
      clientId: `legacy-vacation-${vacation.dateKey}`,
      content: "",
      holidayName: "",
      hours: vacation.hours,
      id: "",
      kind: "VACATION",
      project: "",
      sortOrder: day.entries.length,
      vacationName: vacation.name
    };

    day.entries.push(vacationEntry);
    days.set(vacation.dateKey, day);
  }

  return Array.from(days.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

async function loadMonthData(params: { monthIndex: number; userId: string; year: number }): Promise<MonthData> {
  const range = getMonthRange(params.year, params.monthIndex);
  const [entries, holidays, projects, vacations] = await Promise.all([
    listTimesheetEntries({ endDateKey: range.endDateKey, startDateKey: range.startDateKey, userId: params.userId }),
    listHolidays({ endDateKey: range.endDateKey, startDateKey: range.startDateKey }).catch(() => []),
    listProjects({ userId: params.userId }),
    listVacations({ endDateKey: range.endDateKey, startDateKey: range.startDateKey, userId: params.userId })
  ]);
  const daysByDate = new Map(mergeLegacyVacations(entries, vacations).map((day) => [day.dateKey, day]));

  for (const holiday of holidays) {
    const day = daysByDate.get(holiday.dateKey) ?? {
      dateKey: holiday.dateKey,
      entries: [],
      holidayName: holiday.name,
      shortVersion: ""
    };

    daysByDate.set(holiday.dateKey, {
      ...day,
      holidayName: day.holidayName || holiday.name
    });
  }

  return {
    days: Array.from(daysByDate.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey)),
    month: range.month,
    projects
  };
}

export async function loadMonthlyAiSummaryAction(year: number, monthIndex: number): Promise<MonthlyAiSummaryLoadResult> {
  const user = await requireSession();
  const { days, month, projects } = await loadMonthData({ monthIndex, userId: user.id, year });

  return {
    payload: buildMonthlyAiSummaryExport({ days, month }),
    projects
  };
}

export async function applyMonthlyAiSummaryAction(params: {
  imported: MonthlyAiSummaryPayload;
  monthIndex: number;
  year: number;
}): Promise<MonthlyAiSummaryApplyResult> {
  const user = await requireSession();
  const { days, month } = await loadMonthData({ monthIndex: params.monthIndex, userId: user.id, year: params.year });
  const baseline = buildMonthlyAiSummaryExport({ days, month });
  const validation = validateMonthlyAiSummaryImport({ baseline, imported: params.imported });

  if (validation.errors.length > 0) {
    throw new Error(validation.errors[0]);
  }

  const patches = getMonthlyAiSummaryPatches({ baseline, imported: params.imported });
  const daysByDate = new Map(days.map((day) => [day.dateKey, day]));

  for (const patch of patches) {
    const day = daysByDate.get(patch.dateKey);

    if (!day) {
      throw new Error(`${patch.dateKey} 기록을 찾을 수 없습니다.`);
    }

    await saveTimesheetDay({
      day: {
        ...day,
        shortVersion: patch.shortVersion,
        entries: day.entries.map((entry) => {
          const patchedEntry = patch.entries.find((candidate) => candidate.id === (entry.id || entry.clientId));

          return patchedEntry ? { ...entry, aiTranslation: patchedEntry.aiTranslation } : entry;
        })
      },
      userId: user.id
    });
  }

  return {
    appliedDateKeys: patches.map((patch) => patch.dateKey)
  };
}
