import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import type { OperationLogEvent } from "./operation-log";

const directory = await mkdtemp(join(tmpdir(), "ajam-log-viewer-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;
process.env.AJAM_LOG_LEVEL = "info";

const [{ prisma }, store, logging, queueModule] = await Promise.all([
  import("./client"), import("./operation-log-store"), import("./operation-log"), import("./log-persistence-queue")
]);

test("viewer queries isolate owners, share nothing across admins, and never persist themselves", async () => {
  const collected: OperationLogEvent[] = [];
  logging.setOperationLogSink((event) => {
    collected.push(event);
  });
  try {
    await store.ensureOperationLogSchema();
    const queue = queueModule.createLogPersistenceQueue(async (events) => {
      await logging.withoutOperationLogPersistence(async () => {
        await store.appendOperationLogs(events);
      });
    });
    logging.setOperationLogSink((event) => queue.enqueue(event));
    const { createOperationLog } = logging;
    await createOperationLog("timesheet", "save", { userId: "viewer-A" }).run(async () => {
      createOperationLog("notion", "candidates", { userId: "viewer-A" }).write("warn", "cache_fallback", { cardsFetched: 2 });
    });
    await createOperationLog("ai", "scheduled_user", { userId: "viewer-A" }).run(async () => {
      throw new Error("gemini down");
    }).catch(() => {});
    createOperationLog("auth", "internal_api").write("warn", "rejected", { reason: "missing_or_invalid_token" });
    await queue.flush();
    const countRows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(`SELECT COUNT(*) AS "count" FROM "OperationLog"`);
    assert.ok(Number(countRows[0]!.count) >= 3);
    const seenBefore = collected.length;
    const mine = await logging.withoutOperationLogPersistence(() =>
      store.listVisibleOperationLogs({ userId: "viewer-A", role: "USER" }, { scope: "mine", periodDays: 7 }));
    assert.ok(mine.items.length > 0);
    assert.ok(mine.items.every((item) => item.userId === "viewer-A"));
    assert.ok(mine.items.some((item) => item.level === "warn"));
    await logging.withoutOperationLogPersistence(() => store.getUnreadLogSummary({ userId: "viewer-A", role: "USER" }));
    await queue.flush();
    const countAfter = await prisma.$queryRawUnsafe<Array<{ count: number | bigint }>>(`SELECT COUNT(*) AS "count" FROM "OperationLog"`);
    assert.equal(Number(countAfter[0]!.count), Number(countRows[0]!.count));
    assert.equal(collected.length, seenBefore);
    const adminSummary = await logging.withoutOperationLogPersistence(() =>
      store.getUnreadLogSummary({ userId: "admin-1", role: "ADMIN" }));
    assert.equal(adminSummary.site, 1);
    assert.ok(adminSummary.siteMaxId > 0);
    assert.ok(adminSummary.mineMaxId === 0);
    const site = await logging.withoutOperationLogPersistence(() =>
      store.listVisibleOperationLogs({ userId: "admin-1", role: "ADMIN" }, { scope: "site", periodDays: 7 }));
    assert.equal(site.items.length, 1);
    await logging.withoutOperationLogPersistence(() => store.markOperationLogRead({ userId: "admin-1", role: "ADMIN" }, site.items[0]!.id));
    assert.equal((await logging.withoutOperationLogPersistence(() =>
      store.getUnreadLogSummary({ userId: "admin-2", role: "ADMIN" }))).site, 1);
    assert.equal((await logging.withoutOperationLogPersistence(() =>
      store.getUnreadLogSummary({ userId: "admin-1", role: "ADMIN" }))).site, 0);
  } finally {
    logging.setOperationLogSink(null);
  }
});

after(async () => {
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
