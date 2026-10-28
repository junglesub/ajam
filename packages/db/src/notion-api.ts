import { createNotionLog, notionErrorMessage, type NotionLogContext } from "./notion-log";

export class NotionApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    info: {
      code?: string;
      requestId?: string;
      retryAfter?: number;
      status: number;
    }
  ) {
    super(message);
    this.name = "NotionApiError";
    this.status = info.status;
    this.code = info.code;
    this.retryAfter = info.retryAfter;
    this.requestId = info.requestId;
  }
}

export async function requestNotionApi(params: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  token: string;
  body?: unknown;
  context?: NotionLogContext;
  errorMessage: (status: number) => string;
  logSeverity?: "error" | "warn" | "none";
  onAttempt?: () => void;
}): Promise<Response> {
  const log = createNotionLog("api", params.context);
  const fields = { method: params.method, path: params.path };
  params.onAttempt?.();
  let response: Response;
  try {
    response = await fetch(`https://api.notion.com${params.path}`, {
      method: params.method,
      headers: { Authorization: `Bearer ${params.token}`, "Content-Type": "application/json", "Notion-Version": "2026-03-11" },
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
      cache: "no-store"
    });
  } catch (error) {
    const logSeverity = params.logSeverity ?? "error";
    if (logSeverity !== "none") {
      log.write(logSeverity, "network_failed", { ...fields, error: notionErrorMessage(error) });
    }
    throw error;
  }
  if (!response.ok) {
    const body = await response.clone().json().catch(() => null) as { code?: unknown; request_id?: unknown } | null;
    const error = params.errorMessage(response.status);
    const retryAfterRaw = response.headers.get("retry-after");
    let retryAfter: number | undefined;
    if (retryAfterRaw) {
      const parsed = Number(retryAfterRaw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        retryAfter = parsed;
      }
    }
    const errorCode = typeof body?.code === "string" ? body.code.slice(0, 100) : undefined;
    const requestId = response.headers.get("x-request-id") ?? (typeof body?.request_id === "string" ? body.request_id.slice(0, 100) : undefined);
    const logSeverity = params.logSeverity ?? "error";
    if (logSeverity !== "none") {
      log.write(logSeverity, "failed", {
        ...fields,
        error,
        errorCode,
        requestId,
        retryAfter: retryAfterRaw ?? undefined,
        status: response.status
      });
    }
    throw new NotionApiError(error, {
      code: errorCode,
      requestId,
      retryAfter,
      status: response.status
    });
  }
  log.write("info", "success", { ...fields, status: response.status });
  return response;
}
