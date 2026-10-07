import assert from "node:assert/strict";
import test from "node:test";

import { createNotionLog, notionErrorMessage } from "./notion-log";
import { requestNotionApi } from "./notion-api";
import { updateNotionPageProperties } from "./notion-page-update";

test("Notion logs preserve correlation, route levels, and select context without credentials", (t) => {
  const lines: string[] = [];
  for (const level of ["info", "warn", "error"] as const) {
    t.mock.method(console, level, (line: string) => lines.push(line));
  }
  const log = createNotionLog("test", { source: "card_picker", token: "never-log-me" } as { source: string });
  for (const level of ["info", "warn", "error"] as const) log.write(level, "completed", { userId: "user-1" });
  const records = lines.map((line) => JSON.parse(line));
  assert.equal(new Set(records.map((record) => record.operationId)).size, 1);
  assert.deepEqual(records.map((record) => record.level), ["info", "warn", "error"]);
  assert.ok(records.every((record) => record.userId === "user-1" && record.component === "notion" && record.durationMs >= 0));
  assert.ok(!lines.join("").includes("never-log-me"));
  assert.equal(notionErrorMessage(new Error("Bearer abc ntn_xyz secret_123")), "[REDACTED] [REDACTED] [REDACTED]");
  assert.ok(!notionErrorMessage(new SyntaxError("private card contents")).includes("private card contents"));
  const databaseError = new Error("private SQL parameters");
  databaseError.name = "PrismaClientKnownRequestError";
  assert.equal(notionErrorMessage(databaseError), "PrismaClientKnownRequestError");
});

test("Notion PATCH failure logs status, retry hints and correlation without request or response content", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "error", (line: string) => lines.push(line));
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal(init.method, "PATCH");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer private-token");
    return new Response(JSON.stringify({ code: "rate_limited", message: "private-response-content" }), {
      status: 429, headers: { "retry-after": "10", "x-request-id": "request-1" }
    });
  });
  await assert.rejects(updateNotionPageProperties({
    pageId: "page-1", token: "private-token", properties: { private_field: { number: 2 } },
    context: { operationId: "save-1", source: "timesheet_save", userId: "user-1" }
  }), /429/);
  const record = JSON.parse(lines[0]!);
  assert.equal(record.status, 429);
  assert.equal(record.errorCode, "rate_limited");
  assert.equal(record.retryAfter, "10");
  assert.equal(record.requestId, "request-1");
  assert.equal(record.operationId, "save-1");
  assert.equal(record.source, "timesheet_save");
  for (const secret of ["private-token", "private_field", "private-response-content"]) assert.ok(!lines.join("").includes(secret));
});

test("Notion API logs successful calls and network failures and keeps thrown errors", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "info", (line: string) => lines.push(line));
  t.mock.method(console, "error", (line: string) => lines.push(line));
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));
  const params = { method: "GET" as const, path: "/v1/pages/page-1", token: "secret_token", errorMessage: () => "failed" };
  await requestNotionApi(params);
  const failure = new Error("network failed Bearer hidden");
  fetchMock.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(requestNotionApi(params), (error) => error === failure);
  assert.deepEqual(lines.map((line) => JSON.parse(line).result), ["success", "network_failed"]);
  assert.ok(!lines.join("").includes("hidden"));
});

test("Non-JSON Notion errors still log HTTP failures and preserve the mapped error", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "error", (line: string) => lines.push(line));
  t.mock.method(globalThis, "fetch", async () => new Response("private upstream HTML", { status: 502 }));
  await assert.rejects(requestNotionApi({ method: "GET", path: "/v1/pages/page-1", token: "token", errorMessage: (status) => `failure ${status}` }), /failure 502/);
  assert.equal(JSON.parse(lines[0]!).status, 502);
  assert.ok(!lines[0]!.includes("private upstream HTML"));
});
