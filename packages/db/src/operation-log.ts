import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type LogContext = { operationId?: string; source?: string; userId?: string; dateKey?: string };
export type LogFields = Record<string, string | number | boolean | undefined>;
export type LogLevel = "debug" | "info" | "warn" | "error";
export type OperationLogEvent = {
  component: string;
  dateKey?: string;
  durationMs: number;
  eventId: string;
  fields: LogFields;
  level: Exclude<LogLevel, "debug"> | "debug";
  operation: string;
  operationId: string;
  result: string;
  source?: string;
  timestamp: string;
  userId?: string;
};
const contextStorage = new AsyncLocalStorage<LogContext>();
const suppressionStorage = new AsyncLocalStorage<boolean>();
const levels = { debug: 0, info: 1, warn: 2, error: 3 };
// The sink lives on globalThis so logger module re-evaluation (HMR) or a
// duplicated module copy never resets collection to null: every copy reads
// and writes the same shared registry, keeping a single writer.
const sinkRegistry = globalThis as unknown as {
  __ajamOperationLogSink?: ((event: OperationLogEvent) => void) | null;
};

export function setOperationLogSink(sink: ((event: OperationLogEvent) => void) | null): void {
  sinkRegistry.__ajamOperationLogSink = sink;
}

function getOperationLogSink(): ((event: OperationLogEvent) => void) | null {
  return sinkRegistry.__ajamOperationLogSink ?? null;
}

export function withoutOperationLogPersistence<T>(task: () => T): T {
  if (suppressionStorage.getStore()) return task();
  return suppressionStorage.run(true, task);
}

function isPersistenceSuppressed(): boolean {
  return suppressionStorage.getStore() === true;
}

/** Error messages may contain SQL values, response excerpts, URLs or credentials. */
export function safeErrorFields(error: unknown): LogFields {
  const candidate = error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "Error";
  const code = candidate?.code ?? candidate?.cause?.code;
  return {
    errorType: /^(Error|TypeError|SyntaxError|RangeError|AbortError|TimeoutError|PrismaClient\w+Error)$/.test(name) ? name : "Error",
    errorCode: typeof code === "string" && /^(P\d{4}|SQLITE_[A-Z_]+|E[A-Z]+|UND_ERR_[A-Z_]+)$/.test(code) ? code : undefined,
    reason: error instanceof SyntaxError ? "invalid_json"
      : error instanceof Error && /has changed since this JSON was exported/.test(error.message) ? "import_conflict" : undefined
  };
}

/** Pass selected scalar metadata only, never request bodies, URLs or credentials. */
export function createOperationLog(component: string, operation: string, context: LogContext = {}) {
  const startedAt = Date.now();
  const inherited = contextStorage.getStore();
  const dateKey = context.dateKey ?? inherited?.dateKey;
  const safeContext = {
    operationId: context.operationId ?? inherited?.operationId ?? randomUUID(),
    source: context.source ?? inherited?.source,
    userId: context.userId ?? inherited?.userId,
    dateKey: typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : undefined
  };
  const contextFields = Object.fromEntries(Object.entries(safeContext).filter(([, value]) => value !== undefined));
  const log = {
    context: safeContext,
    write(level: LogLevel, result: string, fields: LogFields = {}) {
      const scalarFields = Object.fromEntries(Object.entries(fields).filter(([key, value]) => {
        if (typeof value === "number") return Number.isFinite(value);
        if (key === "year" || key === "month") return false;
        return typeof value === "string" || typeof value === "boolean";
      }));
      const timestamp = new Date().toISOString();
      const durationMs = Date.now() - startedAt;
      const sink = getOperationLogSink();
      if (level !== "debug" && sink && !isPersistenceSuppressed()) {
        const event: OperationLogEvent = {
          component, operation, result, operationId: safeContext.operationId ?? randomUUID(),
          timestamp, level, durationMs, eventId: randomUUID(),
          ...(safeContext.userId ? { userId: safeContext.userId } : {}),
          ...(safeContext.source ? { source: safeContext.source } : {}),
          ...(safeContext.dateKey ? { dateKey: safeContext.dateKey } : {}),
          fields: scalarFields
        };
        try {
          sink(event);
        } catch {
          // Persistence must never break the original work.
        }
      }
      const configured = process.env.AJAM_LOG_LEVEL;
      const threshold = configured && Object.hasOwn(levels, configured) ? levels[configured as LogLevel] : levels.info;
      if (levels[level] < threshold) return;
      const line = JSON.stringify({ ...scalarFields, ...contextFields, timestamp, level,
        component, operation, result, durationMs });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.info(line);
    },
    async run<T>(task: () => Promise<T>, fields: LogFields = {}, summarize?: (result: T) => LogFields): Promise<T> {
      return contextStorage.run(safeContext, async () => {
        log.write("info", "started", fields);
        try {
          const result = await task();
          const slow = Date.now() - startedAt >= 2000;
          const summary = summarize?.(result);
          const failed = Number(summary?.failed ?? summary?.failedUsers ?? 0) > 0;
          log.write(slow || failed ? "warn" : "info", "completed", { ...fields, ...summary, slow });
          return result;
        } catch (error) {
          log.write("error", "failed", { ...fields, ...safeErrorFields(error) });
          throw error;
        }
      });
    }
  };
  return log;
}

export function logHolidayFallback(error: unknown): never[] {
  createOperationLog("holiday", "fallback").write("warn", "empty_fallback", safeErrorFields(error));
  return [];
}

export function withRequestLog<Args extends unknown[], R extends Response>(route: string, handler: (request: Request, ...args: Args) => Promise<R> | R) {
  return async (request: Request, ...args: Args): Promise<R> => {
    if (route === "/api/health") return handler(request, ...args);
    const log = createOperationLog("http", route, { source: "api" });
    const startedAt = Date.now();
    return contextStorage.run(log.context, async () => {
      log.write("info", "received", { method: request.method });
      try {
        const response = await handler(request, ...args);
        const slow = Date.now() - startedAt >= 2000;
        log.write(response.status >= 500 ? "error" : response.status >= 400 || slow ? "warn" : "info", "responded", {
          method: request.method, status: response.status, slow
        });
        return response;
      } catch (error) {
        log.write("error", "failed", { method: request.method, status: 500, ...safeErrorFields(error) });
        throw error;
      }
    });
  };
}
