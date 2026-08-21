import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { databaseUrl } from "../src/database-url";
import { prisma as sharedPrisma } from "../src/client";
import { prefillDummyTimesheetData } from "../src/dummy-prefill";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: databaseUrl
  })
});

async function main() {
  const args = process.argv.slice(2);
  const withNotion = args.includes("--with-notion") || args.includes("--notion");

  console.log(`[aJam] Prefilling dummy timesheet data (withNotion: ${withNotion})...`);

  const result = await prefillDummyTimesheetData({
    withNotion
  });

  console.log(`[aJam] Successfully prefilled dummy data!`);
  console.log(` - Year/Month: ${result.year}-${String(result.month).padStart(2, "0")}`);
  console.log(` - User ID: ${result.userId}`);
  console.log(` - Days prefilled: ${result.daysCreated}`);
  console.log(` - Projects created/ensured: ${result.projectsCreated.join(", ")}`);
  console.log(` - Notion cards created: ${result.notionCardsCreated}`);

  await sharedPrisma.$disconnect();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("[aJam] Failed to prefill dummy data:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
