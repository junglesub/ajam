import { createOperationLog, type LogContext } from "./operation-log";

export type NotionLogContext = LogContext;

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
  return createOperationLog("notion", operation, context);
}
