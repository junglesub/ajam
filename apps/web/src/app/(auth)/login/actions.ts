"use server";

import { ensureApplicationSchema, prisma, verifyPassword } from "@timesheet/db";
import { redirect } from "next/navigation";

import { createSession } from "@/server/session";

export type LoginState = {
  error?: string;
  username?: string;
};

const fallbackLoginNext = "/timesheet";

function decodeLoginNextForValidation(value: string): string | null {
  let decoded = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const nextDecoded = decodeURIComponent(decoded);

      if (nextDecoded === decoded) {
        return decoded;
      }

      decoded = nextDecoded;
    } catch {
      return null;
    }
  }

  return decoded;
}

function normalizeLoginNext(next: string | undefined): string {
  const trimmed = next?.trim() ?? "";
  const decoded = decodeLoginNextForValidation(trimmed);

  if (
    decoded &&
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    decoded.startsWith("/") &&
    !decoded.startsWith("//") &&
    !decoded.includes("\\")
  ) {
    return trimmed;
  }

  return fallbackLoginNext;
}

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const remember = formData.get("remember") === "on";
  const next = normalizeLoginNext(formData.get("next")?.toString());

  if (!username || !password) {
    return {
      error: "아이디와 비밀번호를 모두 입력해 주세요.",
      username
    };
  }

  await ensureApplicationSchema();

  const user = await prisma.user.findUnique({
    where: {
      username
    }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return {
      error: "계정 정보를 다시 확인해 주세요.",
      username
    };
  }

  await createSession({
    remember,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    userId: user.id,
    username: user.username
  });

  redirect(next);
}
