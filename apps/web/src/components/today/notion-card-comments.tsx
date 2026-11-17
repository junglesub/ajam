"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { NotionCardComment, NotionPageCommentsResult } from "@timesheet/db";
import type { TimesheetEntryNotionCardDraft } from "@timesheet/domain";
import { Button, Input, Textarea } from "@timesheet/ui";
import { History, RefreshCw, RotateCcw, X } from "lucide-react";
import {
  createTodayCardCommentAction,
  deleteTodayCardCommentAction,
  updateTodayCardCommentAction
} from "@/app/(app)/today/actions";
import {
  finishCommentMutationSuccess,
  finishHistoryCreateSuccess,
  resolveTargetComment,
  updateCommentDraftText,
  updateHistoryDraftText,
  type CardCommentEditorState
} from "./today-comment-store";

export type SharedCardCommentsState = {
  data: NotionPageCommentsResult | null;
  error: string;
  loading: boolean;
  version: number;
};

type NotionCardCommentsRowProps = {
  allocationStatusText: string;
  card: TimesheetEntryNotionCardDraft;
  commentsState: SharedCardCommentsState | undefined;
  editorState: CardCommentEditorState;
  onAllocationHoursChange: (value: number) => void;
  onApplyCommentMutation: (
    pageId: string,
    kind: "delete" | "upsert",
    payload: NotionCardComment | string
  ) => void;
  onLoadComments: (pageId: string, force?: boolean) => Promise<void>;
  onRemove: () => void;
  onUpdateEditorState: (
    pageId: string,
    updater: (prev: CardCommentEditorState) => CardCommentEditorState
  ) => void;
};

function formatCommentTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  });
}

function sourceLabel(source: TimesheetEntryNotionCardDraft["source"]): string {
  if (source === "weekday_default") return "요일 기본";
  if (source === "previous_business_day_default") return "이전 업무";
  return "직접 추가";
}

export function NotionCardCommentsRow({
  allocationStatusText,
  card,
  commentsState,
  editorState,
  onAllocationHoursChange,
  onApplyCommentMutation,
  onLoadComments,
  onRemove,
  onUpdateEditorState
}: NotionCardCommentsRowProps) {
  const latestComment = commentsState?.data?.latestComment ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const dialogTitleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void onLoadComments(card.notionPageId);
  }, [card.notionPageId, onLoadComments]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (historyOpen && !dialog.open) {
      dialog.showModal();
    } else if (!historyOpen && dialog.open) {
      dialog.close();
    }
  }, [historyOpen]);

  const targetComment = resolveTargetComment(
    commentsState?.data?.comments ?? [],
    editorState.targetCommentId,
    latestComment
  );
  const canUpdateTarget = Boolean(targetComment?.canEdit);

  async function handleCreate() {
    const trimmed = editorState.draftText.trim();
    if (!trimmed || editorState.mutating) return;
    const versionAtStart = editorState.editVersion;
    onUpdateEditorState(card.notionPageId, (prev) => ({
      ...prev,
      mutating: true,
      mutationError: ""
    }));
    try {
      const created = await createTodayCardCommentAction({
        pageId: card.notionPageId,
        text: trimmed
      });
      onApplyCommentMutation(card.notionPageId, "upsert", created);
      onUpdateEditorState(card.notionPageId, (prev) =>
        finishCommentMutationSuccess(prev, versionAtStart, created)
      );
      try {
        await onLoadComments(card.notionPageId, true);
      } catch {
        // Publish succeeded; keep success state even if refresh fails
      }
    } catch (error) {
      onUpdateEditorState(card.notionPageId, (prev) => ({
        ...prev,
        mutating: false,
        mutationError: error instanceof Error ? error.message : "댓글을 등록하지 못했습니다."
      }));
    }
  }

  async function handleUpdate() {
    const trimmed = editorState.draftText.trim();
    if (!trimmed || !targetComment || !canUpdateTarget || editorState.mutating) return;
    const versionAtStart = editorState.editVersion;
    onUpdateEditorState(card.notionPageId, (prev) => ({
      ...prev,
      mutating: true,
      mutationError: ""
    }));
    try {
      const updated = await updateTodayCardCommentAction({
        commentId: targetComment.id,
        pageId: card.notionPageId,
        text: trimmed
      });
      onApplyCommentMutation(card.notionPageId, "upsert", updated);
      onUpdateEditorState(card.notionPageId, (prev) =>
        finishCommentMutationSuccess(prev, versionAtStart, updated)
      );
      try {
        await onLoadComments(card.notionPageId, true);
      } catch {
        // Publish succeeded; keep success state even if refresh fails
      }
    } catch (error) {
      onUpdateEditorState(card.notionPageId, (prev) => ({
        ...prev,
        mutating: false,
        mutationError: error instanceof Error ? error.message : "댓글을 수정하지 못했습니다."
      }));
    }
  }

  function handleReset() {
    onUpdateEditorState(card.notionPageId, (prev) => ({
      ...prev,
      draftText: latestComment?.plainText ?? "",
      isDirty: false,
      mutationError: "",
      targetCommentId: latestComment?.id ?? null
    }));
  }

  async function handleHistoryCreate() {
    const trimmed = editorState.historyNewText.trim();
    if (!trimmed || editorState.mutating) return;
    const historyVersionAtStart = editorState.historyEditVersion;
    onUpdateEditorState(card.notionPageId, (prev) => ({
      ...prev,
      historyError: "",
      mutating: true
    }));
    try {
      const created = await createTodayCardCommentAction({
        pageId: card.notionPageId,
        text: trimmed
      });
      onApplyCommentMutation(card.notionPageId, "upsert", created);
      onUpdateEditorState(card.notionPageId, (prev) =>
        finishHistoryCreateSuccess(prev, historyVersionAtStart)
      );
      try {
        await onLoadComments(card.notionPageId, true);
      } catch {
        // Publish succeeded
      }
    } catch (error) {
      onUpdateEditorState(card.notionPageId, (prev) => ({
        ...prev,
        historyError: error instanceof Error ? error.message : "댓글을 게시하지 못했습니다.",
        mutating: false
      }));
    }
  }

  async function handleHistoryDelete(commentId: string) {
    if (editorState.mutating) return;
    onUpdateEditorState(card.notionPageId, (prev) => ({
      ...prev,
      historyError: "",
      mutating: true
    }));
    try {
      await deleteTodayCardCommentAction({
        commentId,
        pageId: card.notionPageId
      });
      onApplyCommentMutation(card.notionPageId, "delete", commentId);
      onUpdateEditorState(card.notionPageId, (prev) => ({
        ...prev,
        mutating: false
      }));
      try {
        await onLoadComments(card.notionPageId, true);
      } catch {
        // Delete succeeded
      }
    } catch (error) {
      onUpdateEditorState(card.notionPageId, (prev) => ({
        ...prev,
        historyError: error instanceof Error ? error.message : "댓글을 삭제하지 못했습니다.",
        mutating: false
      }));
    }
  }

  const metaParts = [card.status, card.category, sourceLabel(card.source)].filter(Boolean).join(" · ");

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white p-3">
      <button
        aria-label={`${card.title ?? "카드"} 연결 해제`}
        className="absolute left-2 top-2 inline-flex size-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
      </button>

      <div className="grid grid-cols-1 gap-3 pl-5 md:grid-cols-[230px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="truncate text-sm font-semibold text-slate-900" title={card.title || card.notionPageId}>
            {card.title || card.notionPageId}
          </div>
          <div className="truncate text-xs text-slate-500" title={metaParts}>
            {metaParts}
          </div>
          <div className="flex items-center gap-2">
            <Input
              aria-label="배분 시간"
              className="h-8 w-20 text-right text-xs"
              min={0}
              onChange={(event) => onAllocationHoursChange(Number(event.target.value) || 0)}
              placeholder={String(card.allocatedHours)}
              step={0.25}
              type="number"
              value={card.allocationMode === "manual" ? card.allocatedHours : ""}
            />
            <span className="truncate text-xs text-slate-500" title={allocationStatusText}>
              {allocationStatusText}
            </span>
          </div>
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 whitespace-nowrap text-xs">
            <span
              className="min-w-0 truncate text-slate-500"
              title={
                targetComment
                  ? `${targetComment.authorName} · ${formatCommentTime(targetComment.createdTime)}`
                  : "댓글 없음"
              }
            >
              {commentsState?.loading
                ? "댓글 불러오는 중..."
                : commentsState?.error
                  ? "댓글 조회 실패"
                  : targetComment
                    ? `${targetComment.authorName} · ${formatCommentTime(targetComment.createdTime)}`
                    : "댓글 없음"}
            </span>
            <div className="flex items-center gap-1">
              {commentsState?.error ? (
                <Button
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => void onLoadComments(card.notionPageId, true)}
                  type="button"
                  variant="ghost"
                >
                  <RefreshCw className="mr-1 size-3" />
                  재시도
                </Button>
              ) : null}
              <button
                aria-label={`전체 댓글 이력 (${commentsState?.data?.comments.length ?? 0})`}
                className="inline-flex h-6 items-center rounded px-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setHistoryOpen(true)}
                ref={historyTriggerRef}
                type="button"
              >
                <History className="mr-1 size-3" />
                이력 ({commentsState?.data?.comments.length ?? 0})
              </button>
              <Button
                aria-label="되돌리기"
                className="h-6 px-1.5 text-[11px]"
                disabled={!editorState.isDirty || editorState.mutating}
                onClick={handleReset}
                type="button"
                variant="ghost"
              >
                <RotateCcw className="size-3" />
              </Button>
              <Button
                className="h-6 px-2 text-[11px]"
                disabled={editorState.mutating || !editorState.draftText.trim()}
                onClick={() => void handleCreate()}
                type="button"
                variant="secondary"
              >
                새로 추가
              </Button>
              <Button
                className="h-6 px-2 text-[11px]"
                disabled={editorState.mutating || !canUpdateTarget || !editorState.draftText.trim()}
                onClick={() => void handleUpdate()}
                title={canUpdateTarget ? "선택한 댓글 수정" : "aJam 연결이 작성한 댓글만 수정할 수 있습니다."}
                type="button"
                variant="primary"
              >
                업데이트
              </Button>
            </div>
          </div>

          <Textarea
            aria-label="Notion 카드 댓글"
            className="h-[72px] min-h-[72px] resize-y text-xs"
            onChange={(event) =>
              onUpdateEditorState(card.notionPageId, (prev) =>
                updateCommentDraftText(prev, event.target.value)
              )
            }
            placeholder={
              commentsState?.error
                ? "댓글 조회에 실패했지만 새 댓글을 작성할 수 있습니다."
                : "Notion 카드에 남길 댓글을 입력하세요."
            }
            value={editorState.draftText}
          />
          {editorState.mutationError ? (
            <p className="text-xs text-rose-600">{editorState.mutationError}</p>
          ) : null}
        </div>
      </div>

      <dialog
        aria-labelledby={dialogTitleId}
        className="m-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl backdrop:bg-slate-950/50"
        onClose={() => {
          setHistoryOpen(false);
          historyTriggerRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
          <h3 className="truncate text-sm font-bold text-slate-900" id={dialogTitleId}>
            {card.title || card.notionPageId} · 전체 댓글
          </h3>
          <button
            aria-label="닫기"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setHistoryOpen(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {commentsState?.data?.comments.length ? (
            commentsState.data.comments.map((comment) => (
              <div className="rounded-md border border-slate-200 p-2.5 text-xs" key={comment.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-slate-500">
                  <span className="font-medium text-slate-700">
                    {comment.authorName} · {formatCommentTime(comment.createdTime)}
                  </span>
                  <div className="flex items-center gap-1">
                    {comment.canEdit ? (
                      <Button
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          onUpdateEditorState(card.notionPageId, (prev) => ({
                            ...prev,
                            draftText: comment.plainText,
                            editVersion: prev.editVersion + 1,
                            isDirty: true,
                            targetCommentId: comment.id
                          }));
                          setHistoryOpen(false);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        수정
                      </Button>
                    ) : null}
                    {comment.canDelete ? (
                      <Button
                        className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                        disabled={editorState.mutating}
                        onClick={() => void handleHistoryDelete(comment.id)}
                        type="button"
                        variant="ghost"
                      >
                        삭제
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{comment.plainText}</p>
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-xs text-slate-500">아직 등록된 댓글이 없습니다.</p>
          )}
        </div>

        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          <Textarea
            className="h-[72px] min-h-[72px] text-xs"
            onChange={(event) =>
              onUpdateEditorState(card.notionPageId, (prev) =>
                updateHistoryDraftText(prev, event.target.value)
              )
            }
            placeholder="새 댓글을 입력하세요."
            value={editorState.historyNewText}
          />
          {editorState.historyError ? (
            <p className="text-xs text-rose-600">{editorState.historyError}</p>
          ) : null}
          <div className="flex justify-end">
            <Button
              disabled={editorState.mutating || !editorState.historyNewText.trim()}
              onClick={() => void handleHistoryCreate()}
              type="button"
            >
              Notion에 게시
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
