import { NotionApiError, requestNotionApi } from "./notion-api";
import {
  getUserNotionAccessToken,
  getUserNotionConnection,
  listCachedNotionCardsByPageIds
} from "./notion-store";

export type NotionCardComment = {
  authorName: string;
  canDelete: boolean;
  canEdit: boolean;
  createdById: string;
  createdTime: string;
  id: string;
  lastEditedTime: string;
  plainText: string;
};

export type NotionPageCommentsResult = {
  comments: NotionCardComment[];
  latestComment: NotionCardComment | null;
};

type RawNotionComment = {
  created_by?: {
    display_name?: {
      resolved_name?: string;
    };
    id?: string;
    name?: string;
    object?: string;
  };
  created_time?: string;
  display_name?: {
    resolved_name?: string;
  };
  id?: string;
  last_edited_time?: string;
  rich_text?: Array<{
    plain_text?: string;
    text?: { content?: string };
  }>;
};

type RawNotionCommentListResponse = {
  has_more?: boolean;
  next_cursor?: string | null;
  results?: RawNotionComment[];
};

const botIdCache = new Map<string, string>();

async function resolveBotId(userId: string, token: string): Promise<string> {
  const cacheKey = `${userId}:${token.slice(-12)}`;
  const cached = botIdCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await requestNotionApi({
    context: { source: "today_comments", userId },
    errorMessage: (status) => `Notion 사용자 정보를 확인하지 못했습니다. (${status})`,
    method: "GET",
    path: "/v1/users/me",
    token
  });

  const me = (await response.json()) as { id?: string };
  const botId = typeof me.id === "string" ? me.id.trim() : "";
  if (botId) {
    botIdCache.set(cacheKey, botId);
  }
  return botId;
}

function mapNotionComment(raw: RawNotionComment, connectionBotId: string): NotionCardComment | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    return null;
  }

  const createdById = typeof raw.created_by?.id === "string" ? raw.created_by.id.trim() : "";
  const isOwnConnection = Boolean(connectionBotId) && createdById === connectionBotId;
  const plainText = Array.isArray(raw.rich_text)
    ? raw.rich_text.map((item) => item.plain_text ?? item.text?.content ?? "").join("")
    : "";
  const createdTime = typeof raw.created_time === "string" ? raw.created_time : "";
  const lastEditedTime = typeof raw.last_edited_time === "string" ? raw.last_edited_time : createdTime;
  const topLevelDisplayName =
    typeof raw.display_name?.resolved_name === "string"
      ? raw.display_name.resolved_name.trim()
      : "";
  const resolvedDisplayName =
    typeof raw.created_by?.display_name?.resolved_name === "string"
      ? raw.created_by.display_name.resolved_name.trim()
      : "";
  const rawName = typeof raw.created_by?.name === "string" ? raw.created_by.name.trim() : "";
  const authorName =
    topLevelDisplayName || resolvedDisplayName || rawName || (isOwnConnection ? "aJam" : "Notion 사용자");

  return {
    authorName,
    canDelete: isOwnConnection,
    canEdit: isOwnConnection,
    createdById,
    createdTime,
    id,
    lastEditedTime,
    plainText
  };
}

async function requireNotionCommentContext(userId: string, pageId: string) {
  const [connection, token, cachedCards] = await Promise.all([
    getUserNotionConnection(userId),
    getUserNotionAccessToken(userId),
    listCachedNotionCardsByPageIds({ notionPageIds: [pageId], userId })
  ]);

  if (!connection || !token) {
    throw new NotionApiError("연결된 Notion 계정이 없습니다.", { status: 401 });
  }
  if (cachedCards.length === 0) {
    throw new NotionApiError("연결된 Notion 데이터베이스에 속한 카드가 아닙니다.", { status: 403 });
  }

  const botId = await resolveBotId(userId, token);
  return {
    botId,
    token
  };
}

export async function listNotionPageComments(params: {
  pageId: string;
  userId: string;
}): Promise<NotionPageCommentsResult> {
  const pageId = params.pageId.trim();
  if (!pageId) {
    throw new NotionApiError("Notion 카드 ID가 필요합니다.", { status: 400 });
  }

  const { botId, token } = await requireNotionCommentContext(params.userId, params.pageId.trim());
  const comments: NotionCardComment[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const query = new URLSearchParams({
      block_id: pageId,
      page_size: "100"
    });
    if (cursor) {
      query.set("start_cursor", cursor);
    }

    const response = await requestNotionApi({
      context: { source: "today_comments", userId: params.userId },
      errorMessage: (status) => `Notion 댓글을 불러오지 못했습니다. (${status})`,
      method: "GET",
      path: `/v1/comments?${query.toString()}`,
      token
    });

    const data = (await response.json()) as RawNotionCommentListResponse;
    const batch = Array.isArray(data.results) ? data.results : [];
    for (const item of batch) {
      const mapped = mapNotionComment(item, botId);
      if (mapped) {
        comments.push(mapped);
      }
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }
    if (seenCursors.has(data.next_cursor)) {
      throw new NotionApiError("Notion 댓글 페이지네이션 커서가 반복되었습니다.", { status: 502 });
    }
    seenCursors.add(data.next_cursor);
    cursor = data.next_cursor;
  }

  let latestComment: NotionCardComment | null = null;
  for (const comment of comments) {
    if (!latestComment || comment.createdTime >= latestComment.createdTime) {
      latestComment = comment;
    }
  }

  return {
    comments,
    latestComment
  };
}

export async function createNotionPageComment(params: {
  authorName: string;
  pageId: string;
  text: string;
  userId: string;
}): Promise<NotionCardComment> {
  const authorName = params.authorName.trim();
  const pageId = params.pageId.trim();
  const text = params.text.trim();
  if (!pageId) {
    throw new NotionApiError("Notion 카드 ID가 필요합니다.", { status: 400 });
  }
  if (!text) {
    throw new NotionApiError("댓글 내용을 입력하세요.", { status: 400 });
  }
  if (!authorName) {
    throw new NotionApiError("댓글 작성자 이름이 필요합니다.", { status: 400 });
  }

  const { botId, token } = await requireNotionCommentContext(params.userId, pageId);
  const response = await requestNotionApi({
    body: {
      display_name: { type: "custom", custom: { name: authorName } },
      parent: { page_id: pageId },
      rich_text: [{ text: { content: text }, type: "text" }]
    },
    context: { source: "today_comments", userId: params.userId },
    errorMessage: (status) => `Notion 댓글을 등록하지 못했습니다. (${status})`,
    method: "POST",
    path: "/v1/comments",
    token
  });

  const raw = (await response.json()) as RawNotionComment;
  const mapped = mapNotionComment(raw, botId);
  if (!mapped) {
    throw new NotionApiError("Notion 댓글 응답 형식이 올바르지 않습니다.", { status: 502 });
  }
  return mapped;
}

async function assertOwnComment(params: {
  commentId: string;
  pageId: string;
  userId: string;
}): Promise<void> {
  const { comments } = await listNotionPageComments({
    pageId: params.pageId,
    userId: params.userId
  });
  const target = comments.find((item) => item.id === params.commentId);
  if (!target) {
    throw new NotionApiError("대상 댓글을 찾을 수 없습니다.", { status: 404 });
  }
  if (!target.canEdit) {
    throw new NotionApiError("현재 aJam 연결이 작성한 댓글만 수정하거나 삭제할 수 있습니다.", { status: 403 });
  }
}

export async function updateNotionPageComment(params: {
  commentId: string;
  pageId: string;
  text: string;
  userId: string;
}): Promise<NotionCardComment> {
  const commentId = params.commentId.trim();
  const text = params.text.trim();
  if (!commentId) {
    throw new NotionApiError("댓글 ID가 필요합니다.", { status: 400 });
  }
  if (!text) {
    throw new NotionApiError("댓글 내용을 입력하세요.", { status: 400 });
  }

  const { botId, token } = await requireNotionCommentContext(params.userId, params.pageId.trim());
  await assertOwnComment({ commentId, pageId: params.pageId, userId: params.userId });

  const response = await requestNotionApi({
    body: {
      rich_text: [{ text: { content: text }, type: "text" }]
    },
    context: { source: "today_comments", userId: params.userId },
    errorMessage: (status) => `Notion 댓글을 수정하지 못했습니다. (${status})`,
    method: "PATCH",
    path: `/v1/comments/${encodeURIComponent(commentId)}`,
    token
  });

  const raw = (await response.json()) as RawNotionComment;
  const mapped = mapNotionComment(raw, botId);
  if (!mapped) {
    throw new NotionApiError("Notion 댓글 응답 형식이 올바르지 않습니다.", { status: 502 });
  }
  return mapped;
}

export async function deleteNotionPageComment(params: {
  commentId: string;
  pageId: string;
  userId: string;
}): Promise<void> {
  const commentId = params.commentId.trim();
  if (!commentId) {
    throw new NotionApiError("댓글 ID가 필요합니다.", { status: 400 });
  }

  const { token } = await requireNotionCommentContext(params.userId, params.pageId.trim());
  await assertOwnComment({ commentId, pageId: params.pageId, userId: params.userId });

  await requestNotionApi({
    context: { source: "today_comments", userId: params.userId },
    errorMessage: (status) => `Notion 댓글을 삭제하지 못했습니다. (${status})`,
    method: "DELETE",
    path: `/v1/comments/${encodeURIComponent(commentId)}`,
    token
  });
}
