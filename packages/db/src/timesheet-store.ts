import { randomUUID } from "node:crypto";

import { prisma } from "./client";
import { ensureApplicationSchema, getAppSetting } from "./settings-store";

export type StoredTimesheetDraft = {
  aiTranslation: string;
  content: string;
  dateKey: string;
  holidayName: string;
  hours: number;
  kind: "WORK" | "VACATION" | "HOLIDAY";
  project: string;
  shortVersion: string;
  vacationName: string;
};

export type HolidayRecord = {
  dateKey: string;
  name: string;
};

export type VacationRecord = {
  dateKey: string;
  hours: number;
  name: string;
};

type TimesheetEntryRow = StoredTimesheetDraft & {
  userId: string;
};

type HolidayRow = {
  dateKey: string;
  name: string;
};

type VacationRow = {
  dateKey: string;
  hours: number;
  name: string;
};

type ProjectRow = {
  name: string;
};

type HolidayFetchLogRow = {
  fetchedAt: string;
};

type DataGoKrHolidayItem = {
  dateName?: string;
  isHoliday?: string;
  locdate?: number | string;
};

let schemaReady = false;

function normalizeDraft(entry: StoredTimesheetDraft): StoredTimesheetDraft {
  return {
    aiTranslation: entry.aiTranslation.trim(),
    content: entry.content.trim(),
    dateKey: entry.dateKey,
    holidayName: entry.holidayName.trim(),
    hours: Number.isFinite(entry.hours) ? entry.hours : 0,
    kind: entry.kind,
    project: entry.project.trim(),
    shortVersion: entry.shortVersion.trim(),
    vacationName: entry.vacationName.trim()
  };
}

export async function ensureTimesheetSchema() {
  if (schemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimesheetEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "project" TEXT NOT NULL DEFAULT '',
    "hours" REAL NOT NULL DEFAULT 8,
    "content" TEXT NOT NULL DEFAULT '',
    "aiTranslation" TEXT NOT NULL DEFAULT '',
    "shortVersion" TEXT NOT NULL DEFAULT '',
    "vacationName" TEXT NOT NULL DEFAULT '',
    "holidayName" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TimesheetEntry_userId_dateKey_key" ON "TimesheetEntry"("userId", "dateKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimesheetEntry_dateKey_idx" ON "TimesheetEntry"("dateKey")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'data-go-kr',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_dateKey_key" ON "Holiday"("dateKey")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Vacation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hours" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vacation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Vacation_userId_dateKey_key" ON "Vacation"("userId", "dateKey")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Project_userId_name_key" ON "Project"("userId", "name")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "HolidayFetchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solYear" INTEGER NOT NULL,
    "solMonth" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'data-go-kr',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "HolidayFetchLog_solYear_solMonth_source_key" ON "HolidayFetchLog"("solYear", "solMonth", "source")`);

  schemaReady = true;
}

export async function listTimesheetEntries(params: { endDateKey: string; startDateKey: string; userId: string }) {
  await ensureTimesheetSchema();

  return prisma.$queryRawUnsafe<TimesheetEntryRow[]>(
    `SELECT "userId", "dateKey", "kind", "project", "hours", "content", "aiTranslation", "shortVersion", "vacationName", "holidayName"
     FROM "TimesheetEntry"
     WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?
     ORDER BY "dateKey" ASC`,
    params.userId,
    params.startDateKey,
    params.endDateKey
  );
}

async function getDataGoKrServiceKey(): Promise<string | null> {
  await ensureApplicationSchema();

  const key = (await getAppSetting("data_go_kr_service_key"))?.trim();

  return key || null;
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

function normalizeHolidayItems(items: unknown): DataGoKrHolidayItem[] {
  if (!items) {
    return [];
  }

  if (Array.isArray(items)) {
    return items as DataGoKrHolidayItem[];
  }

  return [items as DataGoKrHolidayItem];
}

async function fetchRestDeInfo(params: { solMonth: number; solYear: number }): Promise<HolidayRecord[]> {
  const serviceKey = await getDataGoKrServiceKey();

  if (!serviceKey) {
    return [];
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
    };
  };
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

function getMonthKeysBetween(startDateKey: string, endDateKey: string) {
  const months: Array<{ solMonth: number; solYear: number }> = [];
  const cursor = new Date(Number(startDateKey.slice(0, 4)), Number(startDateKey.slice(5, 7)) - 1, 1);
  const end = new Date(Number(endDateKey.slice(0, 4)), Number(endDateKey.slice(5, 7)) - 1, 1);

  while (cursor <= end) {
    months.push({
      solMonth: cursor.getMonth() + 1,
      solYear: cursor.getFullYear()
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

async function ensureHolidayMonthFetched(params: { solMonth: number; solYear: number }) {
  const existing = await prisma.$queryRawUnsafe<HolidayFetchLogRow[]>(
    `SELECT "fetchedAt" FROM "HolidayFetchLog" WHERE "solYear" = ? AND "solMonth" = ? AND "source" = 'data-go-kr' LIMIT 1`,
    params.solYear,
    params.solMonth
  );

  if (existing.length > 0) {
    return;
  }

  const serviceKey = await getDataGoKrServiceKey();

  if (!serviceKey) {
    return;
  }

  const holidays = await fetchRestDeInfo(params);

  for (const holiday of holidays) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Holiday" ("id", "dateKey", "name", "source", "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'data-go-kr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT("dateKey") DO UPDATE SET "name" = excluded."name", "source" = 'data-go-kr', "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      holiday.dateKey,
      holiday.name
    );
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "HolidayFetchLog" ("id", "solYear", "solMonth", "source", "fetchedAt")
     VALUES (?, ?, ?, 'data-go-kr', CURRENT_TIMESTAMP)
     ON CONFLICT("solYear", "solMonth", "source") DO UPDATE SET "fetchedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.solYear,
    params.solMonth
  );
}

export async function resetHolidayCache(params?: { solMonth?: number; solYear?: number }) {
  await ensureTimesheetSchema();

  if (params?.solYear && params.solMonth) {
    const prefix = `${params.solYear}-${String(params.solMonth).padStart(2, "0")}`;

    await prisma.$executeRawUnsafe(`DELETE FROM "Holiday" WHERE "source" = 'data-go-kr' AND "dateKey" LIKE ?`, `${prefix}-%`);
    await prisma.$executeRawUnsafe(`DELETE FROM "HolidayFetchLog" WHERE "source" = 'data-go-kr' AND "solYear" = ? AND "solMonth" = ?`, params.solYear, params.solMonth);
    return;
  }

  if (params?.solYear) {
    await prisma.$executeRawUnsafe(`DELETE FROM "Holiday" WHERE "source" = 'data-go-kr' AND "dateKey" LIKE ?`, `${params.solYear}-%`);
    await prisma.$executeRawUnsafe(`DELETE FROM "HolidayFetchLog" WHERE "source" = 'data-go-kr' AND "solYear" = ?`, params.solYear);
    return;
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "Holiday" WHERE "source" = 'data-go-kr'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "HolidayFetchLog" WHERE "source" = 'data-go-kr'`);
}

export async function listHolidays(params: { endDateKey: string; startDateKey: string }) {
  await ensureTimesheetSchema();

  for (const month of getMonthKeysBetween(params.startDateKey, params.endDateKey)) {
    await ensureHolidayMonthFetched(month);
  }

  return prisma.$queryRawUnsafe<HolidayRow[]>(
    `SELECT "dateKey", "name" FROM "Holiday" WHERE "dateKey" BETWEEN ? AND ? ORDER BY "dateKey" ASC`,
    params.startDateKey,
    params.endDateKey
  );
}

export async function listVacations(params: { endDateKey: string; startDateKey: string; userId: string }) {
  await ensureTimesheetSchema();

  return prisma.$queryRawUnsafe<VacationRow[]>(
    `SELECT "dateKey", "name", "hours" FROM "Vacation" WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ? ORDER BY "dateKey" ASC`,
    params.userId,
    params.startDateKey,
    params.endDateKey
  );
}

export async function upsertTimesheetEntry(params: { entry: StoredTimesheetDraft; userId: string }) {
  await ensureTimesheetSchema();

  const entry = normalizeDraft(params.entry);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "TimesheetEntry" ("id", "userId", "dateKey", "kind", "project", "hours", "content", "aiTranslation", "shortVersion", "vacationName", "holidayName", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "dateKey") DO UPDATE SET
       "kind" = excluded."kind",
       "project" = excluded."project",
       "hours" = excluded."hours",
       "content" = excluded."content",
       "aiTranslation" = excluded."aiTranslation",
       "shortVersion" = excluded."shortVersion",
       "vacationName" = excluded."vacationName",
       "holidayName" = excluded."holidayName",
       "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    entry.dateKey,
    entry.kind,
    entry.project,
    entry.hours,
    entry.content,
    entry.aiTranslation,
    entry.shortVersion,
    entry.vacationName,
    entry.holidayName
  );

  if (entry.kind === "VACATION") {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Vacation" ("id", "userId", "dateKey", "name", "hours", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT("userId", "dateKey") DO UPDATE SET "name" = excluded."name", "hours" = excluded."hours", "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      params.userId,
      entry.dateKey,
      entry.vacationName || entry.content || "휴가",
      entry.hours
    );
  } else {
    await prisma.$executeRawUnsafe(`DELETE FROM "Vacation" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, entry.dateKey);
  }

  return entry;
}

export async function deleteTimesheetEntry(params: { dateKey: string; userId: string }) {
  await ensureTimesheetSchema();

  await prisma.$executeRawUnsafe(`DELETE FROM "TimesheetEntry" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.dateKey);
  await prisma.$executeRawUnsafe(`DELETE FROM "Vacation" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.dateKey);
}

export async function addProject(params: { name: string; userId: string }) {
  await ensureTimesheetSchema();

  const name = params.name.trim();

  if (!name) {
    throw new Error("프로젝트명을 입력해 주세요.");
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Project" ("id", "userId", "name", "createdAt", "updatedAt")
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "name") DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    name
  );

  return name;
}

export async function listProjects(params: { userId: string }) {
  await ensureTimesheetSchema();

  const projects = await prisma.$queryRawUnsafe<ProjectRow[]>(
    `SELECT "name" FROM "Project" WHERE "userId" = ? ORDER BY "name" ASC`,
    params.userId
  );

  return projects.map((project) => project.name);
}
