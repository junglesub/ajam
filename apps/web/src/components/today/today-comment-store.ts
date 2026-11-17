import type { NotionCardComment, NotionPageCommentsResult } from "@timesheet/db";

export type CardCommentEditorState = {
  draftText: string;
  editVersion: number;
  historyEditVersion: number;
  historyError: string;
  historyNewText: string;
  isDirty: boolean;
  mutating: boolean;
  mutationError: string;
  targetCommentId: string | null;
};

export function createInitialCommentEditorState(
  latestComment: NotionCardComment | null
): CardCommentEditorState {
  return {
    draftText: latestComment?.plainText ?? "",
    editVersion: 0,
    historyEditVersion: 0,
    historyError: "",
    historyNewText: "",
    isDirty: false,
    mutating: false,
    mutationError: "",
    targetCommentId: latestComment?.id ?? null
  };
}

export function syncEditorWithLatestComment(
  state: CardCommentEditorState | undefined,
  latestComment: NotionCardComment | null
): CardCommentEditorState {
  if (!state) {
    return createInitialCommentEditorState(latestComment);
  }
  if (state.isDirty) {
    return state;
  }
  return {
    ...state,
    draftText: latestComment?.plainText ?? "",
    targetCommentId: latestComment?.id ?? null
  };
}

export function updateCommentDraftText(
  state: CardCommentEditorState,
  text: string
): CardCommentEditorState {
  return {
    ...state,
    draftText: text,
    editVersion: state.editVersion + 1,
    isDirty: true,
    mutationError: ""
  };
}

export function finishCommentMutationSuccess(
  state: CardCommentEditorState,
  versionAtStart: number,
  returnedComment?: NotionCardComment
): CardCommentEditorState {
  const unchanged = state.editVersion === versionAtStart;
  return {
    ...state,
    draftText: unchanged && returnedComment ? returnedComment.plainText : state.draftText,
    isDirty: unchanged ? false : state.isDirty,
    mutating: false,
    mutationError: "",
    targetCommentId: unchanged && returnedComment ? returnedComment.id : state.targetCommentId
  };
}

export function upsertCommentInResult(
  existing: NotionPageCommentsResult | null,
  comment: NotionCardComment
): NotionPageCommentsResult {
  const list = existing?.comments ? [...existing.comments] : [];
  const idx = list.findIndex((c) => c.id === comment.id);
  if (idx >= 0) {
    list[idx] = comment;
  } else {
    list.push(comment);
  }
  let latestComment: NotionCardComment | null = null;
  for (const item of list) {
    if (!latestComment || item.createdTime >= latestComment.createdTime) {
      latestComment = item;
    }
  }
  return { comments: list, latestComment };
}

export function removeCommentFromResult(
  existing: NotionPageCommentsResult | null,
  commentId: string
): NotionPageCommentsResult {
  const list = (existing?.comments ?? []).filter((c) => c.id !== commentId);
  let latestComment: NotionCardComment | null = null;
  for (const item of list) {
    if (!latestComment || item.createdTime >= latestComment.createdTime) {
      latestComment = item;
    }
  }
  return { comments: list, latestComment };
}

export function updateHistoryDraftText(
  state: CardCommentEditorState,
  text: string
): CardCommentEditorState {
  return {
    ...state,
    historyEditVersion: state.historyEditVersion + 1,
    historyError: "",
    historyNewText: text
  };
}

export function finishHistoryCreateSuccess(
  state: CardCommentEditorState,
  historyVersionAtStart: number
): CardCommentEditorState {
  const unchanged = state.historyEditVersion === historyVersionAtStart;
  return {
    ...state,
    historyError: "",
    historyNewText: unchanged ? "" : state.historyNewText,
    mutating: false
  };
}

export function resolveTargetComment(
  comments: NotionCardComment[],
  targetCommentId: string | null,
  latestComment: NotionCardComment | null
): NotionCardComment | null {
  if (targetCommentId) {
    return comments.find((c) => c.id === targetCommentId) ?? null;
  }
  return latestComment;
}
