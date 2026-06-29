import type { StoredConnection } from "./storage.js";

export type MonthlyTimeMacroDay = {
  contentValue: string;
  dateKey: string;
  day: number;
  hours: number;
  value: string;
  weekday: number;
};

export type MonthlyTimeMacroCategory = {
  days: MonthlyTimeMacroDay[];
  id: string;
  kind: "work" | "vacation" | "holiday";
  label: string;
};

export type MonthlyTimeMacroExport = {
  categories: MonthlyTimeMacroCategory[];
  daysInMonth: number;
  month: string;
};

type TokenResponse = {
  accessToken: string;
  connectedUsername: string;
  expiresAt: string;
  refreshToken: string;
  scopes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function parseBaseUrl(baseUrl: string): URL {
  try {
    return new URL(normalizeBaseUrl(baseUrl));
  } catch {
    throw new Error("aJam base URL이 올바르지 않습니다. Please enter a valid aJam base URL.");
  }
}

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
}

async function ensureApiOriginPermission(baseUrl: string): Promise<void> {
  const url = parseBaseUrl(baseUrl);

  if (url.protocol === "http:" && isLocalhost(url)) {
    return;
  }

  if (url.protocol !== "https:") {
    throw new Error("HTTP aJam 연결은 localhost에서만 지원합니다. Use HTTPS for remote aJam servers.");
  }

  const originPattern = `${url.origin}/*`;

  if (await chrome.permissions.contains({ origins: [originPattern] })) {
    return;
  }

  const granted = await chrome.permissions.request({ origins: [originPattern] });

  if (!granted) {
    throw new Error("aJam 서버 접근 권한이 필요합니다. Please grant extension permission for this aJam origin.");
  }
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const error = (body as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const fallback = response.statusText || "Request failed";
  let body: unknown = {};

  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message = typeof body === "string" && body.trim() ? body : getErrorMessage(body, fallback);

    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return body as T;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function createInvalidMacroResponseError(): Error {
  return new Error("월간 매크로 API 응답 형식이 올바르지 않습니다. Invalid monthly macro response.");
}

function getDaysInMonth(month: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const year = match ? Number(match[1]) : Number.NaN;
  const monthNumber = match ? Number(match[2]) : Number.NaN;

  if (!match || !Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function getDateKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function getWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function validateTokenResponse(value: unknown): TokenResponse {
  if (!isRecord(value)) {
    throw new Error("aJam API 응답 형식이 올바르지 않습니다. Invalid token response.");
  }

  const candidate = value as Partial<TokenResponse>;
  const expiresAtMs = typeof candidate.expiresAt === "string" ? new Date(candidate.expiresAt).getTime() : Number.NaN;

  if (
    typeof candidate.accessToken !== "string" ||
    !candidate.accessToken ||
    typeof candidate.connectedUsername !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    !Number.isFinite(expiresAtMs) ||
    typeof candidate.refreshToken !== "string" ||
    !candidate.refreshToken ||
    !isStringArray(candidate.scopes)
  ) {
    throw new Error("aJam API 응답 형식이 올바르지 않습니다. Invalid token response.");
  }

  return {
    accessToken: candidate.accessToken,
    connectedUsername: candidate.connectedUsername,
    expiresAt: candidate.expiresAt,
    refreshToken: candidate.refreshToken,
    scopes: candidate.scopes
  };
}

function isMacroDay(value: unknown, params: { day: number; dateKey: string; weekday: number }): value is MonthlyTimeMacroDay {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.dateKey === params.dateKey &&
    typeof value.contentValue === "string" &&
    value.day === params.day &&
    typeof value.hours === "number" &&
    Number.isFinite(value.hours) &&
    typeof value.value === "string" &&
    value.weekday === params.weekday
  );
}

function isMacroCategory(value: unknown, params: { daysInMonth: number; month: string }): value is MonthlyTimeMacroCategory {
  if (!isRecord(value)) {
    return false;
  }

  if (!Array.isArray(value.days) || value.days.length !== params.daysInMonth) {
    return false;
  }

  return (
    value.days.every((day, index) => {
      const dayNumber = index + 1;
      const dateKey = getDateKey(params.month, dayNumber);

      return isMacroDay(day, { dateKey, day: dayNumber, weekday: getWeekday(dateKey) });
    }) &&
    typeof value.id === "string" &&
    (value.kind === "work" || value.kind === "vacation" || value.kind === "holiday") &&
    typeof value.label === "string"
  );
}

function validateMonthlyTimeMacroExport(value: unknown, expectedMonth: string): MonthlyTimeMacroExport {
  if (!isRecord(value) || typeof value.month !== "string") {
    throw createInvalidMacroResponseError();
  }

  const month = value.month;
  const daysInMonth = getDaysInMonth(month);

  if (
    month !== expectedMonth ||
    daysInMonth === null ||
    !Array.isArray(value.categories) ||
    typeof value.daysInMonth !== "number" ||
    value.daysInMonth !== daysInMonth ||
    !value.categories.every((category) => isMacroCategory(category, { daysInMonth, month }))
  ) {
    throw createInvalidMacroResponseError();
  }

  return {
    categories: value.categories,
    daysInMonth: value.daysInMonth,
    month
  };
}

function toStoredConnection(baseUrl: string, token: TokenResponse): StoredConnection {
  return {
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.expiresAt,
    baseUrl: normalizeBaseUrl(baseUrl),
    connectedUsername: token.connectedUsername,
    refreshToken: token.refreshToken,
    scopes: token.scopes
  };
}

export function getConnectUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/extension/connect`;
}

export async function exchangeCode(baseUrl: string, code: string): Promise<StoredConnection> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  await ensureApiOriginPermission(normalizedBaseUrl);

  const response = await fetch(`${normalizedBaseUrl}/api/extension/auth/exchange`, {
    body: JSON.stringify({ code }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  return toStoredConnection(normalizedBaseUrl, validateTokenResponse(await readJson<unknown>(response)));
}

export async function refreshConnection(connection: StoredConnection): Promise<StoredConnection> {
  await ensureApiOriginPermission(connection.baseUrl);

  const response = await fetch(`${normalizeBaseUrl(connection.baseUrl)}/api/extension/auth/refresh`, {
    body: JSON.stringify({ refreshToken: connection.refreshToken }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  return toStoredConnection(connection.baseUrl, validateTokenResponse(await readJson<unknown>(response)));
}

export async function getValidConnection(connection: StoredConnection): Promise<StoredConnection> {
  const expiresAt = new Date(connection.accessTokenExpiresAt).getTime();

  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) {
    return connection;
  }

  return refreshConnection(connection);
}

export async function fetchMonthlyTimeMacro(connection: StoredConnection, month: string): Promise<MonthlyTimeMacroExport> {
  await ensureApiOriginPermission(connection.baseUrl);

  const response = await fetch(
    `${normalizeBaseUrl(connection.baseUrl)}/api/extension/monthly-time-macro?month=${encodeURIComponent(month)}`,
    {
      headers: {
        authorization: `Bearer ${connection.accessToken}`
      }
    }
  );

  return validateMonthlyTimeMacroExport(await readJson<unknown>(response), month);
}
