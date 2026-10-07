import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Notion sync logs per-page failures, skip reasons and partial pagination with a shared operation ID", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-notion-log-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replace(/\\/g, "/")}`;
  const [{ prisma }, { ensureApplicationSchema }, store, { syncNotionWorkHoursForPages }, { syncNotionCardsForDate }] = await Promise.all([
    import("./client"), import("./settings-store"), import("./notion-store"), import("./notion-work-hours-sync"), import("./notion-sync")
  ]);
  const lines: string[] = [];
  for (const level of ["info", "warn", "error"] as const) t.mock.method(console, level, (line: string) => lines.push(line));
  try {
    await ensureApplicationSchema();
    await prisma.$executeRawUnsafe(`INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, "user-1", "tester", "hash");
    const missing = await syncNotionWorkHoursForPages({ userId: "user-1", notionPageIds: ["page-1"] });
    assert.equal(missing.skippedReason, "missing_connection");
    assert.ok(lines.some((line) => JSON.parse(line).skippedReason === "missing_connection"));

    await store.upsertUserNotionConnection({ userId: "user-1", accessToken: "ntn_private_token", connection: {
      analysisConfigVersion: 1, authType: "internal_token", dataSourceId: "source-1", databaseId: "database-1",
      dataSourceName: "Private source", sourceInput: "source-1", notionApiVersion: "2026-03-11",
      dateMappingMode: "separate_properties", doneStatusValues: ["Done"],
      titleProperty: { id: "title", name: "Private title", type: "title" }, statusProperty: null, categoryProperty: null,
      startDateProperty: { id: "start", name: "Start", type: "date" }, endDateProperty: null,
      workHoursProperty: { id: "hours", name: "Hours", type: "number" }, workDayCountProperty: null,
      availableHoursProperty: null, lastWorkedDateProperty: null, ajamLastUpdateProperty: null
    } });
    lines.length = 0;
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ code: "validation_error" }), { status: 400 }));
    const result = await syncNotionWorkHoursForPages({ userId: "user-1", notionPageIds: ["page-1"], context: { source: "timesheet_save", operationId: "save-1" } });
    assert.equal(result.failed, 1);
    const failure = lines.map((line) => JSON.parse(line)).find((record) => record.result === "page_failed");
    assert.equal(failure.pageId, "page-1");
    assert.equal(failure.source, "timesheet_save");
    assert.ok(lines.every((line) => JSON.parse(line).operationId === "save-1"));
    assert.ok(!lines.join("").includes("ntn_private_token"));

    lines.length = 0;
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ results: [], has_more: true, next_cursor: "cursor" })));
    await syncNotionCardsForDate({ userId: "user-1", dateKey: "2026-10-07", context: { source: "card_picker", operationId: "picker-1" } });
    const partial = lines.map((line) => JSON.parse(line)).find((record) => record.result === "partial");
    assert.equal(partial.requestCount, 20);
    assert.equal(partial.level, "warn");
    assert.ok(lines.every((line) => JSON.parse(line).operationId === "picker-1"));
    const run = await store.getLatestNotionSyncRun({ userId: "user-1", scopeType: "date", scopeStartDate: "2026-10-07", scopeEndDate: "2026-10-07" });
    assert.equal(run?.partial, true);

    lines.length = 0;
    fetchMock.mock.mockImplementation(async () => new Response("private card contents"));
    await assert.rejects(syncNotionCardsForDate({ userId: "user-1", dateKey: "2026-10-07", context: { source: "card_picker" } }), SyntaxError);
    assert.ok(lines.some((line) => JSON.parse(line).result === "failed"));
    assert.ok(!lines.join("").includes("private card contents"));

    const { handleNotionWebhook } = await import("./notion-webhook");
    const webhook = await store.getOrCreateNotionWebhookSettings("user-1");
    await store.setNotionWebhookVerificationToken({ userId: "user-1", token: "verification-private" });
    const sendEvent = (eventId: string, eventType: string, data = {}) => {
      const rawBody = JSON.stringify({ id: eventId, type: eventType, entity: { type: "page", id: "page-1" }, data });
      const signature = `sha256=${createHmac("sha256", "verification-private").update(rawBody).digest("hex")}`;
      return handleNotionWebhook({ connectionId: webhook.connectionId, rawBody, signature, context: { source: "webhook", operationId: "webhook-1" } });
    };
    lines.length = 0;
    assert.equal(await sendEvent("event-1", "page.content_updated"), "ignored");
    assert.equal(await sendEvent("event-1", "page.content_updated"), "duplicate");
    assert.equal(await sendEvent("event-2", "page.properties_updated", { updated_properties: ["hours"] }), "ignored");
    const ignored = lines.map((line) => JSON.parse(line)).filter((record) => record.result === "ignored");
    assert.deepEqual(ignored.map((record) => record.reason), ["unsupported_event", "no_input_property_changes"]);
    assert.ok(ignored.every((record) => record.userId === "user-1"));
    assert.ok(!lines.join("").includes("verification-private"));
  } finally {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
