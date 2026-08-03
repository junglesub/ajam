import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("vacation type color preferences upsert, list, and delete", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-vacation-color-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [{ prisma }, { ensureApplicationSchema }, store] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./vacation-color-store")
  ]);

  try {
    await ensureApplicationSchema();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      "user-1",
      "tester",
      "hash"
    );

    await store.setVacationTypeColorPreference({ color: "blue", name: " 연차 ", userId: "user-1" });
    await store.setVacationTypeColorPreference({ color: "#A1B2C3", name: "연차", userId: "user-1" });

    assert.deepEqual(await store.listVacationTypeColorPreferences("user-1"), [{ color: "#a1b2c3", name: "연차" }]);

    await store.setVacationTypeColorPreference({ color: null, name: "연차", userId: "user-1" });
    assert.deepEqual(await store.listVacationTypeColorPreferences("user-1"), []);
  } finally {
    await prisma.$disconnect();
    await rm(directory, { force: true, recursive: true });
  }
});
