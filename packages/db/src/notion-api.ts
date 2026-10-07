import { createNotionLog, notionErrorMessage, type NotionLogContext } from "./notion-log";

export async function requestNotionApi(params: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  token: string;
  body?: unknown;
  context?: NotionLogContext;
  errorMessage: (status: number) => string;
}): Promise<Response> {
  const log = createNotionLog("api", params.context);
  const fields = { method: params.method, path: params.path };
  let response: Response;
  try {
    response = await fetch(`https://api.notion.com${params.path}`, {
      method: params.method,
      headers: { Authorization: `Bearer ${params.token}`, "Content-Type": "application/json", "Notion-Version": "2026-03-11" },
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
      cache: "no-store"
    });
  } catch (error) {
    log.write("error", "network_failed", { ...fields, error: notionErrorMessage(error) });
    throw error;
  }
  if (!response.ok) {
    const body = await response.clone().json().catch(() => null) as { code?: unknown; request_id?: unknown } | null;
    const error = params.errorMessage(response.status);
    log.write("error", "failed", { ...fields, status: response.status, error,
      errorCode: typeof body?.code === "string" ? body.code.slice(0, 100) : undefined,
      requestId: response.headers.get("x-request-id") ?? (typeof body?.request_id === "string" ? body.request_id.slice(0, 100) : undefined),
      retryAfter: response.headers.get("retry-after") ?? undefined });
    throw new Error(error);
  }
  log.write("info", "success", { ...fields, status: response.status });
  return response;
}
