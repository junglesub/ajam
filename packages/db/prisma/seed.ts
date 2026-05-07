import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { databaseUrl } from "../src/database-url";
import { prisma as sharedPrisma } from "../src/client";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/password";
import { ensureApplicationSchema } from "../src/settings-store";
import { ensureTimesheetSchema } from "../src/timesheet-store";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: databaseUrl
  })
});

async function main() {
  await ensureApplicationSchema();

  const adminCount = await prisma.user.count({
    where: {
      role: "ADMIN"
    }
  });

  if (adminCount === 0) {
    await prisma.user.create({
      data: {
        passwordHash: hashPassword("1234"),
        role: "ADMIN",
        username: "admin"
      }
    });
  }

  await ensureTimesheetSchema();
  await sharedPrisma.$disconnect();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
