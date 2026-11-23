import type { TimesheetDayDraft, TimesheetEntryDraft, WorkRecordKind } from "@timesheet/domain";
import type { TodayWorkDraftSnapshot } from "./timesheet-draft-utils";

export function workEntriesSignature(entries: TimesheetEntryDraft[]): string {
  return JSON.stringify(entries.filter((entry) => entry.kind === "WORK"));
}

export function hasUnsavedNonWorkOrSummaryChanges(
  currentDay: TimesheetDayDraft | undefined,
  savedDay: TimesheetDayDraft | undefined
): boolean {
  if (!currentDay) {
    return false;
  }
  if (currentDay.shortVersion !== (savedDay?.shortVersion ?? "")) {
    return true;
  }
  if (Boolean(currentDay.aiRewriteRequested) !== Boolean(savedDay?.aiRewriteRequested)) {
    return true;
  }
  const currentNonWork = currentDay.entries.filter((e) => e.kind !== "WORK");
  const savedNonWork = (savedDay?.entries ?? []).filter((e) => e.kind !== "WORK");
  return JSON.stringify(currentNonWork) !== JSON.stringify(savedNonWork);
}

export function shouldScheduleWorkDraftAutosave(params: {
  currentWorkSignature: string;
  draftSaveState: "error" | "idle" | "saved" | "saving";
  isDirty: boolean;
  isWeekend: boolean;
  lastSavedWorkSignature: string;
  saveState: string;
  selectedKind: WorkRecordKind | undefined;
}): boolean {
  if (
    !params.isDirty ||
    params.saveState === "saving" ||
    params.draftSaveState === "saving" ||
    params.draftSaveState === "error" ||
    params.isWeekend ||
    params.selectedKind !== "WORK"
  ) {
    return false;
  }
  return params.currentWorkSignature !== params.lastSavedWorkSignature;
}

export async function executeFlushEditorDraft(params: {
  dateKey: string;
  getEpoch: () => number;
  getKnownDraft: (
    dateKey: string
  ) => { confirmedBaselineUpdatedAt: string; revision: number } | undefined;
  getLatestSnapshot: () => { dateKey: string; day: TimesheetDayDraft | undefined };
  getSavedDay: (dateKey: string) => TimesheetDayDraft | undefined;
  onDraftSaved: (snapshot: TodayWorkDraftSnapshot, workSignature: string) => void;
  onError: (message: string) => void;
  onSettledUpToDate: (clearDirty: boolean) => void;
  onStateChange: (state: "error" | "idle" | "saved" | "saving") => void;
  saveEditorDraftAction: (input: {
    confirmedBaselineUpdatedAt?: string;
    dateKey: string;
    entries: TimesheetEntryDraft[];
    expectedRevision?: number;
  }) => Promise<
    | {
        draft: {
          confirmedBaselineUpdatedAt: string;
          entries: TimesheetEntryDraft[];
          revision: number;
          updatedAt?: string;
        };
        status: "saved";
      }
    | { status: "conflict" }
  >;
}): Promise<boolean> {
  const latest = params.getLatestSnapshot();
  if (latest.dateKey !== params.dateKey || !latest.day) {
    return false;
  }
  const entries = latest.day.entries.filter((e) => e.kind === "WORK");
  const submittedSignature = JSON.stringify(entries);
  params.onStateChange("saving");

  try {
    const known = params.getKnownDraft(params.dateKey);
    const epoch = params.getEpoch();
    const result = await params.saveEditorDraftAction({
      confirmedBaselineUpdatedAt: known?.confirmedBaselineUpdatedAt,
      dateKey: params.dateKey,
      entries,
      expectedRevision: known?.revision
    });
    if (epoch !== params.getEpoch()) {
      params.onStateChange("idle");
      return false;
    }
    if (result.status !== "saved") {
      params.onStateChange("error");
      params.onError("임시 저장하지 못했습니다. 다른 화면에서 이 날짜가 바뀌었습니다.");
      return false;
    }

    const snapshot: TodayWorkDraftSnapshot = {
      confirmedBaselineUpdatedAt: result.draft.confirmedBaselineUpdatedAt,
      dateKey: params.dateKey,
      entries: result.draft.entries,
      revision: result.draft.revision,
      updatedAt: result.draft.updatedAt
    };
    params.onDraftSaved(snapshot, submittedSignature);

    const after = params.getLatestSnapshot();
    if (
      after.dateKey === params.dateKey &&
      after.day &&
      workEntriesSignature(after.day.entries) === submittedSignature
    ) {
      const hasNonWork = hasUnsavedNonWorkOrSummaryChanges(
        after.day,
        params.getSavedDay(params.dateKey)
      );
      params.onSettledUpToDate(!hasNonWork);
      params.onStateChange("saved");
    } else {
      params.onStateChange("idle");
    }
    return true;
  } catch {
    params.onStateChange("error");
    params.onError("임시 저장하지 못했습니다.");
    return false;
  }
}

export async function executeSaveCurrentWorkDraft(params: {
  dateKey: string;
  flushEditorDraft: (dateKey: string) => Promise<boolean>;
  getLatestSnapshot: () => { dateKey: string; day: TimesheetDayDraft | undefined };
  getSavedDay: (dateKey: string) => TimesheetDayDraft | undefined;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = params.getLatestSnapshot();
    if (before.dateKey !== params.dateKey || !before.day) {
      return false;
    }
    const signature = workEntriesSignature(before.day.entries);
    const saved = await params.flushEditorDraft(params.dateKey);
    if (!saved) {
      return false;
    }
    const after = params.getLatestSnapshot();
    if (
      after.dateKey === params.dateKey &&
      after.day &&
      workEntriesSignature(after.day.entries) === signature
    ) {
      return !hasUnsavedNonWorkOrSummaryChanges(after.day, params.getSavedDay(params.dateKey));
    }
  }
  return false;
}
