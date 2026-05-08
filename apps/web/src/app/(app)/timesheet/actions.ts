"use server";

import {
  addProject,
  createManagedUser,
  deleteTimesheetEntry,
  findLatestWorkProjectBefore,
  getManagedUser,
  listHolidays,
  listProjects,
  listTimesheetEntries,
  listVacations,
  resetHolidayCache,
  setAppSetting,
  updateManagedUser,
  saveTimesheetDay,
  type ManagedUser,
  type StoredTimesheetDraft,
  type StoredTimesheetEntry,
  type UserRole
} from "@timesheet/db";
import { redirect } from "next/navigation";

import { createSession, destroySession, getSession } from "@/server/session";

export type TimesheetMonthData = {
  entries: StoredTimesheetDraft[];
  holidays: Array<{ dateKey: string; name: string }>;
  projects: string[];
  vacations: Array<{ dateKey: string; hours: number; name: string }>;
};

export type HolidayApiKeyTestResult = {
  holidays: Array<{ dateKey: string; name: string }>;
  ok: boolean;
};

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthRange(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    endDateKey: toDateKey(year, monthIndex, lastDay),
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

async function requireAdmin() {
  const user = await requireSession();

  if (user.role !== "ADMIN") {
    throw new Error("관리자만 사용할 수 있습니다.");
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

function encodeServiceKey(serviceKey: string): string {
  return serviceKey.includes("%") ? serviceKey : encodeURIComponent(serviceKey);
}

function toDateKeyFromLocdate(locdate: number | string | undefined): string | null {
  const value = locdate?.toString();

  if (!value || !/^\d{8}$/.test(value)) {
    return null;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeHolidayItems(items: unknown): Array<{ dateName?: string; isHoliday?: string; locdate?: number | string }> {
  if (!items) {
    return [];
  }

  return Array.isArray(items) ? items : [items as { dateName?: string; isHoliday?: string; locdate?: number | string }];
}

async function fetchRestDeInfoWithKey(params: { serviceKey: string; solMonth: number; solYear: number }) {
  const serviceKey = params.serviceKey.trim();

  if (!serviceKey) {
    throw new Error("API 키를 입력해 주세요.");
  }

  const solMonth = String(params.solMonth).padStart(2, "0");
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?ServiceKey=${encodeServiceKey(serviceKey)}&solYear=${params.solYear}&solMonth=${solMonth}&numOfRows=100&_type=json`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`공휴일 정보를 불러오지 못했습니다. (${response.status})`);
  }

  const data = (await response.json()) as {
    response?: {
      body?: {
        items?: { item?: unknown };
      };
      header?: {
        resultCode?: string;
        resultMsg?: string;
      };
    };
  };

  if (data.response?.header?.resultCode && data.response.header.resultCode !== "00") {
    throw new Error(data.response.header.resultMsg || "API 키를 확인해 주세요.");
  }

  const items = normalizeHolidayItems(data.response?.body?.items?.item);

  return items.flatMap((item) => {
    if (item.isHoliday !== "Y") {
      return [];
    }

    const dateKey = toDateKeyFromLocdate(item.locdate);
    const name = item.dateName?.trim();

    return dateKey && name ? [{ dateKey, name }] : [];
  });
}

export async function loadTimesheetMonthAction(year: number, monthIndex: number): Promise<TimesheetMonthData> {
  const user = await requireSession();
  const range = getMonthRange(year, monthIndex);
  const [entries, holidays, projects, vacations] = await Promise.all([
    listTimesheetEntries({ ...range, userId: user.id }),
    listHolidays(range),
    listProjects({ userId: user.id }),
    listVacations({ ...range, userId: user.id })
  ]);

  return {
    entries: mergeLegacyVacations(entries, vacations),
    holidays,
    projects,
    vacations
  };
}

export async function saveTimesheetEntryAction(day: StoredTimesheetDraft) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  for (const entry of day.entries) {
    if (!["WORK", "VACATION", "HOLIDAY"].includes(entry.kind)) {
    throw new Error("업무 유형이 올바르지 않습니다.");
    }
  }

  return saveTimesheetDay({ day, userId: user.id });
}

export async function deleteTimesheetEntryAction(dateKey: string) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  await deleteTimesheetEntry({ dateKey, userId: user.id });
}

export async function findPreviousProjectAction(dateKey: string): Promise<string> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  return findLatestWorkProjectBefore({ beforeDateKey: dateKey, userId: user.id });
}

export async function addProjectAction(name: string) {
  const user = await requireSession();

  return addProject({ name, userId: user.id });
}

export async function resetHolidayCacheAction(year: number, monthIndex: number): Promise<TimesheetMonthData> {
  await requireAdmin();
  await resetHolidayCache({ solMonth: monthIndex + 1, solYear: year });

  return loadTimesheetMonthAction(year, monthIndex);
}

export async function saveHolidayApiKeyAction(serviceKey: string) {
  await requireAdmin();
  await setAppSetting("data_go_kr_service_key", serviceKey.trim());
}

export async function testHolidayApiKeyAction(serviceKey: string, year: number, monthIndex: number): Promise<HolidayApiKeyTestResult> {
  await requireAdmin();
  const holidays = await fetchRestDeInfoWithKey({ serviceKey, solMonth: monthIndex + 1, solYear: year });

  return {
    holidays,
    ok: true
  };
}

export async function updateProfileAction(params: { password?: string; username: string }): Promise<ManagedUser> {
  const user = await requireSession();
  const updatedUser = await updateManagedUser({ password: params.password, userId: user.id, username: params.username });

  await createSession({
    role: updatedUser.role,
    userId: updatedUser.id,
    username: updatedUser.username
  });

  return updatedUser;
}

export async function createUserAction(params: { password: string; role: UserRole; username: string }): Promise<ManagedUser> {
  await requireAdmin();

  return createManagedUser(params);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
