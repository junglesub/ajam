import { randomUUID } from "node:crypto";

import { prisma } from "./client";
import { hashPassword } from "./password";

export type UserRole = "ADMIN" | "USER";

export type ManagedUser = {
  id: string;
  role: UserRole;
  username: string;
};

type UserRow = {
  id: string;
  role: string;
  username: string;
};

type AppSettingRow = {
  value: string;
};

let applicationSchemaReady = false;

function normalizeRole(role: string | undefined): UserRole {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

function mapUser(row: UserRow): ManagedUser {
  return {
    id: row.id,
    role: normalizeRole(row.role),
    username: row.username
  };
}

export async function ensureApplicationSchema() {
  if (applicationSchemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`);

  const userColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("User")`);
  const hasRole = userColumns.some((column) => column.name === "role");

  if (!hasRole) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER'`);
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "role" = 'ADMIN' WHERE "username" = 'admin'`);
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key")`);

  applicationSchemaReady = true;
}

export async function getAppSetting(key: string): Promise<string | null> {
  await ensureApplicationSchema();

  const rows = await prisma.$queryRawUnsafe<AppSettingRow[]>(`SELECT "value" FROM "AppSetting" WHERE "key" = ? LIMIT 1`, key);

  return rows[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string) {
  await ensureApplicationSchema();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    key,
    value
  );
}

export async function getManagedUser(userId: string): Promise<ManagedUser | null> {
  await ensureApplicationSchema();

  const rows = await prisma.$queryRawUnsafe<UserRow[]>(`SELECT "id", "username", "role" FROM "User" WHERE "id" = ? LIMIT 1`, userId);

  return rows[0] ? mapUser(rows[0]) : null;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  await ensureApplicationSchema();

  const rows = await prisma.$queryRawUnsafe<UserRow[]>(`SELECT "id", "username", "role" FROM "User" ORDER BY "username" ASC`);

  return rows.map(mapUser);
}

export async function updateManagedUser(params: { password?: string; userId: string; username: string }): Promise<ManagedUser> {
  await ensureApplicationSchema();

  const username = params.username.trim();

  if (!username) {
    throw new Error("아이디를 입력해 주세요.");
  }

  const duplicates = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "User" WHERE "username" = ? AND "id" <> ? LIMIT 1`,
    username,
    params.userId
  );

  if (duplicates.length > 0) {
    throw new Error("이미 사용 중인 아이디입니다.");
  }

  const password = params.password?.trim();

  if (password) {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "username" = ?, "passwordHash" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      username,
      hashPassword(password),
      params.userId
    );
  } else {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "username" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`, username, params.userId);
  }

  const user = await getManagedUser(params.userId);

  if (!user) {
    throw new Error("사용자를 찾을 수 없습니다.");
  }

  return user;
}

export async function createManagedUser(params: { password: string; role: UserRole; username: string }): Promise<ManagedUser> {
  await ensureApplicationSchema();

  const username = params.username.trim();
  const password = params.password.trim();
  const role = normalizeRole(params.role);

  if (!username || !password) {
    throw new Error("아이디와 비밀번호를 입력해 주세요.");
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "User" WHERE "username" = ? LIMIT 1`, username);

  if (existing.length > 0) {
    throw new Error("이미 사용 중인 아이디입니다.");
  }

  const id = randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "username", "passwordHash", "role", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    username,
    hashPassword(password),
    role
  );

  const user = await getManagedUser(id);

  if (!user) {
    throw new Error("사용자를 추가하지 못했습니다.");
  }

  return user;
}
