import assert from "node:assert/strict";
import test from "node:test";
import type { NotionCardComment } from "@timesheet/db";
import {
  createInitialCommentEditorState,
  finishCommentMutationSuccess,
  finishHistoryCreateSuccess,
  removeCommentFromResult,
  resolveTargetComment,
  syncEditorWithLatestComment,
  updateCommentDraftText,
  updateHistoryDraftText,
  upsertCommentInResult
} from "./today-comment-store.js";

const comment1: NotionCardComment = {
  authorName: "aJam",
  canDelete: true,
  canEdit: true,
  createdById: "bot-1",
  createdTime: "2026-11-17T01:00:00.000Z",
  id: "c1",
  lastEditedTime: "2026-11-17T01:00:00.000Z",
  plainText: "Initial comment"
};

const comment2: NotionCardComment = {
  authorName: "Alice",
  canDelete: false,
  canEdit: false,
  createdById: "user-2",
  createdTime: "2026-11-17T02:00:00.000Z",
  id: "c2",
  lastEditedTime: "2026-11-17T02:00:00.000Z",
  plainText: "Alice comment"
};

test("today-comment-store preserves dirty input across refresh, edits during mutation, and deleted target", () => {
  // 1. Initialize & edit
  let state = createInitialCommentEditorState(comment1);
  state = updateCommentDraftText(state, "Pending edit");
  assert.equal(state.isDirty, true);
  assert.equal(state.targetCommentId, "c1");

  // 2. Background refresh arrives while dirty -> preserves typed text and original target
  state = syncEditorWithLatestComment(state, comment2);
  assert.equal(state.draftText, "Pending edit");
  assert.equal(state.targetCommentId, "c1");

  // 3. Edit occurs while mutation is in flight -> finishCommentMutationSuccess keeps isDirty true
  const versionAtStart = state.editVersion;
  state = updateCommentDraftText(state, "Newer edit during flight");
  state = finishCommentMutationSuccess(state, versionAtStart);
  assert.equal(state.isDirty, true);
  assert.equal(state.draftText, "Newer edit during flight");

  // 4. Original target c1 deleted -> resolveTargetComment returns null (does NOT fall back to c2)
  const resolved = resolveTargetComment([comment2], state.targetCommentId, comment2);
  assert.equal(resolved, null);

  // 5. History composer edit while POST is in flight is preserved
  state = updateHistoryDraftText(state, "History 1");
  const historyVerAtStart = state.historyEditVersion;
  state = updateHistoryDraftText(state, "History 1 + extra");
  state = finishHistoryCreateSuccess(state, historyVerAtStart);
  assert.equal(state.historyNewText, "History 1 + extra");

  // 6. Canonical upsertCommentInResult & removeCommentFromResult + clean editor sync
  const upserted = upsertCommentInResult({ comments: [comment1], latestComment: comment1 }, comment2);
  assert.equal(upserted.comments.length, 2);
  assert.equal(upserted.latestComment?.id, "c2");
  const cleanAfterCreate = syncEditorWithLatestComment(createInitialCommentEditorState(comment1), upserted.latestComment);
  assert.equal(cleanAfterCreate.targetCommentId, "c2");
  assert.equal(cleanAfterCreate.draftText, "Alice comment");

  const removed = removeCommentFromResult(upserted, "c2");
  assert.equal(removed.comments.length, 1);
  assert.equal(removed.latestComment?.id, "c1");
  const cleanAfterDelete = syncEditorWithLatestComment(cleanAfterCreate, removed.latestComment);
  assert.equal(cleanAfterDelete.targetCommentId, "c1");
  assert.equal(cleanAfterDelete.draftText, "Initial comment");
});
