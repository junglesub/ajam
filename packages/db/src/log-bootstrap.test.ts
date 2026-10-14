import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

const directory = await mkdtemp(join(tmpdir(), "ajam-log-bootstrap-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;
process.env.AJAM_LOG_LEVEL = "info";

const [{ prisma }, store, logging, bootstrap] = await Promise.all([
  import("./client"),
  import("./operation-log-store"),
  import("./operation-log"),
  import("../../../apps/web/src/server/operational-logging")
]);

async function waitForMine(userId: string, result: string, timeoutMs = 12000) {
  const started = Date.now();
  for (;;) {
    const page = await logging.withoutOperationLogPersistence(() =>
      store.listVisibleOperationLogs({ userId, role: "USER" }, { scope: "mine", periodDays: 7 }));
    if (page.items.some((item) => item.result === result)) return page;
    if (Date.now() - started > timeoutMs) return page;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

test("production bootstrap drains logger events without manual flush", async () => {
  await bootstrap.initializeOperationalLogging();
  logging.createOperationLog("timesheet", "save", { userId: "boot-A" }).write("warn", "completed", { status: 200 });
  logging.createOperationLog("server", "startup").write("error", "failed", { status: 500 });
  const mine = await waitForMine("boot-A", "completed");
  assert.ok(mine.items.length >= 1);
  assert.ok(mine.items.every((item) => item.userId === "boot-A"));
  const site = await logging.withoutOperationLogPersistence(() =>
    store.listVisibleOperationLogs({ userId: "boot-admin", role: "ADMIN" }, { scope: "site", periodDays: 7 }));
  assert.ok(site.items.length >= 1);
});

test("auto drain suppression never blocks later business logs", async () => {
  logging.withoutOperationLogPersistence(() => {
    logging.createOperationLog("timesheet", "save", { userId: "boot-B" }).write("info", "suppressed-check");
  });
  logging.createOperationLog("timesheet", "save", { userId: "boot-B" }).write("warn", "after-drain");
  const mine = await waitForMine("boot-B", "after-drain");
  assert.ok(mine.items.some((item) => item.result === "after-drain"));
  assert.ok(!mine.items.some((item) => item.result === "suppressed-check"));
});

test("duplicate initialization keeps a single writer", async () => {
  await bootstrap.initializeOperationalLogging();
  await bootstrap.initializeOperationalLogging();
  logging.createOperationLog("timesheet", "save", { userId: "boot-C" }).write("warn", "single-copy");
  const mine = await waitForMine("boot-C", "single-copy");
  assert.equal(mine.items.filter((item) => item.result === "single-copy").length, 1);
});

after(async () => {
  logging.setOperationLogSink(null);
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
