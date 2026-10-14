"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileJson,
  FileText,
  RefreshCw,
  RotateCcw,
  Sparkles
} from "lucide-react";

import type {
  LoadNotionCardCandidatesInput,
  NotionCardCandidatesResult,
  TimesheetMonthData,
  TimesheetSaveResult
} from "@/app/(app)/timesheet/actions";
import { broadcastViewRefresh } from "@/lib/view-refresh";
import {
  buildYearEndReviewArtifacts,
  buildYearEndReviewExport,
  buildYearEndReviewSummary,
  createEmptyYearEndReviewContext,
  getYearEndReviewDefaultPeriod,
  resolveYearEndReviewWarnings,
  selectYearEndReviewEntries,
  toBrowserDateKey,
  validateYearEndReviewPeriod,
  yearEndReviewLabels,
  type TimesheetDayDraft,
  type YearEndReviewCard,
  type YearEndReviewCategoryFilter,
  type YearEndReviewContext,
  type YearEndReviewData,
  type YearEndReviewEntry,
  type YearEndReviewLink,
  type YearEndReviewPeriod,
  type YearEndReviewQuickFilter,
  type YearEndReviewSelection,
  type YearEndReviewValueFilter
} from "@timesheet/domain";
import { Badge, Button, Input, Textarea, cn } from "@timesheet/ui";

import { TimesheetDayEditModal } from "./timesheet-day-edit-modal";

type YearEndReviewViewKind = "project" | "card" | "category";
type LoadStatus = "loading" | "loaded" | "error";

type YearEndReviewWorkspaceProps = {
  loadMonthAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  loadNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  loadYearEndReviewAction: (period: YearEndReviewPeriod) => Promise<YearEndReviewData>;
  refreshNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  saveEntryAction: (day: TimesheetDayDraft) => Promise<TimesheetSaveResult>;
};

// The screen no longer collects context; the export keeps the JSON v1 default for compatibility.
const emptyYearEndReviewContext: YearEndReviewContext = createEmptyYearEndReviewContext();

type PeriodDraft = {
  endDateKey: string;
  startDateKey: string;
  year: number;
};

const ALL_VALUE = "all";
const VALUE_PREFIX = "value:";
const CATEGORY_MISSING_METADATA = "missing_metadata";
const CATEGORY_UNLINKED = "unlinked";
const selectClassName =
  "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

const quickFilterLabels: Record<YearEndReviewQuickFilter, string> = {
  all: "전체",
  unlinked: "카드 미연결 업무만 보기",
  warnings: "배분 불일치/경고 업무만 보기"
};

const viewLabels: Record<YearEndReviewViewKind, string> = {
  card: "Notion 카드별",
  category: "카테고리별",
  project: "프로젝트별"
};

export function YearEndReviewWorkspace({
  loadMonthAction,
  loadNotionCardCandidatesAction,
  loadYearEndReviewAction,
  refreshNotionCardCandidatesAction,
  saveEntryAction
}: YearEndReviewWorkspaceProps) {
  const browserTodayRef = useRef("");
  const requestIdRef = useRef(0);
  const loadedPeriodRef = useRef<YearEndReviewPeriod | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [draft, setDraft] = useState<PeriodDraft | null>(null);
  const [data, setData] = useState<YearEndReviewData | null>(null);
  const [view, setView] = useState<YearEndReviewViewKind>("project");
  const [projectFilter, setProjectFilter] = useState<YearEndReviewValueFilter>({ kind: "all" });
  const [categoryFilter, setCategoryFilter] = useState<YearEndReviewCategoryFilter>({ kind: "all" });
  const [quickFilter, setQuickFilter] = useState<YearEndReviewQuickFilter>("all");
  const [excludedEntryIds, setExcludedEntryIds] = useState<Set<string>>(() => new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [editDateKey, setEditDateKey] = useState<string | null>(null);
  const [isReloadingAfterSave, setIsReloadingAfterSave] = useState(false);
  const [reloadAfterSaveError, setReloadAfterSaveError] = useState("");
  const [notionSyncNotice, setNotionSyncNotice] = useState("");

  useEffect(() => {
    const browserToday = toBrowserDateKey(new Date());

    browserTodayRef.current = browserToday;

    const initialPeriod = getYearEndReviewDefaultPeriod(browserToday);

    setDraft({
      endDateKey: initialPeriod.endDateKey,
      startDateKey: initialPeriod.startDateKey,
      year: Number(browserToday.slice(0, 4))
    });
    void loadPeriod(initialPeriod);
    // The initial period must be derived from the browser clock, so this runs once on mount.
  }, []);

  async function loadPeriod(period: YearEndReviewPeriod): Promise<boolean> {
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    setStatus("loading");
    setErrorMessage("");

    try {
      validateYearEndReviewPeriod(period);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "조회 기간을 확인할 수 없습니다.");
      return false;
    }

    try {
      const nextData = await loadYearEndReviewAction(period);

      if (requestId !== requestIdRef.current) {
        return false;
      }

      const isSamePeriod = isSameYearEndReviewPeriod(loadedPeriodRef.current, period);
      const knownEntryIds = new Set(nextData.entries.map((entry) => entry.id));

      setData(nextData);
      loadedPeriodRef.current = period;
      setStatus("loaded");
      setReloadAfterSaveError("");

      if (isSamePeriod) {
        setExcludedEntryIds((previous) => new Set([...previous].filter((entryId) => knownEntryIds.has(entryId))));
        return true;
      }

      setExcludedEntryIds(new Set());
      setProjectFilter({ kind: "all" });
      setCategoryFilter({ kind: "all" });
      setQuickFilter("all");
      setView("project");
      setExpandedGroupIds(new Set());

      return true;
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return false;
      }

      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "자료를 불러오지 못했습니다.");

      return false;
    }
  }

  async function reloadLoadedPeriod(): Promise<boolean> {
    const period = loadedPeriodRef.current;

    if (!period) {
      return false;
    }

    setIsReloadingAfterSave(true);

    try {
      return await loadPeriod(period);
    } finally {
      setIsReloadingAfterSave(false);
    }
  }

  function handleDaySaved(result: TimesheetSaveResult) {
    setEditDateKey(null);
    setNotionSyncNotice(result.notionSyncError);
    broadcastViewRefresh(["timesheet", "vacations", "notion-cards", "ai-summary", "projects"], "mutation");
    void reloadLoadedPeriod().then((loaded) => {
      if (!loaded) {
        setReloadAfterSaveError(
          "업무 기록 저장은 완료됐지만 정리 자료를 다시 불러오지 못했습니다. 자료를 다시 불러온 뒤 내보내 주세요."
        );
      }
    });
  }

  function retryReloadAfterSave() {
    setReloadAfterSaveError("");
    void reloadLoadedPeriod().then((loaded) => {
      if (!loaded) {
        setReloadAfterSaveError(
          "정리 자료를 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
      }
    });
  }

  const selection = useMemo<YearEndReviewSelection>(
    () => ({
      categoryFilter,
      excludedEntryIds: [...excludedEntryIds],
      projectFilter,
      quickFilter
    }),
    [categoryFilter, excludedEntryIds, projectFilter, quickFilter]
  );
  const selectionResult = useMemo(
    () => (data ? selectYearEndReviewEntries(data, selection) : null),
    [data, selection]
  );
  const exportPayload = useMemo(
    () => (data ? buildYearEndReviewExport({ context: emptyYearEndReviewContext, data, selection }) : null),
    [data, selection]
  );
  const resolvedWarnings = useMemo(() => (data ? resolveYearEndReviewWarnings(data) : []), [data]);
  // One warning can name several dates, so each date becomes its own table row; a warning without a date stays visible
  // as a single neutral row instead of leaking an identifier.
  const warningRows = useMemo(
    () =>
      resolvedWarnings.flatMap((warning, warningIndex) =>
        warning.targets.length > 0
          ? warning.targets.map((target) => ({
              dateKey: target.dateKey,
              key: `${warningIndex}:${warning.code}:${target.dateKey}`,
              labels: target.labels,
              message: warning.message
            }))
          : [
              {
                dateKey: "",
                key: `${warningIndex}:${warning.code}:unknown`,
                labels: [] as string[],
                message: warning.message
              }
            ]
      ),
    [resolvedWarnings]
  );
  const artifacts = useMemo(() => {
    if (!exportPayload) {
      return { error: "", value: null };
    }

    try {
      return { error: "", value: buildYearEndReviewArtifacts(exportPayload) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "파일과 프롬프트를 생성하지 못했습니다.",
        value: null
      };
    }
  }, [exportPayload]);
  const reviewGroups = useMemo(() => {
    if (!data || !selectionResult) {
      return [];
    }

    const reviewSummary = buildYearEndReviewSummary({ ...data, entries: selectionResult.matchingEntries });
    const entriesById = new Map(selectionResult.matchingEntries.map((entry) => [entry.id, entry]));

    return reviewSummary.groups[view]
      .map((group) => ({
        entries: group.entryIds
          .map((entryId) => entriesById.get(entryId))
          .filter((entry): entry is YearEndReviewEntry => Boolean(entry)),
        group
      }))
      .filter((item) => item.entries.length > 0);
  }, [data, selectionResult, view]);
  // The project header checkbox covers every loaded entry of that exact project, including entries the filters hide.
  // Project groups are keyed as `project:${entry.project}`, so the raw stored value stays the identity and a blank
  // project remains distinct from a project literally named "프로젝트 미분류".
  const projectScopeEntryIdsByKey = useMemo(() => {
    const entryIdsByKey = new Map<string, string[]>();

    for (const entry of data?.entries ?? []) {
      const key = `project:${entry.project}`;
      const entryIds = entryIdsByKey.get(key);

      if (entryIds) {
        entryIds.push(entry.id);
      } else {
        entryIdsByKey.set(key, [entry.id]);
      }
    }

    return entryIdsByKey;
  }, [data]);
  const cardsByPageId = useMemo(
    () => new Map((data?.cards ?? []).map((card) => [card.notionPageId, card])),
    [data]
  );
  const linksByEntryId = useMemo(() => groupLinksByEntryId(data?.links ?? []), [data]);
  const projectOptions = useMemo(
    () => [...new Set((data?.entries ?? []).map((entry) => entry.project))].sort((left, right) => left.localeCompare(right, "ko-KR")),
    [data]
  );
  // The cached category text has no reliable tag boundaries, so each exact value is one option.
  const categoryOptions = useMemo(
    () =>
      [...new Set((data?.cards ?? []).filter((card) => !card.metadataMissing).map((card) => card.category))].sort(
        (left, right) => left.localeCompare(right, "ko-KR")
      ),
    [data]
  );
  const yearOptions = useMemo(() => {
    const currentYear = Number((browserTodayRef.current || toBrowserDateKey(new Date())).slice(0, 4));

    return Array.from({ length: 6 }, (_, index) => currentYear - index);
  }, []);
  const sizes = useMemo(() => {
    if (!artifacts.value) {
      return null;
    }

    return {
      json: new Blob([artifacts.value.json]).size,
      markdown: new Blob([artifacts.value.markdown]).size
    };
  }, [artifacts]);
  const loadedPeriod = loadedPeriodRef.current;
  const draftMatchesLoaded = Boolean(
    draft && loadedPeriod && loadedPeriod.startDateKey === draft.startDateKey && loadedPeriod.endDateKey === draft.endDateKey
  );
  const isLoading = status === "loading";
  const canExport = Boolean(
    artifacts.value &&
      status === "loaded" &&
      draftMatchesLoaded &&
      !editDateKey &&
      !isReloadingAfterSave &&
      !reloadAfterSaveError
  );
  const partialDayCount =
    exportPayload?.warnings.filter((warning) => warning.code === "partial_day_summary_omitted").length ?? 0;

  function changeYear(year: number) {
    const browserToday = browserTodayRef.current || toBrowserDateKey(new Date());
    const period = getYearEndReviewDefaultPeriod(browserToday, year);

    setDraft({ endDateKey: period.endDateKey, startDateKey: period.startDateKey, year });
    setErrorMessage("");
  }

  function loadDraftPeriod() {
    if (!draft) {
      return;
    }

    void loadPeriod({
      browserTodayDateKey: browserTodayRef.current || toBrowserDateKey(new Date()),
      endDateKey: draft.endDateKey,
      startDateKey: draft.startDateKey
    });
  }

  function toggleEntryInclusion(entryId: string, included: boolean) {
    setExcludedEntryIds((previous) => {
      const next = new Set(previous);

      if (included) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }

      return next;
    });
  }

  function toggleProjectInclusion(projectKey: string, included: boolean) {
    const scopeEntryIds = projectScopeEntryIdsByKey.get(projectKey) ?? [];

    if (scopeEntryIds.length === 0) {
      return;
    }

    setExcludedEntryIds((previous) => {
      const next = new Set(previous);

      for (const entryId of scopeEntryIds) {
        if (included) {
          next.delete(entryId);
        } else {
          next.add(entryId);
        }
      }

      return next;
    });
  }

  function toggleGroup(groupId: string) {
    setExpandedGroupIds((previous) => {
      const next = new Set(previous);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }

  function downloadFile(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");

    anchor.download = filename;
    anchor.href = url;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function copyPrompt() {
    const prompt = artifacts.value?.prompt;

    if (!prompt) {
      return;
    }

    setCopyError("");

    void writeClipboardText(prompt)
      .then(() => {
        setCopiedPrompt(true);
        window.setTimeout(() => setCopiedPrompt(false), 1400);
      })
      .catch(() => {
        setCopiedPrompt(false);
        setCopyError("클립보드에 복사하지 못했습니다. 아래 프롬프트 텍스트를 직접 선택해 복사해 주세요.");
      });
  }

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-8 pt-4 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <Sparkles aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-950">연말 정리 자료 내보내기</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                저장된 업무와 연결 카드를 검토하고 외부 LLM 인터뷰용 파일을 만듭니다.
              </p>
            </div>
          </div>
          <Badge tone={status === "error" ? "orange" : status === "loading" ? "gray" : "green"}>
            {status === "error" ? "조회 실패" : status === "loading" ? "불러오는 중" : "조회 완료"}
          </Badge>
        </header>

        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {notionSyncNotice ? (
          <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 whitespace-pre-wrap">
              업무 기록은 저장됐지만 Notion 필드 동기화는 완료되지 않았습니다. {notionSyncNotice}
            </span>
          </div>
        ) : null}

        {reloadAfterSaveError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0">{reloadAfterSaveError}</span>
            <Button className="h-8 px-3" disabled={isLoading} onClick={retryReloadAfterSave} type="button" variant="secondary">
              <RefreshCw aria-hidden="true" className="size-4" />
              다시 불러오기
            </Button>
          </div>
        ) : null}

        <Panel icon={<RefreshCw aria-hidden="true" className="size-4" />} title="정리 준비">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="연도">
              <select
                className={selectClassName}
                disabled={isLoading}
                onChange={(event) => changeYear(Number(event.target.value))}
                value={draft?.year ?? ""}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </Field>
            <Field label="시작일">
              <Input
                disabled={isLoading}
                max={browserTodayRef.current || undefined}
                onChange={(event) => setDraft((previous) => (previous ? { ...previous, startDateKey: event.target.value } : previous))}
                type="date"
                value={draft?.startDateKey ?? ""}
              />
            </Field>
            <Field label="종료일">
              <Input
                disabled={isLoading}
                max={browserTodayRef.current || undefined}
                onChange={(event) => setDraft((previous) => (previous ? { ...previous, endDateKey: event.target.value } : previous))}
                type="date"
                value={draft?.endDateKey ?? ""}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button disabled={isLoading || !draft} onClick={loadDraftPeriod} type="button">
              <RefreshCw aria-hidden="true" className="size-4" />
              {isLoading ? "불러오는 중" : "자료 불러오기"}
            </Button>
            {!draftMatchesLoaded && data ? (
              <span className="text-sm font-semibold text-orange-700">
                편집한 기간이 아직 조회되지 않았습니다. 자료를 불러온 뒤 내보낼 수 있습니다.
              </span>
            ) : null}
          </div>

          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
            작성 기준·역할·목표·직무 레벨·출력 언어는 이 화면에서 입력하지 않습니다. 외부 LLM 대화나 첨부 자료에서 제공하세요. 이 화면은 기간 선택,
            근거 검토와 내보내기를 담당합니다.
          </p>
        </Panel>

        {!data ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
            {status === "error" ? "자료를 불러오지 못했습니다. 기간을 확인하고 다시 시도해 주세요." : "업무 자료를 불러오는 중입니다."}
          </p>
        ) : (
          <>
            <Panel icon={<FileText aria-hidden="true" className="size-4" />} title="근거 검토">
              <div className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                <p>
                  조회 기간 {data.period.startDateKey} ~ {data.period.endDateKey} · 고유 작업 날짜 {exportPayload?.summary.workDayCount ?? 0}일
                </p>
                <p>
                  기록 시간 {exportPayload?.summary.recordedHours ?? 0}시간 · 카드 배분 시간 {exportPayload?.summary.allocatedHours ?? 0}시간
                </p>
                <p>
                  미연결 업무 {exportPayload?.summary.unlinkedEntryCount ?? 0}건 · 배분 불일치{" "}
                  {exportPayload?.summary.allocationMismatchCount ?? 0}건
                </p>
                <p>조회 시각 {data.loadedAt}</p>
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                기록 시간은 사용자가 입력한 업무 시간이고 카드 배분 시간은 카드별로 나눈 시간입니다. 둘 다 측정된 실제 소요 시간이나 생산성 점수가
                아니며, 카드 편집 시각은 캐시 동기화 완료 시각이 아닙니다.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Field label="보기">
                  <select
                    className={selectClassName}
                    onChange={(event) => setView(event.target.value as YearEndReviewViewKind)}
                    value={view}
                  >
                    {(Object.keys(viewLabels) as YearEndReviewViewKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {viewLabels[kind]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="프로젝트 필터">
                  <select
                    className={selectClassName}
                    onChange={(event) => setProjectFilter(decodeValueFilter(event.target.value))}
                    value={encodeValueFilter(projectFilter)}
                  >
                    <option value={ALL_VALUE}>전체 프로젝트</option>
                    {projectOptions.map((project) => (
                      <option key={project} value={`${VALUE_PREFIX}${project}`}>
                        {project || yearEndReviewLabels.missingProject}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="카테고리 필터">
                  <select
                    className={selectClassName}
                    onChange={(event) => setCategoryFilter(decodeCategoryFilter(event.target.value))}
                    value={encodeCategoryFilter(categoryFilter)}
                  >
                    <option value={ALL_VALUE}>전체 카테고리</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={`${VALUE_PREFIX}${category}`}>
                        {category || yearEndReviewLabels.missingCategory}
                      </option>
                    ))}
                    <option value={CATEGORY_MISSING_METADATA}>{yearEndReviewLabels.missingCard}</option>
                    <option value={CATEGORY_UNLINKED}>{yearEndReviewLabels.unlinked}</option>
                  </select>
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="상태 빠른 필터">
                  <select
                    className={selectClassName}
                    onChange={(event) => setQuickFilter(event.target.value as YearEndReviewQuickFilter)}
                    value={quickFilter}
                  >
                    {(Object.keys(quickFilterLabels) as YearEndReviewQuickFilter[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {quickFilterLabels[kind]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end">
                  <Button
                    className="h-10"
                    disabled={excludedEntryIds.size === 0}
                    onClick={() => setExcludedEntryIds(new Set())}
                    type="button"
                    variant="secondary"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    제외한 업무 모두 다시 포함
                  </Button>
                </div>
              </div>
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
                세 필터는 AND 조건으로 함께 적용됩니다. 카테고리 필터는 업무를 고르는 조건이며, 선택된 업무의 모든 카드 연결과 배분 시간을 그대로
                내보냅니다. 제외 상태는 필터·보기를 바꿔도 유지되고 같은 기간을 새로고침하면 삭제된 ID만 정리됩니다.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="gray">전체 {data.entries.length}건</Badge>
                <Badge tone="blue">현재 필터 {selectionResult?.matchingEntries.length ?? 0}건</Badge>
                <Badge tone="orange">직접 제외 {selectionResult?.excludedEntryCount ?? 0}건</Badge>
                <Badge tone="orange">필터 내 제외 {selectionResult?.excludedMatchingEntryCount ?? 0}건</Badge>
                <Badge tone="green">최종 포함 {selectionResult?.selectedEntries.length ?? 0}건</Badge>
              </div>
            </Panel>

            <Panel icon={<ChevronDown aria-hidden="true" className="size-4" />} title={`${viewLabels[view]} 검토`}>
              {view === "project" ? (
                <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
                  프로젝트 헤더의 체크박스는 현재 조회 기간의 그 프로젝트 업무 전체를 포함·제외합니다. 프로젝트 필터·카테고리 필터나 빠른 필터로
                  가려진 업무도 함께 처리되며, 개별 업무 제외도 같은 상태를 공유합니다.
                </p>
              ) : null}
              {selectionResult && selectionResult.matchingEntries.length > 0 && reviewGroups.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">
                  현재 보기에서 묶을 근거가 없습니다. 다른 보기나 필터를 선택해 주세요.
                </p>
              ) : null}
              {reviewGroups.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">
                  현재 필터에 맞는 업무가 없습니다. 필터를 전체로 바꾸면 남은 업무와 제외 항목을 다시 볼 수 있습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {reviewGroups.map(({ entries, group }) => {
                    const groupId = `${view}:${group.key}`;
                    const isExpanded = expandedGroupIds.has(groupId);
                    // The header control stays outside the accordion button, so toggling inclusion never expands or
                    // collapses the group and the control is reachable on collapsed groups.
                    const scopeEntryIds = projectScopeEntryIdsByKey.get(group.key) ?? group.entryIds;
                    const includedScopeCount = scopeEntryIds.filter((entryId) => !excludedEntryIds.has(entryId)).length;

                    return (
                      <div className="rounded-md border border-slate-200 bg-white shadow-sm" key={groupId}>
                        <div className="flex items-start gap-2 px-3 py-3">
                          {view === "project" ? (
                            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-0.5">
                              <ProjectInclusionCheckbox
                                checked={scopeEntryIds.length > 0 && includedScopeCount === scopeEntryIds.length}
                                indeterminate={includedScopeCount > 0 && includedScopeCount < scopeEntryIds.length}
                                label={`${group.label} 프로젝트 업무 전체 포함 (${includedScopeCount}/${scopeEntryIds.length}건 포함)`}
                                onChange={(included) => toggleProjectInclusion(group.key, included)}
                              />
                              <span className="text-[11px] font-bold tabular-nums text-slate-500">
                                {includedScopeCount}/{scopeEntryIds.length}건 포함
                              </span>
                            </label>
                          ) : null}
                          <button
                            aria-expanded={isExpanded}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                            onClick={() => toggleGroup(groupId)}
                            type="button"
                          >
                          <span className="flex min-w-0 items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
                            )}
                            <span className="truncate font-bold text-slate-950">{group.label}</span>
                          </span>
                          <span className="flex shrink-0 flex-wrap items-center gap-2">
                            <Badge tone="gray">
                              {group.hoursKind === "recorded" ? "기록" : "배분"} {group.hours}시간
                            </Badge>
                            <Badge tone="white">업무 {group.entryIds.length}건</Badge>
                            <Badge tone="white">{group.workDateKeys.length}일</Badge>
                            </span>
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="space-y-3 border-t border-slate-200 px-3 py-3">
                            {entries.map((entry) => (
                              <EntryReviewRow
                                cardsByPageId={cardsByPageId}
                                entry={entry}
                                excluded={excludedEntryIds.has(entry.id)}
                                key={`${groupId}:${entry.id}`}
                                links={linksByEntryId.get(entry.id) ?? []}
                                onEditDate={setEditDateKey}
                                onToggle={toggleEntryInclusion}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {resolvedWarnings.length > 0 ? (
              <Panel icon={<AlertCircle aria-hidden="true" className="size-4" />} title="경고">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] border-collapse text-left text-sm font-semibold text-slate-600">
                    <caption className="mb-2 text-left text-xs font-semibold leading-5 text-slate-500">
                      조회한 기간의 저장 기록 전체에서 계산한 경고입니다. 제외한 업무의 문제도 그대로 남으며, 날짜를 누르면 그 날짜 저장 팝업이
                      열립니다.
                    </caption>
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2" scope="col">
                          날짜
                        </th>
                        <th className="px-2 py-2" scope="col">
                          관련 업무/카드
                        </th>
                        <th className="px-2 py-2" scope="col">
                          경고 내용
                        </th>
                        <th className="px-2 py-2" scope="col">
                          수정
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {warningRows.map((row) => (
                        <tr className="border-b border-slate-100 align-top" key={row.key}>
                          <th className="whitespace-nowrap px-2 py-2 text-left font-bold text-slate-950" scope="row">
                            {row.dateKey || (
                              <span className="font-semibold text-slate-400">{yearEndReviewLabels.noDate}</span>
                            )}
                          </th>
                          <td className="px-2 py-2">
                            {row.labels.length > 0 ? (
                              <ul className="flex flex-wrap gap-x-2 gap-y-1">
                                {row.labels.map((label, index) => (
                                  <li className="break-words" key={`${row.key}:label:${index}`}>
                                    {label}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-400">{yearEndReviewLabels.noTarget}</span>
                            )}
                          </td>
                          <td className="whitespace-normal break-words px-2 py-2">{row.message}</td>
                          <td className="whitespace-nowrap px-2 py-2">
                            {row.dateKey ? (
                              <button
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                                onClick={() => setEditDateKey(row.dateKey)}
                                type="button"
                              >
                                <span className="text-slate-950">{row.dateKey} 기록 수정</span>
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">수정 불가</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </section>

      <aside className="space-y-4">
        <Panel icon={<FileJson aria-hidden="true" className="size-4" />} title="내보내기">
          <p className="text-sm font-semibold leading-6 text-slate-600">
            필터·제외 결과와 조회 시각을 한 스냅샷으로 묶습니다. 두 파일과 프롬프트는 같은 스냅샷에서 만들어집니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="green">최종 포함 {selectionResult?.selectedEntries.length ?? 0}건</Badge>
            {sizes ? <Badge tone="gray">Markdown {formatBytes(sizes.markdown)}</Badge> : null}
            {sizes ? <Badge tone="gray">JSON {formatBytes(sizes.json)}</Badge> : null}
          </div>
          {partialDayCount > 0 ? (
            <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
              업무 일부를 제외한 {partialDayCount}개 날짜는 날짜 전체 요약을 내보내지 않습니다. 앱이 남은 업무로 대체 요약을 만들지 않습니다.
            </p>
          ) : null}
          {sizes && (sizes.json > 200_000 || sizes.markdown > 200_000) ? (
            <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold leading-5 text-orange-800">
              파일이 큽니다. 프로젝트 필터로 기간이나 범위를 나눠 내보내는 것을 권장합니다.
            </p>
          ) : null}
          {artifacts.error ? (
            <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
              {artifacts.error}
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            <Button
              className="w-full"
              disabled={!canExport}
              onClick={() =>
                artifacts.value &&
                downloadFile(artifacts.value.markdownFilename, artifacts.value.markdown, "text/markdown;charset=utf-8")
              }
              type="button"
            >
              <FileText aria-hidden="true" className="size-4" />
              개요 Markdown 다운로드
            </Button>
            <Button
              className="w-full"
              disabled={!canExport}
              onClick={() =>
                artifacts.value && downloadFile(artifacts.value.jsonFilename, artifacts.value.json, "application/json;charset=utf-8")
              }
              type="button"
              variant="secondary"
            >
              <FileJson aria-hidden="true" className="size-4" />
              상세 JSON 다운로드
            </Button>
            <Button className="w-full" disabled={!canExport} onClick={copyPrompt} type="button" variant="secondary">
              {copiedPrompt ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              {copiedPrompt ? "프롬프트 복사됨" : "인터뷰 프롬프트 복사"}
            </Button>
          </div>
          {!canExport && !artifacts.error ? (
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              {reloadAfterSaveError || isReloadingAfterSave || editDateKey
                ? "기록을 저장하거나 불러오는 중에는 최신 자료로 다시 조회한 뒤 내보낼 수 있습니다."
                : "최종 포함 업무가 있거나 조회·기간 상태가 맞을 때만 파일과 프롬프트를 만들 수 있습니다."}
            </p>
          ) : null}
          {copyError ? (
            <>
              <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
                {copyError}
              </p>
              <Textarea
                className="mt-2 h-40 font-mono text-xs leading-5"
                readOnly
                value={artifacts.value?.prompt ?? ""}
              />
            </>
          ) : null}
        </Panel>

        <Panel icon={<Sparkles aria-hidden="true" className="size-4" />} title="인터뷰 프롬프트">
          <p className="text-sm font-semibold leading-6 text-slate-600">
            외부 LLM에 <span className="font-mono text-xs">{artifacts.value?.markdownFilename ?? "review-brief-….md"}</span> 와{" "}
            <span className="font-mono text-xs">{artifacts.value?.jsonFilename ?? "review-evidence-….json"}</span> 를 첨부하고 아래 프롬프트를
            붙여넣으세요. 앱은 기록의 의미·성과·영향·목표를 추론하지 않습니다.
          </p>
          <Textarea
            className="mt-3 h-72 font-mono text-xs leading-5"
            readOnly
            value={artifacts.value?.prompt ?? "최종 포함 업무가 준비되면 프롬프트가 표시됩니다."}
          />
        </Panel>
      </aside>

      {editDateKey ? (
        <TimesheetDayEditModal
          dateKey={editDateKey}
          loadMonthAction={loadMonthAction}
          loadNotionCardCandidatesAction={loadNotionCardCandidatesAction}
          onClose={() => setEditDateKey(null)}
          onSaved={handleDaySaved}
          refreshNotionCardCandidatesAction={refreshNotionCardCandidatesAction}
          saveEntryAction={saveEntryAction}
        />
      ) : null}
    </main>
  );
}

function Panel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-slate-950">
        {icon}
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// A native checkbox reflects all / mixed / none, and its indeterminate state is a DOM property, not an attribute.
function ProjectInclusionCheckbox({
  checked,
  indeterminate,
  label,
  onChange
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: (included: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      aria-label={label}
      checked={checked}
      className="size-4 shrink-0 cursor-pointer rounded border-slate-300 accent-slate-950"
      onChange={(event) => onChange(event.target.checked)}
      ref={inputRef}
      type="checkbox"
    />
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

function EntryReviewRow({
  cardsByPageId,
  entry,
  excluded,
  links,
  onEditDate,
  onToggle
}: {
  cardsByPageId: Map<string, YearEndReviewCard>;
  entry: YearEndReviewEntry;
  excluded: boolean;
  links: YearEndReviewLink[];
  onEditDate: (dateKey: string) => void;
  onToggle: (entryId: string, included: boolean) => void;
}) {
  const entryLabel = `${entry.dateKey} ${entry.project || yearEndReviewLabels.missingProject} ${
    entry.content.trim().slice(0, 40) || yearEndReviewLabels.missingCard
  }`;

  return (
    <div
      className={cn(
        "rounded-md border border-slate-200 p-3",
        excluded ? "bg-slate-50 opacity-60" : "bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <input
            aria-label={`${entryLabel} 내보내기에 포함`}
            checked={!excluded}
            className="mt-1 size-4 shrink-0 rounded border-slate-300"
            onChange={(event) => onToggle(entry.id, event.target.checked)}
            type="checkbox"
          />
          <button
            aria-label={`${entry.dateKey} 기록 수정`}
            className="min-w-0 rounded-md text-left transition hover:bg-slate-50"
            onClick={() => onEditDate(entry.dateKey)}
            type="button"
          >
            <span className="block text-sm font-bold text-slate-950">
              {entry.dateKey} · {entry.project || yearEndReviewLabels.missingProject}
            </span>
            <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {entry.content || yearEndReviewLabels.emptyContent}
            </span>
          </button>
        </div>
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          {excluded ? <Badge tone="orange">제외됨</Badge> : null}
          <Badge tone="gray">기록 {formatHoursValue(entry.hours)}시간</Badge>
        </span>
      </div>
      {entry.aiTranslation ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">보조 번역: {entry.aiTranslation}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {links.length === 0 ? (
          <Badge tone="orange">{yearEndReviewLabels.unlinked}</Badge>
        ) : (
          links.map((link) => {
            const card = cardsByPageId.get(link.notionPageId);
            const title = card?.title || yearEndReviewLabels.missingCard;

            return (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700"
                key={`${entry.id}:${link.notionPageId}`}
              >
                <button
                  className="max-w-[16rem] truncate underline-offset-2 hover:underline"
                  onClick={() => onEditDate(entry.dateKey)}
                  type="button"
                >
                  {title}
                </button>
                <span>· 배분 {formatHoursValue(link.allocatedHours)}시간</span>
                {card?.url ? (
                  <a
                    aria-label={`${title} Notion 페이지 열기`}
                    className="inline-flex items-center text-blue-700 hover:text-blue-900"
                    href={card.url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                ) : null}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function encodeValueFilter(filter: YearEndReviewValueFilter): string {
  return filter.kind === "all" ? ALL_VALUE : `${VALUE_PREFIX}${filter.value}`;
}

function decodeValueFilter(value: string): YearEndReviewValueFilter {
  return value === ALL_VALUE ? { kind: "all" } : { kind: "value", value: value.slice(VALUE_PREFIX.length) };
}

function encodeCategoryFilter(filter: YearEndReviewCategoryFilter): string {
  if (filter.kind === "missing_metadata") {
    return CATEGORY_MISSING_METADATA;
  }

  if (filter.kind === "unlinked") {
    return CATEGORY_UNLINKED;
  }

  return filter.kind === "all" ? ALL_VALUE : `${VALUE_PREFIX}${filter.value}`;
}

function decodeCategoryFilter(value: string): YearEndReviewCategoryFilter {
  if (value === ALL_VALUE) {
    return { kind: "all" };
  }

  if (value === CATEGORY_MISSING_METADATA) {
    return { kind: "missing_metadata" };
  }

  if (value === CATEGORY_UNLINKED) {
    return { kind: "unlinked" };
  }

  return { kind: "value", value: value.slice(VALUE_PREFIX.length) };
}

function groupLinksByEntryId(links: YearEndReviewLink[]): Map<string, YearEndReviewLink[]> {
  const linksByEntryId = new Map<string, YearEndReviewLink[]>();

  for (const link of links) {
    const entryLinks = linksByEntryId.get(link.entryId) ?? [];

    entryLinks.push(link);
    linksByEntryId.set(link.entryId, entryLinks);
  }

  return linksByEntryId;
}

function isSameYearEndReviewPeriod(left: YearEndReviewPeriod | null, right: YearEndReviewPeriod): boolean {
  return Boolean(
    left &&
      left.startDateKey === right.startDateKey &&
      left.endDateKey === right.endDateKey &&
      left.browserTodayDateKey === right.browserTodayDateKey
  );
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function writeClipboardText(value: string): Promise<void> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;

  if (!clipboard || typeof clipboard.writeText !== "function") {
    throw new Error("clipboard_unavailable");
  }

  // Both a synchronous throw and a rejected write must reach the caller's catch.
  await clipboard.writeText(value);
}

function formatHoursValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
