import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ajam-notion-comments-test-"));
const dbPath = path.join(tempDir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;

const {
  createManagedUser,
  createNotionPageComment,
  deleteNotionPageComment,
  ensureNotionSchema,
  listNotionPageComments,
  prisma,
  updateNotionPageComment,
  upsertNotionCardCache,
  upsertUserNotionConnection
} = await import("./index.js");

test.after(async () => {
  await prisma.$disconnect();
  fs.rmSync(tempDir, { force: true, recursive: true });
});

test("notion-comments resolves /v1/users/me bot identity, enforces ownership on partial users, handles pagination & repeated cursors, and never retries create", async () => {
  await ensureNotionSchema();

  const user = await createManagedUser({
    email: "comments@example.com",
    password: "password123",
    role: "USER",
    username: "comments-user"
  });

  await upsertUserNotionConnection({
    accessToken: "secret-test-token",
    connection: {
      ajamLastUpdateProperty: null,
      analysisConfigVersion: 1,
      authType: "oauth",
      availableHoursProperty: null,
      categoryProperty: { id: "cat", name: "Category", type: "select" },
      databaseId: "db-1",
      dataSourceId: "ds-1",
      dataSourceName: "Tasks",
      dateMappingMode: "due_date",
      doneStatusValues: ["Done"],
      endDateProperty: { id: "end", name: "End", type: "date" },
      lastWorkedDateProperty: null,
      notionApiVersion: "2026-03-11",
      sourceInput: "db-1",
      startDateProperty: { id: "start", name: "Start", type: "date" },
      statusProperty: { id: "status", name: "Status", type: "status" },
      titleProperty: { id: "title", name: "Title", type: "title" },
      workDayCountProperty: null,
      workHoursProperty: null
    } as never,
    userId: user.id
  });

  await upsertNotionCardCache({
    analysisConfigVersion: 1,
    cards: [
      {
        category: "Dev",
        dataSourceId: "ds-1",
        endDate: "",
        isDone: false,
        lastEditedTime: "2026-11-17T00:00:00.000Z",
        notionPageId: "page-1",
        rawPropertiesJson: "{}",
        startDate: "",
        status: "In Progress",
        title: "Test Card",
        url: "https://notion.so/page-1"
      } as never
    ],
    userId: user.id
  });

  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string }> = [];

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      calls.push({ method, url });

      if (method === "GET" && url.endsWith("/v1/users/me")) {
        return new Response(
          JSON.stringify({ id: "bot-ajam-1", name: "aJam Integration", object: "user", type: "bot" }),
          { status: 200 }
        );
      }

      if (method === "GET" && url.includes("start_cursor=cursor-2")) {
        return new Response(
          JSON.stringify({
            has_more: false,
            next_cursor: null,
            results: [
              {
                created_by: { id: "bot-ajam-1", name: "aJam", object: "user" },
                created_time: "2026-11-17T02:00:00.000Z",
                id: "comment-2",
                last_edited_time: "2026-11-17T02:00:00.000Z",
                rich_text: [{ plain_text: "Second comment" }]
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (method === "GET") {
        return new Response(
          JSON.stringify({
            has_more: true,
            next_cursor: "cursor-2",
            results: [
              {
                created_by: { id: "user-other-1", object: "user" },
                created_time: "2026-11-17T01:00:00.000Z",
                display_name: { resolved_name: "Alice" },
                id: "comment-1",
                last_edited_time: "2026-11-17T01:00:00.000Z",
                rich_text: [{ plain_text: "First comment" }]
              }
            ]
          }),
          { status: 200 }
        );
      }

      if (method === "POST") {
        return new Response(
          JSON.stringify({
            created_by: { id: "bot-ajam-1", name: "aJam", object: "user" },
            created_time: "2026-11-17T03:00:00.000Z",
            id: "comment-3",
            last_edited_time: "2026-11-17T03:00:00.000Z",
            rich_text: [{ plain_text: "Created comment" }]
          }),
          { status: 200 }
        );
      }

      if (method === "PATCH") {
        return new Response(
          JSON.stringify({
            created_by: { id: "bot-ajam-1", name: "aJam", object: "user" },
            created_time: "2026-11-17T02:00:00.000Z",
            id: "comment-2",
            last_edited_time: "2026-11-17T04:00:00.000Z",
            rich_text: [{ plain_text: "Updated comment" }]
          }),
          { status: 200 }
        );
      }

      if (method === "DELETE") {
        return new Response(JSON.stringify({ archived: true, id: "comment-2" }), { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    // 1. Paginated list & authorship flags using partial user IDs
    const listed = await listNotionPageComments({ pageId: "page-1", userId: user.id });
    assert.equal(listed.comments.length, 2);
    assert.equal(listed.comments[0]?.authorName, "Alice");
    assert.equal(listed.comments[0]?.canEdit, false);
    assert.equal(listed.comments[1]?.canEdit, true);
    assert.equal(listed.latestComment?.id, "comment-2");

    // 1b. Uncached/unauthorized pageId is rejected
    await assert.rejects(
      () => listNotionPageComments({ pageId: "page-unauthorized", userId: user.id }),
      /연결된 Notion 데이터베이스에 속한 카드가 아닙니다/
    );

    // 2. Authorship denial for other user's comment
    await assert.rejects(
      () =>
        updateNotionPageComment({
          commentId: "comment-1",
          pageId: "page-1",
          text: "Should fail",
          userId: user.id
        }),
      /현재 aJam 연결이 작성한 댓글만/
    );

    // 3. Create, Update, Delete own comment
    const created = await createNotionPageComment({
      pageId: "page-1",
      text: "Created comment",
      userId: user.id
    });
    assert.equal(created.id, "comment-3");

    const updated = await updateNotionPageComment({
      commentId: "comment-2",
      pageId: "page-1",
      text: "Updated comment",
      userId: user.id
    });
    assert.equal(updated.plainText, "Updated comment");

    await deleteNotionPageComment({
      commentId: "comment-2",
      pageId: "page-1",
      userId: user.id
    });

    // 4. Repeated cursor throws explicit error
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          has_more: true,
          next_cursor: "cursor-loop",
          results: []
        }),
        { status: 200 }
      )) as typeof fetch;

    await assert.rejects(
      () => listNotionPageComments({ pageId: "page-1", userId: user.id }),
      /커서가 반복/
    );

    // 5. Ambiguous create (network error) does NOT retry
    calls.length = 0;
    globalThis.fetch = (async () => {
      calls.push({ method: "POST", url: "https://api.notion.com/v1/comments" });
      throw new Error("socket hang up");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        createNotionPageComment({
          pageId: "page-1",
          text: "Ambiguous",
          userId: user.id
        }),
      /socket hang up/
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
