import { randomUUID } from "node:crypto";

export type NotionLogContext = {
  operationId?: string;
  source?: string;
  userId?: string;
  dateKey?: string;
};

type LogValue = string | number | boolean | undefined;

export function notionErrorMessage(error: unknown): string {
  // JSON.parse/Response.json SyntaxErrors can embed a snippet of private data.
  if (error instanceof SyntaxError) return "Invalid JSON or syntax; response contents omitted";
  if (error instanceof Error && error.name.startsWith("Prisma")) {
    return error.name;
  }
  return (error instanceof Error ? error.message : "Unknown error")
    .replace(/Bearer\s+\S+|(?:secret_|ntn_)[A-Za-z0-9_-]+/gi, "[REDACTED]")
    .slice(0, 1000);
}

/** Only explicitly selected metadata belongs here; never pass payloads or credentials. */
export function createNotionLog(operation: string, context: NotionLogContext = {}) {
  const startedAt = Date.now();
  const operationId = context.operationId ?? randomUUID();
  const safeContext = { operationId, source: context.source, userId: context.userId, dateKey: context.dateKey };
  const contextFields = Object.fromEntries(Object.entries(safeContext).filter(([, value]) => value !== undefined));
  return {
    context: safeContext,
    write(level: "info" | "warn" | "error", result: string, fields: Record<string, LogValue> = {}) {
      const line = JSON.stringify({ ...fields, ...contextFields, timestamp: new Date().toISOString(), level,
        component: "notion", operation, result, durationMs: Date.now() - startedAt });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.info(line);
    }
  };
}
