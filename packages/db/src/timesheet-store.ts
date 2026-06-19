import { randomUUID } from "node:crypto";

import { allocateNotionCardHours, type TimesheetEntryNotionCardDraft } from "@timesheet/domain";

import { prisma } from "./client";
import { ensureNotionSchema } from "./notion-store";
import { ensureApplicationSchema, getAppSetting } from "./settings-store";

export type StoredTimesheetEntry = {
  aiTranslation: string;
  clientId: string;
  content: string;
  holidayName: string;
  hours: number;
  id: string;
  kind: "WORK" | "VACATION" | "HOLIDAY";
  notionCards: TimesheetEntryNotionCardDraft[];
  project: string;
  sortOrder: number;
  vacationName: string;
};

export type StoredTimesheetDay = {
  aiRewriteRequested: boolean;
  dateKey: string;
  entries: StoredTimesheetEntry[];
  holidayName: string;
  shortVersion: string;
};

export type StoredTimesheetDraft = StoredTimesheetDay;

export type HolidayRecord = {
  dateKey: string;
  name: string;
};

export type VacationRecord = {
  dateKey: string;
  hours: number;
  name: string;
};

export type TimesheetAiRewriteRequest = {
  cleanupType: "fill_missing" | "rewrite";
  dateKey: string;
  entryCount: number;
  previewContent: string;
  rewriteRequested: boolean;
  shortVersion: string;
};

type TimesheetEntryRow = {
  aiTranslation: string;
  clientId: string;
  content: string;
  dateKey: string;
  holidayName: string;
  hours: number;
  id: string;
  kind: "WORK" | "VACATION" | "HOLIDAY";
  project: string;
  sortOrder: number;
  userId: string;
  vacationName: string;
};

type TimesheetDayRow = {
  aiRewriteRequested: number;
  dateKey: string;
  shortVersion: string;
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

export type ProjectSummary = {
  entryCount: number;
  latestDateKey: string | null;
  name: string;
  totalHours: number;
};

type ProjectSummaryRow = {
  entryCount: number | bigint | null;
  latestDateKey: string | null;
  name: string;
  totalHours: number | null;
};

type TimesheetAiRewriteRequestRow = {
  dateKey: string;
  entryCount: number | bigint | null;
  missingTranslationCount: number | bigint | null;
  previewContent: string | null;
  rewriteRequested: number;
  shortVersion: string;
};

type WorkEntryNotionCardRow = TimesheetEntryNotionCardDraft & {
  timesheetEntryId: string;
};

type TimesheetTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type HolidayFetchLogRow = {
  fetchedAt: string;
};

type TableInfoRow = {
  name: string;
};

type DataGoKrHolidayItem = {
  dateName?: string;
  isHoliday?: string;
  locdate?: number | string;
};

type TimesheetAiSummaryBaselineEntry = Pick<StoredTimesheetEntry, "aiTranslation" | "clientId" | "id" | "kind">;

type TimesheetAiSummaryBaselineDay = {
  dateKey: string;
  entries: TimesheetAiSummaryBaselineEntry[];
  shortVersion: string;
};

type TimesheetAiSummaryPatch = {
  dateKey: string;
  entries: Array<{ aiTranslation: string; id: string }>;
  shortVersion: string;
};

let schemaReady = false;

function normalizeEntry(entry: StoredTimesheetEntry, sortOrder: number): StoredTimesheetEntry {
  const kind = entry.kind;
  const isWork = kind === "WORK";
  const isVacation = kind === "VACATION";
  const isHoliday = kind === "HOLIDAY";
  const hours = normalizeHours(entry.hours);
  const notionCards = isWork
    ? allocateNotionCardHours({
        entryHours: hours,
        links: normalizeNotionCards(entry.notionCards)
      })
    : [];

  return {
    aiTranslation: isWork ? entry.aiTranslation.trim() : "",
    clientId: entry.clientId || entry.id || randomUUID(),
    content: isWork ? entry.content.trim() : "",
    holidayName: isHoliday ? entry.holidayName.trim() : "",
    hours,
    id: entry.id.trim(),
    kind,
    notionCards,
    project: isWork ? entry.project.trim() : "",
    sortOrder,
    vacationName: isVacation ? entry.vacationName.trim() : ""
  };
}

function normalizeHours(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeNotionCardSource(source: string | undefined): TimesheetEntryNotionCardDraft["source"] {
  if (source === "previous_business_day_default" || source === "weekday_default") {
    return source;
  }

  return "manual";
}

function normalizeNotionCards(links: TimesheetEntryNotionCardDraft[] | undefined): TimesheetEntryNotionCardDraft[] {
  return (links ?? [])
    .map((link): TimesheetEntryNotionCardDraft => ({
      allocatedHours: Number.isFinite(link.allocatedHours) ? link.allocatedHours : 0,
      allocationMode: link.allocationMode === "manual" ? "manual" : "auto",
      category: link.category?.trim() ?? "",
      endDate: link.endDate?.trim() ?? "",
      notionPageId: link.notionPageId.trim(),
      source: normalizeNotionCardSource(link.source),
      startDate: link.startDate?.trim() ?? "",
      status: link.status?.trim() ?? "",
      title: link.title?.trim() ?? ""
    }))
    .filter((link) => link.notionPageId);
}

function normalizeDay(day: StoredTimesheetDay): StoredTimesheetDay {
  const hasWork = day.entries.some((entry) => entry.kind === "WORK");

  return {
    aiRewriteRequested: hasWork ? Boolean(day.aiRewriteRequested) : false,
    dateKey: day.dateKey,
    entries: day.entries.map((entry, index) => normalizeEntry(entry, index)),
    holidayName: day.holidayName.trim(),
    shortVersion: day.shortVersion.trim()
  };
}

async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<TableInfoRow[]>(`PRAGMA table_info("${tableName}")`);
  return rows.some((row) => row.name === columnName);
}

async function migrateTimesheetDaySummaries() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "createdAt", "updatedAt")
    SELECT lower(hex(randomblob(16))), "userId", "dateKey", max("shortVersion"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "TimesheetEntry"
    WHERE trim("shortVersion") <> ''
    GROUP BY "userId", "dateKey"
    ON CONFLICT("userId", "dateKey") DO UPDATE SET
      "shortVersion" = CASE
        WHEN trim("TimesheetDay"."shortVersion") = '' THEN excluded."shortVersion"
        ELSE "TimesheetDay"."shortVersion"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

export async function ensureTimesheetSchema() {
  if (schemaReady) {
    return;
  }

  await ensureApplicationSchema();
  await ensureNotionSchema();

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
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  if (!(await hasColumn("TimesheetEntry", "sortOrder"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "TimesheetEntry" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0`);
  }
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "TimesheetEntry_userId_dateKey_key"`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimesheetEntry_userId_dateKey_idx" ON "TimesheetEntry"("userId", "dateKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimesheetEntry_dateKey_idx" ON "TimesheetEntry"("dateKey")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimesheetDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "shortVersion" TEXT NOT NULL DEFAULT '',
    "aiRewriteRequested" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  if (!(await hasColumn("TimesheetDay", "aiRewriteRequested"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "TimesheetDay" ADD COLUMN "aiRewriteRequested" INTEGER NOT NULL DEFAULT 0`);
  }
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TimesheetDay_userId_dateKey_key" ON "TimesheetDay"("userId", "dateKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimesheetDay_dateKey_idx" ON "TimesheetDay"("dateKey")`);
  await migrateTimesheetDaySummaries();

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

async function listEntryNotionCards(params: {
  entryIds: string[];
  userId: string;
}): Promise<Map<string, TimesheetEntryNotionCardDraft[]>> {
  if (params.entryIds.length === 0) {
    return new Map();
  }

  const entryIdPlaceholders = params.entryIds.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<WorkEntryNotionCardRow[]>(
    `SELECT link."timesheetEntryId", link."notionPageId", link."allocatedHours", link."allocationMode", link."source",
            coalesce(cache."title", '') AS "title", coalesce(cache."status", '') AS "status", coalesce(cache."category", '') AS "category",
            coalesce(cache."startDate", '') AS "startDate", coalesce(cache."endDate", '') AS "endDate"
     FROM "WorkEntryNotionCard" link
     LEFT JOIN "NotionCardCache" cache ON cache."userId" = link."userId" AND cache."notionPageId" = link."notionPageId"
     WHERE link."userId" = ? AND link."timesheetEntryId" IN (${entryIdPlaceholders})
     ORDER BY link."createdAt" ASC`,
    params.userId,
    ...params.entryIds
  );

  return mapNotionCardLinks(rows);
}

async function listEntryNotionCardsInTransaction(params: {
  entryIds: string[];
  transaction: TimesheetTransaction;
  userId: string;
}): Promise<Map<string, TimesheetEntryNotionCardDraft[]>> {
  if (params.entryIds.length === 0) {
    return new Map();
  }

  const entryIdPlaceholders = params.entryIds.map(() => "?").join(", ");
  const rows = await params.transaction.$queryRawUnsafe<WorkEntryNotionCardRow[]>(
    `SELECT link."timesheetEntryId", link."notionPageId", link."allocatedHours", link."allocationMode", link."source",
            coalesce(cache."title", '') AS "title", coalesce(cache."status", '') AS "status", coalesce(cache."category", '') AS "category",
            coalesce(cache."startDate", '') AS "startDate", coalesce(cache."endDate", '') AS "endDate"
     FROM "WorkEntryNotionCard" link
     LEFT JOIN "NotionCardCache" cache ON cache."userId" = link."userId" AND cache."notionPageId" = link."notionPageId"
     WHERE link."userId" = ? AND link."timesheetEntryId" IN (${entryIdPlaceholders})
     ORDER BY link."createdAt" ASC`,
    params.userId,
    ...params.entryIds
  );

  return mapNotionCardLinks(rows);
}

function mapNotionCardLinks(rows: WorkEntryNotionCardRow[]): Map<string, TimesheetEntryNotionCardDraft[]> {
  const linksByEntryId = new Map<string, TimesheetEntryNotionCardDraft[]>();

  for (const row of rows) {
    const links = linksByEntryId.get(row.timesheetEntryId) ?? [];
    links.push({
      allocatedHours: row.allocatedHours,
      allocationMode: row.allocationMode === "manual" ? "manual" : "auto",
      category: row.category,
      endDate: row.endDate,
      notionPageId: row.notionPageId,
      source: normalizeNotionCardSource(row.source),
      startDate: row.startDate,
      status: row.status,
      title: row.title
    });
    linksByEntryId.set(row.timesheetEntryId, links);
  }

  return linksByEntryId;
}

export async function listTimesheetEntries(params: { endDateKey: string; startDateKey: string; userId: string }) {
  await ensureTimesheetSchema();

  const [entries, dayRows] = await Promise.all([
    prisma.$queryRawUnsafe<TimesheetEntryRow[]>(
      `SELECT "id", "userId", "dateKey", "kind", "project", "hours", "content", "aiTranslation", "sortOrder", "vacationName", "holidayName"
       FROM "TimesheetEntry"
       WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?
       ORDER BY "dateKey" ASC, "sortOrder" ASC, "createdAt" ASC`,
      params.userId,
      params.startDateKey,
      params.endDateKey
    ),
    prisma.$queryRawUnsafe<TimesheetDayRow[]>(
      `SELECT "userId", "dateKey", "shortVersion", "aiRewriteRequested"
       FROM "TimesheetDay"
       WHERE "userId" = ? AND "dateKey" BETWEEN ? AND ?
       ORDER BY "dateKey" ASC`,
      params.userId,
      params.startDateKey,
      params.endDateKey
    )
  ]);
  const notionCardsByEntryId = await listEntryNotionCards({
    entryIds: entries.map((entry) => entry.id),
    userId: params.userId
  });
  const days = new Map<string, StoredTimesheetDay>();

  for (const day of dayRows) {
    days.set(day.dateKey, {
      aiRewriteRequested: Boolean(day.aiRewriteRequested),
      dateKey: day.dateKey,
      entries: [],
      holidayName: "",
      shortVersion: day.shortVersion
    });
  }

  for (const entry of entries) {
    const day = days.get(entry.dateKey) ?? {
      aiRewriteRequested: false,
      dateKey: entry.dateKey,
      entries: [],
      holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
      shortVersion: ""
    };
    day.entries.push({
      aiTranslation: entry.kind === "WORK" ? entry.aiTranslation : "",
      content: entry.kind === "WORK" ? entry.content : "",
      holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
      hours: entry.hours,
      id: entry.id,
      clientId: entry.id,
      kind: entry.kind,
      notionCards: notionCardsByEntryId.get(entry.id) ?? [],
      project: entry.kind === "WORK" ? entry.project : "",
      sortOrder: entry.sortOrder,
      vacationName: entry.kind === "VACATION" ? entry.vacationName : ""
    });
    days.set(entry.dateKey, day);
  }

  return Array.from(days.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

export async function findLatestWorkProjectBefore(params: { beforeDateKey: string; userId: string }): Promise<string> {
  await ensureTimesheetSchema();

  const rows = await prisma.$queryRawUnsafe<ProjectRow[]>(
    `SELECT "project" AS "name"
     FROM "TimesheetEntry"
     WHERE "userId" = ? AND "dateKey" < ? AND "kind" = 'WORK' AND trim("project") <> ''
     ORDER BY "dateKey" DESC, "sortOrder" ASC, "createdAt" DESC
     LIMIT 1`,
    params.userId,
    params.beforeDateKey
  );

  return rows[0]?.name ?? "";
}

export async function findLatestWorkNotionCardsBefore(params: {
  beforeDateKey: string;
  userId: string;
}): Promise<TimesheetEntryNotionCardDraft[]> {
  await ensureTimesheetSchema();

  const rows = await prisma.$queryRawUnsafe<WorkEntryNotionCardRow[]>(
    `WITH latest_entry AS (
       SELECT entry."id"
       FROM "TimesheetEntry" entry
       INNER JOIN "WorkEntryNotionCard" link ON link."userId" = entry."userId" AND link."timesheetEntryId" = entry."id" AND link."source" <> 'weekday_default'
       WHERE entry."userId" = ? AND entry."dateKey" < ? AND entry."kind" = 'WORK'
       GROUP BY entry."id", entry."dateKey", entry."sortOrder", entry."createdAt"
       ORDER BY entry."dateKey" DESC, entry."sortOrder" ASC, entry."createdAt" DESC
       LIMIT 1
     )
     SELECT link."timesheetEntryId", link."notionPageId", link."allocatedHours", link."allocationMode", link."source",
            coalesce(cache."title", '') AS "title", coalesce(cache."status", '') AS "status", coalesce(cache."category", '') AS "category",
            coalesce(cache."startDate", '') AS "startDate", coalesce(cache."endDate", '') AS "endDate"
     FROM "WorkEntryNotionCard" link
     INNER JOIN latest_entry ON latest_entry."id" = link."timesheetEntryId"
     LEFT JOIN "NotionCardCache" cache ON cache."userId" = link."userId" AND cache."notionPageId" = link."notionPageId"
     WHERE link."userId" = ? AND link."source" <> 'weekday_default'
     ORDER BY link."createdAt" ASC`,
    params.userId,
    params.beforeDateKey,
    params.userId
  );
  const entryId = rows[0]?.timesheetEntryId;

  return entryId ? mapNotionCardLinks(rows).get(entryId) ?? [] : [];
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

export async function saveTimesheetDay(params: { day: StoredTimesheetDay; userId: string }) {
  await ensureTimesheetSchema();

  const day = normalizeDay(params.day);

  await prisma.$transaction(async (transaction) => {
    await saveTimesheetDayInTransaction({ day, transaction, userId: params.userId });
  });

  return day;
}

export async function saveTimesheetDays(params: { days: StoredTimesheetDay[]; userId: string }) {
  await ensureTimesheetSchema();

  const days = params.days.map(normalizeDay);

  await prisma.$transaction(async (transaction) => {
    for (const day of days) {
      await saveTimesheetDayInTransaction({ day, transaction, userId: params.userId });
    }
  });

  return days;
}

export async function applyTimesheetAiSummaryPatches(params: {
  baseline: { days: TimesheetAiSummaryBaselineDay[] };
  days: StoredTimesheetDay[];
  patches: TimesheetAiSummaryPatch[];
  userId: string;
}): Promise<void> {
  await ensureTimesheetSchema();

  if (params.patches.length === 0) {
    return;
  }

  const requestedDaysByDate = new Map(params.days.map((day) => [day.dateKey, day]));
  const baselineDaysByDate = new Map(params.baseline.days.map((day) => [day.dateKey, day]));
  const patchDateKeys = [...new Set(params.patches.map((patch) => patch.dateKey))];

  await prisma.$transaction(async (transaction) => {
    const currentDays = await listTimesheetDaysInTransaction({
      dateKeys: patchDateKeys,
      transaction,
      userId: params.userId
    });
    const currentDaysByDate = new Map(currentDays.map((day) => [day.dateKey, day]));

    for (const patch of params.patches) {
      const requestedDay = requestedDaysByDate.get(patch.dateKey);
      const baselineDay = baselineDaysByDate.get(patch.dateKey);
      const currentDay = currentDaysByDate.get(patch.dateKey);

      if (!requestedDay || !baselineDay || !currentDay) {
        throw new Error(`${patch.dateKey} 기록을 찾을 수 없습니다.`);
      }

      const shortVersionChanged = patch.shortVersion !== baselineDay.shortVersion;

      if (shortVersionChanged && currentDay.shortVersion !== baselineDay.shortVersion) {
        throw new Error(`${patch.dateKey} shortVersion has changed since this JSON was exported. Reload the month and reapply the import.`);
      }

      for (const patchedEntry of patch.entries) {
        const baselineEntry = baselineDay.entries.find((entry) => getAiSummaryEntryId(entry) === patchedEntry.id);
        const currentEntry = currentDay.entries.find((entry) => entry.kind === "WORK" && getAiSummaryEntryId(entry) === patchedEntry.id);

        if (!baselineEntry || baselineEntry.kind !== "WORK" || !currentEntry) {
          throw new Error(`${patch.dateKey} entry ${patchedEntry.id} 기록을 찾을 수 없습니다.`);
        }

        if (currentEntry.aiTranslation !== baselineEntry.aiTranslation) {
          throw new Error(`${patch.dateKey} entry ${patchedEntry.id} aiTranslation has changed since this JSON was exported. Reload the month and reapply the import.`);
        }
      }

      const patchedEntriesById = new Map(patch.entries.map((entry) => [entry.id, entry]));
      const nextDay: StoredTimesheetDay = normalizeDay({
        ...currentDay,
        shortVersion: shortVersionChanged ? patch.shortVersion : currentDay.shortVersion,
        entries: currentDay.entries.map((entry) => {
          const patchedEntry = entry.kind === "WORK" ? patchedEntriesById.get(getAiSummaryEntryId(entry)) : undefined;

          return patchedEntry ? { ...entry, aiTranslation: patchedEntry.aiTranslation } : entry;
        })
      });

      await saveTimesheetDayInTransaction({ day: nextDay, transaction, userId: params.userId });
    }
  });
}

async function listTimesheetDaysInTransaction(params: {
  dateKeys: string[];
  transaction: TimesheetTransaction;
  userId: string;
}): Promise<StoredTimesheetDay[]> {
  const dateKeys = [...new Set(params.dateKeys)].sort((left, right) => left.localeCompare(right));

  if (dateKeys.length === 0) {
    return [];
  }

  const dateKeyPlaceholders = dateKeys.map(() => "?").join(", ");
  const [entries, dayRows] = await Promise.all([
    params.transaction.$queryRawUnsafe<TimesheetEntryRow[]>(
      `SELECT "id", "userId", "dateKey", "kind", "project", "hours", "content", "aiTranslation", "sortOrder", "vacationName", "holidayName"
       FROM "TimesheetEntry"
       WHERE "userId" = ? AND "dateKey" IN (${dateKeyPlaceholders})
       ORDER BY "dateKey" ASC, "sortOrder" ASC, "createdAt" ASC`,
      params.userId,
      ...dateKeys
    ),
    params.transaction.$queryRawUnsafe<TimesheetDayRow[]>(
      `SELECT "userId", "dateKey", "shortVersion", "aiRewriteRequested"
       FROM "TimesheetDay"
       WHERE "userId" = ? AND "dateKey" IN (${dateKeyPlaceholders})
       ORDER BY "dateKey" ASC`,
      params.userId,
      ...dateKeys
    )
  ]);
  const notionCardsByEntryId = await listEntryNotionCardsInTransaction({
    entryIds: entries.map((entry) => entry.id),
    transaction: params.transaction,
    userId: params.userId
  });
  const days = new Map<string, StoredTimesheetDay>();

  for (const day of dayRows) {
    days.set(day.dateKey, {
      aiRewriteRequested: Boolean(day.aiRewriteRequested),
      dateKey: day.dateKey,
      entries: [],
      holidayName: "",
      shortVersion: day.shortVersion
    });
  }

  for (const entry of entries) {
    const day = days.get(entry.dateKey) ?? {
      aiRewriteRequested: false,
      dateKey: entry.dateKey,
      entries: [],
      holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
      shortVersion: ""
    };
    day.entries.push({
      aiTranslation: entry.kind === "WORK" ? entry.aiTranslation : "",
      content: entry.kind === "WORK" ? entry.content : "",
      holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
      hours: entry.hours,
      id: entry.id,
      clientId: entry.id,
      kind: entry.kind,
      notionCards: notionCardsByEntryId.get(entry.id) ?? [],
      project: entry.kind === "WORK" ? entry.project : "",
      sortOrder: entry.sortOrder,
      vacationName: entry.kind === "VACATION" ? entry.vacationName : ""
    });
    days.set(entry.dateKey, day);
  }

  return Array.from(days.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function getAiSummaryEntryId(entry: Pick<StoredTimesheetEntry, "clientId" | "id">): string {
  return entry.id || entry.clientId;
}

async function saveTimesheetDayInTransaction(params: {
  day: StoredTimesheetDay;
  transaction: TimesheetTransaction;
  userId: string;
}) {
  await params.transaction.$executeRawUnsafe(
    `INSERT INTO "TimesheetDay" ("id", "userId", "dateKey", "shortVersion", "aiRewriteRequested", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "dateKey") DO UPDATE SET "shortVersion" = excluded."shortVersion", "aiRewriteRequested" = excluded."aiRewriteRequested", "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    params.day.dateKey,
    params.day.shortVersion,
    params.day.aiRewriteRequested ? 1 : 0
  );
  await params.transaction.$executeRawUnsafe(`DELETE FROM "WorkEntryNotionCard" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.day.dateKey);
  await params.transaction.$executeRawUnsafe(`DELETE FROM "TimesheetEntry" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.day.dateKey);

  for (const entry of params.day.entries) {
    const entryId = entry.id || randomUUID();

    await params.transaction.$executeRawUnsafe(
      `INSERT INTO "TimesheetEntry" ("id", "userId", "dateKey", "kind", "project", "hours", "content", "aiTranslation", "shortVersion", "sortOrder", "vacationName", "holidayName", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      entryId,
      params.userId,
      params.day.dateKey,
      entry.kind,
      entry.project,
      entry.hours,
      entry.content,
      entry.aiTranslation,
      entry.sortOrder,
      entry.vacationName,
      entry.holidayName
    );

    for (const link of entry.notionCards) {
      await params.transaction.$executeRawUnsafe(
        `INSERT INTO "WorkEntryNotionCard" ("id", "userId", "timesheetEntryId", "dateKey", "notionPageId", "allocatedHours", "allocationMode", "source", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        params.userId,
        entryId,
        params.day.dateKey,
        link.notionPageId,
        link.allocatedHours,
        link.allocationMode,
        link.source
      );
    }
  }

  const vacationEntries = params.day.entries.filter((entry) => entry.kind === "VACATION");

  if (vacationEntries.length === 0) {
    await params.transaction.$executeRawUnsafe(`DELETE FROM "Vacation" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.day.dateKey);
    return;
  }

  const totalHours = vacationEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const name = vacationEntries.map((entry) => entry.vacationName.trim()).filter(Boolean).join(", ") || "휴가";

  await params.transaction.$executeRawUnsafe(
    `INSERT INTO "Vacation" ("id", "userId", "dateKey", "name", "hours", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "dateKey") DO UPDATE SET "name" = excluded."name", "hours" = excluded."hours", "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    params.day.dateKey,
    name,
    totalHours
  );
}

export async function deleteTimesheetEntry(params: { dateKey: string; userId: string }) {
  await ensureTimesheetSchema();

  await prisma.$executeRawUnsafe(`DELETE FROM "WorkEntryNotionCard" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.dateKey);
  await prisma.$executeRawUnsafe(`DELETE FROM "TimesheetEntry" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.dateKey);
  await prisma.$executeRawUnsafe(`DELETE FROM "TimesheetDay" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.dateKey);
  await prisma.$executeRawUnsafe(`DELETE FROM "Vacation" WHERE "userId" = ? AND "dateKey" = ?`, params.userId, params.dateKey);
}

export const upsertTimesheetEntry = saveTimesheetDay;

export async function listTimesheetAiRewriteRequests(userId: string): Promise<TimesheetAiRewriteRequest[]> {
  await ensureTimesheetSchema();

  const rows = await prisma.$queryRawUnsafe<TimesheetAiRewriteRequestRow[]>(
    `SELECT day."dateKey",
            day."shortVersion",
            day."aiRewriteRequested" AS "rewriteRequested",
            count(entry."id") AS "entryCount",
            sum(CASE WHEN trim(entry."content") <> '' AND trim(entry."aiTranslation") = '' THEN 1 ELSE 0 END) AS "missingTranslationCount",
            coalesce(max(CASE WHEN trim(entry."content") <> '' THEN entry."content" ELSE NULL END), '') AS "previewContent"
     FROM "TimesheetDay" day
     LEFT JOIN "TimesheetEntry" entry ON entry."userId" = day."userId" AND entry."dateKey" = day."dateKey" AND entry."kind" = 'WORK'
     WHERE day."userId" = ?
     GROUP BY day."dateKey", day."shortVersion", day."aiRewriteRequested"
     HAVING (
          day."aiRewriteRequested" = 1
          AND sum(CASE WHEN trim(entry."content") <> '' THEN 1 ELSE 0 END) > 0
        )
        OR (
          sum(CASE WHEN trim(entry."content") <> '' THEN 1 ELSE 0 END) > 0
          AND (
            trim(day."shortVersion") = ''
            OR sum(CASE WHEN trim(entry."content") <> '' AND trim(entry."aiTranslation") = '' THEN 1 ELSE 0 END) > 0
          )
        )
     ORDER BY day."dateKey" DESC`,
    userId
  );

  return rows.map((row) => ({
    cleanupType: row.rewriteRequested ? "rewrite" : "fill_missing",
    dateKey: row.dateKey,
    entryCount: Number(row.entryCount ?? 0),
    previewContent: row.previewContent?.trim() ?? "",
    rewriteRequested: Boolean(row.rewriteRequested),
    shortVersion: row.shortVersion
  }));
}

export async function clearTimesheetAiRewriteRequests(params: {
  dateKeys: string[];
  userId: string;
}): Promise<void> {
  await ensureTimesheetSchema();

  const dateKeys = [...new Set(params.dateKeys.map((dateKey) => dateKey.trim()).filter(Boolean))];

  if (dateKeys.length === 0) {
    return;
  }

  const placeholders = dateKeys.map(() => "?").join(", ");

  await prisma.$executeRawUnsafe(
    `UPDATE "TimesheetDay"
     SET "aiRewriteRequested" = 0, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "userId" = ? AND "dateKey" IN (${placeholders})`,
    params.userId,
    ...dateKeys
  );
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

export async function listProjectSummaries(params: { userId: string }): Promise<ProjectSummary[]> {
  await ensureTimesheetSchema();

  const rows = await prisma.$queryRawUnsafe<ProjectSummaryRow[]>(
    `WITH project_names AS (
       SELECT trim("name") AS "name"
       FROM "Project"
       WHERE "userId" = ? AND trim("name") <> ''
       UNION
       SELECT trim("project") AS "name"
       FROM "TimesheetEntry"
       WHERE "userId" = ? AND "kind" = 'WORK' AND trim("project") <> ''
     ),
     work_summary AS (
       SELECT trim("project") AS "name",
              count(*) AS "entryCount",
              coalesce(sum("hours"), 0) AS "totalHours",
              max("dateKey") AS "latestDateKey"
       FROM "TimesheetEntry"
       WHERE "userId" = ? AND "kind" = 'WORK' AND trim("project") <> ''
       GROUP BY trim("project")
     )
     SELECT project_names."name",
            coalesce(work_summary."entryCount", 0) AS "entryCount",
            coalesce(work_summary."totalHours", 0) AS "totalHours",
            work_summary."latestDateKey"
     FROM project_names
     LEFT JOIN work_summary ON work_summary."name" = project_names."name"
     ORDER BY work_summary."latestDateKey" IS NULL ASC, work_summary."latestDateKey" DESC, project_names."name" ASC`,
    params.userId,
    params.userId,
    params.userId
  );

  return rows
    .map((row) => ({
      entryCount: Number(row.entryCount ?? 0),
      latestDateKey: row.latestDateKey,
      name: row.name,
      totalHours: Number(row.totalHours ?? 0)
    }))
    .sort((left, right) => {
      if (left.latestDateKey && right.latestDateKey && left.latestDateKey !== right.latestDateKey) {
        return right.latestDateKey.localeCompare(left.latestDateKey);
      }

      if (left.latestDateKey && !right.latestDateKey) {
        return -1;
      }

      if (!left.latestDateKey && right.latestDateKey) {
        return 1;
      }

      return left.name.localeCompare(right.name, "ko-KR");
    });
}

export async function renameProject(params: { fromName: string; toName: string; userId: string }): Promise<void> {
  await ensureTimesheetSchema();

  const fromName = params.fromName.trim();
  const toName = params.toName.trim();

  if (!fromName) {
    throw new Error("변경할 프로젝트를 찾을 수 없습니다.");
  }

  if (!toName) {
    throw new Error("프로젝트명을 입력해 주세요.");
  }

  if (fromName === toName) {
    return;
  }

  await prisma.$transaction(async (transaction) => {
    const duplicates = await transaction.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM "Project" WHERE "userId" = ? AND trim("name") = ?
       UNION
       SELECT "project" AS "name" FROM "TimesheetEntry" WHERE "userId" = ? AND "kind" = 'WORK' AND trim("project") = ?
       LIMIT 1`,
      params.userId,
      toName,
      params.userId,
      toName
    );

    if (duplicates.length > 0) {
      throw new Error("이미 사용 중인 프로젝트명입니다.");
    }

    const existingProjects = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Project" WHERE "userId" = ? AND trim("name") = ? LIMIT 1`,
      params.userId,
      fromName
    );
    const existingEntries = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TimesheetEntry" WHERE "userId" = ? AND "kind" = 'WORK' AND trim("project") = ? LIMIT 1`,
      params.userId,
      fromName
    );

    if (existingProjects.length === 0 && existingEntries.length === 0) {
      throw new Error("프로젝트를 찾을 수 없습니다.");
    }

    if (existingProjects.length > 0) {
      await transaction.$executeRawUnsafe(
        `UPDATE "Project" SET "name" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ? AND trim("name") = ?`,
        toName,
        params.userId,
        fromName
      );
    } else {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "Project" ("id", "userId", "name", "createdAt", "updatedAt")
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        randomUUID(),
        params.userId,
        toName
      );
    }

    await transaction.$executeRawUnsafe(
      `UPDATE "TimesheetEntry" SET "project" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = ? AND "kind" = 'WORK' AND trim("project") = ?`,
      toName,
      params.userId,
      fromName
    );
  });
}
