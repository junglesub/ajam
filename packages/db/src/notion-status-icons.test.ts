import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isValidEmoji } from "@timesheet/domain";

test("notion status icons and webhook sync in isolated database", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-test-icons-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [
    { prisma },
    { ensureApplicationSchema },
    store,
    icons,
    sync,
    { setOperationLogSink }
  ] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./notion-store"),
    import("./notion-status-icons"),
    import("./notion-sync"),
    import("./operation-log")
  ]);

  const {
    assertMatchingScope,
    determineTargetIcon,
    validateStatusIconSettings
  } = icons;

  const originalFetch = globalThis.fetch;

  try {
    await t.test("verifies SQLite client is connected to isolated temp DB via PRAGMA database_list", async () => {
      const dbList = await prisma.$queryRawUnsafe<Array<{ file: string; name: string }>>("PRAGMA database_list;");
      const mainDb = dbList.find((d) => d.name === "main");
      assert.ok(
        mainDb && (mainDb.file.includes("ajam-test-icons-") || mainDb.file.includes(directory)),
        `Expected temp DB in ${directory}, but PRAGMA database_list reported: ${mainDb?.file}`
      );
    });

    await t.test("emoji validation accepts valid single Unicode emoji graphemes and rejects invalid inputs", () => {
      // Standard emojis
      assert.equal(isValidEmoji("✅"), true);
      assert.equal(isValidEmoji("🚧"), true);
      assert.equal(isValidEmoji("🚀"), true);
      assert.equal(isValidEmoji("✨"), true);
      assert.equal(isValidEmoji("⚠️"), true);

      // Modifiers and sequences
      assert.equal(isValidEmoji("👍🏽"), true); // Skin tone modifier
      assert.equal(isValidEmoji("🇰🇷"), true); // Regional indicator pair (country flag)
      assert.equal(isValidEmoji("👨‍👩‍👧‍👦"), true); // Multi-character ZWJ family sequence
      assert.equal(isValidEmoji("🧑‍💻"), true); // ZWJ sequence
      assert.equal(isValidEmoji("1️⃣"), true); // Keycap sequence
      assert.equal(isValidEmoji("*️⃣"), true); // Symbol keycap sequence
      assert.equal(isValidEmoji("🏳️‍🌈"), true); // Rainbow flag sequence

      // Invalid: multiple emojis
      assert.equal(isValidEmoji("🚀🚀"), false);
      assert.equal(isValidEmoji("✅🚧"), false);

      // Invalid: standalone control/formatting characters
      assert.equal(isValidEmoji("\u200D"), false); // Standalone ZWJ
      assert.equal(isValidEmoji("\uFE0F"), false); // Standalone variation selector

      // Invalid: text, numbers, URLs, secrets
      assert.equal(isValidEmoji(""), false);
      assert.equal(isValidEmoji("   "), false);
      assert.equal(isValidEmoji("status"), false);
      assert.equal(isValidEmoji("123"), false);
      assert.equal(isValidEmoji("secret_token_12345"), false);
      assert.equal(isValidEmoji("https://api.notion.com"), false);
      assert.equal(isValidEmoji("🚀abc"), false);
      assert.equal(isValidEmoji("a🚀"), false);
    });

    await t.test("validateStatusIconSettings enforces strict types and bounds", () => {
      const valid = validateStatusIconSettings({
        dataSourceId: "ds-1",
        emojiByOptionId: {
          "opt-done": "✅",
          "opt-progress": "🚧",
          "opt-empty": "   "
        },
        enabled: true,
        statusPropertyId: "prop-status"
      });

      assert.deepEqual(valid, {
        dataSourceId: "ds-1",
        emojiByOptionId: {
          "opt-done": "✅",
          "opt-progress": "🚧"
        },
        enabled: true,
        statusPropertyId: "prop-status"
      });

      assert.throws(() => {
        validateStatusIconSettings({
          dataSourceId: "ds-1",
          emojiByOptionId: {},
          enabled: "true",
          statusPropertyId: "prop-status"
        });
      }, /enabled 속성은 boolean이어야 합니다/);

      assert.throws(() => {
        validateStatusIconSettings({
          dataSourceId: "ds-1",
          emojiByOptionId: {
            "opt-done": "not_an_emoji"
          },
          enabled: true,
          statusPropertyId: "prop-status"
        });
      }, /올바르지 않은 이모지입니다/);

      assert.throws(() => {
        validateStatusIconSettings({
          dataSourceId: "",
          emojiByOptionId: {},
          enabled: true,
          statusPropertyId: "prop-status"
        });
      }, /데이터 소스 ID가 올바르지 않습니다/);

      assert.throws(() => {
        validateStatusIconSettings({
          dataSourceId: "ds-1",
          emojiByOptionId: {},
          enabled: true,
          statusPropertyId: ""
        });
      }, /상태 속성 ID가 올바르지 않습니다/);
    });

    await t.test("scope matching checks both dataSourceId and statusPropertyId and validates options", () => {
      const connection = {
        dataSourceId: "ds-current",
        statusProperty: { id: "prop-status", name: "Status", type: "status" }
      };

      const settings = {
        dataSourceId: "ds-current",
        emojiByOptionId: {
          "opt-1": "✅",
          "opt-2": "🚧"
        },
        enabled: true,
        statusPropertyId: "prop-status"
      };

      assert.doesNotThrow(() => {
        assertMatchingScope(settings, connection, ["opt-1", "opt-2", "opt-unused"]);
      });

      assert.throws(() => {
        assertMatchingScope({ ...settings, dataSourceId: "ds-old" }, connection);
      }, /데이터 소스와 일치하지 않습니다/);

      assert.throws(() => {
        assertMatchingScope({ ...settings, statusPropertyId: "prop-old" }, connection);
      }, /상태 속성과 일치하지 않습니다/);

      assert.throws(() => {
        assertMatchingScope(settings, connection, ["opt-1"]);
      }, /알 수 없는 상태 옵션입니다: opt-2/);
    });

    await t.test("determineTargetIcon checks both dataSourceId and statusPropertyId", () => {
      const connection = {
        dataSourceId: "ds-1",
        statusProperty: { id: "prop-status", name: "상태", type: "status" }
      };

      const settings = {
        dataSourceId: "ds-1",
        emojiByOptionId: {
          "opt-done": "✅",
          "opt-prog": "🚧"
        },
        enabled: true,
        statusPropertyId: "prop-status"
      };

      const disabledRes = determineTargetIcon({ id: "p1" }, connection, { ...settings, enabled: false });
      assert.equal(disabledRes.action, "skip");
      assert.equal(disabledRes.reason, "settings_disabled");

      const mismatchRes = determineTargetIcon({ id: "p1" }, connection, { ...settings, statusPropertyId: "prop-other" });
      assert.equal(mismatchRes.action, "skip");
      assert.equal(mismatchRes.reason, "scope_mismatch");

      const dsMismatchRes = determineTargetIcon({ id: "p1" }, connection, { ...settings, dataSourceId: "ds-other" });
      assert.equal(dsMismatchRes.action, "skip");
      assert.equal(dsMismatchRes.reason, "scope_mismatch");

      const archivedRes = determineTargetIcon(
        {
          archived: true,
          id: "p1",
          properties: {
            상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
          }
        },
        connection,
        settings
      );
      assert.equal(archivedRes.action, "skip");
      assert.equal(archivedRes.reason, "archived_or_trashed");

      const trashRes = determineTargetIcon(
        {
          in_trash: true,
          id: "p1",
          properties: {
            상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
          }
        },
        connection,
        settings
      );
      assert.equal(trashRes.action, "skip");
      assert.equal(trashRes.reason, "archived_or_trashed");

      const foreignParentRes = determineTargetIcon(
        {
          id: "p1",
          parent: { data_source_id: "ds-foreign" },
          properties: {
            상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
          }
        },
        connection,
        settings
      );
      assert.equal(foreignParentRes.action, "skip");
      assert.equal(foreignParentRes.reason, "different_data_source");

      const nonDataSourceParentRes = determineTargetIcon(
        {
          id: "p1",
          parent: { database_id: "db-123", type: "database_id" },
          properties: {
            상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
          }
        },
        connection,
        settings
      );
      assert.equal(nonDataSourceParentRes.action, "skip");
      assert.equal(nonDataSourceParentRes.reason, "different_data_source");

      const sameIconRes = determineTargetIcon(
        {
          icon: { emoji: "✅", type: "emoji" },
          id: "p1",
          properties: {
            상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
          }
        },
        connection,
        settings
      );
      assert.equal(sameIconRes.action, "skip");
      assert.equal(sameIconRes.reason, "same_icon");

      const updateRes = determineTargetIcon(
        {
          icon: { emoji: "📅", type: "emoji" },
          id: "p1",
          properties: {
            상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
          }
        },
        connection,
        settings
      );
      assert.equal(updateRes.action, "update");
      assert.equal(updateRes.targetEmoji, "✅");
    });

    await t.test("saves settings, validates allowed options, and maintains analysisConfigVersion", async () => {
      await ensureApplicationSchema();
      await store.ensureNotionSchema();

      const userId = `user-icons-${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        userId,
        `test-${userId}`,
        "hash"
      );

      await store.upsertUserNotionConnection({
        accessToken: "secret_notion_token",
        connection: {
          ajamLastUpdateProperty: null,
          analysisConfigVersion: 1,
          authType: "internal_token",
          availableHoursProperty: null,
          categoryProperty: { id: "prop-cat", name: "Category", type: "select" },
          databaseId: "db-1",
          dataSourceId: "ds-1",
          dataSourceName: "Tasks",
          dateMappingMode: "separate_properties",
          doneStatusValues: ["Done"],
          endDateProperty: null,
          lastWorkedDateProperty: null,
          notionApiVersion: "2026-03-11",
          sourceInput: "https://notion.so/db-1",
          startDateProperty: null,
          statusProperty: { id: "prop-status", name: "Status", type: "status" },
          titleProperty: { id: "prop-title", name: "Title", type: "title" },
          workDayCountProperty: null,
          workHoursProperty: { id: "prop-hours", name: "Work Hours", type: "number" }
        },
        userId
      });

      // 1. Rejects unknown option IDs
      await assert.rejects(async () => {
        await icons.saveNotionStatusIconSettings({
          allowedOptionIds: ["opt-done", "opt-prog"],
          settings: {
            dataSourceId: "ds-1",
            emojiByOptionId: { "opt-unknown": "❌" },
            enabled: true,
            statusPropertyId: "prop-status"
          },
          userId
        });
      }, /알 수 없는 상태 옵션입니다/);

      // 2. Saves successfully and does not bump analysisConfigVersion
      const initialConn = (await store.getUserNotionConnection(userId))!;
      const saved = await icons.saveNotionStatusIconSettings({
        allowedOptionIds: ["opt-done", "opt-prog"],
        settings: {
          dataSourceId: "ds-1",
          emojiByOptionId: { "opt-done": "✅", "opt-prog": "🚧" },
          enabled: true,
          statusPropertyId: "prop-status"
        },
        userId
      });

      assert.equal(saved.enabled, true);
      assert.deepEqual(saved.emojiByOptionId, { "opt-done": "✅", "opt-prog": "🚧" });

      const updatedConn = (await store.getUserNotionConnection(userId))!;
      assert.equal(updatedConn.analysisConfigVersion, initialConn.analysisConfigVersion);
    });

    await t.test("webhook sync combines icon and aggregate hours into 1 realistic full page PATCH", async () => {
      const userId = `user-webhook-${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        userId,
        `test-${userId}`,
        "hash"
      );

      await store.upsertUserNotionConnection({
        accessToken: "secret_notion_token",
        connection: {
          ajamLastUpdateProperty: null,
          analysisConfigVersion: 1,
          authType: "internal_token",
          availableHoursProperty: null,
          categoryProperty: { id: "prop-cat", name: "Category", type: "select" },
          databaseId: "db-1",
          dataSourceId: "ds-1",
          dataSourceName: "Tasks",
          dateMappingMode: "separate_properties",
          doneStatusValues: ["Done"],
          endDateProperty: null,
          lastWorkedDateProperty: null,
          notionApiVersion: "2026-03-11",
          sourceInput: "https://notion.so/db-1",
          startDateProperty: null,
          statusProperty: { id: "prop-status", name: "Status", type: "status" },
          titleProperty: { id: "prop-title", name: "Title", type: "title" },
          workDayCountProperty: null,
          workHoursProperty: { id: "prop-hours", name: "Work Hours", type: "number" }
        },
        userId
      });

      await icons.saveNotionStatusIconSettings({
        allowedOptionIds: ["opt-done"],
        settings: {
          dataSourceId: "ds-1",
          emojiByOptionId: { "opt-done": "✅" },
          enabled: true,
          statusPropertyId: "prop-status"
        },
        userId
      });

      let patchCount = 0;
      let getCount = 0;
      let lastPatchBody: { icon?: { emoji?: string; type?: string } } | null = null;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "GET" && urlStr.includes("/v1/pages/page-webhook-1")) {
          getCount += 1;
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "📅", type: "emoji" },
              id: "page-webhook-1",
              last_edited_time: "2026-10-28T10:00:00.000Z",
              parent: { data_source_id: "ds-1", type: "data_source_id" },
              properties: {
                Category: { id: "prop-cat", select: { id: "cat-1", name: "Dev" }, type: "select" },
                Status: { id: "prop-status", status: { id: "opt-done", name: "Done" }, type: "status" },
                Title: { id: "prop-title", title: [{ plain_text: "Task 1" }], type: "title" }
              },
              url: "https://notion.so/page-webhook-1"
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/v1/pages/page-webhook-1")) {
          patchCount += 1;
          lastPatchBody = JSON.parse(String(init?.body ?? "{}"));
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "✅", type: "emoji" },
              id: "page-webhook-1",
              last_edited_time: "2026-10-28T10:01:00.000Z",
              parent: { data_source_id: "ds-1", type: "data_source_id" },
              properties: {
                Category: { id: "prop-cat", select: { id: "cat-1", name: "Dev" }, type: "select" },
                Status: { id: "prop-status", status: { id: "opt-done", name: "Done" }, type: "status" },
                Title: { id: "prop-title", title: [{ plain_text: "Task 1" }], type: "title" },
                "Work Hours": { id: "prop-hours", number: 0, type: "number" }
              },
              url: "https://notion.so/page-webhook-1"
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await sync.syncSingleNotionCard({
        pageId: "page-webhook-1",
        userId
      });

      assert.equal(getCount, 1, "Exactly 1 GET for reading page snapshot");
      assert.equal(patchCount, 1, "Exactly 1 combined PATCH for updating page");
      assert.deepEqual(
        (lastPatchBody as { icon?: { emoji?: string; type?: string } } | null)?.icon,
        { emoji: "✅", type: "emoji" },
        "Icon patch is included in combined write"
      );
    });

    await t.test("webhook sync skips icon PATCH when matching icon already exists", async () => {
      const userId = `user-match-${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        userId,
        `test-${userId}`,
        "hash"
      );

      await store.upsertUserNotionConnection({
        accessToken: "secret_notion_token",
        connection: {
          ajamLastUpdateProperty: null,
          analysisConfigVersion: 1,
          authType: "internal_token",
          availableHoursProperty: null,
          categoryProperty: null,
          databaseId: "db-1",
          dataSourceId: "ds-1",
          dataSourceName: "Tasks",
          dateMappingMode: "separate_properties",
          doneStatusValues: ["Done"],
          endDateProperty: null,
          lastWorkedDateProperty: null,
          notionApiVersion: "2026-03-11",
          sourceInput: "https://notion.so/db-1",
          startDateProperty: null,
          statusProperty: { id: "prop-status", name: "Status", type: "status" },
          titleProperty: { id: "prop-title", name: "Title", type: "title" },
          workDayCountProperty: null,
          workHoursProperty: null
        },
        userId
      });

      await icons.saveNotionStatusIconSettings({
        allowedOptionIds: ["opt-done"],
        settings: {
          dataSourceId: "ds-1",
          emojiByOptionId: { "opt-done": "✅" },
          enabled: true,
          statusPropertyId: "prop-status"
        },
        userId
      });

      const capturedEvents: Array<Record<string, unknown>> = [];
      setOperationLogSink((ev) => {
        if (ev.userId === userId) {
          capturedEvents.push(ev);
        }
      });

      let patchCount = 0;
      let getCount = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "GET" && urlStr.includes("/v1/pages/page-matching-1")) {
          getCount += 1;
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "✅", type: "emoji" }, // Already matches
              id: "page-matching-1",
              last_edited_time: "2026-10-28T10:00:00.000Z",
              parent: { data_source_id: "ds-1", type: "data_source_id" },
              properties: {
                Status: { id: "prop-status", status: { id: "opt-done", name: "Done" }, type: "status" },
                Title: { id: "prop-title", title: [{ plain_text: "Task Match" }], type: "title" }
              },
              url: "https://notion.so/page-matching-1"
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          patchCount += 1;
          return new Response(JSON.stringify({ id: "page-matching-1" }), { status: 200 });
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await sync.syncSingleNotionCard({
        pageId: "page-matching-1",
        userId
      });

      assert.equal(getCount, 1);
      assert.equal(patchCount, 0, "No PATCH needed when icon matches and no numeric mappings exist");

      const missingWarnings = capturedEvents.filter(
        (e) => e.level === "warn" && (e.metadata as Record<string, unknown> | undefined)?.skippedReason === "missing_number_properties"
      );
      assert.equal(missingWarnings.length, 0, "No missing_number_properties warning when matching icon and no aggregate properties");

      const completedEvents = capturedEvents.filter((e) => e.result === "completed" && e.operation === "single_sync");
      assert.ok(completedEvents.length >= 1, "Completed sync log event is emitted");
    });
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
    await rm(directory, { force: true, recursive: true });
  }
});
