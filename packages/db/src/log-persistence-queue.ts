import type { OperationLogEvent } from "./operation-log";

const MAX_QUEUE = 1000;
const FLUSH_BATCH = 100;
const SUMMARY_INTERVAL_MS = 60000;

export function createLogPersistenceQueue(writeBatch: (events: OperationLogEvent[]) => Promise<void>): {
  enqueue(event: OperationLogEvent): void;
  flush(): Promise<void>;
} {
  const pending: OperationLogEvent[] = [];
  let flushing = false;
  let lastSummaryAt = 0;
  let dropped = 0;

  function summarize(reason: string, count: number): void {
    const now = Date.now();
    if (now - lastSummaryAt < SUMMARY_INTERVAL_MS) return;
    lastSummaryAt = now;
    dropped = 0;
    try {
      console.warn(JSON.stringify({ timestamp: new Date(now).toISOString(), level: "warn", component: "db", operation: "log_persistence", result: reason, count }));
    } catch {
      // Console must never break the caller.
    }
  }

  function enqueue(event: OperationLogEvent): void {
    pending.push(event);
    if (pending.length > MAX_QUEUE) {
      const infoIndex = pending.findIndex((item) => item.level === "info");
      if (infoIndex >= 0) pending.splice(infoIndex, 1);
      else pending.shift();
      dropped += 1;
      summarize("queue_overflow_drop", dropped);
    }
  }

  async function flush(): Promise<void> {
    if (flushing) return;
    flushing = true;
    try {
      while (pending.length > 0) {
        const batch = pending.splice(0, FLUSH_BATCH);
        try {
          await writeBatch(batch);
        } catch {
          dropped += batch.length;
          summarize("write_batch_failed", batch.length);
        }
      }
    } finally {
      flushing = false;
    }
  }

  return { enqueue, flush };
}
