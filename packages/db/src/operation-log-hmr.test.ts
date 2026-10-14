import assert from "node:assert/strict";
import test from "node:test";

import { createOperationLog, setOperationLogSink, type OperationLogEvent } from "./operation-log";

// A query-suffixed import forces a second evaluation of the logger module,
// simulating HMR or a duplicated module copy with reset module-local state.
// @ts-expect-error - the query suffix is intentional and unresolvable statically.
const hmrCopy = await import("./operation-log.ts?hmr-copy=1");

test("sink registry is shared across logger module copies", () => {
  const received: OperationLogEvent[] = [];
  setOperationLogSink((event) => {
    received.push(event);
  });
  try {
    hmrCopy.createOperationLog("timesheet", "save", { userId: "hmr-A" }).write("warn", "completed", {});
    assert.equal(received.length, 1);
    assert.equal(received[0]!.operation, "save");
  } finally {
    setOperationLogSink(null);
  }
});

test("re-registration through a re-evaluated copy keeps a single writer", () => {
  const received: OperationLogEvent[] = [];
  hmrCopy.setOperationLogSink((event: OperationLogEvent) => {
    received.push(event);
  });
  try {
    createOperationLog("timesheet", "save", { userId: "hmr-B" }).write("warn", "completed", {});
    hmrCopy.createOperationLog("timesheet", "save", { userId: "hmr-B" }).write("warn", "completed", {});
    assert.equal(received.length, 2);
  } finally {
    hmrCopy.setOperationLogSink(null);
  }
  createOperationLog("timesheet", "save", { userId: "hmr-B" }).write("warn", "completed", {});
  assert.equal(received.length, 2);
});
