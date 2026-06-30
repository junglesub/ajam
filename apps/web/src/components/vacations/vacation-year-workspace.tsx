"use client";

import { useMemo, useState } from "react";

import {
  addBusinessDays,
  buildVacationYearMetricSummary,
  formatKoreanDate,
  getYearRange,
  groupVacationRecordsByName,
  normalizeVacationName,
  type VacationStatus,
  type VacationYearRecord
} from "@timesheet/domain";
import { Button } from "@timesheet/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { VacationBoundary, VacationDateInput, VacationWorkDay, VacationYearData } from "./types";
import { VacationEditModal, type VacationEditDraft, type VacationEditOption } from "./vacation-edit-modal";
import { VacationSummaryPanel } from "./vacation-summary-panel";
import { VacationWorkRecordModal } from "./vacation-work-record-modal";
import { VacationYearCalendar } from "./vacation-year-calendar";

type SaveState = "error" | "idle" | "saved" | "saving";
type ConnectedVacationPrompt =
  | { action: "delete"; dateKeys: string[] }
  | { action: "save"; dateKeys: string[]; label: string; matchStatus: VacationStatus; status: VacationStatus };

type VacationYearWorkspaceProps = {
  deleteVacationDateAction: (dateKey: string, status: VacationStatus, name: string) => Promise<VacationYearData>;
  deleteVacationWorkDateAction: (dateKey: string) => Promise<VacationYearData>;
  initialData: VacationYearData;
  initialTodayKey: string;
  initialYear: number;
  loadVacationYearAction: (year: number) => Promise<VacationYearData>;
  saveVacationAllowanceAction: (year: number, days: number) => Promise<number>;
  saveVacationDateAction: (input: VacationDateInput) => Promise<VacationYearData>;
};

function findConnectedVacationDateKeysForTab({
  dateKey,
  getBoundary,
  getVacationStatus,
  isSavedHolidayDate,
  isVacationDate,
  vacationStatus
}: {
  dateKey: string;
  getBoundary: (dateKey: string) => VacationBoundary | undefined;
  getVacationStatus: (dateKey: string) => VacationStatus | undefined;
  isSavedHolidayDate: (dateKey: string) => boolean;
  isVacationDate: (dateKey: string) => boolean;
  vacationStatus: VacationStatus | undefined;
}): string[] {
  const originBoundary = getBoundary(dateKey);
  const targetStatus = vacationStatus ?? getVacationStatus(dateKey);

  if (!originBoundary || !targetStatus || !isVacationDate(dateKey)) {
    return [];
  }

  const connected = new Set([dateKey]);

  for (const direction of [-1, 1] as const) {
    const canLeaveOrigin = direction === -1 ? originBoundary.startsDay : originBoundary.endsDay;

    if (!canLeaveOrigin) {
      continue;
    }

    let cursor = addBusinessDays(dateKey, direction);

    while (true) {
      if (isSavedHolidayDate(cursor)) {
        cursor = addBusinessDays(cursor, direction);
        continue;
      }

      const boundary = getBoundary(cursor);
      const connectsToCursor = direction === -1 ? boundary?.endsDay : boundary?.startsDay;

      if (!boundary || !isVacationDate(cursor) || getVacationStatus(cursor) !== targetStatus || !connectsToCursor) {
        break;
      }

      connected.add(cursor);

      const canContinue = direction === -1 ? boundary.startsDay : boundary.endsDay;

      if (!canContinue) {
        break;
      }

      cursor = addBusinessDays(cursor, direction);
    }
  }

  return Array.from(connected).sort();
}

function findConnectedVacationDateKeysForNewTab({
  dateKey,
  getBoundary,
  getVacationStatus,
  isSavedHolidayDate,
  isVacationDate,
  vacationStatus
}: {
  dateKey: string;
  getBoundary: (dateKey: string) => VacationBoundary | undefined;
  getVacationStatus: (dateKey: string) => VacationStatus | undefined;
  isSavedHolidayDate: (dateKey: string) => boolean;
  isVacationDate: (dateKey: string) => boolean;
  vacationStatus: VacationStatus;
}): string[] {
  const connectedByDirection = new Map<-1 | 1, string[]>();

  for (const direction of [-1, 1] as const) {
    const dateKeys: string[] = [];
    let cursor = addBusinessDays(dateKey, direction);

    while (true) {
      if (isSavedHolidayDate(cursor)) {
        cursor = addBusinessDays(cursor, direction);
        continue;
      }

      const boundary = getBoundary(cursor);
      const connectsToCursor = direction === -1 ? boundary?.endsDay : boundary?.startsDay;

      if (!boundary || !isVacationDate(cursor) || getVacationStatus(cursor) !== vacationStatus || !connectsToCursor) {
        break;
      }

      dateKeys.push(cursor);

      const canContinue = direction === -1 ? boundary.startsDay : boundary.endsDay;

      if (!canContinue) {
        break;
      }

      cursor = addBusinessDays(cursor, direction);
    }

    connectedByDirection.set(direction, dateKeys);
  }

  const leftDateKeys = connectedByDirection.get(-1) ?? [];
  const rightDateKeys = connectedByDirection.get(1) ?? [];

  if (leftDateKeys.length > 0 && rightDateKeys.length > 0) {
    return [dateKey];
  }

  return [...leftDateKeys, dateKey, ...rightDateKeys].sort();
}

function VacationConnectedActionModal({
  dateKeys,
  disabled,
  onClose,
  onConnected,
  onSingle,
  prompt
}: {
  dateKeys: string[];
  disabled: boolean;
  onClose: () => void;
  onConnected: () => void;
  onSingle: () => void;
  prompt: ConnectedVacationPrompt;
}) {
  const firstDateKey = dateKeys[0] ?? "";
  const lastDateKey = dateKeys[dateKeys.length - 1] ?? firstDateKey;
  const rangeLabel = firstDateKey && lastDateKey ? `${formatKoreanDate(firstDateKey)} - ${formatKoreanDate(lastDateKey)}` : "";
  const isDelete = prompt.action === "delete";
  const actionLabel = isDelete ? "삭제" : prompt.label;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 px-4 py-6" role="presentation">
      <div aria-modal="true" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" role="dialog">
        <h2 className="text-lg font-bold text-slate-950">{isDelete ? "연결된 휴가 삭제" : "연결된 휴가 수정"}</h2>
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            붙어있는 휴가 {dateKeys.length}일이 있습니다. {isDelete ? "연결된 휴가를 함께 삭제할까요?" : "현재 휴가 유형과 상태를 연결된 휴가에 함께 적용할까요? 각 날짜의 휴가 시간은 유지됩니다."}
          </p>
          {rangeLabel ? <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">{rangeLabel}</div> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button disabled={disabled} onClick={onClose} type="button" variant="secondary">
              취소
            </Button>
            <Button disabled={disabled} onClick={onSingle} type="button" variant="secondary">
              현재 날짜만 {actionLabel}
            </Button>
            <Button disabled={disabled} onClick={onConnected} type="button" variant={isDelete ? "danger" : "primary"}>
              함께 {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VacationYearWorkspace({
  deleteVacationDateAction,
  deleteVacationWorkDateAction,
  initialData,
  initialTodayKey,
  initialYear,
  loadVacationYearAction,
  saveVacationAllowanceAction,
  saveVacationDateAction
}: VacationYearWorkspaceProps) {
  const [year, setYear] = useState(initialYear);
  const [allowanceDays, setAllowanceDays] = useState(initialData.allowanceDays);
  const [allowanceDraft, setAllowanceDraft] = useState(String(initialData.allowanceDays || ""));
  const [allowanceState, setAllowanceState] = useState<SaveState>("idle");
  const [allowanceError, setAllowanceError] = useState("");
  const [holidayWarning, setHolidayWarning] = useState(initialData.holidayWarning ?? "");
  const [holidays, setHolidays] = useState(initialData.holidays);
  const [savedHolidayDateKeys, setSavedHolidayDateKeys] = useState(initialData.savedHolidayDateKeys);
  const [vacationBoundaries, setVacationBoundaries] = useState(initialData.vacationBoundaries);
  const [vacations, setVacations] = useState<VacationYearRecord[]>(initialData.vacations);
  const [workDateKeys, setWorkDateKeys] = useState(initialData.workDateKeys);
  const [workRecords, setWorkRecords] = useState(initialData.workRecords);
  const [hoveredDateKey, setHoveredDateKey] = useState("");
  const [yearLoadState, setYearLoadState] = useState<"error" | "idle" | "loading">("idle");
  const [modalDraft, setModalDraft] = useState<VacationEditDraft | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalError, setModalError] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [connectedPrompt, setConnectedPrompt] = useState<ConnectedVacationPrompt | null>(null);
  const [workPreview, setWorkPreview] = useState<VacationWorkDay | null>(null);
  const [workDeleteError, setWorkDeleteError] = useState("");
  const [workDeleting, setWorkDeleting] = useState(false);

  const groups = useMemo(() => groupVacationRecordsByName(vacations), [vacations]);
  const metricSummary = useMemo(() => buildVacationYearMetricSummary({ allowanceDays, vacations }), [allowanceDays, vacations]);
  const savedHolidayDateKeySet = useMemo(() => new Set(savedHolidayDateKeys), [savedHolidayDateKeys]);
  const vacationBoundaryByDate = useMemo(() => new Map(vacationBoundaries.map((boundary) => [`${boundary.dateKey}:${boundary.status}:${boundary.name.trim()}`, boundary])), [vacationBoundaries]);
  const vacationRecordsByDate = useMemo(() => {
    const recordsByDate = new Map<string, VacationYearRecord[]>();

    for (const vacation of vacations) {
      recordsByDate.set(vacation.dateKey, [...(recordsByDate.get(vacation.dateKey) ?? []), vacation]);
    }

    return recordsByDate;
  }, [vacations]);
  const vacationDateKeySet = useMemo(() => new Set(vacationRecordsByDate.keys()), [vacationRecordsByDate]);
  const connectedDateKeys = useMemo(() => {
    if (!hoveredDateKey || !vacationDateKeySet.has(hoveredDateKey)) {
      return new Set<string>();
    }

    const hoveredVacation = vacationRecordsByDate.get(hoveredDateKey)?.[0];
    const hoveredVacationStatus = hoveredVacation?.status;
    const hoveredVacationName = hoveredVacation?.name ?? "";

    return new Set(
      findConnectedVacationDateKeysForTab({
        dateKey: hoveredDateKey,
        getBoundary: (dateKey) => vacationBoundaryByDate.get(`${dateKey}:${hoveredVacationStatus}:${hoveredVacationName.trim()}`),
        getVacationStatus: (dateKey) =>
          vacationRecordsByDate.get(dateKey)?.some((vacation) => vacation.status === hoveredVacationStatus && vacation.name.trim() === hoveredVacationName.trim())
            ? hoveredVacationStatus
            : undefined,
        isSavedHolidayDate: (dateKey) => savedHolidayDateKeySet.has(dateKey),
        isVacationDate: (dateKey) => vacationDateKeySet.has(dateKey),
        vacationStatus: hoveredVacationStatus
      })
    );
  }, [hoveredDateKey, savedHolidayDateKeySet, vacationBoundaryByDate, vacationDateKeySet, vacationRecordsByDate]);
  const workRecordByDate = useMemo(() => new Map(workRecords.map((workDay) => [workDay.dateKey, workDay])), [workRecords]);

  function applyVacationYearData(data: VacationYearData, options: { preserveAllowanceDraft?: boolean } = {}) {
    setAllowanceDays(data.allowanceDays);
    if (!options.preserveAllowanceDraft) {
      setAllowanceDraft(String(data.allowanceDays || ""));
      setAllowanceState("idle");
      setAllowanceError("");
    }
    setHolidayWarning(data.holidayWarning ?? "");
    setHolidays(data.holidays);
    setSavedHolidayDateKeys(data.savedHolidayDateKeys);
    setVacationBoundaries(data.vacationBoundaries);
    setVacations(data.vacations);
    setWorkDateKeys(data.workDateKeys);
    setWorkRecords(data.workRecords);
  }

  async function loadYear(nextYear: number) {
    setYearLoadState("loading");

    try {
      const data = await loadVacationYearAction(nextYear);
      setYear(nextYear);
      applyVacationYearData(data);
      setHoveredDateKey("");
      setYearLoadState("idle");
    } catch {
      setYearLoadState("error");
    }
  }

  async function saveAllowance() {
    const days = Number(allowanceDraft);

    if (!Number.isFinite(days) || days < 0) {
      setAllowanceState("error");
      setAllowanceError("연차 개수를 확인해 주세요.");
      return;
    }

    setAllowanceState("saving");
    setAllowanceError("");

    try {
      const saved = await saveVacationAllowanceAction(year, days);
      setAllowanceDays(saved);
      setAllowanceDraft(String(saved || ""));
      setAllowanceState("saved");
    } catch {
      setAllowanceState("error");
      setAllowanceError("연차 개수를 저장하지 못했습니다.");
    }
  }

  function openDateModal(dateKey: string) {
    const dayVacations = vacationRecordsByDate.get(dateKey) ?? [];
    const vacation = dayVacations[0];
    const workRecord = workRecordByDate.get(dateKey);

    if (!vacation && workRecord) {
      setWorkPreview(workRecord);
      setWorkDeleteError("");
      return;
    }

    setModalMode(vacation ? "edit" : "create");
    setModalDraft({
      dateKey,
      hours: vacation?.hours ?? 8,
      matchName: vacation?.name,
      matchStatus: vacation?.status,
      name: vacation?.name ?? "",
      status: vacation?.status ?? "CONFIRMED"
    });
    setModalError("");
    setConnectedPrompt(null);
  }

  function getModalConnectedDateKeys(status = modalDraft?.status ?? "CONFIRMED") {
    if (!modalDraft) {
      return [];
    }

    const matchName = modalDraft.matchName ?? modalDraft.name;

    if (!vacationDateKeySet.has(modalDraft.dateKey)) {
      if (savedHolidayDateKeySet.has(modalDraft.dateKey)) {
        return [modalDraft.dateKey];
      }

      return findConnectedVacationDateKeysForNewTab({
        dateKey: modalDraft.dateKey,
        getBoundary: (dateKey) => vacationBoundaryByDate.get(`${dateKey}:${status}:${matchName.trim()}`),
        getVacationStatus: (dateKey) =>
          vacationRecordsByDate.get(dateKey)?.some((vacation) => vacation.status === status && vacation.name.trim() === matchName.trim()) ? status : undefined,
        isSavedHolidayDate: (dateKey) => savedHolidayDateKeySet.has(dateKey),
        isVacationDate: (dateKey) => vacationDateKeySet.has(dateKey),
        vacationStatus: status
      });
    }

    return findConnectedVacationDateKeysForTab({
      dateKey: modalDraft.dateKey,
      getBoundary: (dateKey) => vacationBoundaryByDate.get(`${dateKey}:${status}:${matchName.trim()}`),
      getVacationStatus: (dateKey) =>
        vacationRecordsByDate.get(dateKey)?.some((vacation) => vacation.status === status && vacation.name.trim() === matchName.trim()) ? status : undefined,
      isSavedHolidayDate: (dateKey) => savedHolidayDateKeySet.has(dateKey),
      isVacationDate: (dateKey) => vacationDateKeySet.has(dateKey),
      vacationStatus: status
    });
  }

  async function saveModal(dateKeys: string[], status: VacationStatus, matchStatus = modalDraft?.matchStatus ?? modalDraft?.status ?? status) {
    if (!modalDraft) {
      return;
    }

    const draftYear = Number(modalDraft.dateKey.slice(0, 4));

    if (draftYear !== year || dateKeys.some((dateKey) => Number(dateKey.slice(0, 4)) !== year)) {
      setModalError("선택한 연도 안의 날짜만 저장할 수 있습니다.");
      return;
    }

    if (!Number.isFinite(modalDraft.hours) || modalDraft.hours < 0 || modalDraft.hours > 24) {
      setModalError("휴가 시간을 확인해 주세요.");
      return;
    }

    setModalSaving(true);
    setModalError("");

    try {
      let nextData: VacationYearData | null = null;
      const effectiveMatchName = modalDraft.matchName ?? modalDraft.name;
      for (const dateKey of dateKeys) {
        const existingVacation = vacationRecordsByDate
          .get(dateKey)
          ?.find((vacation) => vacation.status === matchStatus && vacation.name.trim() === effectiveMatchName.trim());
        nextData = await saveVacationDateAction({
          dateKey,
          hours: dateKey === modalDraft.dateKey ? modalDraft.hours : existingVacation?.hours ?? modalDraft.hours,
          matchName: vacationDateKeySet.has(dateKey) ? effectiveMatchName : undefined,
          matchStatus: vacationDateKeySet.has(dateKey) ? matchStatus : undefined,
          name: modalDraft.name,
          preserveHours: dateKey !== modalDraft.dateKey,
          status
        });
      }
      if (nextData) {
        applyVacationYearData(nextData, { preserveAllowanceDraft: true });
      }
      setModalDraft(null);
    } catch {
      setModalError("휴가를 저장하지 못했습니다.");
    } finally {
      setModalSaving(false);
    }
  }

  function getSaveActionLabel(status: VacationStatus) {
    if (modalMode === "create") {
      return status === "TEMPORARY" ? "임시저장" : "저장";
    }

    if (modalDraft?.status === "TEMPORARY") {
      return status === "TEMPORARY" ? "임시저장" : "등록";
    }

    return status === "TEMPORARY" ? "임시로 변경" : "저장";
  }

  function requestSaveModal(status: VacationStatus) {
    if (!modalDraft) {
      return;
    }

    if (modalMode === "create") {
      void saveModal([modalDraft.dateKey], status);
      return;
    }

    const matchStatus = modalDraft.matchStatus ?? modalDraft.status;
    const dateKeys = getModalConnectedDateKeys(matchStatus);

    if (dateKeys.length > 1) {
      setConnectedPrompt({ action: "save", dateKeys, label: getSaveActionLabel(status), matchStatus, status });
      return;
    }

    void saveModal([modalDraft.dateKey], status);
  }

  function requestDeleteModal() {
    if (!modalDraft) {
      return;
    }

    const dateKeys = getModalConnectedDateKeys();

    if (dateKeys.length > 1) {
      setConnectedPrompt({ action: "delete", dateKeys });
      return;
    }

    void deleteModal([modalDraft.dateKey]);
  }

  async function deleteModal(dateKeys: string[], status = modalDraft?.matchStatus ?? modalDraft?.status ?? "CONFIRMED", name = modalDraft?.matchName ?? modalDraft?.name ?? "") {
    setModalSaving(true);
    setModalError("");

    try {
      let nextData: VacationYearData | null = null;
      for (const dateKey of dateKeys) {
        nextData = await deleteVacationDateAction(dateKey, status, name);
      }
      if (nextData) {
        applyVacationYearData(nextData, { preserveAllowanceDraft: true });
      }
      setModalDraft(null);
    } catch {
      setModalError("휴가를 삭제하지 못했습니다.");
    } finally {
      setModalSaving(false);
    }
  }

  async function deleteWorkAndOpenVacation() {
    if (!workPreview) {
      return;
    }

    const dateKey = workPreview.dateKey;
    setWorkDeleting(true);
    setWorkDeleteError("");

    try {
      const data = await deleteVacationWorkDateAction(dateKey);
      applyVacationYearData(data);
      setWorkPreview(null);
      setModalMode("create");
      setModalDraft({
        dateKey,
        hours: 8,
        matchName: undefined,
        matchStatus: undefined,
        name: "",
        status: "CONFIRMED"
      });
    } catch {
      setWorkDeleteError("업무 기록을 삭제하지 못했습니다.");
    } finally {
      setWorkDeleting(false);
    }
  }

  const vacationEditOptions: VacationEditOption[] =
    modalDraft && modalMode === "edit"
      ? (vacationRecordsByDate.get(modalDraft.dateKey) ?? []).map((vacation) => ({
          hours: vacation.hours,
          label: `${vacation.status === "TEMPORARY" ? "임시" : "확정"} · ${normalizeVacationName(vacation.name)} · ${vacation.hours}시간`,
          name: vacation.name,
          status: vacation.status
        }))
      : [];
  const todayYear = Number(initialTodayKey.slice(0, 4));

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">휴가</h1>
          <p className="text-sm font-semibold text-slate-500">
            {getYearRange(year).startDateKey} - {getYearRange(year).endDateKey}
          </p>
          {yearLoadState === "error" ? <p className="mt-1 text-xs font-semibold text-red-600">연도 데이터를 불러오지 못했습니다.</p> : null}
          {holidayWarning ? <p className="mt-1 text-xs font-semibold text-red-600">{holidayWarning}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-9 px-3" disabled={yearLoadState === "loading"} onClick={() => void loadYear(year - 1)} type="button" variant="secondary">
            <ChevronLeft aria-hidden="true" className="size-4" />
            이전
          </Button>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-950">{year}</div>
          <Button className="h-9 px-3" disabled={yearLoadState === "loading"} onClick={() => void loadYear(year + 1)} type="button" variant="secondary">
            다음
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          {year !== todayYear ? (
            <Button className="h-9 px-3" disabled={yearLoadState === "loading"} onClick={() => void loadYear(todayYear)} type="button" variant="ghost">
              올해
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <VacationYearCalendar
          connectedDateKeys={connectedDateKeys}
          groups={groups}
          hoveredDateKey={hoveredDateKey}
          holidays={holidays}
          onDateClick={openDateModal}
          onDateHover={setHoveredDateKey}
          onDateLeave={() => setHoveredDateKey("")}
          todayKey={initialTodayKey}
          vacations={vacations}
          workDateKeys={workDateKeys}
          year={year}
        />
        <VacationSummaryPanel
          allowanceDraft={allowanceDraft}
          allowanceError={allowanceError}
          groups={groups}
          metricSummary={metricSummary}
          onAllowanceChange={(value) => {
            setAllowanceDraft(value);
            setAllowanceState("idle");
          }}
          onAllowanceSave={() => void saveAllowance()}
          saveState={allowanceState}
        />
      </div>

      {modalDraft ? (
        <VacationEditModal
          draft={modalDraft}
          error={modalError}
          mode={modalMode}
          onClose={() => {
            setConnectedPrompt(null);
            setModalDraft(null);
          }}
          onDelete={requestDeleteModal}
          onDraftChange={setModalDraft}
          onSave={requestSaveModal}
          saving={modalSaving}
          vacationOptions={vacationEditOptions}
        />
      ) : null}
      {modalDraft && connectedPrompt ? (
        <VacationConnectedActionModal
          dateKeys={connectedPrompt.dateKeys}
          disabled={modalSaving}
          prompt={connectedPrompt}
          onClose={() => setConnectedPrompt(null)}
          onConnected={() => {
            const prompt = connectedPrompt;
            setConnectedPrompt(null);

            if (prompt.action === "delete") {
              void deleteModal(prompt.dateKeys, modalDraft.matchStatus ?? modalDraft.status, modalDraft.matchName ?? modalDraft.name);
            } else {
              void saveModal(prompt.dateKeys, prompt.status, prompt.matchStatus);
            }
          }}
          onSingle={() => {
            const prompt = connectedPrompt;
            setConnectedPrompt(null);

            if (prompt.action === "delete") {
              void deleteModal([modalDraft.dateKey], modalDraft.matchStatus ?? modalDraft.status, modalDraft.matchName ?? modalDraft.name);
            } else {
              void saveModal([modalDraft.dateKey], prompt.status, prompt.matchStatus);
            }
          }}
        />
      ) : null}
      {workPreview ? (
        <VacationWorkRecordModal
          deleting={workDeleting}
          error={workDeleteError}
          onClose={() => setWorkPreview(null)}
          onDeleteWork={() => void deleteWorkAndOpenVacation()}
          workDay={workPreview}
        />
      ) : null}
    </div>
  );
}
