"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { NotionCardComment, NotionPageCommentsResult } from "@timesheet/db";
import type { TimesheetEntryNotionCardDraft } from "@timesheet/domain";
import { Button, Input, Textarea } from "@timesheet/ui";
import { ExternalLink, History, RefreshCw, RotateCcw, X } from "lucide-react";
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
  card: TimesheetEntryNotionCardDraft;
  cardUrl?: string;
  commentsState: SharedCardCommentsState | undefined;
  editorState: CardCommentEditorState;
  onAllocationHoursChange: (value: number) => void;
  onAutoAllocate: () => void;
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
  card,
  cardUrl,
  commentsState,
  editorState,
  onAllocationHoursChange,
  onAutoAllocate,
  onApplyCommentMutation,
  onLoadComments,
  onRemove,
  onUpdateEditorState
}: NotionCardCommentsRowProps) {
  const latestComment = commentsState?.data?.latestComment ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const dialogTitleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const backdropPointerDownRef = useRef(false);
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
  const cardTitle = card.title || card.notionPageId;
  const notionUrl = cardUrl || (card.notionPageId ? `https://www.notion.so/${card.notionPageId.replaceAll("-", "")}` : "");
  const commentStatus = commentsState?.loading
    ? "댓글 불러오는 중..."
    : commentsState?.error
      ? "댓글을 불러오지 못했습니다."
      : targetComment
        ? `${targetComment.authorName} · ${formatCommentTime(targetComment.createdTime)}`
        : "댓글 없음";
  const commentsLoaded = Boolean(commentsState?.data) && !commentsState?.error;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <div className="min-w-0 truncate text-sm font-bold text-slate-950" title={cardTitle}>
              {cardTitle}
            </div>
            {notionUrl ? (
              <a
                aria-label={`${cardTitle} Notion에서 열기`}
                className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                href={notionUrl}
                rel="noreferrer"
                target="_blank"
                title="Notion에서 열기"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500" title={metaParts}>
            {metaParts}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            aria-label={`${card.title || "카드"} 시간 자동 배분`}
            disabled={card.allocationMode !== "manual"}
            onClick={onAutoAllocate}
            size="sm"
            type="button"
            variant="ghost"
          >
            자동
          </Button>
          <div className="flex items-center gap-1">
            <Input
              aria-label="배분 시간"
              className="h-8! w-16 px-2! text-right text-xs! font-semibold"
              min={0}
              onChange={(event) => onAllocationHoursChange(Number(event.target.value) || 0)}
              step={0.25}
              type="number"
              value={card.allocatedHours}
            />
            <span className="text-xs font-semibold text-slate-400">h</span>
          </div>
          <button
            aria-label={`${card.title ?? "카드"} 연결 해제`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-950"
            onClick={onRemove}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span
            className={`min-w-0 font-medium ${commentsState?.error ? "text-red-600" : "text-slate-500"}`}
            title={commentStatus}
          >
            {commentStatus}
          </span>
          {commentsState?.error ? (
            <Button
              className="shrink-0"
              onClick={() => void onLoadComments(card.notionPageId, true)}
              size="xs"
              type="button"
              variant="ghost"
            >
              <RefreshCw className="size-3.5" />
              재시도
            </Button>
          ) : null}
        </div>

        <Textarea
          aria-label="Notion 카드 댓글"
          className="h-[76px] min-h-[76px] resize-y bg-white text-xs leading-relaxed"
          onChange={(event) =>
            onUpdateEditorState(card.notionPageId, (prev) =>
              updateCommentDraftText(prev, event.target.value)
            )
          }
          placeholder="새 댓글을 입력하세요."
          value={editorState.draftText}
        />
        {editorState.mutationError ? (
          <p className="text-xs text-red-600">{editorState.mutationError}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div>
            {commentsLoaded ? (
              <button
                aria-label={`전체 댓글 이력 (${commentsState?.data?.comments.length ?? 0})`}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-950"
                onClick={() => setHistoryOpen(true)}
                ref={historyTriggerRef}
                type="button"
              >
                <History className="size-3.5" />
                이력 ({commentsState?.data?.comments.length ?? 0})
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {editorState.isDirty ? (
              <Button
                aria-label="되돌리기"
                disabled={editorState.mutating}
                onClick={handleReset}
                size="xs"
                type="button"
                variant="ghost"
              >
                <RotateCcw className="size-3.5" />
                되돌리기
              </Button>
            ) : null}
            <Button
              disabled={editorState.mutating || !editorState.draftText.trim()}
              onClick={() => void handleCreate()}
              size="xs"
              type="button"
              variant="secondary"
            >
              댓글 추가
            </Button>
            {canUpdateTarget ? (
              <Button
                disabled={editorState.mutating || !editorState.draftText.trim()}
                onClick={() => void handleUpdate()}
                size="xs"
                title="선택한 댓글 수정"
                type="button"
                variant="primary"
              >
                업데이트
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <dialog
        aria-labelledby={dialogTitleId}
        className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/60"
        onClick={(event) => {
          if (backdropPointerDownRef.current && event.target === dialogRef.current) {
            setHistoryOpen(false);
          }
          backdropPointerDownRef.current = false;
        }}
        onClose={() => {
          backdropPointerDownRef.current = false;
          setHistoryOpen(false);
          historyTriggerRef.current?.focus();
        }}
        onPointerDown={(event) => {
          backdropPointerDownRef.current = event.target === dialogRef.current;
        }}
        ref={dialogRef}
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h3 className="truncate text-sm font-bold text-slate-950" id={dialogTitleId}>
              {cardTitle} · 전체 댓글
            </h3>
            <button
              aria-label="닫기"
              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setHistoryOpen(false)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {commentsState?.data?.comments.length ? (
              commentsState.data.comments.map((comment) => (
                <div
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs"
                  key={comment.id}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {comment.authorName} · {formatCommentTime(comment.createdTime)}
                    </span>
                    <div className="flex items-center gap-1">
                      {comment.canEdit ? (
                        <Button
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
                          size="xs"
                          type="button"
                          variant="ghost"
                        >
                          수정
                        </Button>
                      ) : null}
                      {comment.canDelete ? (
                        <Button
                          className="text-red-600 hover:text-red-700"
                          disabled={editorState.mutating}
                          onClick={() => void handleHistoryDelete(comment.id)}
                          size="xs"
                          type="button"
                          variant="ghost"
                        >
                          삭제
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
                    {comment.plainText}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">
                아직 등록된 댓글이 없습니다.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-200 px-5 py-4">
            <Textarea
              className="h-[72px] min-h-[72px] bg-white text-xs"
              onChange={(event) =>
                onUpdateEditorState(card.notionPageId, (prev) =>
                  updateHistoryDraftText(prev, event.target.value)
                )
              }
              placeholder="새 댓글을 입력하세요."
              value={editorState.historyNewText}
            />
            {editorState.historyError ? (
              <p className="text-xs text-red-600">{editorState.historyError}</p>
            ) : null}
            <div className="flex justify-end">
              <Button
                disabled={editorState.mutating || !editorState.historyNewText.trim()}
                onClick={() => void handleHistoryCreate()}
                size="sm"
                type="button"
              >
                Notion에 게시
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
