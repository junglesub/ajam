import { createOperationLog, safeErrorFields } from "@timesheet/db/logging";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getAppSetting, setAppSetting } from "@timesheet/db";
import { cookies } from "next/headers";

const sessionCookieName = "timesheet_session";
const sessionMaxAge = 60 * 60 * 12;
const rememberedSessionMaxAge = 60 * 60 * 24 * 30;
const sessionSecretSettingKey = "session_secret";

type SessionPayload = {
  expiresAt: number;
  role: "ADMIN" | "USER";
  userId: string;
  username: string;
};

async function getSessionSecret(): Promise<string> {
  const envSecret = process.env.SESSION_SECRET?.trim();

  if (envSecret) {
    return envSecret;
  }

  const storedSecret = (await getAppSetting(sessionSecretSettingKey))?.trim();

  if (storedSecret) {
    return storedSecret;
  }

  const generatedSecret = randomBytes(32).toString("base64url");
  await setAppSetting(sessionSecretSettingKey, generatedSecret);

  return generatedSecret;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function sign(payload: string): Promise<string> {
  try {
    return createHmac("sha256", await getSessionSecret()).update(payload).digest("base64url");
  } catch (error) {
    createOperationLog("auth", "session_secret").write("error", "failed", safeErrorFields(error));
    throw error;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function createToken(payload: SessionPayload): Promise<string> {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = await sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

async function readToken(token: string | undefined): Promise<SessionPayload | null> {
  const log = createOperationLog("auth", "session");
  if (!token) {
    log.write("debug", "rejected", { reason: "missing_cookie" });
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature || !safeEqual(signature, await sign(encodedPayload))) {
    log.write("warn", "rejected", { reason: "invalid_signature_or_format" });
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      log.write("debug", "rejected", { reason: "expired" });
      return null;
    }

    return payload;
  } catch (error) {
    log.write("warn", "rejected", { reason: "invalid_payload", ...safeErrorFields(error) });
    return null;
  }
}

export async function createSession(params: { remember?: boolean; role: "ADMIN" | "USER"; userId: string; username: string }) {
  const cookieStore = await cookies();
  const maxAge = params.remember ? rememberedSessionMaxAge : sessionMaxAge;
  const token = await createToken({
    expiresAt: Date.now() + maxAge * 1000,
    role: params.role,
    userId: params.userId,
    username: params.username
  });

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    ...(params.remember ? { maxAge } : {}),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  createOperationLog("auth", "session", { userId: params.userId }).write("info", "created", { remembered: Boolean(params.remember) });
}

export async function destroySession() {
  const cookieStore = await cookies();

  cookieStore.delete(sessionCookieName);
  createOperationLog("auth", "session").write("info", "destroyed");
}

export async function getSession() {
  const cookieStore = await cookies();

  return readToken(cookieStore.get(sessionCookieName)?.value);
}
