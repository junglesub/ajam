import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { databaseUrl } from "./database-url";
import { PrismaClient } from "./generated/prisma/client";
import { createOperationLog, safeErrorFields } from "./operation-log";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createDatabaseClient() {
  const log = createOperationLog("db", "client_init");
  try {
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
    const client = new PrismaClient({ adapter });
    log.write("info", "initialized");
    return client;
  } catch (error) {
    log.write("error", "failed", safeErrorFields(error));
    throw error;
  }
}

export const prisma = globalForPrisma.prisma ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
