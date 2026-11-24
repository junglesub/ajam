"use server";

import {
  clearTodayDraft,
  confirmTodayDraft,
  createNotionPageComment,
  deleteNotionPageComment,
  getManagedUser,
  getTodayDraft,
  listNotionPageComments,
  listTimesheetEntries,
  notionErrorMessage,
  saveTodayDraft,
  syncNotionWorkHoursForPages,
  updateNotionPageComment,
  type NotionCardComment,
  type NotionPageCommentsResult,
  type TodayDraftClearResult,
  type TodayDraftConfirmResult,
  type TodayDraftLoadResult,
  type TodayDraftSaveResult
} from "@timesheet/db";
import type { TimesheetDayDraft, TimesheetEntryDraft } from "@timesheet/domain";
import { revalidatePath } from "next/cache";
import { getSession } from "@/server/session";

async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  return { id: session.userId };
}

function assertDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
}

export async function loadTodayWorkspaceAction(dateKey: string): Promise<TodayDraftLoadResult> {
  const user = await requireSession();
  assertDateKey(dateKey);
  return getTodayDraft({ dateKey, userId: user.id });
}

export async function saveTodayDraftAction(params: {
  confirmedBaselineUpdatedAt: string;
  dateKey: string;
  entries: TimesheetEntryDraft[];
  expectedRevision: number;
}): Promise<TodayDraftSaveResult> {
  const user = await requireSession();
  assertDateKey(params.dateKey);
  if (!Number.isInteger(params.expectedRevision) || params.expectedRevision < 0) {
    throw new Error("초안 버전 값이 올바르지 않습니다.");
  }
  for (const entry of params.entries) {
    for (const card of entry.notionCards) {
      if (!Number.isFinite(card.allocatedHours) || card.allocatedHours < 0) {
        throw new Error("카드 배분 시간은 0 이상이어야 합니다.");
      }
    }
  }
  return saveTodayDraft({
    confirmedBaselineUpdatedAt: params.confirmedBaselineUpdatedAt,
    dateKey: params.dateKey,
    entries: params.entries,
    expectedRevision: params.expectedRevision,
    userId: user.id
  });
}

export async function discardTodayDraftAction(params: {
  dateKey: string;
  expectedRevision: number;
}): Promise<TodayDraftClearResult> {
  const user = await requireSession();
  assertDateKey(params.dateKey);
  if (!Number.isInteger(params.expectedRevision) || params.expectedRevision < 0) {
    throw new Error("초안 버전 값이 올바르지 않습니다.");
  }
  return clearTodayDraft({
    dateKey: params.dateKey,
    expectedRevision: params.expectedRevision,
    userId: user.id
  });
}

export type TodayConfirmActionResult = TodayDraftConfirmResult & {
  notionSyncError?: string;
};

export async function confirmTodayDraftAction(params: {
  confirmedBaselineUpdatedAt: string;
  dateKey: string;
  day: TimesheetDayDraft;
  expectedDraftRevision: number;
}): Promise<TodayConfirmActionResult> {
  const user = await requireSession();
  assertDateKey(params.dateKey);

  if (!Number.isInteger(params.expectedDraftRevision) || params.expectedDraftRevision < 0) {
    throw new Error("초안 버전 값이 올바르지 않습니다.");
  }
  if (params.dateKey !== params.day.dateKey) {
    throw new Error("요청 날짜와 업무 기록 날짜가 일치하지 않습니다.");
  }

  for (const entry of params.day.entries) {
    if (!["WORK", "VACATION", "HOLIDAY"].includes(entry.kind)) {
      throw new Error("업무 유형이 올바르지 않습니다.");
    }
    if (entry.kind === "WORK") {
      if (!Number.isFinite(entry.hours) || entry.hours <= 0) {
        throw new Error("근무시간은 0보다 커야 합니다.");
      }
      const allocatedSum = entry.notionCards.reduce((sum, c) => sum + (Number(c.allocatedHours) || 0), 0);
      if (allocatedSum > entry.hours + 0.001) {
        throw new Error("카드 배분 시간 합계가 근무시간을 초과했습니다.");
      }
    }
  }

  const previousDays = await listTimesheetEntries({
    endDateKey: params.dateKey,
    startDateKey: params.dateKey,
    userId: user.id
  });

  const result = await confirmTodayDraft({
    confirmedBaselineUpdatedAt: params.confirmedBaselineUpdatedAt,
    dateKey: params.dateKey,
    day: {
      ...params.day,
      aiRewriteRequested: Boolean(params.day.aiRewriteRequested)
    },
    expectedDraftRevision: params.expectedDraftRevision,
    userId: user.id
  });

  if (result.status === "confirmed") {
    const affectedNotionPageIds = [
      ...new Set(
        [...(previousDays[0]?.entries ?? []), ...result.day.entries].flatMap((entry) =>
          entry.notionCards.map((c) => c.notionPageId.trim()).filter(Boolean)
        )
      )
    ];
    let notionSyncError = "";
    if (affectedNotionPageIds.length > 0) {
      try {
        const syncResult = await syncNotionWorkHoursForPages({
          notionPageIds: affectedNotionPageIds,
          userId: user.id
        });
        if (syncResult.errors.length > 0) {
          notionSyncError = syncResult.errors.map((item) => item.message).join(" / ");
        }
      } catch (error) {
        notionSyncError = notionErrorMessage(error);
      }
    }
    revalidatePath("/today");
    revalidatePath("/timesheet");
    revalidatePath("/notion-cards");
    return { ...result, notionSyncError };
  }

  return result;
}

export async function listTodayCardCommentsAction(pageId: string): Promise<NotionPageCommentsResult> {
  const user = await requireSession();
  return listNotionPageComments({ pageId, userId: user.id });
}

export async function createTodayCardCommentAction(params: {
  pageId: string;
  text: string;
}): Promise<NotionCardComment> {
  const user = await requireSession();
  const managedUser = await getManagedUser(user.id);
  if (!managedUser?.username.trim()) {
    throw new Error("댓글 작성자 이름이 필요합니다.");
  }
  return createNotionPageComment({
    authorName: managedUser.username,
    pageId: params.pageId,
    text: params.text,
    userId: user.id
  });
}

export async function updateTodayCardCommentAction(params: {
  commentId: string;
  pageId: string;
  text: string;
}): Promise<NotionCardComment> {
  const user = await requireSession();
  return updateNotionPageComment({
    commentId: params.commentId,
    pageId: params.pageId,
    text: params.text,
    userId: user.id
  });
}

export async function deleteTodayCardCommentAction(params: {
  commentId: string;
  pageId: string;
}): Promise<void> {
  const user = await requireSession();
  await deleteNotionPageComment({
    commentId: params.commentId,
    pageId: params.pageId,
    userId: user.id
  });
}
