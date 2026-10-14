import assert from "node:assert/strict";
import test from "node:test";

import { formatLogSummary, formatUnreadBadge } from "./log-presentation.ts";

function makeLog(overrides = {}) {
  return {
    component: "timesheet",
    dateKey: null,
    durationMs: 5,
    id: 1,
    level: "info",
    metadata: {},
    operation: "save",
    operationId: "op-1",
    result: "completed",
    source: null,
    timestamp: new Date().toISOString(),
    unread: false,
    userId: "A",
    ...overrides
  };
}

test("badge hides zero and caps at 99+", () => {
  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(-3), null);
  assert.equal(formatUnreadBadge(99), "99");
  assert.equal(formatUnreadBadge(100), "99+");
  assert.equal(formatUnreadBadge(250), "99+");
});

test("unknown operations and error sentinels never leak into labels", () => {
  const summary = formatLogSummary(makeLog({ component: "mystery", operation: "mystery_op", result: "mystery_result", metadata: { message: "sentinel-secret", error: "sentinel-secret" } }));
  assert.ok(!summary.includes("sentinel"));
  assert.ok(summary.includes("기타"));
});

test("started info is not shown as completed success", () => {
  const started = formatLogSummary(makeLog({ result: "started" }));
  assert.ok(!started.includes("완료"));
  assert.ok(started.includes("시작"));
  const completed = formatLogSummary(makeLog({ result: "completed" }));
  assert.ok(completed.includes("완료"));
});
