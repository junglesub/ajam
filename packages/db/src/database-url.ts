const normalizedCwd = process.cwd().replaceAll("\\", "/");

const defaultDatabaseUrl = normalizedCwd.endsWith("/apps/web")
  ? "file:../../packages/db/prisma/dev.db"
  : normalizedCwd.endsWith("/packages/db")
    ? "file:./prisma/dev.db"
    : "file:./packages/db/prisma/dev.db";

process.env.DATABASE_URL ??= defaultDatabaseUrl;

export const databaseUrl = process.env.DATABASE_URL;
