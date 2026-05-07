"use server";

import { ensureApplicationSchema, prisma, verifyPassword } from "@timesheet/db";
import { redirect } from "next/navigation";

import { createSession } from "@/server/session";

export type LoginState = {
  error?: string;
  username?: string;
};

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const remember = formData.get("remember") === "on";

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

  redirect("/timesheet");
}
