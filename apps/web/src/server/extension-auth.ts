import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getAppSetting, getExtensionConnection, setAppSetting } from "@timesheet/db";

const extensionAccessTokenSecretSettingKey = "extension_access_token_secret";
const accessTokenMaxAgeSeconds = 15 * 60;

export type ExtensionAccessTokenPayload = {
  connectionId: string;
  exp: number;
  scopes: string[];
  sub: string;
  username?: string;
};

export type AuthenticatedExtension = {
  connectionId: string;
  scopes: string[];
  userId: string;
};

type ExtensionAccessTokenHeader = {
  alg: "HS256";
  typ: "JWT";
};

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function getExtensionAccessTokenSecret(): Promise<string> {
  const envSecret = process.env.EXTENSION_ACCESS_TOKEN_SECRET?.trim();

  if (envSecret) {
    return envSecret;
  }

  const storedSecret = (await getAppSetting(extensionAccessTokenSecretSettingKey))?.trim();

  if (storedSecret) {
    return storedSecret;
  }

  const generatedSecret = randomBytes(32).toString("base64url");
  await setAppSetting(extensionAccessTokenSecretSettingKey, generatedSecret);

  return generatedSecret;
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", await getExtensionAccessTokenSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeJsonPart(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function isHeader(value: unknown): value is ExtensionAccessTokenHeader {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ExtensionAccessTokenHeader>;
  return candidate.alg === "HS256" && candidate.typ === "JWT";
}

function isPayload(value: unknown): value is ExtensionAccessTokenPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ExtensionAccessTokenPayload>;

  return (
    typeof candidate.connectionId === "string" &&
    typeof candidate.exp === "number" &&
    Number.isFinite(candidate.exp) &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.every((scope) => typeof scope === "string") &&
    typeof candidate.sub === "string" &&
    (candidate.username === undefined || typeof candidate.username === "string")
  );
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);

  return match?.[1]?.trim() ?? "";
}

function parseScopeList(scopes: string): string[] {
  return scopes.split(/\s+/).filter(Boolean);
}

export async function createExtensionAccessToken(params: {
  connectionId: string;
  scopes: string[];
  userId: string;
  username?: string;
}): Promise<{ accessToken: string; expiresAt: string }> {
  const expiresAtMs = Date.now() + accessTokenMaxAgeSeconds * 1000;
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" } satisfies ExtensionAccessTokenHeader));
  const payload = base64Url(
    JSON.stringify({
      connectionId: params.connectionId,
      exp: Math.floor(expiresAtMs / 1000),
      scopes: params.scopes,
      sub: params.userId,
      username: params.username
    } satisfies ExtensionAccessTokenPayload)
  );
  const signature = await sign(`${header}.${payload}`);

  return {
    accessToken: `${header}.${payload}.${signature}`,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export async function authenticateExtensionRequest(request: Request, requiredScope: string): Promise<AuthenticatedExtension | null> {
  const token = getBearerToken(request);
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;

  if (!header || !payload || !signature || !safeEqual(signature, await sign(`${header}.${payload}`))) {
    return null;
  }

  try {
    const parsedHeader = decodeJsonPart(header);
    const parsedPayload = decodeJsonPart(payload);

    if (!isHeader(parsedHeader) || !isPayload(parsedPayload)) {
      return null;
    }

    if (parsedPayload.exp <= Math.floor(Date.now() / 1000) || !parsedPayload.scopes.includes(requiredScope)) {
      return null;
    }

    const connection = await getExtensionConnection(parsedPayload.connectionId);

    if (!connection || connection.revokedAt || connection.userId !== parsedPayload.sub) {
      return null;
    }

    const connectionScopes = parseScopeList(connection.scopes);

    if (!connectionScopes.includes(requiredScope)) {
      return null;
    }

    return {
      connectionId: parsedPayload.connectionId,
      scopes: connectionScopes,
      userId: parsedPayload.sub
    };
  } catch {
    return null;
  }
}
