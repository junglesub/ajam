"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allocateNotionCardHours,
  createEmptyEntryDraft,
  toBrowserDateKey,
  type TimesheetEntryDraft,
  type TimesheetEntryNotionCardDraft
} from "@timesheet/domain";
import { Button, Input, Textarea } from "@timesheet/ui";
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  confirmTodayDraftAction,
  discardTodayDraftAction,
  listTodayCardCommentsAction,
  loadTodayWorkspaceAction,
  saveTodayDraftAction
} from "@/app/(app)/today/actions";
import {
  findPreviousOpenNotionCardsAction,
  findPreviousProjectAction,
  loadNotionCardCandidatesAction,
  refreshNotionCardCandidatesAction
} from "@/app/(app)/timesheet/actions";
import type { NotionCardCandidate } from "@/components/timesheet/use-notion-card-candidates";
import { NotionCardPickerModal } from "@/components/timesheet/notion-card-picker-modal";
import {
  TodayDraftLifecycle,
  type TodayLifecycleSnapshot
} from "./today-draft-lifecycle";
import type { NotionCardComment } from "@timesheet/db";
import {
  createInitialCommentEditorState,
  removeCommentFromResult,
  syncEditorWithLatestComment,
  upsertCommentInResult,
  type CardCommentEditorState
} from "./today-comment-store";
import {
  NotionCardCommentsRow,
  type SharedCardCommentsState
} from "./notion-card-comments";

type TodayWorkspaceProps = {
  initialDateKey: string;
  projects: string[];
};

function makeClientId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rebalanceEntryCards(entry: TimesheetEntryDraft): TimesheetEntryDraft {
  if (entry.notionCards.length === 0) return entry;
  return {
    ...entry,
    notionCards: allocateNotionCardHours({
      entryHours: Math.max(0, Number(entry.hours) || 0),
      links: entry.notionCards
    })
  };
}

export function TodayWorkspace({ initialDateKey, projects }: TodayWorkspaceProps) {
  const lifecycleRef = useRef<TodayDraftLifecycle | null>(null);
  const [state, setState] = useState<TodayLifecycleSnapshot>(() => ({
    confirmError: "",
    confirmSuccess: "",
    confirmedBaselineUpdatedAt: "",
    confirming: false,
    dateKey: initialDateKey,
    entries: [{ ...createEmptyEntryDraft(0), clientId: makeClientId() }],
    hasUnsavedChanges: false,
    loaded: false,
    loading: true,
    notionSyncWarning: "",
    revision: 0,
    saveMessage: "",
    saveStatus: "idle"
  }));

  if (!lifecycleRef.current) {
    lifecycleRef.current = new TodayDraftLifecycle(
      initialDateKey,
      state.entries,
      {
        confirm: confirmTodayDraftAction,
        load: loadTodayWorkspaceAction,
        save: saveTodayDraftAction
      },
      setState
    );
  }

  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<NotionCardCandidate[]>([]);
  const [candidatesError, setCandidatesError] = useState("");
  const [includeDone, setIncludeDone] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [commentsByPageId, setCommentsByPageId] = useState<Record<string, SharedCardCommentsState>>({});
  const commentsCacheRef = useRef<Record<string, SharedCardCommentsState>>({});
  commentsCacheRef.current = commentsByPageId;
  const [commentEditorsByPageId, setCommentEditorsByPageId] = useState<
    Record<string, CardCommentEditorState>
  >({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [copyFeedback, setCopyFeedback] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentInFlightRef = useRef<Map<string, number>>(new Map());
  const commentSeqRef = useRef(0);

  const applyDefaultsForTab = useCallback(async (targetDateKey: string, targetClientId: string) => {
    const startSnap = lifecycleRef.current?.getSnapshot();
    const targetEntryAtStart = startSnap?.entries.find((e) => e.clientId === targetClientId);
    if (!startSnap || startSnap.dateKey !== targetDateKey || !targetEntryAtStart) return;
    if (targetEntryAtStart.project.trim() || targetEntryAtStart.notionCards.length > 0) return;

    try {
      const [prevProject, prevCards] = await Promise.all([
        findPreviousProjectAction(targetDateKey),
        findPreviousOpenNotionCardsAction(targetDateKey)
      ]);
      const current = lifecycleRef.current?.getSnapshot();
      if (!current || current.dateKey !== targetDateKey) return;
      lifecycleRef.current?.applyLocalEdit((prev) =>
        prev.map((entry) => {
          if (entry.clientId !== targetClientId || entry !== targetEntryAtStart) return entry;
          return rebalanceEntryCards({
            ...entry,
            notionCards: prevCards,
            project: prevProject || entry.project
          });
        })
      );
    } catch {
      // Non-fatal: user can still fill project and cards manually
    }
  }, []);

  const loadForDate = useCallback(async (targetDateKey: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setCopyFeedback("");
    const firstClientId = makeClientId();
    await lifecycleRef.current?.loadDate(
      targetDateKey,
      makeClientId,
      () => ({ ...createEmptyEntryDraft(0), clientId: firstClientId })
    );
    setActiveIndex(0);
    const snap = lifecycleRef.current?.getSnapshot();
    if (snap && snap.loaded && snap.revision === 0 && snap.entries.length === 1 && !snap.entries[0]?.project.trim()) {
      void applyDefaultsForTab(targetDateKey, snap.entries[0]!.clientId);
    }
  }, [applyDefaultsForTab]);

  useEffect(() => {
    const browserToday = toBrowserDateKey(new Date());
    void loadForDate(browserToday);
  }, [loadForDate]);

  // Midnight transition detection
  useEffect(() => {
    async function checkMidnight() {
      const browserToday = toBrowserDateKey(new Date());
      const current = lifecycleRef.current?.getSnapshot();
      if (!current || !current.loaded || current.confirming || browserToday === current.dateKey) {
        return;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (current.hasUnsavedChanges) {
        const flushed = await lifecycleRef.current?.flushSave();
        if (!flushed) {
          return;
        }
      }
      await loadForDate(browserToday);
    }

    const interval = setInterval(() => void checkMidnight(), 30_000);
    const onFocus = () => void checkMidnight();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadForDate]);

  // Navigation protection (beforeunload + in-app link clicks)
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (lifecycleRef.current?.getSnapshot().hasUnsavedChanges) {
        event.preventDefault();
      }
    }
    function handleDocumentClick(event: MouseEvent) {
      if (!lifecycleRef.current?.getSnapshot().hasUnsavedChanges) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (!window.confirm("저장되지 않은 변경사항이 있습니다. 이동하시겠습니까?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  // Debounced serialized autosave
  useEffect(() => {
    if (state.loading || !state.loaded || !state.hasUnsavedChanges || state.confirming) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void lifecycleRef.current?.flushSave();
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [state.confirming, state.entries, state.hasUnsavedChanges, state.loaded, state.loading]);

  const updateActiveEntry = useCallback(
    (updater: (entry: TimesheetEntryDraft) => TimesheetEntryDraft) => {
      lifecycleRef.current?.applyLocalEdit((prev) =>
        prev.map((entry, idx) => (idx === activeIndex ? rebalanceEntryCards(updater(entry)) : entry))
      );
    },
    [activeIndex]
  );

  const dateKey = state.dateKey;
  const entries = state.entries;
  const loading = state.loading;
  const confirming = state.confirming;
  const confirmError = state.confirmError;
  const confirmSuccess = state.confirmSuccess;
  const saveState = state.saveStatus;
  const saveMessage = state.saveMessage;

  const handleApplyCommentMutation = useCallback(
    (pageId: string, kind: "delete" | "upsert", payload: NotionCardComment | string) => {
      commentSeqRef.current += 1;
      commentInFlightRef.current.delete(pageId);
      const existing = commentsCacheRef.current[pageId];
      const nextData =
        kind === "upsert"
          ? upsertCommentInResult(existing?.data ?? null, payload as NotionCardComment)
          : removeCommentFromResult(existing?.data ?? null, payload as string);
      setCommentsByPageId((prev) => ({
        ...prev,
        [pageId]: {
          data: nextData,
          error: "",
          loading: false,
          version: (prev[pageId]?.version ?? 0) + 1
        }
      }));
      setCommentEditorsByPageId((prev) => ({
        ...prev,
        [pageId]: syncEditorWithLatestComment(prev[pageId], nextData.latestComment)
      }));
    },
    []
  );

  const handleUpdateCommentEditorState = useCallback(
    (pageId: string, updater: (prev: CardCommentEditorState) => CardCommentEditorState) => {
      setCommentEditorsByPageId((prev) => {
        const latest = commentsByPageId[pageId]?.data?.latestComment ?? null;
        const base = prev[pageId] ?? createInitialCommentEditorState(latest);
        return {
          ...prev,
          [pageId]: updater(base)
        };
      });
    },
    [commentsByPageId]
  );

  const handleLoadComments = useCallback(async (pageId: string, force = false) => {
    if (!force && (commentInFlightRef.current.has(pageId) || commentsCacheRef.current[pageId]?.data)) {
      return;
    }
    const seq = ++commentSeqRef.current;
    commentInFlightRef.current.set(pageId, seq);

    setCommentsByPageId((prev) => {
      const existing = prev[pageId];
      if (!force && existing && (existing.loading || existing.data)) {
        return prev;
      }
      return {
        ...prev,
        [pageId]: {
          data: existing?.data ?? null,
          error: "",
          loading: true,
          version: (existing?.version ?? 0) + 1
        }
      };
    });

    try {
      const data = await listTodayCardCommentsAction(pageId);
      if (commentInFlightRef.current.get(pageId) !== seq) {
        return;
      }
      setCommentsByPageId((prev) => ({
        ...prev,
        [pageId]: {
          data,
          error: "",
          loading: false,
          version: (prev[pageId]?.version ?? 0) + 1
        }
      }));
      setCommentEditorsByPageId((prev) => ({
        ...prev,
        [pageId]: syncEditorWithLatestComment(prev[pageId], data.latestComment)
      }));
    } catch (error) {
      if (commentInFlightRef.current.get(pageId) !== seq) {
        return;
      }
      setCommentsByPageId((prev) => ({
        ...prev,
        [pageId]: {
          data: prev[pageId]?.data ?? null,
          error: error instanceof Error ? error.message : "댓글 조회 실패",
          loading: false,
          version: (prev[pageId]?.version ?? 0) + 1
        }
      }));
    } finally {
      if (commentInFlightRef.current.get(pageId) === seq) {
        commentInFlightRef.current.delete(pageId);
      }
    }
  }, []);

  async function handleOpenPicker() {
    setPickerOpen(true);
    if (candidates.length > 0) return;
    setCandidatesLoading(true);
    setCandidatesError("");
    try {
      const list = await loadNotionCardCandidatesAction(dateKey);
      setCandidates(list.candidates);
    } catch (error) {
      setCandidatesError(error instanceof Error ? error.message : "카드를 불러오지 못했습니다.");
    } finally {
      setCandidatesLoading(false);
    }
  }

  async function handleRefreshCandidates() {
    setCandidatesLoading(true);
    setCandidatesError("");
    try {
      const list = await refreshNotionCardCandidatesAction(dateKey);
      setCandidates(list.candidates);
    } catch (error) {
      setCandidatesError(error instanceof Error ? error.message : "카드를 새로고침하지 못했습니다.");
    } finally {
      setCandidatesLoading(false);
    }
  }

  function handleToggleCard(notionPageId: string) {
    const card = candidates.find((c) => c.notionPageId === notionPageId);
    updateActiveEntry((entry) => {
      const exists = entry.notionCards.some((c) => c.notionPageId === notionPageId);
      if (exists) {
        return {
          ...entry,
          notionCards: entry.notionCards.filter((c) => c.notionPageId !== notionPageId)
        };
      }
      if (!card) return entry;
      const nextCard: TimesheetEntryNotionCardDraft = {
        allocatedHours: 0,
        allocationMode: "auto",
        category: card.category,
        endDate: card.endDate ?? undefined,
        notionPageId: card.notionPageId,
        source: "manual",
        startDate: card.startDate ?? undefined,
        status: card.status,
        title: card.title
      };
      return {
        ...entry,
        notionCards: [...entry.notionCards, nextCard]
      };
    });
  }

  async function handleConfirmDay() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!;
      if (!entry.project.trim() && !entry.content.trim()) {
        setActiveIndex(i);
        lifecycleRef.current?.setConfirmError(`업무 ${i + 1}의 프로젝트 또는 내용을 입력하세요.`);
        return;
      }
      if (!Number.isFinite(entry.hours) || entry.hours <= 0) {
        setActiveIndex(i);
        lifecycleRef.current?.setConfirmError(`업무 ${i + 1}의 근무시간은 0보다 커야 합니다.`);
        return;
      }
      const allocatedSum = entry.notionCards.reduce((sum, c) => sum + (Number(c.allocatedHours) || 0), 0);
      if (allocatedSum > entry.hours + 0.001) {
        setActiveIndex(i);
        lifecycleRef.current?.setConfirmError(`업무 ${i + 1}의 카드 배분 시간 합계가 근무시간을 초과했습니다.`);
        return;
      }
    }

    await lifecycleRef.current?.confirmDay(makeClientId);
  }

  const activeEntry = entries[activeIndex] ?? entries[0]!;
  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0),
    [entries]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">오늘의 업무 · {dateKey}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            작성 중인 내용은 자동 임시 저장되며, 확정 시 캘린더에 반영됩니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveState === "saving" ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin" />
              {saveMessage}
            </span>
          ) : null}
          {saveState === "saved" ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {saveMessage}
            </span>
          ) : null}
          {saveState === "error" || saveState === "conflict" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-3.5" />
              {saveMessage}
              {saveState === "conflict" ? (
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={async () => {
                    const summary = entries
                      .map((e, i) => `[업무 ${i + 1}] ${e.project} (${e.hours}h)\n${e.content}`)
                      .join("\n\n");
                    try {
                      await navigator.clipboard.writeText(summary);
                      setCopyFeedback("복사됨");
                    } catch {
                      setCopyFeedback("복사 실패");
                    }
                  }}
                  type="button"
                  variant="secondary"
                >
                  {copyFeedback || "작성 내용 복사"}
                </Button>
              ) : null}
              <Button
                className="h-6 px-2 text-xs"
                onClick={async () => {
                  if (saveState === "conflict") {
                    try {
                      const res = await discardTodayDraftAction({ dateKey, expectedRevision: state.revision });
                      if (res.status === "cleared") {
                        await loadForDate(dateKey);
                      } else {
                        lifecycleRef.current?.setConfirmError(
                          "다른 탭에서 더 최신 초안이 저장되었습니다. 내용을 복사한 뒤 다시 시도해 주세요."
                        );
                      }
                    } catch (error) {
                      lifecycleRef.current?.setConfirmError(
                        error instanceof Error ? error.message : "임시본을 버리지 못했습니다."
                      );
                    }
                  } else if (!state.loaded) {
                    await loadForDate(dateKey);
                  } else {
                    await lifecycleRef.current?.flushSave();
                  }
                }}
                type="button"
                variant="secondary"
              >
                <RefreshCw className="mr-1 size-3" />
                {saveState === "conflict" ? "임시본 버리고 최신 기록 불러오기" : !state.loaded ? "최신 기록 불러오기" : "재시도"}
              </Button>
            </span>
          ) : null}

          <Button disabled={confirming || loading || !state.loaded} onClick={() => void handleConfirmDay()} type="button">
            {confirming ? "확정 중..." : "업무 기록 확정"}
          </Button>
        </div>
      </div>

      {confirmError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {confirmError}
        </div>
      ) : null}
      {confirmSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {confirmSuccess}
        </div>
      ) : null}
      {state.notionSyncWarning ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Notion 동기화 경고: {state.notionSyncWarning}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        {/* Left: Work Tabs & Editor */}
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div aria-label="업무 항목 탭" className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-800" role="tablist">
            {entries.map((entry, idx) => {
              const selected = idx === activeIndex;
              return (
                <button
                  aria-controls="today-tabpanel"
                  aria-selected={selected}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  id={`today-tab-${idx}`}
                  key={entry.clientId || idx}
                  onClick={() => setActiveIndex(idx)}
                  onKeyDown={(event) => {
                    let nextIdx: number | null = null;
                    if (event.key === "ArrowRight") {
                      nextIdx = (idx + 1) % entries.length;
                    } else if (event.key === "ArrowLeft") {
                      nextIdx = (idx - 1 + entries.length) % entries.length;
                    } else if (event.key === "Home") {
                      nextIdx = 0;
                    } else if (event.key === "End") {
                      nextIdx = entries.length - 1;
                    }
                    if (nextIdx !== null) {
                      event.preventDefault();
                      setActiveIndex(nextIdx);
                      tabRefs.current[nextIdx]?.focus();
                    }
                  }}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  {entry.project.trim() ? `${entry.project} (${entry.hours}h)` : `업무 ${idx + 1}`}
                </button>
              );
            })}
            <Button
              aria-label="업무 항목 추가"
              className="h-7 px-2 text-xs"
              disabled={loading || !state.loaded || confirming}
              onClick={() => {
                const nextId = makeClientId();
                lifecycleRef.current?.applyLocalEdit((prev) => [
                  ...prev,
                  { ...createEmptyEntryDraft(prev.length), clientId: nextId }
                ]);
                setActiveIndex(entries.length);
                void applyDefaultsForTab(dateKey, nextId);
              }}
              type="button"
              variant="secondary"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div aria-labelledby={`today-tab-${activeIndex}`} className="space-y-4" id="today-tabpanel" role="tabpanel">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="today-project">
                진행한 프로젝트
              </label>
              <Input
                disabled={loading || !state.loaded || confirming}
                id="today-project"
                list="today-project-options"
                onChange={(event) => updateActiveEntry((e) => ({ ...e, project: event.target.value }))}
                placeholder="프로젝트 선택 또는 입력"
                value={activeEntry.project}
              />
              <datalist id="today-project-options">
                {projects.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="today-hours">
                근무시간
              </label>
              <Input
                disabled={loading || !state.loaded || confirming}
                id="today-hours"
                min={0}
                onChange={(event) =>
                  updateActiveEntry((e) => ({
                    ...e,
                    hours: Math.max(0, Number(event.target.value) || 0),
                    hoursTouched: true
                  }))
                }
                step={0.5}
                type="number"
                value={activeEntry.hours}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="today-content">
              내용
            </label>
            <Textarea
              className="h-36 min-h-36 resize-y text-sm"
              disabled={loading || !state.loaded || confirming}
              id="today-content"
              onChange={(event) => updateActiveEntry((e) => ({ ...e, content: event.target.value }))}
              placeholder="오늘 진행한 업무 내용을 작성하세요."
              value={activeEntry.content}
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                연결된 Notion 카드 ({activeEntry.notionCards.length})
              </span>
              <div className="flex items-center gap-1.5">
                {activeEntry.notionCards.some((card) => card.allocationMode === "manual") ? (
                  <Button
                    disabled={loading || !state.loaded || confirming}
                    onClick={() =>
                      updateActiveEntry((e) => ({
                        ...e,
                        notionCards: e.notionCards.map((c) => ({ ...c, allocationMode: "auto" }))
                      }))
                    }
                    type="button"
                    variant="ghost"
                  >
                    모두 자동으로
                  </Button>
                ) : null}
                <Button disabled={loading || !state.loaded || confirming} onClick={() => void handleOpenPicker()} type="button" variant="secondary">
                  <Plus className="mr-1 size-3.5" />
                  카드
                </Button>
              </div>
            </div>

            {activeEntry.notionCards.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-500 dark:border-slate-800">
                연결된 Notion 카드가 없습니다.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activeEntry.notionCards.map((card) => (
                  <NotionCardCommentsRow
                    allocationStatusText={card.allocationMode === "manual" ? "수동 배분" : "자동 배분"}
                    card={card}
                    commentsState={commentsByPageId[card.notionPageId]}
                    editorState={
                      commentEditorsByPageId[card.notionPageId] ??
                      createInitialCommentEditorState(
                        commentsByPageId[card.notionPageId]?.data?.latestComment ?? null
                      )
                    }
                    key={card.notionPageId}
                    onAllocationHoursChange={(hours) =>
                      updateActiveEntry((e) => ({
                        ...e,
                        notionCards: e.notionCards.map((c) =>
                          c.notionPageId === card.notionPageId
                            ? { ...c, allocatedHours: Math.max(0, hours), allocationMode: "manual" }
                            : c
                        )
                      }))
                    }
                    onApplyCommentMutation={handleApplyCommentMutation}
                    onLoadComments={handleLoadComments}
                    onRemove={() =>
                      updateActiveEntry((e) => ({
                        ...e,
                        notionCards: e.notionCards.filter((c) => c.notionPageId !== card.notionPageId)
                      }))
                    }
                    onUpdateEditorState={handleUpdateCommentEditorState}
                  />
                ))}
              </div>
            )}
          </div>
          </div>
        </section>

        {/* Right: Full Day Summary Preview */}
        <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">오늘 전체 요약</h2>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">총 {totalHours}h</span>
          </div>

          <div className="space-y-2.5">
            {entries.map((entry, idx) => (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  idx === activeIndex
                    ? "border-slate-900 bg-slate-50 dark:border-slate-400 dark:bg-slate-800/50"
                    : "border-slate-200 dark:border-slate-800"
                }`}
                key={entry.clientId || idx}
              >
                <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                  <span>{entry.project.trim() || `업무 ${idx + 1}`}</span>
                  <span>{entry.hours}h</span>
                </div>
                {entry.content.trim() ? (
                  <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{entry.content}</p>
                ) : (
                  <p className="mt-1 italic text-slate-400">내용 없음</p>
                )}
                {entry.notionCards.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-slate-200 pt-1.5 dark:border-slate-700">
                    {entry.notionCards.map((c) => (
                      <li className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400" key={c.notionPageId}>
                        <span className="truncate pr-2">{c.title || c.notionPageId}</span>
                        <span>{c.allocatedHours}h</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <NotionCardPickerModal
        candidates={candidates}
        error={candidatesError}
        includeDone={includeDone}
        isLoading={candidatesLoading}
        linkedPageIds={activeEntry.notionCards.map((c) => c.notionPageId)}
        onClose={() => setPickerOpen(false)}
        onIncludeDoneChange={setIncludeDone}
        onRefresh={() => void handleRefreshCandidates()}
        onToggleCard={handleToggleCard}
        open={pickerOpen}
      />
    </div>
  );
}
