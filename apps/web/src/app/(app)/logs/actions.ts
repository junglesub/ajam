"use server";

import { getManagedUser } from "@timesheet/db";
import { withoutOperationLogPersistence } from "@timesheet/db/logging";
import type {
  LogDetail,
  LogPage,
  LogQuery,
  LogScope,
  StoredLogLevel,
  UnreadLogSummary
} from "@timesheet/db/operational-logs";

import { getSession } from "@/server/session";
import { resolveLogViewer } from "@/server/log-viewer-access";

export type LogActionResult<T> =
  | { code?: never; data: T; ok: true; viewerUserId: string }
  | { code: "forbidden" | "invalid_input" | "not_found" | "unauthenticated" | "unavailable"; ok: false };

const COMPONENT_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const PERIODS: ReadonlySet<number> = new Set([1, 7, 30]);
const LEVELS: ReadonlySet<string> = new Set(["info", "warn", "error"]);

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validateQuery(query: LogQuery): string | null {
  if (query.scope !== "mine" && query.scope !== "site") return "scope";
  if (!PERIODS.has(query.periodDays)) return "periodDays";
  if (query.levels !== undefined && (!Array.isArray(query.levels) || query.levels.some((level) => !LEVELS.has(level)))) return "levels";
  if (query.component !== undefined && (typeof query.component !== "string" || !COMPONENT_PATTERN.test(query.component))) return "component";
  if (query.beforeId !== undefined && !isPositiveInt(query.beforeId)) return "beforeId";
  return null;
}

async function requireViewer() {
  const session = await getSession();
  const viewer = await resolveLogViewer(session ? { userId: session.userId } : null, (id) => getManagedUser(id));
  return viewer;
}

export async function listOperationLogsAction(query: LogQuery): Promise<LogActionResult<LogPage>> {
  return withoutOperationLogPersistence(async () => {
    try {
      const viewer = await requireViewer();
      if (!viewer) return { ok: false, code: "unauthenticated" };
      if (validateQuery(query)) return { ok: false, code: "invalid_input" };
      if (query.scope === "site" && viewer.role !== "ADMIN") return { ok: false, code: "forbidden" };
      const store = await import("@timesheet/db/operational-logs");
      const data = await store.listVisibleOperationLogs(viewer, {
        scope: query.scope,
        periodDays: query.periodDays,
        ...(query.levels ? { levels: query.levels as StoredLogLevel[] } : {}),
        ...(query.component ? { component: query.component } : {}),
        ...(typeof query.unreadOnly === "boolean" ? { unreadOnly: query.unreadOnly } : {}),
        ...(query.beforeId ? { beforeId: query.beforeId } : {})
      });
      return { ok: true, viewerUserId: viewer.userId, data };
    } catch (error) {
      if (error instanceof Error && error.message === "forbidden") return { ok: false, code: "forbidden" };
      return { ok: false, code: "unavailable" };
    }
  });
}

export async function getOperationLogDetailAction(id: number, beforeRelatedId?: number): Promise<LogActionResult<LogDetail>> {
  return withoutOperationLogPersistence(async () => {
    try {
      const viewer = await requireViewer();
      if (!viewer) return { ok: false, code: "unauthenticated" };
      if (!isPositiveInt(id)) return { ok: false, code: "invalid_input" };
      if (beforeRelatedId !== undefined && !isPositiveInt(beforeRelatedId)) return { ok: false, code: "invalid_input" };
      const store = await import("@timesheet/db/operational-logs");
      const data = await store.getVisibleOperationLogDetail(viewer, id, beforeRelatedId);
      if (!data) return { ok: false, code: "not_found" };
      return { ok: true, viewerUserId: viewer.userId, data };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  });
}

export async function getUnreadOperationLogsAction(): Promise<LogActionResult<UnreadLogSummary>> {
  return withoutOperationLogPersistence(async () => {
    try {
      const viewer = await requireViewer();
      if (!viewer) return { ok: false, code: "unauthenticated" };
      const store = await import("@timesheet/db/operational-logs");
      const data = await store.getUnreadLogSummary(viewer);
      return { ok: true, viewerUserId: viewer.userId, data };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  });
}

export async function markOperationLogReadAction(id: number): Promise<LogActionResult<UnreadLogSummary>> {
  return withoutOperationLogPersistence(async () => {
    try {
      const viewer = await requireViewer();
      if (!viewer) return { ok: false, code: "unauthenticated" };
      if (!isPositiveInt(id)) return { ok: false, code: "invalid_input" };
      const store = await import("@timesheet/db/operational-logs");
      const readable = await store.markOperationLogRead(viewer, id);
      if (!readable) return { ok: false, code: "not_found" };
      const data = await store.getUnreadLogSummary(viewer);
      return { ok: true, viewerUserId: viewer.userId, data };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  });
}

export async function markAllOperationLogsReadAction(scope: LogScope, snapshotMaxId: number): Promise<LogActionResult<UnreadLogSummary>> {
  return withoutOperationLogPersistence(async () => {
    try {
      const viewer = await requireViewer();
      if (!viewer) return { ok: false, code: "unauthenticated" };
      if (scope !== "mine" && scope !== "site") return { ok: false, code: "invalid_input" };
      if (!Number.isSafeInteger(snapshotMaxId) || snapshotMaxId < 0) return { ok: false, code: "invalid_input" };
      if (scope === "site" && viewer.role !== "ADMIN") return { ok: false, code: "forbidden" };
      const store = await import("@timesheet/db/operational-logs");
      await store.markAllOperationLogsRead(viewer, scope, snapshotMaxId);
      const data = await store.getUnreadLogSummary(viewer);
      return { ok: true, viewerUserId: viewer.userId, data };
    } catch {
      return { ok: false, code: "unavailable" };
    }
  });
}
