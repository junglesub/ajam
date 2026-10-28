import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setOperationLogSink, type OperationLogEvent } from "./operation-log";

test("notion icon bulk sync runner comprehensive verification in isolated database", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ajam-test-bulk-"));
  process.env.DATABASE_URL = `file:${join(directory, "test.db").replaceAll("\\", "/")}`;

  const [
    { prisma },
    { ensureApplicationSchema },
    bulk,
    store,
    icons
  ] = await Promise.all([
    import("./client"),
    import("./settings-store"),
    import("./notion-icon-bulk"),
    import("./notion-store"),
    import("./notion-status-icons")
  ]);

  const originalFetch = globalThis.fetch;

  async function setupUser(userId: string) {
    await ensureApplicationSchema();
    await store.ensureNotionSchema();
    await bulk.ensureNotionIconBulkSchema();

    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "User" ("id", "username", "passwordHash", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      userId,
      `user_${userId}`,
      "hash"
    );

    await store.upsertUserNotionConnection({
      accessToken: "test-token",
      connection: {
        ajamLastUpdateProperty: null,
        analysisConfigVersion: 1,
        authType: "internal_token",
        availableHoursProperty: null,
        categoryProperty: null,
        databaseId: "db-bulk",
        dataSourceId: "ds-bulk",
        dataSourceName: "Bulk DS",
        dateMappingMode: "separate_properties",
        doneStatusValues: ["완료"],
        endDateProperty: null,
        lastWorkedDateProperty: null,
        notionApiVersion: "2026-03-11",
        sourceInput: "https://notion.so/db-bulk",
        startDateProperty: null,
        statusProperty: { id: "prop-status", name: "상태", type: "status" },
        titleProperty: { id: "prop-title", name: "제목", type: "title" },
        workDayCountProperty: null,
        workHoursProperty: null
      },
      userId
    });

    await icons.saveNotionStatusIconSettings({
      allowedOptionIds: ["opt-done", "opt-prog", "opt-other"],
      settings: {
        dataSourceId: "ds-bulk",
        emojiByOptionId: {
          "opt-done": "✅",
          "opt-other": "🎯",
          "opt-prog": "🚧"
        },
        enabled: true,
        statusPropertyId: "prop-status"
      },
      userId
    });
  }

  try {
    await t.test("verifies SQLite database is opened in temporary directory via PRAGMA database_list", async () => {
      const dbList = await prisma.$queryRawUnsafe<Array<{ file: string; name: string }>>("PRAGMA database_list;");
      const mainDb = dbList.find((d) => d.name === "main");
      assert.ok(
        mainDb && (mainDb.file.includes("ajam-test-bulk-") || mainDb.file.includes(directory)),
        `Expected temp DB in ${directory}, got: ${mainDb?.file}`
      );
    });

    await t.test("startup validation checks job row, server ownership, and recorded fingerprint", async () => {
      const user = `user_owner_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      // Modify settings directly in DB to trigger fingerprint mismatch at startup
      await prisma.$executeRawUnsafe(
        `UPDATE "UserNotionConnection" SET "statusPropertyJson" = ? WHERE "userId" = ?`,
        JSON.stringify({ id: "prop-other", name: "Other", type: "status" }),
        user
      );

      let queryCalls = 0;
      globalThis.fetch = (async () => {
        queryCalls += 1;
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(queryCalls, 0, "No Notion requests must be made when startup fingerprint mismatches");
      const updatedJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(updatedJob?.status, "interrupted");
      assert.equal(updatedJob?.errorCode, "SETTINGS_CHANGED");
    });

    await t.test("concurrent Promise.all starts return the same running job with atomic lock", async () => {
      const user = `user_atomic_${Date.now()}`;
      await setupUser(user);

      const [res1, res2] = await Promise.all([
        bulk.startNotionIconBulk(user),
        bulk.startNotionIconBulk(user)
      ]);

      assert.equal(res1.job.id, res2.job.id, "Both concurrent starts must return identical job ID");
      const startedCount = (res1.startedNew ? 1 : 0) + (res2.startedNew ? 1 : 0);
      assert.equal(startedCount, 1, "Exactly one start must report startedNew = true");
    });

    await t.test("dead process abandoned running job is marked interrupted on retrieval", async () => {
      const user = `user_dead_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      // Simulate previous process ID
      await prisma.$executeRawUnsafe(
        `UPDATE "NotionIconBulkJob" SET "serverInstanceId" = 'dead-process-id' WHERE "id" = ?`,
        job.id
      );

      const latest = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(latest?.status, "interrupted");
      assert.ok(latest?.errorMessage.includes("서버 재시작"));
    });

    await t.test("query 429 Retry-After retries and succeeds", async () => {
      const user = `user_q429_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let queryAttempts = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          queryAttempts += 1;
          if (queryAttempts === 1) {
            return new Response(JSON.stringify({ code: "rate_limited", message: "Rate limit" }), {
              headers: { "retry-after": "0.01" },
              status: 429
            });
          }
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-q429-1",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          return new Response(
            JSON.stringify({
              icon: { emoji: "✅", type: "emoji" },
              id: "page-q429-1",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(queryAttempts, 2, "Query must retry after 429");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.updatedCount, 1);
      assert.equal(finalJob?.skippedCount, 0);
      assert.equal(finalJob?.failedCount, 0);
    });

    await t.test("query 529 exhaustion marks job failed and never completed", async () => {
      const user = `user_q529_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let queryAttempts = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          queryAttempts += 1;
          return new Response(JSON.stringify({ code: "service_unavailable" }), {
            headers: { "retry-after": "0.01" },
            status: 529
          });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.ok(queryAttempts >= 3, "Query must retry up to max retries before exhaustion");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "failed");
      assert.equal(finalJob?.errorCode, "529");
    });

    await t.test("fatal authentication error in query (401) marks job failed, never completed", async () => {
      const user = `user_auth401_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return new Response(JSON.stringify({ code: "unauthorized", message: "Invalid token" }), {
            status: 401
          });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "failed");
      assert.equal(finalJob?.errorCode, "401");
    });

    await t.test("fatal authentication error in PATCH (403) stops job and marks failed", async () => {
      const user = `user_auth403_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-auth-403",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (method === "PATCH") {
          return new Response(JSON.stringify({ code: "restricted_resource", message: "Forbidden" }), {
            status: 403
          });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "failed");
      assert.equal(finalJob?.errorCode, "403");
    });

    await t.test("ambiguous PATCH 503 that actually committed reconciles via verification GET", async () => {
      const user = `user_ambig503_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchCalls = 0;
      let getCalls = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-ambig-503",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          patchCalls += 1;
          // In-flight 503 error
          return new Response(JSON.stringify({ code: "service_unavailable" }), { status: 503 });
        }

        if (method === "GET" && urlStr.includes("/v1/pages/page-ambig-503")) {
          getCalls += 1;
          // Verification GET shows that Notion actually committed the write!
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "✅", type: "emoji" },
              id: "page-ambig-503",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(patchCalls, 1, "Only 1 initial PATCH should be sent before ambiguity reconciliation");
      assert.equal(getCalls, 1, "Verification GET must be called to inspect committed status");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.updatedCount, 1);
      assert.equal(finalJob?.skippedCount, 0);
      assert.equal(finalJob?.failedCount, 0);
    });

    await t.test("ambiguous PATCH verification with changed status writes new status emoji, never resends old", async () => {
      const user = `user_ambig_chg_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchCalls = 0;
      const sentEmojis: string[] = [];
      let getCalls = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-ambig-chg",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          patchCalls += 1;
          const body = JSON.parse(String(init?.body ?? "{}"));
          sentEmojis.push(body?.icon?.emoji);

          if (patchCalls === 1) {
            // First patch (target: ✅ for opt-done) fails with ambiguous 504
            return new Response(JSON.stringify({ code: "gateway_timeout" }), { status: 504 });
          }

          // Second patch succeeds with the NEW status's emoji (🎯 for opt-other)
          return new Response(
            JSON.stringify({
              icon: { emoji: body?.icon?.emoji, type: "emoji" },
              id: "page-ambig-chg",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-other", name: "기타" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        if (method === "GET" && urlStr.includes("/v1/pages/page-ambig-chg")) {
          getCalls += 1;
          // Verification GET shows that the page's status in Notion was changed to opt-other!
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "📅", type: "emoji" },
              id: "page-ambig-chg",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-other", name: "기타" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(patchCalls, 2);
      assert.ok(getCalls >= 1, "Verification GET was called");
      assert.equal(sentEmojis[0], "✅", "First attempt sends initial status emoji");
      assert.equal(sentEmojis[1], "🎯", "Second attempt MUST send verified new status emoji (never old emoji!)");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.updatedCount, 1);
      assert.equal(finalJob?.skippedCount, 0);
      assert.equal(finalJob?.failedCount, 0);
    });

    await t.test("settings change mid-batch halts job immediately as interrupted without writing old icons", async () => {
      const user = `user_midchg_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchesAttempted = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";

        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-mid-1",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                },
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-mid-2",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          patchesAttempted += 1;
          // Change settings right after page 1 PATCH
          await icons.saveNotionStatusIconSettings({
            allowedOptionIds: ["opt-done"],
            settings: {
              dataSourceId: "ds-bulk",
              emojiByOptionId: { "opt-done": "🔥" }, // Changed emoji!
              enabled: true,
              statusPropertyId: "prop-status"
            },
            userId: user
          });

          return new Response(
            JSON.stringify({
              icon: { emoji: "✅", type: "emoji" },
              id: "page-mid-1",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(patchesAttempted, 1, "Page 2 must NOT be patched with old settings");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "interrupted");
    });

    await t.test("100-page list reuse requires 0 GETs when cache is empty or matches", async () => {
      const user = `user_reuse_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      const mockPages100 = Array.from({ length: 100 }, (_, i) => ({
        archived: false,
        icon: { emoji: "📅", type: "emoji" },
        id: `page-reuse-${i + 1}`,
        last_edited_time: "2026-10-28T10:00:00.000Z",
        parent: { data_source_id: "ds-bulk", type: "data_source_id" },
        properties: {
          상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
        }
      }));

      let queryCount = 0;
      let patchCount = 0;
      let getCount = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";

        if (method === "POST") {
          queryCount += 1;
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: mockPages100
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          patchCount += 1;
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "✅", type: "emoji" },
              id: "dummy",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {}
            }),
            { status: 200 }
          );
        }

        if (method === "GET") {
          getCount += 1;
          return new Response(JSON.stringify({}), { status: 200 });
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(queryCount, 1, "Exactly 1 query for 100 pages");
      assert.equal(patchCount, 100, "100 pages updated via PATCH");
      assert.equal(getCount, 0, "Zero GET requests needed on normal path");
    });

    await t.test("same-icon rerun requires 0 GETs and 0 PATCHes", async () => {
      const user = `user_same_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      const mockPagesMatching = Array.from({ length: 50 }, (_, i) => ({
        archived: false,
        icon: { emoji: "✅", type: "emoji" }, // Already matches
        id: `page-match-${i + 1}`,
        parent: { data_source_id: "ds-bulk", type: "data_source_id" },
        properties: {
          상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
        }
      }));

      let patchCount = 0;
      let getCount = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: mockPagesMatching
            }),
            { status: 200 }
          );
        }
        if (method === "PATCH") {
          patchCount += 1;
          return new Response("{}", { status: 200 });
        }
        if (method === "GET") {
          getCount += 1;
          return new Response("{}", { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(patchCount, 0, "Zero PATCH requests when icons already match");
      assert.equal(getCount, 0, "Zero GET requests on same-icon run");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.skippedCount, 50);
      assert.equal(finalJob?.updatedCount, 0);
    });

    await t.test("newer cache with failed exception GET marks page failed and performs 0 PATCHes", async () => {
      const user = `user_stale_${Date.now()}`;
      await setupUser(user);

      // Seed newer cache observation
      await prisma.$executeRawUnsafe(
        `INSERT INTO "NotionCardCache" ("id", "userId", "notionPageId", "title", "status", "category", "startDate", "endDate", "lastEditedTime", "rawPropertiesJson", "createdAt", "updatedAt")
         VALUES ('cache-stale-1', ?, 'page-stale-1', 'Stale Card', '완료', 'Dev', '', '', '2026-10-28T12:00:00.000Z', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        user
      );

      const { job } = await bulk.startNotionIconBulk(user);

      let patchCalls = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-stale-1",
                  last_edited_time: "2026-10-28T10:00:00.000Z", // Older than cache!
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "GET" && urlStr.includes("/v1/pages/page-stale-1")) {
          // Exception GET fails
          return new Response("Server error", { status: 500 });
        }

        if (method === "PATCH") {
          patchCalls += 1;
          return new Response("{}", { status: 200 });
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(patchCalls, 0, "NEVER patch known stale data when refresh fails!");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.failedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
    });

    await t.test("equal-time observation with matching status requires 0 exception GETs", async () => {
      const user = `user_eq_${Date.now()}`;
      await setupUser(user);

      await prisma.$executeRawUnsafe(
        `INSERT INTO "NotionCardCache" ("id", "userId", "notionPageId", "title", "status", "category", "startDate", "endDate", "lastEditedTime", "rawPropertiesJson", "createdAt", "updatedAt")
         VALUES ('cache-eq-1', ?, 'page-eq-1', 'Eq Card', '완료', 'Dev', '', '', '2026-10-28T10:00:00.000Z', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        user,
        JSON.stringify({
          상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
        })
      );

      const { job } = await bulk.startNotionIconBulk(user);

      let getCalls = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-eq-1",
                  last_edited_time: "2026-10-28T10:00:00.000Z", // Same timestamp
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (method === "PATCH") {
          return new Response(
            JSON.stringify({
              icon: { emoji: "✅", type: "emoji" },
              id: "page-eq-1",
              parent: { data_source_id: "ds-bulk", type: "data_source_id" },
              properties: {}
            }),
            { status: 200 }
          );
        }
        if (method === "GET") {
          getCalls += 1;
          return new Response("{}", { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      assert.equal(getCalls, 0, "Matching status at equal timestamp must require 0 exception GETs");
      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.updatedCount, 1);
    });

    await t.test("all-page failure logs error failed and finishes with status failed", async () => {
      const user = `user_allfail_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return new Response(
            JSON.stringify({
              has_more: false,
              next_cursor: null,
              results: [
                {
                  archived: false,
                  icon: { emoji: "📅", type: "emoji" },
                  id: "page-fail-1",
                  parent: { data_source_id: "ds-bulk", type: "data_source_id" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }
        if (method === "PATCH") {
          // Permanent 400 error
          return new Response(JSON.stringify({ code: "validation_error" }), { status: 400 });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "failed");
      assert.equal(finalJob?.failedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
    });
    await t.test("persisted log assertions verify userId, operationId, and seconds retryAfter in DB", async () => {
      const user = `user_log_${Date.now()}`;
      await setupUser(user);

      const capturedEvents: OperationLogEvent[] = [];
      setOperationLogSink((ev) => {
        if (ev.userId === user) {
          capturedEvents.push(ev);
        }
      });

      const { job } = await bulk.startNotionIconBulk(user);

      let attempts = 0;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          attempts += 1;
          if (attempts === 1) {
            return new Response(JSON.stringify({ code: "rate_limited" }), {
              headers: { "retry-after": "1" },
              status: 429
            });
          }
          return new Response(JSON.stringify({ has_more: false, results: [] }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({ jobId: job.id, pacingMs: 0, userId: user });

      // Ensure OperationLog schema exists and persist captured events
      const { ensureOperationLogSchema, appendOperationLogs } = await import("./operation-log-store");
      await ensureOperationLogSchema();
      await appendOperationLogs(capturedEvents);

      // Verify persisted logs in OperationLog table
      const logs = await prisma.$queryRawUnsafe<Array<{
        component: string;
        level: string;
        metadataJson: string;
        operation: string;
        operationId: string;
        result: string;
        userId: string;
      }>>(
        `SELECT "component", "operation", "result", "level", "userId", "operationId", "metadataJson"
         FROM "OperationLog"
         WHERE "userId" = ? AND "operationId" = ?
         ORDER BY id ASC`,
        user,
        job.id
      );

      assert.ok(logs.length >= 2, "Must persist at least started and completed/retrying logs");
      assert.ok(logs.some((l) => l.result === "started" && l.operationId === job.id && l.userId === user));
      assert.ok(logs.some((l) => l.result === "retrying" && l.level === "warn" && l.metadataJson.includes('"retryAfter":1')));
    });

    await t.test("120-second Retry-After respects server header without 60s clamp using injected sleep", async () => {
      const user = `user_retry120_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      const sleptMs: number[] = [];
      let patchAttempts = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-120",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-120")) {
          patchAttempts += 1;
          if (patchAttempts === 1) {
            return new Response(JSON.stringify({ code: "rate_limited" }), {
              headers: { "retry-after": "120" },
              status: 429
            });
          }
          return new Response(
            JSON.stringify({
              icon: { emoji: "✅", type: "emoji" },
              id: "page-120"
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        sleepFn: async (ms) => {
          sleptMs.push(ms);
        },
        userId: user
      });

      assert.equal(patchAttempts, 2, "PATCH retried exactly once after 429");
      assert.deepEqual(sleptMs, [120000], "Slept full 120s from header without 60s clamp");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.updatedCount, 1);
      assert.equal(finalJob?.skippedCount, 0);
      assert.equal(finalJob?.failedCount, 0);
    });

    await t.test("blocked 429 (public_api_request_blocked) stops immediately with exactly 1 attempt", async () => {
      const user = `user_blocked429_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchAttempts = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-blocked",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-blocked")) {
          patchAttempts += 1;
          return new Response(
            JSON.stringify({ code: "public_api_request_blocked", message: "API access blocked" }),
            { status: 429 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        userId: user
      });

      assert.equal(patchAttempts, 1, "Non-retryable blocked 429 makes exactly 1 attempt");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.failedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
    });

    await t.test("permanent 4xx (422) stops immediately without extra PATCH or ambiguous retries", async () => {
      const user = `user_perm4xx_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchAttempts = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-perm-422",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-perm-422")) {
          patchAttempts += 1;
          return new Response(
            JSON.stringify({ code: "validation_error", message: "Unprocessable entity" }),
            { status: 422 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        userId: user
      });

      assert.equal(patchAttempts, 1, "Permanent 4xx makes exactly 1 attempt, no extra PATCH");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.failedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
    });

    await t.test("throttled reconciliation GET respects delay and makes NO early write", async () => {
      const user = `user_throt_recon_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchAttempts = 0;
      let getAttempts = 0;
      const sleptMs: number[] = [];

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-recon-throt",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-recon-throt")) {
          patchAttempts += 1;
          // Ambiguous 500 error on initial PATCH
          return new Response(JSON.stringify({ code: "internal_server_error" }), { status: 500 });
        }

        if (method === "GET" && urlStr.includes("/pages/page-recon-throt")) {
          getAttempts += 1;
          if (getAttempts === 1) {
            // First reconciliation GET is throttled!
            return new Response(JSON.stringify({ code: "rate_limited" }), {
              headers: { "retry-after": "5" },
              status: 429
            });
          }
          // Second reconciliation GET succeeds and confirms commit!
          return new Response(
            JSON.stringify({
              archived: false,
              icon: { emoji: "✅", type: "emoji" },
              id: "page-recon-throt",
              parent: { data_source_id: "ds-bulk" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        sleepFn: async (ms) => {
          sleptMs.push(ms);
        },
        userId: user
      });

      assert.equal(patchAttempts, 1, "Exactly 1 PATCH: NO early or blind write triggered by throttled GET");
      assert.equal(getAttempts, 2, "Reconciliation GET was retried after backoff");
      assert.ok(sleptMs.includes(5000), "Slept 5s for the reconciliation GET throttle");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.updatedCount, 1);
      assert.equal(finalJob?.skippedCount, 0);
      assert.equal(finalJob?.failedCount, 0);
    });

    await t.test("persisted log regression on PATCH 429/529 retries asserts NO error logs, warn retrying in seconds, and final completed", async () => {
      const user = `user_patch_retry_logs_${Date.now()}`;
      await setupUser(user);

      const capturedEvents: OperationLogEvent[] = [];
      setOperationLogSink((ev) => {
        if (ev.userId === user) {
          capturedEvents.push(ev);
        }
      });

      const { job } = await bulk.startNotionIconBulk(user);

      let patchAttempts = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-patch-log",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-patch-log")) {
          patchAttempts += 1;
          if (patchAttempts === 1) {
            return new Response(JSON.stringify({ code: "rate_limited" }), {
              headers: { "retry-after": "3" },
              status: 429
            });
          }
          if (patchAttempts === 2) {
            return new Response(JSON.stringify({ code: "service_unavailable" }), {
              headers: { "retry-after": "2" },
              status: 529
            });
          }
          return new Response(
            JSON.stringify({
              icon: { emoji: "✅", type: "emoji" },
              id: "page-patch-log"
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        sleepFn: async () => {},
        userId: user
      });

      assert.equal(patchAttempts, 3);

      const { ensureOperationLogSchema, appendOperationLogs } = await import("./operation-log-store");
      await ensureOperationLogSchema();
      await appendOperationLogs(capturedEvents);

      const logs = await prisma.$queryRawUnsafe<Array<{
        component: string;
        level: string;
        metadataJson: string;
        operation: string;
        operationId: string;
        result: string;
        userId: string;
      }>>(
        `SELECT "component", "operation", "result", "level", "userId", "operationId", "metadataJson"
         FROM "OperationLog"
         WHERE "userId" = ? AND "operationId" = ?
         ORDER BY id ASC`,
        user,
        job.id
      );

      // Verify NO error logs exist
      const errorLogs = logs.filter((l) => l.level === "error" || l.result === "failed");
      assert.equal(errorLogs.length, 0, "No error/failed logs persisted for retried-and-successful PATCH");

      // Verify warn retrying in seconds
      const retryLogs = logs.filter((l) => l.result === "retrying" && l.level === "warn");
      assert.equal(retryLogs.length, 2, "Expected 2 retry warning logs (429 and 529)");
      assert.ok(retryLogs[0]?.metadataJson.includes('"retryAfter":3'), "429 retryAfter in seconds");
      assert.ok(retryLogs[1]?.metadataJson.includes('"retryAfter":2'), "529 retryAfter in seconds");

      // Verify final info completed
      const completedLogs = logs.filter((l) => l.result === "completed" && l.level === "info");
      assert.equal(completedLogs.length, 1, "Final completed info log");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.requestCount, 4, "Exact request count: 1 query + 3 PATCHes");
    });

    await t.test("initial eligible snapshot -> fresh GET trashed/archived -> zero PATCH", async () => {
      const user = `user_fresh_trash_${Date.now()}`;
      await setupUser(user);

      // Seed local cache with newer timestamp
      await prisma.$executeRawUnsafe(
        `INSERT INTO "NotionCardCache" ("id", "userId", "notionPageId", "title", "status", "category", "startDate", "endDate", "lastEditedTime", "rawPropertiesJson", "createdAt", "updatedAt")
         VALUES ('cache-fresh-trash', ?, 'page-fresh-trash', 'Card', '완료', 'Dev', '', '', '2026-10-28T12:00:00.000Z', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        user
      );

      const { job } = await bulk.startNotionIconBulk(user);

      let patchCount = 0;
      let freshGetCount = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-fresh-trash",
                  last_edited_time: "2026-10-28T10:00:00.000Z", // Older than cache
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "GET" && urlStr.includes("/pages/page-fresh-trash")) {
          freshGetCount += 1;
          // Fresh GET reveals page was moved to trash!
          return new Response(
            JSON.stringify({
              id: "page-fresh-trash",
              in_trash: true,
              parent: { data_source_id: "ds-bulk" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH") {
          patchCount += 1;
          return new Response(JSON.stringify({ id: "page-fresh-trash" }), { status: 200 });
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        userId: user
      });

      assert.equal(freshGetCount, 1, "Exception GET was performed due to newer cache");
      assert.equal(patchCount, 0, "Zero PATCH performed on trashed page revealed by fresh GET");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.skippedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
    });

    await t.test("ambiguous write (500) -> verification foreign source/trash -> NO subsequent PATCH", async () => {
      const user = `user_ambig_foreign_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchCount = 0;
      let getCount = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-ambig-foreign",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-ambig-foreign")) {
          patchCount += 1;
          // Initial PATCH fails ambiguously
          return new Response(JSON.stringify({ code: "server_error" }), { status: 500 });
        }

        if (method === "GET" && urlStr.includes("/pages/page-ambig-foreign")) {
          getCount += 1;
          // Verification GET reveals page moved to another data source!
          return new Response(
            JSON.stringify({
              id: "page-ambig-foreign",
              parent: { data_source_id: "other_foreign_ds" },
              properties: {
                상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
              }
            }),
            { status: 200 }
          );
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        sleepFn: async () => {},
        userId: user
      });

      assert.equal(patchCount, 1, "Exactly 1 PATCH: NO subsequent PATCH after verification reveals foreign source");
      assert.equal(getCount, 1, "Reconciliation GET was performed");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "completed");
      assert.equal(finalJob?.skippedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
      assert.equal(finalJob?.failedCount, 0);
    });

    await t.test("ambiguous write (500) -> reconciliation GET failure -> exactly 1 PATCH, failedCount=1, no blind retry", async () => {
      const user = `user_recon_fail_${Date.now()}`;
      await setupUser(user);

      const { job } = await bulk.startNotionIconBulk(user);

      let patchCount = 0;
      let getCount = 0;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";

        if (method === "POST" && urlStr.includes("/query")) {
          return new Response(
            JSON.stringify({
              has_more: false,
              results: [
                {
                  archived: false,
                  icon: { emoji: "❓", type: "emoji" },
                  id: "page-recon-fail",
                  last_edited_time: "2026-10-28T10:00:00.000Z",
                  parent: { data_source_id: "ds-bulk" },
                  properties: {
                    상태: { id: "prop-status", status: { id: "opt-done", name: "완료" }, type: "status" }
                  }
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (method === "PATCH" && urlStr.includes("/pages/page-recon-fail")) {
          patchCount += 1;
          // Initial PATCH fails ambiguously
          return new Response(JSON.stringify({ code: "server_error" }), { status: 500 });
        }

        if (method === "GET" && urlStr.includes("/pages/page-recon-fail")) {
          getCount += 1;
          // Reconciliation GET fails with 500 (or network error / 404)
          return new Response(JSON.stringify({ code: "internal_server_error" }), { status: 500 });
        }

        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      await bulk.runNotionIconBulkJob({
        jobId: job.id,
        pacingMs: 0,
        sleepFn: async () => {},
        userId: user
      });

      assert.equal(patchCount, 1, "Exactly 1 PATCH: never fall through to blind PATCH on reconciliation failure");
      assert.equal(getCount, 1, "Reconciliation GET was attempted once before failing safely");

      const finalJob = await bulk.getLatestNotionIconBulkJob(user);
      assert.equal(finalJob?.status, "failed");
      assert.equal(finalJob?.failedCount, 1);
      assert.equal(finalJob?.updatedCount, 0);
      assert.equal(finalJob?.skippedCount, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
    await rm(directory, { force: true, recursive: true });
  }
});
