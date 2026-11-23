import type { TimesheetDayDraft } from "@timesheet/domain";
import { daySignature } from "./timesheet-draft-discard";
import type { TodayWorkDraftSnapshot } from "./timesheet-draft-utils";

export type GuardedSaveResultLike = {
  confirmedUpdatedAt?: string;
  day: TimesheetDayDraft;
  draftRevision?: number;
};

export function applyExternalSavedDays(params: {
  days: TimesheetDayDraft[];
  getIsDirty: () => boolean;
  getSelectedDateKey: () => string;
  getTodayDrafts: () => Record<string, TodayWorkDraftSnapshot>;
  onUpdateRecords: (updater: (current: Record<string, TimesheetDayDraft>) => Record<string, TimesheetDayDraft>) => void;
  onUpdateSavedDateKeys: (dateKeys: string[]) => void;
  onUpdateSavedRecords: (updater: (current: Record<string, TimesheetDayDraft>) => Record<string, TimesheetDayDraft>) => void;
  onClearWorkSignature: (dateKey: string) => void;
}): void {
  if (params.days.length === 0) {
    return;
  }
  const currentSelected = params.getSelectedDateKey();
  const currentDirty = params.getIsDirty();
  const currentDrafts = params.getTodayDrafts();

  const preservedDates = new Set(
    params.days
      .map((day) => day.dateKey)
      .filter((dateKey) => (dateKey === currentSelected && currentDirty) || Boolean(currentDrafts[dateKey]))
  );

  params.onUpdateSavedRecords((current) => {
    const next = { ...current };
    for (const day of params.days) {
      next[day.dateKey] = day;
    }
    return next;
  });

  params.onUpdateRecords((current) => {
    const next = { ...current };
    for (const day of params.days) {
      if (!preservedDates.has(day.dateKey)) {
        next[day.dateKey] = day;
        params.onClearWorkSignature(day.dateKey);
      }
    }
    return next;
  });

  params.onUpdateSavedDateKeys(params.days.map((day) => day.dateKey));
}

export function consumeGuardedSaveResult(params: {
  dateKey: string;
  expectedDraftRevision?: number;
  getLatestSnapshot: () => { dateKey: string; day: TimesheetDayDraft | undefined };
  onClearPendingDraft: (dateKey: string, expectedRevision?: number) => void;
  onClearWorkSignature: (dateKey: string) => void;
  onSetTombstone: (
    dateKey: string,
    tombstone: { confirmedBaselineUpdatedAt: string; revision: number }
  ) => void;
  onUpdateConfirmedDay: (dateKey: string, canonicalDay: TimesheetDayDraft, adoptIntoRecords: boolean) => void;
  prevKnown?: { confirmedBaselineUpdatedAt: string; revision: number };
  result: GuardedSaveResultLike;
  submittedDaySignature: string;
}): void {
  if (params.result.draftRevision !== undefined || params.result.confirmedUpdatedAt !== undefined) {
    params.onSetTombstone(params.dateKey, {
      confirmedBaselineUpdatedAt:
        params.result.confirmedUpdatedAt ?? params.prevKnown?.confirmedBaselineUpdatedAt ?? "",
      revision: params.result.draftRevision ?? params.prevKnown?.revision ?? 0
    });
  }

  params.onClearWorkSignature(params.dateKey);
  params.onClearPendingDraft(params.dateKey, params.expectedDraftRevision);

  const afterSnap = params.getLatestSnapshot();
  const adoptIntoRecords =
    afterSnap.dateKey !== params.dateKey || daySignature(afterSnap.day) === params.submittedDaySignature;

  params.onUpdateConfirmedDay(params.dateKey, params.result.day, adoptIntoRecords);
}

export function applyPreservedDraftVacationResult(params: {
  activeDraft: TodayWorkDraftSnapshot;
  dateKey: string;
  getIsDirty: () => boolean;
  getLatestDraft: (dateKey: string) => TodayWorkDraftSnapshot | undefined;
  getLatestSnapshot: () => { dateKey: string; day: TimesheetDayDraft | undefined };
  onUpdateDraft: (dateKey: string, draft: TodayWorkDraftSnapshot) => void;
  onUpdateRecords: (dateKey: string, day: TimesheetDayDraft, draftToOverlay: TodayWorkDraftSnapshot) => void;
  onUpdateSavedDay: (dateKey: string, canonicalDay: TimesheetDayDraft) => void;
  result: GuardedSaveResultLike;
  submittedDaySignature: string;
}): void {
  params.onUpdateSavedDay(params.dateKey, params.result.day);

  const latestDraft = params.getLatestDraft(params.dateKey);
  const draftToOverlay =
    latestDraft && latestDraft.revision === params.activeDraft.revision
      ? {
          ...latestDraft,
          confirmedBaselineUpdatedAt: params.result.confirmedUpdatedAt ?? latestDraft.confirmedBaselineUpdatedAt,
          revision: params.result.draftRevision ?? latestDraft.revision
        }
      : latestDraft;

  if (latestDraft && latestDraft.revision === params.activeDraft.revision && draftToOverlay) {
    params.onUpdateDraft(params.dateKey, draftToOverlay);
  }

  const afterSnap = params.getLatestSnapshot();
  const isSelectedAndEdited =
    afterSnap.dateKey === params.dateKey &&
    (params.getIsDirty() || daySignature(afterSnap.day) !== params.submittedDaySignature);

  if (!isSelectedAndEdited && draftToOverlay) {
    params.onUpdateRecords(params.dateKey, params.result.day, draftToOverlay);
  }
}
