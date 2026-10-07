import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("internal API, authentication, holiday fallback and scheduled AI logs omit private data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-operation-log-"));
  t.mock.property(process, "env", { ...process.env, DATABASE_URL: `file:${join(directory, "test.db").replace(/\\/g, "/")}`, AJAM_LOG_LEVEL: "info", AJAM_INTERNAL_API_TOKEN: "" });
  const lines: string[] = [];
  for (const level of ["info", "warn", "error"] as const) t.mock.method(console, level, (line: string) => lines.push(line));
  const [{ prisma }, settings, store, aiSettings, ai, { POST }, { authenticateExtensionRequest }, { logHolidayFallback }] = await Promise.all([
    import("./client"), import("./settings-store"), import("./timesheet-store"), import("./ai-settings-store"),
    import("../../../apps/web/src/server/timesheet-ai-cleanup"),
    import("../../../apps/web/src/app/api/internal/notion/daily-maintenance/route"),
    import("../../../apps/web/src/server/extension-auth"), import("./operation-log")
  ]);
  try {
    await settings.ensureApplicationSchema();
    await prisma.$executeRawUnsafe(`INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, "user-1", "private-user", "private-hash");
    const request = () => new Request("https://example.com/api/internal/notion/daily-maintenance", { method: "POST", headers: { Authorization: "Bearer private-bearer", "Content-Type": "application/json" }, body: JSON.stringify({ dateKey: "invalid" }) });
    process.env.AJAM_INTERNAL_API_TOKEN = "";
    assert.equal((await POST(request())).status, 401);
    assert.ok(lines.some((line) => JSON.parse(line).reason === "token_not_configured"));
    process.env.AJAM_INTERNAL_API_TOKEN = "private-bearer";
    assert.equal((await POST(request())).status, 400);
    assert.ok(lines.some((line) => JSON.parse(line).reason === "invalid_date"));
    assert.equal(await authenticateExtensionRequest(new Request("https://example.com", { headers: { Authorization: "Bearer private-malformed" } }), "read"), null);
    assert.ok(lines.some((line) => JSON.parse(line).reason === "invalid_format"));

    await settings.setAppSetting("data_go_kr_service_key", "private-holiday-key");
    t.mock.method(globalThis, "fetch", async () => new Response("private provider response", { status: 503 }));
    assert.deepEqual(await store.listHolidays({ startDateKey: "2026-10-01", endDateKey: "2026-10-31" }).catch(logHolidayFallback), []);
    assert.ok(lines.some((line) => JSON.parse(line).result === "empty_fallback"));
    assert.ok(lines.some((line) => JSON.parse(line).component === "holiday" && JSON.parse(line).status === 503));

    await aiSettings.updateUserAiSetting("user-1", { apiKey: "private-gemini-key", enabled: true, cleanupMode: "scheduled", model: "test-model", contextDays: 0, backfillLimit: 1, backfillMissing: false });
    await store.saveTimesheetDay({ userId: "user-1", day: {
      dateKey: "2026-10-07", aiRewriteRequested: false, shortVersion: "", holidayName: "",
      entries: [{ id: "entry-1", clientId: "entry-1", kind: "WORK", hours: 8, content: "private-work-content", aiTranslation: "", project: "", holidayName: "", vacationName: "", vacationStatus: "CONFIRMED", sortOrder: 0, notionCards: [] }]
    } });
    const result = await ai.runScheduledTimesheetAiCleanup({ dateKey: "2026-10-07", lookbackDays: 1 });
    assert.equal(result.errors.length, 1);
    const records = lines.map((line) => JSON.parse(line));
    assert.ok(records.some((record) => record.component === "ai" && record.status === 503));
    assert.ok(records.some((record) => record.operation === "scheduled_user" && record.result === "failed" && record.userId === "user-1"));
    assert.ok(records.some((record) => record.operation === "scheduled_cleanup" && record.result === "completed" && record.failedUsers === 1 && record.level === "warn"));

    const [baseline] = await store.listTimesheetEntries({ userId: "user-1", startDateKey: "2026-10-07", endDateKey: "2026-10-07" });
    assert.ok(baseline);
    await store.saveTimesheetDay({ userId: "user-1", day: { ...baseline, shortVersion: "private concurrent summary" } });
    await assert.rejects(store.applyTimesheetAiSummaryPatches({
      userId: "user-1", days: [baseline], baseline: { days: [baseline] },
      patches: [{ dateKey: baseline.dateKey, shortVersion: "private imported summary", entries: [] }]
    }), /has changed/);
    assert.ok(lines.some((line) => JSON.parse(line).reason === "import_conflict"));
    await store.deleteTimesheetEntry({ userId: "user-1", dateKey: "2026-10-07" });
    assert.ok(lines.some((line) => JSON.parse(line).operation === "delete" && JSON.parse(line).result === "completed"));

    process.env.NEXT_RUNTIME = "nodejs";
    const instrumentation = await import("../../../apps/web/src/instrumentation");
    await instrumentation.register();
    await instrumentation.onRequestError(new SyntaxError("private render response"), {
      path: "/api/example?key=private", method: "GET", headers: { Authorization: "private" }
    }, { routePath: "/api/example", routeType: "route", routerKind: "App Router", revalidateReason: undefined });
    assert.ok(lines.some((line) => JSON.parse(line).operation === "startup"));
    assert.ok(lines.some((line) => JSON.parse(line).operation === "unhandled_error" && JSON.parse(line).reason === "invalid_json"));
    for (const secret of ["private-bearer", "private-holiday-key", "private-gemini-key", "private-work-content", "private provider response", "private-hash", "private-user"]) assert.ok(!lines.join("").includes(secret));
    for (const content of ["private concurrent summary", "private imported summary", "private render response", "key=private"]) assert.ok(!lines.join("").includes(content));
  } finally {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
