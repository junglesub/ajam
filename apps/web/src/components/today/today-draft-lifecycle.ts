import type { TodayDraftLoadResult, TodayDraftSaveResult } from "@timesheet/db";
import type { TimesheetDayDraft, TimesheetEntryDraft } from "@timesheet/domain";
import type { TodayConfirmActionResult } from "@/app/(app)/today/actions";

export type TodaySaveStatus = "conflict" | "error" | "idle" | "saved" | "saving";

export type TodayLifecycleSnapshot = {
  confirmError: string;
  confirmSuccess: string;
  confirmedBaselineUpdatedAt: string;
  confirming: boolean;
  dateKey: string;
  entries: TimesheetEntryDraft[];
  hasUnsavedChanges: boolean;
  loaded: boolean;
  loading: boolean;
  notionSyncWarning: string;
  revision: number;
  saveMessage: string;
  saveStatus: TodaySaveStatus;
};

export type TodayLifecycleActions = {
  confirm: (params: {
    confirmedBaselineUpdatedAt: string;
    dateKey: string;
    day: TimesheetDayDraft;
    expectedDraftRevision: number;
  }) => Promise<TodayConfirmActionResult>;
  load: (dateKey: string) => Promise<TodayDraftLoadResult>;
  save: (params: {
    confirmedBaselineUpdatedAt: string;
    dateKey: string;
    entries: TimesheetEntryDraft[];
    expectedRevision: number;
  }) => Promise<TodayDraftSaveResult>;
};

export class TodayDraftLifecycle {
  private snapshot: TodayLifecycleSnapshot;
  private localVersion = 0;
  private savedVersion = 0;
  private inFlightSave: Promise<void> | null = null;
  private pendingResave = false;
  private loadSeq = 0;
  private onChange: (snapshot: TodayLifecycleSnapshot) => void;
  private actions: TodayLifecycleActions;

  constructor(
    initialDateKey: string,
    initialEntries: TimesheetEntryDraft[],
    actions: TodayLifecycleActions,
    onChange: (snapshot: TodayLifecycleSnapshot) => void
  ) {
    this.actions = actions;
    this.onChange = onChange;
    this.snapshot = {
      confirmError: "",
      confirmSuccess: "",
      confirmedBaselineUpdatedAt: "",
      confirming: false,
      dateKey: initialDateKey,
      entries: initialEntries,
      hasUnsavedChanges: false,
      loaded: false,
      loading: true,
      notionSyncWarning: "",
      revision: 0,
      saveMessage: "",
      saveStatus: "idle"
    };
  }

  getSnapshot(): TodayLifecycleSnapshot {
    return this.snapshot;
  }

  private emit(patch: Partial<TodayLifecycleSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      hasUnsavedChanges: this.localVersion !== this.savedVersion || this.inFlightSave !== null
    };
    this.onChange(this.snapshot);
  }

  async loadDate(targetDateKey: string, makeClientId: () => string, emptyEntry: () => TimesheetEntryDraft) {
    const seq = ++this.loadSeq;
    const versionBeforeLoad = this.localVersion;
    this.emit({
      confirmError: "",
      confirmSuccess: "",
      dateKey: targetDateKey,
      loaded: false,
      loading: true,
      notionSyncWarning: ""
    });

    try {
      const result = await this.actions.load(targetDateKey);
      if (seq !== this.loadSeq) {
        return;
      }
      // Do not overwrite input typed while load was in flight
      if (this.localVersion !== versionBeforeLoad) {
        this.emit({
          confirmedBaselineUpdatedAt: result.confirmedUpdatedAt,
          loaded: true,
          loading: false,
          revision: result.draftRevision
        });
        return;
      }

      if (result.draft && result.draft.entries.length > 0) {
        const hasConflict = result.draft.confirmedBaselineUpdatedAt !== result.confirmedUpdatedAt;
        this.localVersion = 0;
        this.savedVersion = 0;
        this.emit({
          confirmedBaselineUpdatedAt: result.draft.confirmedBaselineUpdatedAt,
          entries: result.draft.entries.map((entry, idx) => ({
            ...entry,
            clientId: entry.clientId || makeClientId(),
            sortOrder: idx
          })),
          loaded: true,
          loading: false,
          revision: result.draftRevision,
          saveMessage: hasConflict
            ? "다른 화면에서 오늘 기록이 변경되었습니다. 새로고침해 주세요."
            : "",
          saveStatus: hasConflict ? "conflict" : "idle"
        });
        return;
      }

      const workEntries = result.confirmedDay
        ? result.confirmedDay.entries.filter((e) => e.kind === "WORK")
        : [];
      this.localVersion = 0;
      this.savedVersion = 0;
      this.emit({
        confirmedBaselineUpdatedAt: result.confirmedUpdatedAt,
        entries:
          workEntries.length > 0
            ? workEntries.map((entry, idx) => ({
                ...entry,
                clientId: entry.clientId || makeClientId(),
                sortOrder: idx
              }))
            : [emptyEntry()],
        loaded: true,
        loading: false,
        revision: result.draftRevision,
        saveMessage: "",
        saveStatus: "idle"
      });
    } catch (error) {
      if (seq !== this.loadSeq) {
        return;
      }
      this.emit({
        loaded: false,
        loading: false,
        saveMessage: error instanceof Error ? error.message : "초안을 불러오지 못했습니다.",
        saveStatus: "error"
      });
    }
  }

  setConfirmError(message: string) {
    this.emit({ confirmError: message });
  }

  applyLocalEdit(updater: (entries: TimesheetEntryDraft[]) => TimesheetEntryDraft[]) {
    if (!this.snapshot.loaded || this.snapshot.loading || this.snapshot.confirming) {
      return;
    }
    this.localVersion += 1;
    this.emit({
      confirmError: "",
      confirmSuccess: "",
      entries: updater(this.snapshot.entries),
      notionSyncWarning: ""
    });
  }

  async flushSave(allowDuringConfirm = false): Promise<boolean> {
    if (!this.snapshot.loaded || (this.snapshot.confirming && !allowDuringConfirm)) {
      return false;
    }
    if (this.inFlightSave) {
      this.pendingResave = true;
      await this.inFlightSave;
      return this.localVersion === this.savedVersion;
    }
    if (this.localVersion === this.savedVersion) {
      return true;
    }

    const runSaveLoop = async () => {
      do {
        this.pendingResave = false;
        const versionAtStart = this.localVersion;
        const snapshotDate = this.snapshot.dateKey;
        const snapshotEntries = this.snapshot.entries;
        const snapshotRevision = this.snapshot.revision;
        const snapshotBaseline = this.snapshot.confirmedBaselineUpdatedAt;

        this.emit({ saveMessage: "임시 저장 중...", saveStatus: "saving" });
        try {
          const res = await this.actions.save({
            confirmedBaselineUpdatedAt: snapshotBaseline,
            dateKey: snapshotDate,
            entries: snapshotEntries,
            expectedRevision: snapshotRevision
          });

          if (res.status === "saved") {
            this.savedVersion = Math.max(this.savedVersion, versionAtStart);
            const isUpToDate = this.localVersion === this.savedVersion;
            this.emit({
              revision: res.draft.revision,
              saveMessage: isUpToDate ? "임시 저장됨" : "임시 저장 중...",
              saveStatus: isUpToDate ? "saved" : "saving"
            });
          } else {
            this.pendingResave = false;
            this.emit({
              saveMessage:
                res.reason === "confirmed_changed"
                  ? "다른 화면에서 오늘 기록이 확정되었습니다. 새로고침해 주세요."
                  : "다른 탭에서 수정된 최신 초안이 있습니다. 새로고침해 주세요.",
              saveStatus: "conflict"
            });
            return;
          }
        } catch (error) {
          this.pendingResave = false;
          this.emit({
            saveMessage: error instanceof Error ? error.message : "임시 저장 실패",
            saveStatus: "error"
          });
          return;
        }
      } while (this.localVersion > this.savedVersion || this.pendingResave);
    };

    const task = runSaveLoop().finally(() => {
      this.inFlightSave = null;
      this.emit({});
    });
    this.inFlightSave = task;
    this.emit({});
    await task;
    return this.localVersion === this.savedVersion;
  }

  async confirmDay(makeClientId: () => string): Promise<void> {
    if (!this.snapshot.loaded) {
      this.emit({ confirmError: "오늘 데이터를 먼저 불러와 주세요." });
      return;
    }
    if (this.snapshot.confirming) {
      return;
    }

    this.emit({ confirmError: "", confirmSuccess: "", confirming: true, notionSyncWarning: "" });
    try {
      if (this.inFlightSave || this.localVersion !== this.savedVersion) {
        const flushed = await this.flushSave(true);
        if (!flushed) {
          this.emit({
            confirmError: "임시 저장을 완료하지 못해 확정할 수 없습니다.",
            confirming: false
          });
          return;
        }
      }

      const day: TimesheetDayDraft = {
        aiRewriteRequested: false,
        dateKey: this.snapshot.dateKey,
        entries: this.snapshot.entries.map((e, idx) => ({ ...e, kind: "WORK", sortOrder: idx })),
        holidayName: "",
        shortVersion: ""
      };

      const res = await this.actions.confirm({
        confirmedBaselineUpdatedAt: this.snapshot.confirmedBaselineUpdatedAt,
        dateKey: this.snapshot.dateKey,
        day,
        expectedDraftRevision: this.snapshot.revision
      });

      if (res.status === "confirmed") {
        const canonicalWorkEntries = res.day.entries
          .filter((e) => e.kind === "WORK")
          .map((e, idx) => ({
            ...e,
            clientId: e.clientId || e.id || makeClientId(),
            sortOrder: idx
          }));
        this.localVersion = 0;
        this.savedVersion = 0;
        this.emit({
          confirmSuccess: "오늘 업무 기록이 확정되었습니다.",
          confirmedBaselineUpdatedAt: res.confirmedUpdatedAt,
          confirming: false,
          entries: canonicalWorkEntries.length > 0 ? canonicalWorkEntries : this.snapshot.entries,
          notionSyncWarning: res.notionSyncError ?? "",
          revision: res.draftRevision,
          saveMessage: "",
          saveStatus: "idle"
        });
      } else {
        this.emit({
          confirmError: "다른 화면에서 오늘 기록이 변경되었습니다. 새로고침 후 다시 확인하세요.",
          confirming: false
        });
      }
    } catch (error) {
      this.emit({
        confirmError: error instanceof Error ? error.message : "업무 기록 확정에 실패했습니다.",
        confirming: false
      });
    }
  }
}
