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
test("icon bulk sync and retry/interrupted/progress results format in Korean", () => {
  const syncProgress = formatLogSummary(
    makeLog({ component: "notion", level: "info", operation: "icon_bulk_sync", result: "progress" })
  );
  assert.equal(syncProgress, "Notion 아이콘 동기화 진행 중 · 정보");

  const syncInterrupted = formatLogSummary(
    makeLog({ component: "notion", level: "warn", operation: "icon_bulk_sync", result: "interrupted" })
  );
  assert.equal(syncInterrupted, "Notion 아이콘 동기화 중단됨 · 경고");

  const syncRetrying = formatLogSummary(
    makeLog({ component: "notion", level: "warn", metadata: { status: 429 }, operation: "icon_bulk_sync", result: "retrying" })
  );
  assert.equal(syncRetrying, "Notion 아이콘 동기화 재시도 중 · 경고 (상태 429)");

  const pageFailed = formatLogSummary(
    makeLog({ component: "notion", level: "error", operation: "icon_bulk_sync", result: "page_failed" })
  );
  assert.equal(pageFailed, "Notion 아이콘 동기화 페이지 실패 · 오류");

  const syncPartial = formatLogSummary(
    makeLog({ component: "notion", level: "warn", operation: "icon_bulk_sync", result: "partial" })
  );
  assert.equal(syncPartial, "Notion 아이콘 동기화 일부 완료 · 경고");
});
