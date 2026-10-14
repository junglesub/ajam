"use client";

import { Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import {
  allocateNotionCardHours,
  buildYearEndReviewDaySavePayload,
  yearEndReviewLabels,
  type TimesheetDayDraft,
  type TimesheetEntryDraft,
  type TimesheetEntryNotionCardDraft
} from "@timesheet/domain";
import { Badge, Button, Input, Textarea, cn } from "@timesheet/ui";

import type {
  LoadNotionCardCandidatesInput,
  NotionCardCandidatesResult,
  TimesheetMonthData,
  TimesheetSaveResult
} from "@/app/(app)/timesheet/actions";

import { NotionCardLinkSection } from "../timesheet/notion-card-link-section";
import { NotionCardPickerModal } from "../timesheet/notion-card-picker-modal";
import { useNotionCardCandidates } from "../timesheet/use-notion-card-candidates";

type LoadStatus = "loading" | "loaded" | "error";
type SaveStatus = "idle" | "saving" | "error";

export type TimesheetDayEditModalProps = {
  dateKey: string;
  loadMonthAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  loadNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  onClose: () => void;
  onSaved: (result: TimesheetSaveResult) => void;
  refreshNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  saveEntryAction: (day: TimesheetDayDraft) => Promise<TimesheetSaveResult>;
};

/**
 * Edits one whole saved day without touching the review export snapshot.
 * The authoritative day is loaded through the existing authenticated month action,
 * so vacation/holiday records, hidden WORK entries and day flags survive the save.
 */
export function TimesheetDayEditModal({
  dateKey,
  loadMonthAction,
  loadNotionCardCandidatesAction,
  onClose,
  onSaved,
  refreshNotionCardCandidatesAction,
  saveEntryAction
}: TimesheetDayEditModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pickerScopeRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [day, setDay] = useState<TimesheetDayDraft | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [pickerEntryId, setPickerEntryId] = useState<string | null>(null);
  const [includeDone, setIncludeDone] = useState(false);
  const notionCandidates = useNotionCardCandidates({
    loadNotionCardCandidatesAction,
    refreshNotionCardCandidatesAction
  });

  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.body.style.overflow = originalOverflow;
      previousActive?.focus();
    };
  }, []);

  // The nested picker is its own focus scope: it takes focus on open and returns it to its opener on close.
  useEffect(() => {
    if (!pickerEntryId) {
      return;
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = requestAnimationFrame(() => pickerScopeRef.current?.focus());

    return () => {
      cancelAnimationFrame(frameId);
      opener?.focus();
    };
  }, [pickerEntryId]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    setStatus("loading");
    setLoadError("");
    setSaveStatus("idle");
    setSaveError("");
    setDirty(false);
    setConfirmClose(false);
    setPickerEntryId(null);

    void (async () => {
      try {
        const [yearValue, monthValue] = dateKey.split("-");
        const year = Number(yearValue);
        const monthIndex = Number(monthValue) - 1;
        const monthData = await loadMonthAction(year, monthIndex);

        if (requestId !== requestIdRef.current) {
          return;
        }

        const loadedDay = monthData.entries.find((entry) => entry.dateKey === dateKey);

        if (!loadedDay) {
          setStatus("error");
          setLoadError("해당 날짜의 저장 기록을 찾지 못했습니다. 자료를 새로고침한 뒤 다시 시도해 주세요.");
          return;
        }

        setDay(loadedDay);
        setProjects(monthData.projects);
        setStatus("loaded");
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setStatus("error");
        setLoadError(error instanceof Error ? error.message : "저장 기록을 불러오지 못했습니다.");
      }
    })();
  }, [dateKey, loadMonthAction, reloadToken]);

  const workEntries = useMemo(() => (day?.entries ?? []).filter((entry) => entry.kind === "WORK"), [day]);
  const preservedEntries = useMemo(() => (day?.entries ?? []).filter((entry) => entry.kind !== "WORK"), [day]);
  const totalHours = useMemo(
    () => (day?.entries ?? []).reduce((sum, entry) => sum + entry.hours, 0),
    [day]
  );
  const isSaving = saveStatus === "saving";
  const candidates = notionCandidates.candidatesByDate[dateKey] ?? [];

  function markDirty() {
    setDirty(true);
    setSaveStatus("idle");
    setSaveError("");
  }

  function updateEntries(updater: (entries: TimesheetEntryDraft[]) => TimesheetEntryDraft[]) {
    setDay((current) => (current ? { ...current, entries: updater(current.entries) } : current));
    markDirty();
  }

  function updateWorkEntry(entryKey: string, patch: Partial<TimesheetEntryDraft>) {
    updateEntries((entries) =>
      entries.map((entry) =>
        entry.kind === "WORK" && entryKeyFor(entry) === entryKey ? { ...entry, ...patch } : entry
      )
    );
  }

  function updateWorkEntryHours(entryKey: string, hours: number) {
    updateEntries((entries) =>
      entries.map((entry) => {
        if (entry.kind !== "WORK" || entryKeyFor(entry) !== entryKey) {
          return entry;
        }

        // Reusing the save-path rule keeps the preview in sync with what the save action stores.
        return { ...entry, hours, notionCards: applyAllocation(hours, entry.notionCards) };
      })
    );
  }

  function updateNotionCards(entryKey: string, cards: TimesheetEntryNotionCardDraft[]) {
    updateEntries((entries) =>
      entries.map((entry) => {
        if (entry.kind !== "WORK" || entryKeyFor(entry) !== entryKey) {
          return entry;
        }

        return { ...entry, notionCards: applyAllocation(entry.hours, cards) };
      })
    );
  }

  function toggleNotionCard(entryKey: string, notionPageId: string) {
    updateEntries((entries) =>
      entries.map((entry) => {
        if (entry.kind !== "WORK" || entryKeyFor(entry) !== entryKey) {
          return entry;
        }

        const exists = entry.notionCards.some((card) => card.notionPageId === notionPageId);
        const nextCards = exists
          ? entry.notionCards.filter((card) => card.notionPageId !== notionPageId)
          : [
              ...entry.notionCards,
              { allocatedHours: 0, allocationMode: "auto" as const, notionPageId, source: "manual" as const }
            ];

        return { ...entry, notionCards: applyAllocation(entry.hours, dedupeNotionCards(nextCards)) };
      })
    );
  }

  function requestClose() {
    if (isSaving) {
      return;
    }

    if (dirty) {
      setConfirmClose(true);
      return;
    }

    onClose();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (pickerEntryId) {
        setPickerEntryId(null);
        return;
      }

      if (confirmClose) {
        setConfirmClose(false);
        return;
      }

      requestClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    // Tab is trapped in the active scope only, never in the dialog underneath the picker.
    const scope = pickerEntryId ? pickerScopeRef.current : dialogRef.current;

    if (!scope) {
      return;
    }

    const focusable = getFocusableElements(scope);

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    // The scope container itself holds initial focus, so it is not in the tabbable list.
    const currentIndex = focusable.findIndex((element) => element === active);

    if (event.shiftKey) {
      if (currentIndex <= 0) {
        event.preventDefault();
        last.focus();
      }

      return;
    }

    if (currentIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (currentIndex === -1 && !scope.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSave() {
    if (!day || isSaving) {
      return;
    }

    const invalidMessage = findInvalidWorkEntry(day.entries);

    if (invalidMessage) {
      setSaveStatus("error");
      setSaveError(invalidMessage);
      return;
    }

    setSaveStatus("saving");
    setSaveError("");

    const payload = buildYearEndReviewDaySavePayload({
      day,
      edits: day.entries
        .filter((entry) => entry.kind === "WORK")
        .map((entry) => ({
          aiTranslation: entry.aiTranslation,
          content: entry.content,
          entryId: entryKeyFor(entry),
          hours: entry.hours,
          notionCards: entry.notionCards,
          project: entry.project
        })),
      shortVersion: day.shortVersion
    });

    try {
      const result = await saveEntryAction(payload);

      setDirty(false);
      setSaveStatus("idle");
      onSaved(result);
    } catch (error) {
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "업무 기록을 저장하지 못했습니다.");
    }
  }

  const pickerEntry = pickerEntryId
    ? workEntries.find((entry) => entryKeyFor(entry) === pickerEntryId)
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-6"
      onKeyDown={handleDialogKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby="year-end-review-day-title"
        aria-modal="true"
        className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-950" id="year-end-review-day-title">
              기록 수정
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              이 날짜의 저장된 전체 기록을 불러와 편집합니다. 휴가·공휴일과 숨은 기록은 그대로 보존됩니다.
            </p>
          </div>
          <button
            aria-label="닫기"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isSaving}
            onClick={requestClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {status === "error" ? (
          <div className="mt-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-3">
            <p className="text-sm font-semibold text-orange-800">{loadError}</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button onClick={requestClose} type="button" variant="secondary">
                닫기
              </Button>
              <Button onClick={() => setReloadToken((value) => value + 1)} type="button">
                <RefreshCw aria-hidden="true" className="size-4" />
                다시 불러오기
              </Button>
            </div>
          </div>
        ) : status === "loading" || !day ? (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-sm font-semibold text-slate-500">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            저장 기록을 불러오는 중입니다.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Field label="날짜 (고정)">
                <Input className="cursor-default bg-slate-50" readOnly type="date" value={dateKey} />
              </Field>
              <Field label="하루 합계">
                <span className={cn("flex h-10 items-center text-sm font-bold", totalHours > 8 ? "text-red-600" : "text-slate-950")}>
                  {formatHours(totalHours)}
                </span>
              </Field>
            </div>

            <Field label="짧은 버전 (하루 요약)">
              <Input
                disabled={isSaving}
                onChange={(event) => {
                  setDay((current) => (current ? { ...current, shortVersion: event.target.value } : current));
                  markDirty();
                }}
                placeholder="캘린더에 표시할 한 줄 요약"
                value={day.shortVersion}
              />
            </Field>

            <datalist id="year-end-review-day-projects">
              {projects.map((project) => (
                <option key={project} value={project} />
              ))}
            </datalist>

            <div className="space-y-3">
              {workEntries.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">
                  이 날짜에 저장된 업무 기록이 없습니다.
                </p>
              ) : null}
              {workEntries.map((entry) => {
                const entryKey = entryKeyFor(entry);
                const allocationError = getNotionAllocationError(entry);

                return (
                  <div className="rounded-md border border-slate-200 bg-white p-3" key={entryKey}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-950">
                        {entry.project.trim() || yearEndReviewLabels.missingProject}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {allocationError ? <Badge tone="orange">{allocationError}</Badge> : null}
                        <Badge tone="gray">기록 {formatHours(entry.hours)}</Badge>
                      </span>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                      <Field label="진행한 프로젝트">
                        <Input
                          disabled={isSaving}
                          list="year-end-review-day-projects"
                          onChange={(event) => updateWorkEntry(entryKey, { project: event.target.value })}
                          placeholder="프로젝트"
                          value={entry.project}
                        />
                      </Field>
                      <Field label="일한 시간">
                        <Input
                          disabled={isSaving}
                          max={24}
                          min={0}
                          onChange={(event) => updateWorkEntryHours(entryKey, Number(event.target.value))}
                          step={0.5}
                          type="number"
                          value={entry.hours}
                        />
                      </Field>
                    </div>

                    <div className="mt-2 space-y-2">
                      <Field label="내용">
                        <Textarea
                          disabled={isSaving}
                          onChange={(event) => updateWorkEntry(entryKey, { content: event.target.value })}
                          rows={4}
                          value={entry.content}
                        />
                      </Field>
                      <Field label="영문 번역본">
                        <Textarea
                          disabled={isSaving}
                          onChange={(event) => updateWorkEntry(entryKey, { aiTranslation: event.target.value })}
                          rows={3}
                          value={entry.aiTranslation}
                        />
                      </Field>
                    </div>

                    <div className="mt-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notion 카드 연결</span>
                      <NotionCardLinkSection
                        allocationError={allocationError}
                        candidates={candidates}
                        disabled={isSaving}
                        entry={entry}
                        missingTitleLabel={yearEndReviewLabels.missingCard}
                        onAllocatedHoursChange={(notionPageId, allocatedHours) =>
                          updateNotionCards(
                            entryKey,
                            entry.notionCards.map((card) =>
                              card.notionPageId === notionPageId
                                ? { ...card, allocatedHours: Math.max(allocatedHours, 0), allocationMode: "manual" }
                                : card
                            )
                          )
                        }
                        onOpenPicker={() => {
                          setIncludeDone(false);
                          setPickerEntryId(entryKey);
                          notionCandidates.loadCandidates({
                            dateKey,
                            includeDone: false,
                            linkedPageIds: entry.notionCards.map((card) => card.notionPageId)
                          });
                        }}
                        onRemoveCard={(notionPageId) => toggleNotionCard(entryKey, notionPageId)}
                        onResetAutoAllocation={() =>
                          updateNotionCards(
                            entryKey,
                            entry.notionCards.map((card) => ({ ...card, allocatedHours: 0, allocationMode: "auto" }))
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {preservedEntries.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  함께 보존되는 기록 (읽기 전용)
                </span>
                <ul className="mt-2 space-y-1 text-sm font-semibold text-slate-600">
                  {preservedEntries.map((entry) => (
                    <li key={entryKeyFor(entry)}>
                      {entry.kind === "VACATION"
                        ? `휴가 · ${entry.vacationName.trim() || "휴가"} · ${formatHours(entry.hours)}`
                        : `공휴일 · ${entry.holidayName.trim() || "공휴일"}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {saveStatus === "error" && saveError ? (
              <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
                {saveError}
              </p>
            ) : null}

            {confirmClose ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-3">
                <p className="text-sm font-semibold text-orange-800">
                  저장하지 않은 변경이 있습니다. 닫으면 이 편집 내용이 사라집니다.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button onClick={() => setConfirmClose(false)} type="button" variant="secondary">
                    계속 편집
                  </Button>
                  <Button
                    onClick={() => {
                      setConfirmClose(false);
                      onClose();
                    }}
                    type="button"
                    variant="danger"
                  >
                    변경 버리기
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <span className="text-sm font-semibold text-slate-500">
                {isSaving ? "저장 중" : dirty ? "저장하지 않은 변경 있음" : "변경 없음"}
              </span>
              <div className="flex items-center gap-2">
                <Button disabled={isSaving} onClick={requestClose} type="button" variant="secondary">
                  취소
                </Button>
                <Button disabled={isSaving || !dirty} onClick={() => void handleSave()} type="button">
                  {isSaving ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Check aria-hidden="true" className="size-4" />
                  )}
                  저장
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {pickerEntryId ? (
        <div className="outline-none" ref={pickerScopeRef} tabIndex={-1}>
          <NotionCardPickerModal
            candidates={candidates}
            error={notionCandidates.error}
            includeDone={includeDone}
            isLoading={notionCandidates.isPending}
            linkedPageIds={pickerEntry?.notionCards.map((card) => card.notionPageId) ?? []}
            onClose={() => setPickerEntryId(null)}
            onIncludeDoneChange={(nextIncludeDone) => {
              setIncludeDone(nextIncludeDone);
              notionCandidates.refreshCandidates({
                dateKey,
                includeDone: nextIncludeDone,
                linkedPageIds: pickerEntry?.notionCards.map((card) => card.notionPageId) ?? []
              });
            }}
            onRefresh={() =>
              notionCandidates.refreshCandidates({
                dateKey,
                includeDone,
                linkedPageIds: pickerEntry?.notionCards.map((card) => card.notionPageId) ?? []
              })
            }
            onToggleCard={(notionPageId) => {
              if (pickerEntryId) {
                toggleNotionCard(pickerEntryId, notionPageId);
              }
            }}
            open
            sync={notionCandidates.syncByDate[dateKey]}
          />
        </div>
      ) : null}
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function entryKeyFor(entry: TimesheetEntryDraft): string {
  return entry.id || entry.clientId;
}

function applyAllocation(entryHours: number, cards: TimesheetEntryNotionCardDraft[]): TimesheetEntryNotionCardDraft[] {
  try {
    return allocateNotionCardHours({ entryHours, links: cards });
  } catch {
    return cards;
  }
}

function dedupeNotionCards(cards: TimesheetEntryNotionCardDraft[]): TimesheetEntryNotionCardDraft[] {
  const cardsByPageId = new Map<string, TimesheetEntryNotionCardDraft>();

  for (const card of cards) {
    const notionPageId = card.notionPageId.trim();

    if (notionPageId && !cardsByPageId.has(notionPageId)) {
      cardsByPageId.set(notionPageId, { ...card, notionPageId });
    }
  }

  return [...cardsByPageId.values()];
}

function findInvalidWorkEntry(entries: TimesheetEntryDraft[]): string {
  for (const entry of entries) {
    if (entry.kind !== "WORK") {
      continue;
    }

    if (!Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24) {
      return "업무 시간은 0시간 이상 24시간 이하여야 합니다.";
    }

    if (entry.notionCards.some((card) => !Number.isFinite(card.allocatedHours) || card.allocatedHours < 0)) {
      return "카드 배분 시간은 0시간 이상이어야 합니다.";
    }
  }

  return "";
}

function getNotionAllocationError(entry: TimesheetEntryDraft): string {
  if (entry.notionCards.length === 0) {
    return "";
  }

  const allocatedCents = entry.notionCards.reduce((sum, card) => sum + Math.round(card.allocatedHours * 100), 0);

  if (allocatedCents === Math.round(entry.hours * 100)) {
    return "";
  }

  return `배분 합계 ${formatHours(allocatedCents / 100)} / 업무 ${formatHours(entry.hours)}`;
}

function formatHours(value: number): string {
  return `${Math.round((value + Number.EPSILON) * 100) / 100}h`;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ];
}
