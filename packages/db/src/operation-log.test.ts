import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createOperationLog, safeErrorFields, setOperationLogSink, withRequestLog, withoutOperationLogPersistence } from "./operation-log";
import { createNotionLog } from "./notion-log";

function capture(t: TestContext) {
  const lines: string[] = [];
  for (const level of ["info", "warn", "error"] as const) t.mock.method(console, level, (line: string) => lines.push(line));
  t.mock.property(process, "env", { ...process.env, AJAM_LOG_LEVEL: "info" });
  return lines;
}

test("parallel requests keep isolated IDs and nested Notion logs inherit their request ID", async (t) => {
  const lines = capture(t);
  const handler = withRequestLog("/api/example/[id]", async (_request: Request, context: { id: string }) => {
    await Promise.resolve();
    createNotionLog("nested").write("info", "completed", { itemId: context.id });
    return new Response(null, { status: 204 });
  });
  await Promise.all(["one", "two"].map((id) => handler(new Request(`https://example.com/api/example/${id}?key=private`), { id })));
  const records = lines.map((line) => JSON.parse(line));
  assert.equal(new Set(records.map((record) => record.operationId)).size, 2);
  for (const nested of records.filter((record) => record.component === "notion")) {
    assert.equal(records.filter((record) => record.operationId === nested.operationId).length, 3);
  }
  assert.ok(!lines.join("").includes("private"));
});

test("request logging preserves responses, classifies failures and suppresses healthcheck output", async (t) => {
  const lines = capture(t);
  const response = new Response("private response", { status: 401 });
  assert.equal(await withRequestLog("/api/private", async () => response)(new Request("https://example.com")), response);
  assert.equal(JSON.parse(lines.at(-1)!).level, "warn");
  lines.length = 0;
  await withRequestLog("/api/health", async () => response)(new Request("https://example.com"));
  assert.equal(lines.length, 0);
  const failure = Object.assign(new Error("password=private SQL contents"), { code: "SQLITE_BUSY" });
  await assert.rejects(withRequestLog("/api/private", async () => { throw failure; })(new Request("https://example.com")), (error) => error === failure);
  const record = JSON.parse(lines.at(-1)!);
  assert.equal(record.status, 500);
  assert.equal(record.errorCode, "SQLITE_BUSY");
  assert.ok(!lines.join("").includes("private SQL"));
});

test("slow requests and batches with failures are warnings", async (t) => {
  const lines = capture(t);
  let now = 0;
  t.mock.method(Date, "now", () => now);
  await withRequestLog("/api/slow", async () => { now = 2500; return new Response(); })(new Request("https://example.com"));
  assert.equal(JSON.parse(lines.at(-1)!).slow, true);
  assert.equal(JSON.parse(lines.at(-1)!).level, "warn");
  await createOperationLog("ai", "batch").run(async () => ({ failed: 1 }), {}, (result) => ({ failedUsers: result.failed }));
  assert.equal(JSON.parse(lines.at(-1)!).level, "warn");
});

test("debug events are opt-in and error metadata never includes error messages", (t) => {
  const lines = capture(t);
  createOperationLog("auth", "session").write("debug", "expired");
  assert.equal(lines.length, 0);
  process.env.AJAM_LOG_LEVEL = "debug";
  createOperationLog("auth", "session").write("debug", "expired");
  assert.equal(JSON.parse(lines[0]!).level, "debug");
  assert.deepEqual(safeErrorFields(new SyntaxError("private response")), { errorType: "SyntaxError", errorCode: undefined, reason: "invalid_json" });
});

test("invalid date input and non-scalar metadata cannot expose rejected private input", async (t) => {
  const lines = capture(t);
  const failure = new Error("날짜 형식이 올바르지 않습니다.");
  const log = createOperationLog("timesheet", "save_action", { dateKey: "private-invalid-date" });
  await assert.rejects(log.run(async () => { throw failure; }), (error) => error === failure);
  log.write("info", "test", { year: "private-year", month: "private-month", extra: { body: "private-body" } } as unknown as Record<string, string>);
  assert.ok(!lines.join("").includes("private-"));
  assert.ok(lines.every((line) => JSON.parse(line).dateKey === undefined));
  createOperationLog("timesheet", "save", { dateKey: "2026-10-07" }).write("info", "completed", { year: 2026, month: 10 });
  assert.equal(JSON.parse(lines.at(-1)!).dateKey, "2026-10-07");
  assert.equal(JSON.parse(lines.at(-1)!).year, 2026);
});

test("sink receives info once when console threshold suppresses it, debug never sinks", (t) => {
  const lines = capture(t);
  process.env.AJAM_LOG_LEVEL = "error";
  const received: string[] = [];
  setOperationLogSink((event) => {
    received.push(`${event.level}:${event.operation}:${event.eventId}`);
  });
  try {
    createOperationLog("timesheet", "save", { userId: "u1" }).write("info", "completed", { status: 200 });
    createOperationLog("timesheet", "save", { userId: "u1" }).write("debug", "expired");
    assert.equal(lines.length, 0);
    assert.equal(received.length, 1);
    assert.ok(received[0]!.startsWith("info:save:"));
  } finally {
    setOperationLogSink(null);
  }
});

test("sink throw preserves run result, exception identity and response reference", async (t) => {
  capture(t);
  setOperationLogSink(() => {
    throw new Error("sink down");
  });
  try {
    const originalResult = { ok: true };
    assert.equal(await createOperationLog("ai", "batch").run(async () => originalResult), originalResult);
    const originalError = new Error("original");
    await assert.rejects(createOperationLog("ai", "batch").run(async () => {
      throw originalError;
    }), (error) => error === originalError);
    const originalResponse = new Response("x");
    assert.equal(await withRequestLog("/api/example", async () => originalResponse)(new Request("https://example.com")), originalResponse);
  } finally {
    setOperationLogSink(null);
  }
});

test("suppression scope blocks sink but keeps other concurrent tasks collecting", async () => {
  const received: string[] = [];
  setOperationLogSink((event) => {
    received.push(event.operationId);
  });
  try {
    await withoutOperationLogPersistence(async () => {
      createOperationLog("timesheet", "save", { userId: "u1" }).write("info", "suppressed");
      await Promise.all([
        (async () => {
          createOperationLog("timesheet", "save", { userId: "u2" }).write("info", "still-suppressed");
        })(),
        createOperationLog("ai", "batch").run(async () => 1)
      ]);
      assert.equal(received.length, 0);
    });
    const after: string[] = [];
    setOperationLogSink((event) => {
      after.push(event.operationId);
    });
    await Promise.all([
      withoutOperationLogPersistence(async () => {
        createOperationLog("timesheet", "save").write("info", "a");
      }),
      (async () => {
        createOperationLog("timesheet", "save").write("info", "b");
      })()
    ]);
    assert.equal(after.length, 1);
  } finally {
    setOperationLogSink(null);
  }
});
