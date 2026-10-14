import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { LogFields, OperationLogEvent } from "./operation-log";

const directory = await mkdtemp(join(tmpdir(), "ajam-operation-log-store-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

const store = await import("./operation-log-store");
const { prisma } = await import("./client");

function makeEvent(overrides: Partial<OperationLogEvent> & { component: string; operation: string }): OperationLogEvent {
  return {
    component: overrides.component,
    operation: overrides.operation,
    result: overrides.result ?? "completed",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    level: overrides.level ?? "info",
    durationMs: overrides.durationMs ?? 5,
    eventId: overrides.eventId ?? randomUUID(),
    operationId: overrides.operationId ?? randomUUID(),
    userId: overrides.userId,
    source: overrides.source,
    dateKey: overrides.dateKey,
    fields: overrides.fields ?? {}
  };
}

async function reset() {
  await store.ensureOperationLogSchema();
  await prisma.$executeRawUnsafe(`DELETE FROM "OperationLogRead"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "OperationLog"`);
}

test("visibility isolates users and common logs", async () => {
  await reset();
  const opId = randomUUID();
  await store.appendOperationLogs([
    makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", operationId: opId }),
    makeEvent({ component: "timesheet", operation: "save", level: "warn", userId: "A", operationId: opId }),
    makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "A", operationId: opId }),
    makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "B", operationId: opId }),
    makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "B", operationId: opId }),
    makeEvent({ component: "server", operation: "startup", level: "warn", operationId: opId }),
    makeEvent({ component: "server", operation: "startup", level: "error", operationId: opId }),
    makeEvent({ component: "server", operation: "startup", level: "info", operationId: opId })
  ]);
  const mine = await store.listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "mine", periodDays: 7 });
  assert.deepEqual(mine.items.map((log) => log.level).sort(), ["error", "info", "warn"]);
  assert.ok(mine.items.every((log) => log.userId === "A"));
  const site = await store.listVisibleOperationLogs({ userId: "M1", role: "ADMIN" }, { scope: "site", periodDays: 7 });
  assert.deepEqual(site.items.map((log) => log.level).sort(), ["error", "warn"]);
  assert.ok(site.items.every((log) => log.userId === null));
  await assert.rejects(store.listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "site", periodDays: 7 }), /forbidden/);
  const bLog = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "OperationLog" WHERE "userId" = 'B' AND "level" = 'error' LIMIT 1`);
  assert.equal(await store.markOperationLogRead({ userId: "A", role: "USER" }, bLog[0]!.id), false);
  const adminDirect = await store.getVisibleOperationLogDetail({ userId: "M1", role: "ADMIN" }, bLog[0]!.id);
  assert.equal(adminDirect, null);
  const detail = await store.getVisibleOperationLogDetail({ userId: "A", role: "USER" }, mine.items[0]!.id);
  assert.ok(detail);
  const expectedRelatedIds = mine.items.filter((item) => item.id !== mine.items[0]!.id).map((item) => item.id).sort((a, b) => a - b);
  const relatedIds = detail.related.items.map((item) => item.id).sort((a, b) => a - b);
  assert.equal(detail.related.items.length, 2);
  assert.deepEqual(relatedIds, expectedRelatedIds);
  assert.ok(detail.related.items.every((log) => log.userId === "A"));
  const siteDetail = await store.getVisibleOperationLogDetail({ userId: "M1", role: "ADMIN" }, site.items[0]!.id);
  assert.ok(siteDetail);
  assert.equal(siteDetail.related.items.length, 1);
  assert.equal(siteDetail.related.items[0]!.id, site.items[1]!.id);
  assert.ok(siteDetail.related.items.every((log) => log.userId === null && (log.level === "warn" || log.level === "error")));
});

test("projection allowlist, size and ownership rules", async (t) => {
  await reset();
  const base = makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "A", fields: { status: 500, pageId: "page-1", token: "sentinel-token", body: "sentinel-body", error: "sentinel-error", path: "/sentinel-path", message: "sentinel-message" } });
  const projected = store.projectOperationLog(base);
  assert.ok(projected);
  assert.ok(!projected!.metadataJson.includes("sentinel"));
  assert.ok(projected!.metadataJson.includes("500"));
  assert.ok(projected!.metadataJson.includes("page-1"));
  assert.equal(store.projectOperationLog(makeEvent({ component: "timesheet", operation: "save", level: "debug", userId: "A" })), null);
  assert.equal(store.projectOperationLog(makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "x".repeat(200) })), null);
  assert.equal(store.projectOperationLog(makeEvent({ component: "timesheet", operation: "save", level: "info" })), null);
  assert.equal(store.projectOperationLog(makeEvent({ component: "custom", operation: "user_action", level: "info" })), null);
  assert.ok(store.projectOperationLog(makeEvent({ component: "server", operation: "startup", level: "info" })));
  const big = store.projectOperationLog(makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", fields: { reason: "x".repeat(5000) } }));
  assert.ok(big);
  assert.ok((JSON.parse(big!.metadataJson) as { reason: string }).reason.length <= 256);
  const hugeFields: Record<string, string> = {};
  for (let i = 0; i < 40; i++) hugeFields[`reason${i}`] = "y".repeat(200);
  const huge = store.projectOperationLog(makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", fields: { status: 1, ...(hugeFields as unknown as LogFields) } }));
  assert.ok(huge === null || Buffer.byteLength(huge!.metadataJson, "utf8") <= 4096);
  const commonStripped = store.projectOperationLog(makeEvent({ component: "server", operation: "startup", level: "warn", fields: { pageId: "p1", status: 500 } }));
  assert.ok(commonStripped);
  assert.ok(!commonStripped!.metadataJson.includes("p1"));
  t.mock.property(process, "env", { ...process.env });
});

test("read receipts are per-viewer and snapshot race safe", async () => {
  await reset();
  await store.appendOperationLogs([
    makeEvent({ component: "server", operation: "startup", level: "error", eventId: "e1" }),
    makeEvent({ component: "server", operation: "startup", level: "warn", eventId: "e2" }),
    makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "M1", eventId: "e3" })
  ]);
  const m1 = { userId: "M1", role: "ADMIN" } as const;
  const m2 = { userId: "M2", role: "ADMIN" } as const;
  const before = await store.getUnreadLogSummary(m1);
  assert.equal(before.mine, 1);
  assert.equal(before.site, 2);
  assert.equal(before.total, 3);
  const sitePage = await store.listVisibleOperationLogs(m1, { scope: "site", periodDays: 7 });
  const snapshot = sitePage.snapshotMaxId;
  assert.equal(sitePage.items.length, 2);
  await store.markOperationLogRead(m1, sitePage.items[0]!.id);
  assert.equal((await store.getUnreadLogSummary(m1)).site, 1);
  assert.equal((await store.getUnreadLogSummary(m2)).site, 2);
  await store.appendOperationLogs([makeEvent({ component: "server", operation: "startup", level: "error", eventId: "e-new" })]);
  await store.markAllOperationLogsRead(m1, "site", snapshot);
  const after = await store.getUnreadLogSummary(m1);
  assert.equal(after.site, 1);
  await store.markAllOperationLogsRead(m1, "site", snapshot);
  assert.equal((await store.getUnreadLogSummary(m1)).site, 1);
  assert.equal(await store.markOperationLogRead(m1, 999999), false);
  const infoEvent = makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "M1", eventId: "e-info" });
  await store.appendOperationLogs([infoEvent]);
  const infoRow = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "OperationLog" WHERE "eventId" = 'e-info'`);
  assert.equal(await store.markOperationLogRead(m1, infoRow[0]!.id), true);
  const receipts = await prisma.$queryRawUnsafe<Array<{ logId: number }>>(`SELECT "logId" FROM "OperationLogRead" WHERE "viewerUserId" = 'M1' AND "logId" = ?`, infoRow[0]!.id);
  assert.equal(receipts.length, 0);
  const summaryWithMax = await store.getUnreadLogSummary(m1);
  assert.ok(summaryWithMax.mineMaxId >= infoRow[0]!.id);
  assert.ok(summaryWithMax.siteMaxId > 0);
});

test("admin to user transition loses site access immediately", async () => {
  await reset();
  await store.appendOperationLogs([
    makeEvent({ component: "server", operation: "startup", level: "error", eventId: "role-common" }),
    makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "R1", eventId: "role-mine" })
  ]);
  const admin = { userId: "R1", role: "ADMIN" } as const;
  const site = await store.listVisibleOperationLogs(admin, { scope: "site", periodDays: 7 });
  assert.equal(site.items.length, 1);
  const demoted = { userId: "R1", role: "USER" } as const;
  await assert.rejects(store.listVisibleOperationLogs(demoted, { scope: "site", periodDays: 7 }), /forbidden/);
  assert.equal(await store.getVisibleOperationLogDetail(demoted, site.items[0]!.id), null);
  const mine = await store.listVisibleOperationLogs(demoted, { scope: "mine", periodDays: 7 });
  assert.equal(mine.items.length, 1);
  assert.equal((await store.getUnreadLogSummary(demoted)).site, 0);
});

test("cutoff-or-older rows are invisible to reads and removed by prune", async () => {
  await reset();
  const now = new Date("2026-10-07T00:00:00.000Z");
  const infoCutoff = new Date(now.getTime() - 7 * 86400000).toISOString();
  const warnCutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
  await store.appendOperationLogs([
    makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", timestamp: infoCutoff, eventId: "edge-info" }),
    makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "A", timestamp: warnCutoff, eventId: "edge-error" }),
    makeEvent({ component: "server", operation: "startup", level: "error", timestamp: warnCutoff, eventId: "edge-common" })
  ]);
  const viewer = { userId: "A", role: "USER" } as const;
  const page = await store.listVisibleOperationLogs(viewer, { scope: "mine", periodDays: 30 }, now);
  assert.equal(page.items.length, 0);
  assert.equal((await store.getUnreadLogSummary(viewer, now)).mine, 0);
  const edgeRow = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "OperationLog" WHERE "eventId" = 'edge-error'`);
  assert.equal(await store.markOperationLogRead(viewer, edgeRow[0]!.id, now), false);
  await store.pruneOperationLogs(now);
  const remaining = await prisma.$queryRawUnsafe<Array<{ eventId: string }>>(`SELECT "eventId" FROM "OperationLog"`);
  assert.equal(remaining.length, 0);
});

test("list snapshot is pinned before rows so later inserts stay outside", async () => {
  await reset();
  const viewer = { userId: "A", role: "USER" } as const;
  await store.appendOperationLogs([
    makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", eventId: "pin-1" })
  ]);
  const first = await store.listVisibleOperationLogs(viewer, { scope: "mine", periodDays: 7 });
  assert.equal(first.items.length, 1);
  await store.appendOperationLogs([
    makeEvent({ component: "timesheet", operation: "save", level: "warn", userId: "A", eventId: "pin-2" })
  ]);
  assert.ok(first.snapshotMaxId < (await store.listVisibleOperationLogs(viewer, { scope: "mine", periodDays: 7 })).snapshotMaxId);
  await store.markAllOperationLogsRead(viewer, "mine", first.snapshotMaxId);
  const summary = await store.getUnreadLogSummary(viewer);
  assert.equal(summary.mine, 1);
  assert.ok(summary.mineMaxId > first.snapshotMaxId);
});

test("retention, cap, cursor and re-init", async () => {
  await reset();
  const now = new Date("2026-10-07T00:00:00.000Z");
  const oldInfo = new Date(now.getTime() - 8 * 86400000).toISOString();
  const oldWarn = new Date(now.getTime() - 31 * 86400000).toISOString();
  await store.appendOperationLogs([
    makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", timestamp: oldInfo, eventId: "old-info" }),
    makeEvent({ component: "timesheet", operation: "save", level: "warn", userId: "A", timestamp: oldWarn, eventId: "old-warn" }),
    makeEvent({ component: "timesheet", operation: "save", level: "warn", userId: "A", timestamp: now.toISOString(), eventId: "fresh" })
  ]);
  const page = await store.listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "mine", periodDays: 30 }, now);
  assert.equal(page.items.length, 1);
  assert.equal(await store.markOperationLogRead({ userId: "A", role: "USER" }, 1, now), false);
  await store.pruneOperationLogs(now);
  const remaining = await prisma.$queryRawUnsafe<Array<{ eventId: string }>>(`SELECT "eventId" FROM "OperationLog"`);
  assert.ok(!remaining.some((row) => row.eventId === "old-info" || row.eventId === "old-warn"));
  const sameTs = now.toISOString();
  const bulk: OperationLogEvent[] = Array.from({ length: 55 }, (_, i) => makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", timestamp: sameTs, eventId: `bulk-${i}`, operationId: "op-bulk" }));
  await store.appendOperationLogs(bulk);
  const p1 = await store.listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "mine", periodDays: 7 }, now);
  assert.equal(p1.items.length, 50);
  assert.ok(p1.nextCursor);
  const p2 = await store.listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "mine", periodDays: 7, beforeId: p1.nextCursor! }, now);
  assert.ok(p2.items.length > 0);
  const ids1 = new Set(p1.items.map((item) => item.id));
  assert.ok(p2.items.every((item) => !ids1.has(item.id)));
  await store.ensureOperationLogSchema();
  const afterReinit = await store.listVisibleOperationLogs({ userId: "A", role: "USER" }, { scope: "mine", periodDays: 7 }, now);
  assert.ok(afterReinit.items.length > 0);
});

test("cap prefers deleting info", async () => {
  await reset();
  const now = new Date("2026-10-07T00:00:00.000Z");
  const events: OperationLogEvent[] = [];
  for (let i = 0; i < 10; i++) events.push(makeEvent({ component: "timesheet", operation: "save", level: "info", userId: "A", timestamp: now.toISOString(), eventId: `cap-info-${i}` }));
  for (let i = 0; i < 5; i++) events.push(makeEvent({ component: "timesheet", operation: "save", level: "error", userId: "A", timestamp: now.toISOString(), eventId: `cap-err-${i}` }));
  await store.appendOperationLogs(events);
  await prisma.$executeRawUnsafe(`INSERT INTO "OperationLog" ("eventId","timestamp","level","component","operation","result","operationId","userId","durationMs","metadataJson") SELECT 'pad-' || "id", "timestamp","level","component","operation","result","operationId","userId","durationMs","metadataJson" FROM "OperationLog" LIMIT 5`);
  await store.pruneOperationLogs(now);
  const count = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*) AS "count" FROM "OperationLog"`);
  assert.ok(Number(count[0]!.count) <= 50000);
});

after(async () => {
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
