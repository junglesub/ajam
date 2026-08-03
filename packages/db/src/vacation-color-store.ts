import { randomUUID } from "node:crypto";

import { normalizeVacationColor, normalizeVacationName, type VacationColor } from "@timesheet/domain";

import { prisma } from "./client";

export type VacationTypeColorPreference = {
  color: VacationColor;
  name: string;
};

let schemaReady = false;

async function ensureVacationTypeColorPreferenceSchema() {
  if (schemaReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "VacationTypeColorPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VacationTypeColorPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "VacationTypeColorPreference_userId_name_key" ON "VacationTypeColorPreference"("userId", "name")`
  );

  schemaReady = true;
}

export async function listVacationTypeColorPreferences(userId: string): Promise<VacationTypeColorPreference[]> {
  await ensureVacationTypeColorPreferenceSchema();

  return prisma.$queryRawUnsafe<VacationTypeColorPreference[]>(
    `SELECT "name", "color" FROM "VacationTypeColorPreference" WHERE "userId" = ? ORDER BY "name" ASC`,
    userId
  );
}

export async function setVacationTypeColorPreference(params: { color: string | null; name: string; userId: string }): Promise<void> {
  await ensureVacationTypeColorPreferenceSchema();

  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error("휴가 유형 이름을 확인해 주세요.");
  }

  const name = normalizeVacationName(trimmedName);
  if (params.color === null) {
    await prisma.$executeRawUnsafe(`DELETE FROM "VacationTypeColorPreference" WHERE "userId" = ? AND "name" = ?`, params.userId, name);
    return;
  }

  const color = normalizeVacationColor(params.color);
  if (!color) {
    throw new Error("휴가 유형 색상을 확인해 주세요.");
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "VacationTypeColorPreference" ("id", "userId", "name", "color", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("userId", "name") DO UPDATE SET "color" = excluded."color", "updatedAt" = CURRENT_TIMESTAMP`,
    randomUUID(),
    params.userId,
    name,
    color
  );
}
