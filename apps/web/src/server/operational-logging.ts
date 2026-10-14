import { setOperationLogSink, withoutOperationLogPersistence, type OperationLogEvent } from "@timesheet/db/logging";
import { createLogPersistenceQueue } from "@timesheet/db/log-persistence-queue";

type GlobalLoggingState = {
  __ajamOperationalLogging?: { drainStarted: boolean; initialized: boolean };
  __ajamLastLogPruneAt?: number;
};

const FLUSH_INTERVAL_MS = 2000;
const PRUNE_INTERVAL_MS = 3600000;

export async function initializeOperationalLogging(): Promise<void> {
  const state = globalThis as unknown as GlobalLoggingState;
  // HMR and duplicate module evaluation reuse the first sink/queue instead of
  // registering a second writer. The flag lives on globalThis so it survives
  // hot reloads; the queue/interval below are created exactly once.
  if (state.__ajamOperationalLogging?.initialized) return;
  state.__ajamOperationalLogging = { drainStarted: false, initialized: true };
  const queue = createLogPersistenceQueue(async (events: OperationLogEvent[]) => {
    await withoutOperationLogPersistence(async () => {
      const store = await import("@timesheet/db/operational-logs");
      await store.appendOperationLogs(events);
      const lastPrune = state.__ajamLastLogPruneAt ?? 0;
      if (Date.now() - lastPrune >= PRUNE_INTERVAL_MS) {
        state.__ajamLastLogPruneAt = Date.now();
        await store.pruneOperationLogs(new Date());
      }
    });
  });
  setOperationLogSink((event) => queue.enqueue(event));
  try {
    await withoutOperationLogPersistence(async () => {
      const store = await import("@timesheet/db/operational-logs");
      await store.ensureOperationLogSchema();
    });
  } catch (error) {
    try {
      console.warn(JSON.stringify({ level: "warn", component: "db", operation: "log_schema", result: "unavailable" }));
    } catch {
      // ignore
    }
    void error;
  }
  if (!state.__ajamOperationalLogging.drainStarted && typeof setInterval !== "undefined") {
    state.__ajamOperationalLogging.drainStarted = true;
    // The drain only runs the queue's own flush; suppression stays inside
    // writeBatch, so business logs keep collecting while a drain is in flight.
    const timer = setInterval(() => {
      void queue.flush();
    }, FLUSH_INTERVAL_MS);
    const unref = (timer as unknown as { unref?: () => void }).unref;
    if (typeof unref === "function") unref.call(timer);
  }
}
