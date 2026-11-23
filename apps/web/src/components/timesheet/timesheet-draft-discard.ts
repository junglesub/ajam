import type { TimesheetDayDraft } from "@timesheet/domain";

export function daySignature(day: TimesheetDayDraft | undefined): string {
  return JSON.stringify({
    aiRewriteRequested: Boolean(day?.aiRewriteRequested),
    entries: day?.entries ?? [],
    shortVersion: day?.shortVersion ?? ""
  });
}

export async function executeDiscardTimesheetDraft(params: {
  clearEditorDraftAction: (
    dateKey: string,
    expectedRevision?: number
  ) => Promise<{ confirmedUpdatedAt?: string; draftRevision?: number; status: "cleared" | "conflict" }>;
  dateKey: string;
  getLatestSnapshot: () => { dateKey: string; day: TimesheetDayDraft | undefined };
  known: { confirmedBaselineUpdatedAt: string; revision: number };
  onClearedLocal: (restoreConfirmed: boolean) => void;
  onError: (message: string) => void;
  onTombstone: (tombstone: { confirmedBaselineUpdatedAt: string; revision: number }) => void;
}): Promise<boolean> {
  const beforeSignature = daySignature(params.getLatestSnapshot().day);
  try {
    const result = await params.clearEditorDraftAction(params.dateKey, params.known.revision);
    if (result.status !== "cleared") {
      params.onError("임시본을 삭제하지 못했습니다. 다른 화면에서 수정된 최신 초안이 있습니다.");
      return false;
    }
    if (typeof result.draftRevision === "number") {
      params.onTombstone({
        confirmedBaselineUpdatedAt:
          typeof result.confirmedUpdatedAt === "string"
            ? result.confirmedUpdatedAt
            : params.known.confirmedBaselineUpdatedAt,
        revision: result.draftRevision
      });
    }
  } catch {
    params.onError("임시본을 삭제하지 못했습니다.");
    return false;
  }

  const afterSnap = params.getLatestSnapshot();
  const unchanged =
    afterSnap.dateKey === params.dateKey && daySignature(afterSnap.day) === beforeSignature;
  params.onClearedLocal(unchanged);
  return true;
}
