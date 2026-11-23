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
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw, Sun, X } from "lucide-react";
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
import { DeleteConfirmModal, PendingNavigationConfirmModal } from "@/components/timesheet/timesheet-simple-modals";
import { useDraftSavedTime } from "@/lib/use-draft-saved-time";

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
    lastDraftSavedAt: null,
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
  const [pendingDelete, setPendingDelete] = useState<{
    dateKey: string; clientId: string | undefined; label: string; trigger: HTMLButtonElement;
  } | null>(null);
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
  const commentEditorsRef = useRef(commentEditorsByPageId);
  commentEditorsRef.current = commentEditorsByPageId;
  const [pendingLeave, setPendingLeave] = useState<{ href: string; kind: "comment" | "navigate" } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const editorSectionRef = useRef<HTMLElement | null>(null);

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
    function hasUnsavedCommentEdits() {
      return Object.values(commentEditorsRef.current).some(
        (editor) => editor.isDirty || editor.historyNewText.trim().length > 0
      );
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (lifecycleRef.current?.getSnapshot().hasUnsavedChanges || hasUnsavedCommentEdits()) {
        event.preventDefault();
      }
    }
    function handleDocumentClick(event: MouseEvent) {
      const unsavedWork = lifecycleRef.current?.getSnapshot().hasUnsavedChanges ?? false;
      const unsavedComment = hasUnsavedCommentEdits();
      if (!unsavedWork && !unsavedComment) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingLeave({ href: anchor.href, kind: unsavedComment ? "comment" : "navigate" });
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
  const exceedsDailyHours = totalHours > 8;
  const draftSavedAt = useDraftSavedTime(state.lastDraftSavedAt);

  function confirmDeleteEntry() {
    setPendingDelete(null);
    const current = lifecycleRef.current?.getSnapshot();
    if (!pendingDelete || !current?.loaded || current.loading || current.confirming || current.dateKey !== pendingDelete.dateKey) return;
    const index = current.entries.findIndex((entry) => entry.clientId === pendingDelete.clientId);
    if (index < 0) return;

    const remainingActiveIndex = activeIndex - Number(index < activeIndex);
    const nextIndex = Math.max(0, Math.min(remainingActiveIndex, current.entries.length - 2));
    lifecycleRef.current?.applyLocalEdit((current) =>
      current.length === 1
        ? [{ ...createEmptyEntryDraft(), clientId: makeClientId() }]
        : current.filter((_, entryIndex) => entryIndex !== index).map((entry, sortOrder) => ({ ...entry, sortOrder }))
    );
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  }

  function renderDeleteButton(index: number, label: string, position: string) {
    return (
      <button
        aria-label={`${label} 삭제`}
        className={`absolute flex size-6 items-center justify-center rounded hover:bg-current/10 focus-visible:outline focus-visible:outline-2 disabled:opacity-40 ${position}`}
        disabled={loading || !state.loaded || confirming}
        onClick={(event) => setPendingDelete({ dateKey, clientId: entries[index]!.clientId, label, trigger: event.currentTarget })}
        title={`${label} 삭제`}
        type="button"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-8 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
            <Sun aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-bold text-slate-950">오늘의 업무</h2>
              <p className="text-sm font-medium text-slate-500">{dateKey}</p>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              작성 중은 자동으로 임시 저장되고, 확정하면 캘린더에 반영됩니다.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saveState === "saving" ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin" />
              {saveMessage || "임시 저장 중..."}
            </span>
          ) : null}
          {draftSavedAt && (saveState === "idle" || saveState === "saved") ? (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                saveState === "saved" && !state.hasUnsavedChanges
                  ? "text-emerald-700"
                  : "text-slate-500"
              }`}
              title={draftSavedAt.timestamp}
            >
              {saveState === "saved" && !state.hasUnsavedChanges ? <CheckCircle2 className="size-3.5" /> : null}
              마지막 임시 저장 {draftSavedAt.label}
            </span>
          ) : null}
          {saveState === "error" || saveState === "conflict" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="size-3.5" />
              {saveMessage}
              {saveState === "conflict" ? (
                <Button
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
                  size="xs"
                  type="button"
                  variant="secondary"
                >
                  {copyFeedback || "작성 내용 복사"}
                </Button>
              ) : null}
              <Button
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
                size="xs"
                type="button"
                variant="secondary"
              >
                <RefreshCw className="size-3" />
                {saveState === "conflict" ? "임시본 버리고 최신 기록 불러오기" : !state.loaded ? "최신 기록 불러오기" : "재시도"}
              </Button>
            </span>
          ) : null}

          <Button disabled={confirming || loading || !state.loaded} onClick={() => void handleConfirmDay()} type="button">
            {confirming ? "확정 중..." : "업무 기록 확정"}
          </Button>
        </div>
      </header>

      {confirmError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {confirmError}
        </div>
      ) : null}
      {confirmSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {confirmSuccess}
        </div>
      ) : null}
      {state.notionSyncWarning ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Notion 동기화 경고: {state.notionSyncWarning}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        {/* Left: Work Tabs & Editor */}
        <section
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          ref={editorSectionRef}
        >
          <div aria-label="업무 항목 탭" className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2.5" role="tablist">
            {entries.map((entry, idx) => {
              const selected = idx === activeIndex;
              const label = entry.project.trim() || `업무 ${idx + 1}`;
              return (
                <div className={`relative rounded-md ${selected ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} key={entry.clientId || idx}>
                  <button
                    aria-controls="today-tabpanel"
                    aria-selected={selected}
                    className="rounded-md py-1.5 pl-3 pr-8 text-xs font-semibold"
                    id={`today-tab-${idx}`}
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
                  {renderDeleteButton(idx, label, "right-1 top-1/2 -translate-y-1/2")}
                </div>
              );
            })}
            <Button
              aria-label="업무 항목 추가"
              className="px-2.5"
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
              size="sm"
              type="button"
              variant="secondary"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          <div aria-labelledby={`today-tab-${activeIndex}`} className="space-y-4" id="today-tabpanel" role="tabpanel">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="today-project">
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
              <label className="text-xs font-semibold text-slate-700" htmlFor="today-hours">
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
            <label className="text-xs font-semibold text-slate-700" htmlFor="today-content">
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
              <span className="text-xs font-bold text-slate-700">
                연결된 Notion 카드 ({activeEntry.notionCards.length})
              </span>
              <Button disabled={loading || !state.loaded || confirming} onClick={() => void handleOpenPicker()} size="sm" type="button" variant="secondary">
                <Plus className="size-3.5" />
                카드
              </Button>
            </div>

            {activeEntry.notionCards.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-500">
                연결된 Notion 카드가 없습니다.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activeEntry.notionCards.map((card) => (
                  <NotionCardCommentsRow
                    card={card}
                    cardUrl={candidates.find((c) => c.notionPageId === card.notionPageId)?.url}
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
                    onAutoAllocate={() =>
                      updateActiveEntry((e) => ({
                        ...e,
                        notionCards: e.notionCards.map((c) =>
                          c.notionPageId === card.notionPageId ? { ...c, allocationMode: "auto" } : c
                        )
                      }))
                    }
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
        <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h2 className="text-sm font-bold text-slate-950">오늘 전체 요약</h2>
            <span className={`text-xs font-semibold ${exceedsDailyHours ? "text-red-600" : "text-slate-600"}`}>
              총 {totalHours}h
            </span>
          </div>
          {exceedsDailyHours ? (
            <p className="text-xs font-semibold text-red-600" role="status">
              하루 합계가 8시간을 초과했습니다.
            </p>
          ) : null}

          <div className="space-y-2.5">
            {entries.map((entry, idx) => {
              const isSelected = idx === activeIndex;
              const label = entry.project.trim() || `업무 ${idx + 1}`;
              return (
                <div className="relative" key={entry.clientId || idx}>
                  <button
                    aria-pressed={isSelected}
                    className={`block w-full rounded-lg border py-3 pl-10 pr-3 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/30 ${
                      isSelected
                        ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950/10"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setActiveIndex(idx);
                      editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold text-slate-950">
                      <span className="truncate">{label}</span>
                      <span className="shrink-0">{entry.hours}h</span>
                    </span>
                    {entry.content.trim() ? (
                      <span className="mt-1 block whitespace-pre-wrap text-slate-600">{entry.content}</span>
                    ) : (
                      <span className="mt-1 block italic text-slate-400">내용 없음</span>
                    )}
                    {entry.notionCards.length > 0 ? (
                      <span className="mt-2 block space-y-1 border-t border-slate-200 pt-1.5">
                        {entry.notionCards.map((c) => (
                          <span className="flex items-center justify-between text-[11px] text-slate-500" key={c.notionPageId}>
                            <span className="truncate pr-2">{c.title || c.notionPageId}</span>
                            <span>{c.allocatedHours}h</span>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                  {renderDeleteButton(idx, label, "left-2 top-2 text-slate-600")}
                </div>
              );
            })}
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
      {pendingDelete && pendingDelete.dateKey === dateKey && !loading && !pendingLeave ? (
        <DeleteConfirmModal
          entryLabel={pendingDelete.label}
          onCancel={() => {
            setPendingDelete(null);
            pendingDelete.trigger.focus();
          }}
          onConfirm={confirmDeleteEntry}
        />
      ) : null}
      {pendingLeave ? (
        <PendingNavigationConfirmModal
          kind={pendingLeave.kind}
          onCancel={() => setPendingLeave(null)}
          onConfirm={() => {
            const href = pendingLeave.href;
            setPendingLeave(null);
            window.location.assign(href);
          }}
        />
      ) : null}
    </div>
  );
}
