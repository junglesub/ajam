import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createLogPersistenceQueue } from "./log-persistence-queue";
import type { OperationLogEvent } from "./operation-log";

function makeEvent(level: OperationLogEvent["level"] = "info"): OperationLogEvent {
  return {
    component: "timesheet", operation: "save", result: "completed",
    timestamp: new Date().toISOString(), level, durationMs: 1,
    eventId: randomUUID(), operationId: randomUUID(), userId: "A", fields: {}
  };
}

test("batches FIFO at 100 and caps at 1000 with info-first drop", async () => {
  const batches: OperationLogEvent[][] = [];
  const queue = createLogPersistenceQueue(async (events) => {
    batches.push(events);
  });
  for (let i = 0; i < 1005; i++) queue.enqueue(makeEvent(i < 5 ? "error" : "info"));
  assert.equal(batches.length, 0);
  await queue.flush();
  assert.equal(batches.length, 10);
  assert.equal(batches[0]!.length, 100);
  const levels = batches.flat().map((event) => event.level);
  assert.equal(levels.filter((level) => level === "error").length, 5);
  assert.equal(levels.length, 1000);
});

test("drops oldest when no info present and discards failed batches", async (t) => {
  const seen: string[] = [];
  let calls = 0;
  const queue = createLogPersistenceQueue(async (events) => {
    calls += 1;
    if (calls === 1) throw new Error("db down");
    seen.push(...events.map((event) => event.eventId));
  });
  const lines: string[] = [];
  t.mock.method(console, "warn", (line: string) => lines.push(line));
  for (let i = 0; i < 1002; i++) queue.enqueue(makeEvent("error"));
  await queue.flush();
  assert.equal(calls, 10);
  assert.equal(seen.length, 900);
  assert.ok(lines.length <= 1);
  await queue.flush();
});

test("console summary is rate limited to 60s", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const lines: string[] = [];
  t.mock.method(console, "warn", (line: string) => lines.push(line));
  const queue = createLogPersistenceQueue(async () => {
    throw new Error("down");
  });
  queue.enqueue(makeEvent("error"));
  await queue.flush();
  queue.enqueue(makeEvent("error"));
  now += 1000;
  await queue.flush();
  queue.enqueue(makeEvent("error"));
  now += 61000;
  await queue.flush();
  assert.ok(lines.length <= 2);
});
