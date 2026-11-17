import { createHash, randomUUID } from "node:crypto";
import type { TimesheetEntryDraft } from "@timesheet/domain";
import { prisma } from "./client";
import { createOperationLog } from "./operation-log";
import { ensureApplicationSchema } from "./settings-store";
import {
  ensureTimesheetSchema,
  listTimesheetDaysInTransaction,
  listTimesheetEntries,
  normalizeDay,
  saveTimesheetDayInTransaction,
  type StoredTimesheetDraft
} from "./timesheet-store";

export type TodayWorkDraftRecord = {
  confirmedBaselineUpdatedAt: string;
  dateKey: string;
  entries: TimesheetEntryDraft[];
  id: string;
  revision: number;
  updatedAt: string;
  userId: string;
};

export type TodayDraftLoadResult = {
  confirmedDay: StoredTimesheetDraft | null;
  confirmedUpdatedAt: string;
  draft: TodayWorkDraftRecord | null;
  draftRevision: number;
};

export type TodayDraftSaveResult =
  | {
      draft: TodayWorkDraftRecord;
      status: "saved";
    }
  | {
      currentConfirmedUpdatedAt: string;
      currentRevision: number;
      draft: TodayWorkDraftRecord | null;
      reason: "confirmed_changed" | "stale_revision";
      status: "conflict";
    };

export type TodayDraftConfirmResult =
  | {
      confirmedUpdatedAt: string;
      day: StoredTimesheetDraft;
      draftRevision: number;
      status: "confirmed";
    }
  | {
      currentConfirmedUpdatedAt: string;
      currentRevision?: number;
      reason: "confirmed_changed" | "stale_revision";
      status: "conflict";
    };

let todaySchemaReadyPromise: Promise<void> | null = null;

export async function ensureTodaySchema(): Promise<void> {
  todaySchemaReadyPromise ??= createOperationLog("db", "schema_today").run(async () => {
    await ensureApplicationSchema();
    await ensureTimesheetSchema();

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TodayWorkDraft" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "dateKey" TEXT NOT NULL,
      "payloadJson" TEXT NOT NULL,
      "revision" INTEGER NOT NULL DEFAULT 1,
      "isCleared" INTEGER NOT NULL DEFAULT 0,
      "confirmedBaselineUpdatedAt" TEXT NOT NULL DEFAULT '',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TodayWorkDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("TodayWorkDraft")`);
    if (!columns.some((col) => col.name === "isCleared")) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "TodayWorkDraft" ADD COLUMN "isCleared" INTEGER NOT NULL DEFAULT 0`);
    }
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "TodayWorkDraft_userId_dateKey_key" ON "TodayWorkDraft"("userId", "dateKey")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TodayWorkDraft_userId_updatedAt_idx" ON "TodayWorkDraft"("userId", "updatedAt")`
    );
  });

  try {
    await todaySchemaReadyPromise;
  } catch (error) {
    todaySchemaReadyPromise = null;
    throw error;
  }
}

type RawTodayWorkDraftRow = {
  confirmedBaselineUpdatedAt: string;
  dateKey: string;
  id: string;
  isCleared: number | bigint;
  payloadJson: string;
  revision: number | bigint;
  updatedAt: string;
  userId: string;
};

function parseDraftEntries(payloadJson: string): TimesheetEntryDraft[] {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return Array.isArray(parsed) ? (parsed as TimesheetEntryDraft[]) : [];
  } catch {
    return [];
  }
}

function mapRawDraftRow(row: RawTodayWorkDraftRow): TodayWorkDraftRecord {
  return {
    confirmedBaselineUpdatedAt: row.confirmedBaselineUpdatedAt ?? "",
    dateKey: row.dateKey,
    entries: parseDraftEntries(row.payloadJson),
    id: row.id,
    revision: Number(row.revision),
    updatedAt: String(row.updatedAt),
    userId: row.userId
  };
}

export function computeConfirmedDayFingerprint(day: StoredTimesheetDraft | null): string {
  if (!day) return "";
  const canonical = {
    aiRewriteRequested: Boolean(day.aiRewriteRequested),
    dateKey: day.dateKey,
    entries: day.entries.map((e) => ({
      aiTranslation: e.aiTranslation,
      content: e.content,
      holidayName: e.holidayName,
      hours: e.hours,
      id: e.id,
      kind: e.kind,
      notionCards: e.notionCards.map((c) => ({
        allocatedHours: c.allocatedHours,
        allocationMode: c.allocationMode,
        notionPageId: c.notionPageId,
        source: c.source
      })),
      project: e.project,
      sortOrder: e.sortOrder,
      vacationDeductsAllowance: e.vacationDeductsAllowance,
      vacationName: e.vacationName,
      vacationStatus: e.vacationStatus
    })),
    holidayName: day.holidayName,
    shortVersion: day.shortVersion
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24);
}

async function readTodayDraftRow(userId: string, dateKey: string): Promise<RawTodayWorkDraftRow | null> {
  const rows = await prisma.$queryRawUnsafe<RawTodayWorkDraftRow[]>(
    `SELECT "id", "userId", "dateKey", "payloadJson", "revision", "isCleared", "confirmedBaselineUpdatedAt", "updatedAt"
     FROM "TodayWorkDraft"
     WHERE "userId" = ? AND "dateKey" = ?
     LIMIT 1`,
    userId,
    dateKey
  );
  return rows[0] ?? null;
}

export async function getTodayDraft(params: {
  dateKey: string;
  userId: string;
}): Promise<TodayDraftLoadResult> {
  await ensureTodaySchema();
  const [rawDraft, confirmedDays] = await Promise.all([
    readTodayDraftRow(params.userId, params.dateKey),
    listTimesheetEntries({
      endDateKey: params.dateKey,
      startDateKey: params.dateKey,
      userId: params.userId
    })
  ]);
  const confirmedDay = confirmedDays[0] ?? null;
  const confirmedUpdatedAt = computeConfirmedDayFingerprint(confirmedDay);
  const draft = rawDraft && Number(rawDraft.isCleared) === 0 ? mapRawDraftRow(rawDraft) : null;
  const draftRevision = rawDraft ? Number(rawDraft.revision) : 0;

  return {
    confirmedDay,
    confirmedUpdatedAt,
    draft,
    draftRevision
  };
}

export async function saveTodayDraft(params: {
  confirmedBaselineUpdatedAt: string;
  dateKey: string;
  entries: TimesheetEntryDraft[];
  expectedRevision: number;
  userId: string;
}): Promise<TodayDraftSaveResult> {
  await ensureTodaySchema();

  return prisma.$transaction(async (tx) => {
    const confirmedDays = await listTimesheetDaysInTransaction({
      dateKeys: [params.dateKey],
      transaction: tx,
      userId: params.userId
    });
    const confirmedDay = confirmedDays[0] ?? null;
    const currentConfirmedUpdatedAt = computeConfirmedDayFingerprint(confirmedDay);

    const existingRows = await tx.$queryRawUnsafe<RawTodayWorkDraftRow[]>(
      `SELECT "id", "userId", "dateKey", "payloadJson", "revision", "isCleared", "confirmedBaselineUpdatedAt", "updatedAt"
       FROM "TodayWorkDraft"
       WHERE "userId" = ? AND "dateKey" = ?
       LIMIT 1`,
      params.userId,
      params.dateKey
    );
    const rawExisting = existingRows[0] ?? null;
    const existing = rawExisting && Number(rawExisting.isCleared) === 0 ? mapRawDraftRow(rawExisting) : null;
    const currentRevision = rawExisting ? Number(rawExisting.revision) : 0;

    if (currentConfirmedUpdatedAt !== params.confirmedBaselineUpdatedAt) {
      return {
        currentConfirmedUpdatedAt,
        currentRevision,
        draft: existing,
        reason: "confirmed_changed",
        status: "conflict"
      };
    }

    if (params.expectedRevision !== currentRevision) {
      return {
        currentConfirmedUpdatedAt,
        currentRevision,
        draft: existing,
        reason: "stale_revision",
        status: "conflict"
      };
    }

    const nextRevision = currentRevision + 1;
    const payloadJson = JSON.stringify(params.entries);
    const nowIso = new Date().toISOString();

    if (rawExisting) {
      await tx.$executeRawUnsafe(
        `UPDATE "TodayWorkDraft"
         SET "payloadJson" = ?, "revision" = ?, "isCleared" = 0, "confirmedBaselineUpdatedAt" = ?, "updatedAt" = ?
         WHERE "id" = ? AND "revision" = ?`,
        payloadJson,
        nextRevision,
        params.confirmedBaselineUpdatedAt,
        nowIso,
        rawExisting.id,
        currentRevision
      );
      return {
        draft: {
          confirmedBaselineUpdatedAt: params.confirmedBaselineUpdatedAt,
          dateKey: params.dateKey,
          entries: params.entries,
          id: rawExisting.id,
          revision: nextRevision,
          updatedAt: nowIso,
          userId: params.userId
        },
        status: "saved"
      };
    }

    const id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "TodayWorkDraft" ("id", "userId", "dateKey", "payloadJson", "revision", "isCleared", "confirmedBaselineUpdatedAt", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      id,
      params.userId,
      params.dateKey,
      payloadJson,
      nextRevision,
      params.confirmedBaselineUpdatedAt,
      nowIso,
      nowIso
    );

    return {
      draft: {
        confirmedBaselineUpdatedAt: params.confirmedBaselineUpdatedAt,
        dateKey: params.dateKey,
        entries: params.entries,
        id,
        revision: nextRevision,
        updatedAt: nowIso,
        userId: params.userId
      },
      status: "saved"
    };
  });
}

export type TodayDraftClearResult =
  | {
      confirmedUpdatedAt: string;
      draftRevision: number;
      status: "cleared";
    }
  | {
      currentConfirmedUpdatedAt: string;
      currentRevision: number;
      reason: "stale_revision";
      status: "conflict";
    };

export async function clearTodayDraft(params: {
  dateKey: string;
  expectedRevision?: number;
  userId: string;
}): Promise<TodayDraftClearResult> {
  await ensureTodaySchema();
  return prisma.$transaction(async (tx) => {
    const confirmedDays = await listTimesheetDaysInTransaction({
      dateKeys: [params.dateKey],
      transaction: tx,
      userId: params.userId
    });
    const currentConfirmedUpdatedAt = computeConfirmedDayFingerprint(confirmedDays[0] ?? null);

    const existingRows = await tx.$queryRawUnsafe<RawTodayWorkDraftRow[]>(
      `SELECT "id", "userId", "dateKey", "payloadJson", "revision", "isCleared", "confirmedBaselineUpdatedAt", "updatedAt"
       FROM "TodayWorkDraft"
       WHERE "userId" = ? AND "dateKey" = ?
       LIMIT 1`,
      params.userId,
      params.dateKey
    );
    const rawDraft = existingRows[0] ?? null;
    const currentRevision = rawDraft ? Number(rawDraft.revision) : 0;

    if (params.expectedRevision !== undefined && params.expectedRevision !== currentRevision) {
      return {
        currentConfirmedUpdatedAt,
        currentRevision,
        reason: "stale_revision",
        status: "conflict"
      };
    }

    let nextRevision = currentRevision;
    if (rawDraft) {
      nextRevision = currentRevision + 1;
      await tx.$executeRawUnsafe(
        `UPDATE "TodayWorkDraft"
         SET "isCleared" = 1, "payloadJson" = '[]', "revision" = ?, "updatedAt" = ?
         WHERE "id" = ? AND "revision" = ?`,
        nextRevision,
        new Date().toISOString(),
        rawDraft.id,
        currentRevision
      );
    }

    return {
      confirmedUpdatedAt: currentConfirmedUpdatedAt,
      draftRevision: nextRevision,
      status: "cleared"
    };
  });
}

export async function confirmTodayDraft(params: {
  confirmedBaselineUpdatedAt: string;
  dateKey: string;
  day: StoredTimesheetDraft;
  expectedDraftRevision: number;
  userId: string;
}): Promise<TodayDraftConfirmResult> {
  await ensureTodaySchema();

  if (params.dateKey !== params.day.dateKey) {
    throw new Error("요청 날짜와 업무 기록 날짜가 일치하지 않습니다.");
  }

  return prisma.$transaction(async (tx) => {
    const existingDays = await listTimesheetDaysInTransaction({
      dateKeys: [params.dateKey],
      transaction: tx,
      userId: params.userId
    });
    const existingDay = existingDays[0] ?? null;
    const currentConfirmedUpdatedAt = computeConfirmedDayFingerprint(existingDay);

    const existingRows = await tx.$queryRawUnsafe<RawTodayWorkDraftRow[]>(
      `SELECT "id", "userId", "dateKey", "payloadJson", "revision", "isCleared", "confirmedBaselineUpdatedAt", "updatedAt"
       FROM "TodayWorkDraft"
       WHERE "userId" = ? AND "dateKey" = ?
       LIMIT 1`,
      params.userId,
      params.dateKey
    );
    const rawDraft = existingRows[0] ?? null;
    const currentRevision = rawDraft ? Number(rawDraft.revision) : 0;

    if (currentConfirmedUpdatedAt !== params.confirmedBaselineUpdatedAt) {
      return {
        currentConfirmedUpdatedAt,
        currentRevision,
        reason: "confirmed_changed",
        status: "conflict"
      };
    }

    if (params.expectedDraftRevision !== currentRevision) {
      return {
        currentConfirmedUpdatedAt,
        currentRevision,
        reason: "stale_revision",
        status: "conflict"
      };
    }

    const preservedNonWorkEntries = existingDay
      ? existingDay.entries.filter((entry) => entry.kind !== "WORK")
      : [];

    const workEntries = params.day.entries
      .filter((entry) => entry.kind === "WORK")
      .map((entry, index) => ({
        ...entry,
        sortOrder: index
      }));

    const mergedEntries = [
      ...workEntries,
      ...preservedNonWorkEntries.map((entry, index) => ({
        ...entry,
        sortOrder: workEntries.length + index
      }))
    ];

    const mergedDay = normalizeDay({
      ...params.day,
      aiRewriteRequested: existingDay?.aiRewriteRequested ?? params.day.aiRewriteRequested,
      entries: mergedEntries,
      holidayName: existingDay?.holidayName ?? params.day.holidayName,
      shortVersion: existingDay?.shortVersion ?? params.day.shortVersion
    });

    await saveTimesheetDayInTransaction({
      day: mergedDay,
      transaction: tx,
      userId: params.userId
    });

    let nextDraftRevision = currentRevision;
    if (rawDraft) {
      nextDraftRevision = currentRevision + 1;
      await tx.$executeRawUnsafe(
        `UPDATE "TodayWorkDraft"
         SET "isCleared" = 1, "payloadJson" = '[]', "revision" = ?, "updatedAt" = ?
         WHERE "id" = ? AND "revision" = ?`,
        nextDraftRevision,
        new Date().toISOString(),
        rawDraft.id,
        currentRevision
      );
    }

    const freshDays = await listTimesheetDaysInTransaction({
      dateKeys: [params.dateKey],
      transaction: tx,
      userId: params.userId
    });
    const finalDay = freshDays[0] ?? mergedDay;
    const nextConfirmedUpdatedAt = computeConfirmedDayFingerprint(finalDay);

    return {
      confirmedUpdatedAt: nextConfirmedUpdatedAt,
      day: finalDay,
      draftRevision: nextDraftRevision,
      status: "confirmed"
    };
  });
}
