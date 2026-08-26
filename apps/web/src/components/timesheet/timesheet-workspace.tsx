"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import {
  allocateNotionCardHours,
  createEmptyDraft,
  createEmptyEntryDraft,
  formatKoreanDate,
  getBusinessCalendarWeeks,
  getBusinessDateKeysUntil,
  getMonthLabel,
  getSavedNotionCardDateRanges,
  isWeekendDateKey,
  toBrowserDateKey,
  type TimesheetRow,
  type TimesheetDayDraft,
  type TimesheetEntryDraft,
  type TimesheetEntryNotionCardDraft,
  type VacationColor,
  type VacationStatus,
  type WorkRecordKind
} from "@timesheet/domain";
import { Button, SegmentedControl, cn } from "@timesheet/ui";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Search,
  Sparkles,
  TimerReset,
  WrapText
} from "lucide-react";

import { AppLoadingOverlay, AppLoadingScreen } from "@/components/app-loading-screen";
import { NotionCardPickerModal } from "./notion-card-picker-modal";
import { addBusinessDays, addDays, getBusinessDateKeysInRange, getDateKeyMonthCursor, getDefaultSelectedDateForMonth, getInclusiveDateSpan } from "./timesheet-date-utils";
import { buildDraftsFromMonthData, buildInitialDrafts, buildSelectedEntryIds, createDraftForDate, createEntryForDate, createFutureDraftForDate, createVacationDay, findPreviousProject, hasExistingAiFields, hasHolidayMarker, hasMissingAiFields, hasWorkContent, hasWorkContentChange, isAutoProjectOnlyDraft, isDefaultFutureVacationDraft, rebalanceDefaultWorkHours, rowFromDraft, sanitizeDayForSave, withClientIds, createClientId, type TimesheetMonthData } from "./timesheet-draft-utils";
import { allocateDefaultNotionCards, buildNotionCardSnapshotMap, createWeekdayDefaultNotionCards, findLocalPreviousNotionCards, mergeNotionCardSnapshot, mergeNotionCardSnapshots, type NotionWeeklyDefaultCard } from "./timesheet-notion-recommendation";
import { CalendarView } from "./timesheet-calendar-view";
import { getNotionAllocationError, listRowKey } from "./timesheet-entry-display";
import { ListView } from "./timesheet-list-view";
import { DailyEditor } from "./timesheet-daily-editor";
import { AiOverwritePromptModal, AiRewritePromptModal, AiRewriteQueueModal } from "./timesheet-ai-modals";
import { ProjectCreateModal } from "./timesheet-project-modal";
import { SettingsModal } from "./timesheet-settings-modal";
import { ConnectedVacationDeleteModal, ConnectedVacationSaveModal, VacationRangeModal } from "./timesheet-vacation-modals";
import { Metric } from "./timesheet-ui-primitives";
import { DeleteConfirmModal, NotionSyncErrorModal, PendingNavigationConfirmModal } from "./timesheet-simple-modals";
import { useNotionCardCandidates, type LoadNotionCardCandidatesInput, type NotionCardCandidatesResult } from "./use-notion-card-candidates";
import { useTimesheetSettings, type GeminiApiKeyTestResult, type HolidayApiKeyTestResult, type ManagedUser, type UserAiSetting, type UserAiSettingUpdate, type UserRole } from "./use-timesheet-settings";
import { adjacentListTarget, shouldIgnoreCalendarShortcut } from "@/lib/calendar-shortcuts";
import { broadcastViewRefresh, useSharedViewRefresh } from "@/lib/view-refresh";

type ViewMode = "calendar" | "list";

const fullListContentStorageKey = "timesheet:list:show-full-content";

type TimesheetAiCleanupResult = {
  appliedDateKeys: string[];
  days: TimesheetDayDraft[];
  message: string;
  skipped: boolean;
};

type TimesheetAiRewriteRequest = {
  cleanupType: "fill_missing" | "rewrite";
  dateKey: string;
  entryCount: number;
  previewContent: string;
  rewriteRequested: boolean;
  shortVersion: string;
};

type TimesheetDeleteResult = {
  notionSyncError: string;
};

type TimesheetSaveResult = {
  day: TimesheetDayDraft;
  notionSyncError: string;
};

type AiCleanupOptions = {
  overwriteCurrentDate?: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type AiCleanupState = "idle" | "running" | "done" | "skipped" | "error";
type DeleteState = "idle" | "deleting" | "error";
type ProjectAddState = "idle" | "saving" | "error";
type VacationRangeSaveState = "idle" | "saving" | "error";
type MonthLoadState = "idle" | "loading" | "error";
type PendingNavigation =
  | { kind: "closeEditor" }
  | { kind: "date"; dateKey: string; entryClientId?: string }
  | { delta: number; kind: "month" }
  | { kind: "today" };

type ConnectedVacationPrompt = {
  actionLabel: string;
  dateKeys: string[];
  matchVacationName: string;
  matchVacationStatus: VacationStatus;
  vacationName: string;
  vacationStatus: VacationStatus;
};
type ConnectedVacationAction = "delete" | "save";
type VacationSaveAction = {
  label: string;
  status: VacationStatus;
  variant: "primary" | "secondary" | "ghost";
};

type TimesheetWorkspaceProps = {
  addProjectAction: (name: string) => Promise<string>;
  createUserAction: (params: { email?: string; password: string; role: UserRole; username: string }) => Promise<ManagedUser>;
  currentUser: ManagedUser;
  deleteEntryAction: (dateKey: string) => Promise<TimesheetDeleteResult>;
  findPreviousNotionCardsAction: (dateKey: string) => Promise<TimesheetEntryNotionCardDraft[]>;
  findPreviousProjectAction: (dateKey: string) => Promise<string>;
  initialHolidayApiKey: string;
  initialAiSetting: UserAiSetting;
  initialAiRewriteRequests: TimesheetAiRewriteRequest[];
  initialManagedUsers: ManagedUser[];
  initialMonthIndex: number;
  initialMonthData: TimesheetMonthData;
  initialNotionDoneStatusValues: string[];
  initialNotionWeeklyDefaults: NotionWeeklyDefaultCard[];
  initialTodayKey: string;
  initialYear: number;
  listAiRewriteRequestsAction: () => Promise<TimesheetAiRewriteRequest[]>;
  loadMonthAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  loadVacationColorsAction: (year: number) => Promise<Record<string, VacationColor>>;
  loadNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  refreshNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  resetAllHolidayCacheAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  resetHolidayCacheAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  runAiCleanupAction: (dateKey: string, options?: AiCleanupOptions) => Promise<TimesheetAiCleanupResult>;
  saveEntryAction: (entry: TimesheetDayDraft) => Promise<TimesheetSaveResult>;
  saveHolidayApiKeyAction: (serviceKey: string) => Promise<void>;
  testGeminiApiKeyAction: (params: { apiKey?: string; model: string }) => Promise<GeminiApiKeyTestResult>;
  testHolidayApiKeyAction: (serviceKey: string, year: number, monthIndex: number) => Promise<HolidayApiKeyTestResult>;
  updateAiSettingAction: (input: UserAiSettingUpdate) => Promise<UserAiSetting>;
  updateProfileAction: (params: { email?: string; password?: string; username: string }) => Promise<ManagedUser>;
};

const todayRefreshIntervalMs = 60_000;

const newProjectOptionValue = "__new_project__";

const kindOptions: Array<{ label: string; value: WorkRecordKind }> = [
  { label: "업무", value: "WORK" },
  { label: "휴가", value: "VACATION" },
  { label: "공휴일", value: "HOLIDAY" }
];

function getVacationSaveActions(mode: "create" | "edit", status: VacationStatus): VacationSaveAction[] {
  if (mode === "create") {
    return [
      { label: "저장", status: "CONFIRMED", variant: "primary" },
      { label: "임시저장", status: "TEMPORARY", variant: "secondary" }
    ];
  }

  if (status === "TEMPORARY") {
    return [
      { label: "임시저장", status: "TEMPORARY", variant: "primary" },
      { label: "등록", status: "CONFIRMED", variant: "secondary" }
    ];
  }

  return [
    { label: "저장", status: "CONFIRMED", variant: "primary" },
    { label: "임시로 변경", status: "TEMPORARY", variant: "ghost" }
  ];
}

function getMonthCacheKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function mergeProjects(current: string[], projects: string[]): string[] {
  const next = new Set(current);

  for (const project of projects) {
    const name = project.trim();

    if (name) {
      next.add(name);
    }
  }

  return Array.from(next).sort((left, right) => left.localeCompare(right, "ko-KR"));
}

function toAiRewriteRequest(day: TimesheetDayDraft): TimesheetAiRewriteRequest | null {
  const rewriteRequested = Boolean(day.aiRewriteRequested);
  const missingAiFields = hasMissingAiFields(day);

  if ((!rewriteRequested && !missingAiFields) || !hasWorkContent(day)) {
    return null;
  }

  const workEntries = day.entries.filter((entry) => entry.kind === "WORK");
  const previewContent = workEntries.find((entry) => entry.content.trim())?.content.trim() ?? "";

  return {
    cleanupType: rewriteRequested ? "rewrite" : "fill_missing",
    dateKey: day.dateKey,
    entryCount: workEntries.length,
    previewContent,
    rewriteRequested,
    shortVersion: day.shortVersion
  };
}

export function TimesheetWorkspace({
  addProjectAction,
  createUserAction,
  currentUser: initialCurrentUser,
  deleteEntryAction,
  findPreviousNotionCardsAction,
  findPreviousProjectAction,
  initialAiSetting,
  initialAiRewriteRequests,
  initialHolidayApiKey,
  initialManagedUsers,
  initialMonthIndex,
  initialMonthData,
  initialNotionDoneStatusValues,
  initialNotionWeeklyDefaults,
  initialTodayKey,
  initialYear,
  listAiRewriteRequestsAction,
  loadMonthAction,
  loadVacationColorsAction,
  loadNotionCardCandidatesAction,
  refreshNotionCardCandidatesAction,
  resetAllHolidayCacheAction,
  resetHolidayCacheAction,
  runAiCleanupAction,
  saveEntryAction,
  saveHolidayApiKeyAction,
  testGeminiApiKeyAction,
  testHolidayApiKeyAction,
  updateAiSettingAction,
  updateProfileAction
}: TimesheetWorkspaceProps) {
  const [todayKey, setTodayKey] = useState(initialTodayKey);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [monthCursor, setMonthCursor] = useState({
    monthIndex: initialMonthIndex,
    year: initialYear
  });
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [isDailyEditorRequested, setIsDailyEditorRequested] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [showFullListContent, setShowFullListContent] = useState(false);
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);
  const [records, setRecords] = useState<Record<string, TimesheetDayDraft>>(() => buildInitialDrafts(initialMonthData, todayKey));
  const [savedRecords, setSavedRecords] = useState<Record<string, TimesheetDayDraft>>(() => buildDraftsFromMonthData(initialMonthData));
  const [savedEntryDateKeys, setSavedEntryDateKeys] = useState(() => new Set(initialMonthData.entries.map((entry) => entry.dateKey)));
  const [celebratingDateKey, setCelebratingDateKey] = useState("");
  const [selectedEntryIdByDate, setSelectedEntryIdByDate] = useState<Record<string, string>>(() => buildSelectedEntryIds(records));
  const workspaceViewRef = useRef<HTMLElement>(null);
  const dailyEditorRef = useRef<HTMLElement>(null);
  const closeEditorButtonRef = useRef<HTMLButtonElement>(null);
  const [editingNotionEntryClientId, setEditingNotionEntryClientId] = useState<string | null>(null);
  const [includeDoneNotionCandidates, setIncludeDoneNotionCandidates] = useState(false);
  const notionCandidates = useNotionCardCandidates({ loadNotionCardCandidatesAction, refreshNotionCardCandidatesAction });
  const [projects, setProjects] = useState(() => mergeProjects([], initialMonthData.projects));
  const [vacationColorsByYear, setVacationColorsByYear] = useState<Record<number, Record<string, VacationColor>>>(() => ({
    [initialYear]: initialMonthData.vacationColors
  }));
  const [loadedMonthKeys, setLoadedMonthKeys] = useState(() => {
    return new Set([getMonthCacheKey(initialYear, initialMonthIndex)]);
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [notionSyncError, setNotionSyncError] = useState("");
  const [aiCleanupState, setAiCleanupState] = useState<AiCleanupState>("idle");
  const [aiCleanupDateKey, setAiCleanupDateKey] = useState("");
  const [aiCleanupMessage, setAiCleanupMessage] = useState("");
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectAddState, setProjectAddState] = useState<ProjectAddState>("idle");
  const [projectAddError, setProjectAddError] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [aiRewriteRequests, setAiRewriteRequests] = useState(initialAiRewriteRequests);
  const [isAiRewriteQueueOpen, setIsAiRewriteQueueOpen] = useState(false);
  const [holidayWarning, setHolidayWarning] = useState(initialMonthData.holidayWarning ?? "");
  const [holidayWarningMonthKeys, setHolidayWarningMonthKeys] = useState(() => {
    const initialMonthKey = getMonthCacheKey(initialYear, initialMonthIndex);

    return new Set(initialMonthData.holidayWarning ? [initialMonthKey] : []);
  });
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [isVacationRangeOpen, setIsVacationRangeOpen] = useState(false);
  const [vacationRangeStart, setVacationRangeStart] = useState(todayKey);
  const [vacationRangeEnd, setVacationRangeEnd] = useState(todayKey);
  const [vacationRangeName, setVacationRangeName] = useState("");
  const [vacationRangeHours, setVacationRangeHours] = useState(8);
  const [vacationRangeStatus, setVacationRangeStatus] = useState<VacationStatus>("CONFIRMED");
  const [canEditVacationRangeStart, setCanEditVacationRangeStart] = useState(false);
  const [vacationRangeState, setVacationRangeState] = useState<VacationRangeSaveState>("idle");
  const [vacationRangeError, setVacationRangeError] = useState("");
  const [vacationRangeMessage, setVacationRangeMessage] = useState("");
  const [vacationRangeConflictKeys, setVacationRangeConflictKeys] = useState<string[]>([]);
  const [vacationRangeProgress, setVacationRangeProgress] = useState({ completed: 0, total: 0 });
  const [connectedVacationPrompt, setConnectedVacationPrompt] = useState<ConnectedVacationPrompt | null>(null);
  const [connectedVacationAction, setConnectedVacationAction] = useState<ConnectedVacationAction>("save");
  const [isConnectedVacationSaving, setIsConnectedVacationSaving] = useState(false);
  const [connectedVacationProgress, setConnectedVacationProgress] = useState({ completed: 0, total: 0 });
  const [aiRewritePromptDateKey, setAiRewritePromptDateKey] = useState("");
  const [aiOverwriteEditPrompt, setAiOverwriteEditPrompt] = useState<{
    entryClientId?: string;
    field: "summary" | "translation";
    previousValue: string;
  } | null>(null);
  const [monthLoadState, setMonthLoadState] = useState<MonthLoadState>("idle");
  const [monthLoadError, setMonthLoadError] = useState("");
  const [isInitialMonthSyncing, setIsInitialMonthSyncing] = useState(true);
  const [projectRecommendationLoadingKeys, setProjectRecommendationLoadingKeys] = useState<Set<string>>(() => new Set());
  const [notionRecommendationLoadingKeys, setNotionRecommendationLoadingKeys] = useState<Set<string>>(() => new Set());
  const previousNotionCardRecommendationKeys = useRef(new Set<string>());
  const settings = useTimesheetSettings({
    createUserAction,
    currentUser,
    currentMonth: { monthIndex: monthCursor.monthIndex, year: monthCursor.year },
    initialAiSetting,
    initialHolidayApiKey,
    initialManagedUsers,
    onHolidayCacheReset: applyHolidayCacheReset,
    onOpenRewriteQueue: () => setIsAiRewriteQueueOpen(true),
    onProfileUpdated: setCurrentUser,
    refreshRewriteQueue: refreshAiRewriteRequests,
    resetAllHolidayCacheAction,
    resetCurrentMonthHolidayCacheAction: resetHolidayCacheAction,
    rewriteQueueCount: aiRewriteRequests.length,
    saveHolidayApiKeyAction,
    testGeminiApiKeyAction,
    testHolidayApiKeyAction,
    updateAiSettingAction,
    updateProfileAction
  });
  const { aiSetting, isOpen: isSettingsOpen, modalProps: settingsModalProps, rewriteQueueCleanupMode } = settings;
  const isDailyEditorModalActive = isCompactViewport && isDailyEditorRequested;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => setIsCompactViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    try {
      setShowFullListContent(localStorage.getItem(fullListContentStorageKey) === "true");
    } catch {
      // Browser storage is optional; the in-memory default remains usable.
    }
  }, []);

  useEffect(() => {
    const browserToday = new Date();
    const browserTodayKey = toBrowserDateKey(browserToday);
    const browserMonthIndex = browserToday.getMonth();
    const browserYear = browserToday.getFullYear();

    if (browserTodayKey === initialTodayKey && browserYear === initialYear && browserMonthIndex === initialMonthIndex) {
      setIsInitialMonthSyncing(false);
      return;
    }

    setTodayKey(browserTodayKey);
    setSelectedDateKey((current) => current === initialTodayKey ? browserTodayKey : current);
    setMonthCursor({
      monthIndex: browserMonthIndex,
      year: browserYear
    });
  }, [initialMonthIndex, initialTodayKey, initialYear]);

  useEffect(() => {
    let isActive = true;

    async function refreshTodayKey() {
      const browserTodayKey = toBrowserDateKey(new Date());

      if (browserTodayKey === todayKey) {
        return;
      }

      setTodayKey(browserTodayKey);

      try {
        const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);
        const monthData = await loadMonthAction(monthCursor.year, monthCursor.monthIndex);

        if (!isActive) {
          return;
        }

        rememberVacationColors(monthCursor.year, monthData);
        const monthDrafts = buildDraftsFromMonthData(monthData);
        const selectedDirtyDateKey = isDirty ? selectedDateKey : "";

        setRecords((current) => ({
          ...current,
          ...Object.fromEntries(Object.entries(monthDrafts).filter(([dateKey]) => dateKey !== selectedDirtyDateKey))
        }));
        setSavedRecords((current) => ({
          ...current,
          ...monthDrafts
        }));
        setSelectedEntryIdByDate((current) => ({
          ...current,
          ...Object.fromEntries(Object.values(monthDrafts).flatMap((day) => day.dateKey !== selectedDirtyDateKey && day.entries[0] ? [[day.dateKey, day.entries[0].clientId]] : []))
        }));
        setProjects((current) => mergeProjects(current, monthData.projects));
        setHolidayWarning(monthData.holidayWarning ?? "");
        setHolidayWarningMonthKeys((current) => {
          const next = new Set(current);

          if (monthData.holidayWarning) {
            next.add(monthKey);
          } else {
            next.delete(monthKey);
          }

          return next;
        });
        setSavedEntryDateKeys((current) => {
          const next = new Set(current);

          for (const entry of monthData.entries) {
            next.add(entry.dateKey);
          }

          return next;
        });
        setLoadedMonthKeys((current) => new Set(current).add(monthKey));
        updateAiRewriteRequestsFromDays(monthData.entries);
      } catch {
        // Midnight refresh is opportunistic; normal month navigation still reports load errors.
      }

      if (selectedDateKey !== browserTodayKey || savedEntryDateKeys.has(browserTodayKey)) {
        return;
      }

      setRecords((current) => {
        if (!isDefaultFutureVacationDraft(current[browserTodayKey])) {
          return current;
        }

        const draft = createDraftForDate(browserTodayKey, current);

        setSelectedEntryIdByDate((selected) => ({
          ...selected,
          [browserTodayKey]: draft.entries[0]?.clientId ?? ""
        }));

        return {
          ...current,
          [browserTodayKey]: draft
        };
      });
    }

    const intervalId = window.setInterval(() => void refreshTodayKey(), todayRefreshIntervalMs);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [isDirty, loadMonthAction, monthCursor.monthIndex, monthCursor.year, savedEntryDateKeys, selectedDateKey, todayKey]);

  useEffect(() => {
    if (!celebratingDateKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCelebratingDateKey(""), 1600);

    return () => window.clearTimeout(timeoutId);
  }, [celebratingDateKey]);

  const calendarWeeks = useMemo(
    () => getBusinessCalendarWeeks(monthCursor.year, monthCursor.monthIndex),
    [monthCursor.monthIndex, monthCursor.year]
  );
  const visibleVacationColors = vacationColorsByYear[monthCursor.year] ?? {};
  const listDateKeys = useMemo(
    () => getBusinessDateKeysUntil(monthCursor.year, monthCursor.monthIndex, todayKey).toReversed(),
    [monthCursor.monthIndex, monthCursor.year, todayKey]
  );
  const rows = useMemo(() => {
    const entries: Record<string, TimesheetRow> = {};
    const getVisibleDraft = (dateKey: string) => {
      if (dateKey <= todayKey || savedEntryDateKeys.has(dateKey)) {
        return records[dateKey];
      }

      return hasHolidayMarker(savedRecords[dateKey]) ? savedRecords[dateKey] : undefined;
    };

    for (const week of calendarWeeks) {
      for (const cell of week) {
        if (cell) {
          entries[cell.dateKey] = rowFromDraft(cell.dateKey, todayKey, getVisibleDraft(cell.dateKey), savedEntryDateKeys.has(cell.dateKey));
        }
      }
    }

    for (const dateKey of listDateKeys) {
      entries[dateKey] = rowFromDraft(dateKey, todayKey, getVisibleDraft(dateKey), savedEntryDateKeys.has(dateKey));
    }

    entries[selectedDateKey] = rowFromDraft(selectedDateKey, todayKey, getVisibleDraft(selectedDateKey), savedEntryDateKeys.has(selectedDateKey));

    return entries;
  }, [calendarWeeks, listDateKeys, records, savedEntryDateKeys, savedRecords, selectedDateKey, todayKey]);
  const isFutureDate = selectedDateKey > todayKey;
  const selectedDay = records[selectedDateKey] ?? (isFutureDate ? createFutureDraftForDate(selectedDateKey) : createDraftForDate(selectedDateKey, records));
  const selectedEntryIdCandidate = selectedEntryIdByDate[selectedDateKey] ?? selectedDay.entries[0]?.clientId ?? "";
  const selectedEntry = selectedDay.entries.find((entry) => entry.clientId === selectedEntryIdCandidate) ?? selectedDay.entries[0];
  const selectedEntryId = selectedEntry?.clientId ?? "";
  const listNavigationTargets = useMemo(() => listDateKeys.flatMap((dateKey) => {
    const row = rows[dateKey]!;

    return row.status === "MISSING" || row.entries.length === 0
      ? [{ dateKey, entryClientId: "" }]
      : row.entries.map((entry) => ({ dateKey, entryClientId: entry.clientId }));
  }), [listDateKeys, rows]);
  const selectedListTarget = listNavigationTargets.find((target) => target.dateKey === selectedDateKey && target.entryClientId === selectedEntryId)
    ?? listNavigationTargets.find((target) => target.dateKey === selectedDateKey);
  const selectedListRowKey = selectedListTarget ? listRowKey(selectedListTarget.dateKey, selectedListTarget.entryClientId) : "";
  const selectedEditorKind: WorkRecordKind = selectedEntry?.kind ?? (selectedDay.holidayName ? "HOLIDAY" : isFutureDate ? "VACATION" : "WORK");
  const selectedNotionAllocationError = selectedEntry ? getNotionAllocationError(selectedEntry) : "";
  const isSelectedProjectRecommendationLoading = Boolean(selectedEntry && projectRecommendationLoadingKeys.has(`${selectedDateKey}:${selectedEntry.clientId}`));
  const isSelectedNotionRecommendationLoading = Boolean(selectedEntry && notionRecommendationLoadingKeys.has(`${selectedDateKey}:${selectedEntry.clientId}`));
  const selectedNotionEntryClientId = selectedEntry ? selectedEntry.clientId || selectedEntry.id : "";
  const selectedEntryLinkedNotionPageIds = selectedEntry ? selectedEntry.notionCards.map((link) => link.notionPageId) : [];

  const monthDateKeys = useMemo(
    () => Object.keys(rows).filter((dateKey) => dateKey.startsWith(`${monthCursor.year}-${String(monthCursor.monthIndex + 1).padStart(2, "0")}`)),
    [monthCursor.monthIndex, monthCursor.year, rows]
  );
  const monthCardDateRanges = useMemo(
    () => getSavedNotionCardDateRanges(savedRecords, monthDateKeys),
    [monthDateKeys, savedRecords]
  );
  const monthRows = Object.values(rows).filter((row) => row.dateKey.startsWith(`${monthCursor.year}-${String(monthCursor.monthIndex + 1).padStart(2, "0")}`));
  const businessDayCount = monthRows.filter((row) => row.status !== "HOLIDAY").length;
  const completedCount = monthRows.filter((row) => row.status === "COMPLETED").length;
  const missingCount = monthRows.filter((row) => row.status === "MISSING").length;
  const vacationHours = monthRows.reduce((sum, row) => sum + row.entries.filter((entry) => entry.kind === "VACATION").reduce((entrySum, entry) => entrySum + entry.hours, 0), 0);
  const vacationDays = Math.floor(vacationHours / 8);
  const vacationRemainderHours = Number((vacationHours % 8).toFixed(2));
  const vacationMetricValue = vacationDays > 0 && vacationRemainderHours > 0
    ? `${vacationDays}일 ${vacationRemainderHours}시간`
    : vacationDays > 0
      ? `${vacationDays}일`
      : `${vacationRemainderHours}시간`;
  const isViewingToday = selectedDateKey === todayKey;
  const isSelectedWeekend = isWeekendDateKey(selectedDateKey);
  const isFutureWork = false;
  const shortcutModifierKey = useMemo(() => getSystemModifierKey(), []);
  const editorKindOptions = isFutureDate ? kindOptions.filter((option) => option.value !== "WORK") : kindOptions;
  const canDeleteSelected = savedEntryDateKeys.has(selectedDateKey);
  const selectedTotalHours = selectedDay.entries.reduce((sum, entry) => sum + entry.hours, 0);
  const selectedHasWork = selectedDay.entries.some((entry) => entry.kind === "WORK");
  const selectedIsHoliday = selectedEditorKind === "HOLIDAY";
  const selectedIsSingleVacation = selectedDay.entries.length === 1 && selectedEntry?.kind === "VACATION";
  const savedSelectedVacation = selectedEntry?.kind === "VACATION"
    ? savedRecords[selectedDateKey]?.entries.find((entry) => entry.kind === "VACATION" && (entry.id === selectedEntry.id || entry.clientId === selectedEntry.clientId))
    : undefined;
  const selectedVacationMode: "create" | "edit" = savedSelectedVacation ? "edit" : "create";
  const selectedVacationSaveActions = selectedEntry?.kind === "VACATION" ? getVacationSaveActions(selectedVacationMode, selectedEntry.vacationStatus) : [];
  const primarySelectedVacationSaveAction = selectedVacationSaveActions.find((action) => action.variant === "primary");
  const secondarySelectedVacationSaveActions = selectedVacationSaveActions.filter((action) => action.variant !== "primary");
  const vacationRangeSaveActions = getVacationSaveActions(selectedVacationMode, vacationRangeStatus);
  const primaryVacationRangeSaveAction = vacationRangeSaveActions.find((action) => action.variant === "primary");
  const secondaryVacationRangeSaveActions = vacationRangeSaveActions.filter((action) => action.variant !== "primary");

  function getVisibleMonthKey() {
    return getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);
  }

  function rememberVacationColors(year: number, monthData: TimesheetMonthData) {
    setVacationColorsByYear((current) => ({ ...current, [year]: monthData.vacationColors }));
  }

  function applyHolidayCacheReset(scope: "all" | "currentMonth", monthData: TimesheetMonthData) {
    const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);
    const monthDrafts = buildDraftsFromMonthData(monthData);

    rememberVacationColors(monthCursor.year, monthData);

    const removeApiHolidayDrafts = (current: Record<string, TimesheetDayDraft>) => {
      const next = { ...current };

      for (const [dateKey, draft] of Object.entries(next)) {
        if ((scope === "all" || dateKey.startsWith(`${monthKey}-`)) && draft.entries.length === 0 && draft.holidayName) {
          delete next[dateKey];
        }
      }

      return {
        ...next,
        ...monthDrafts
      };
    };

    setRecords(removeApiHolidayDrafts);
    setSavedRecords(removeApiHolidayDrafts);
    setHolidayWarning(monthData.holidayWarning ?? "");
    setHolidayWarningMonthKeys((current) => {
      if (scope === "all") {
        return new Set<string>();
      }

      const next = new Set(current);

      if (monthData.holidayWarning) {
        next.add(monthKey);
      } else {
        next.delete(monthKey);
      }

      return next;
    });
    setProjects((current) => mergeProjects(current, monthData.projects));
    setSavedEntryDateKeys((current) => {
      const next = new Set(current);

      for (const entry of monthData.entries) {
        next.add(entry.dateKey);
      }

      return next;
    });
    setLoadedMonthKeys((current) => (scope === "all" ? new Set([monthKey]) : new Set(current).add(monthKey)));
  }

  async function refreshVacationColors(dateKeys: string[]) {
    const years = [...new Set(dateKeys.map((dateKey) => Number(dateKey.slice(0, 4))))].filter(Number.isInteger);

    try {
      const colorsByYear = await Promise.all(years.map(async (year) => [year, await loadVacationColorsAction(year)] as const));
      setVacationColorsByYear((current) => ({ ...current, ...Object.fromEntries(colorsByYear) }));
    } catch {
      setVacationColorsByYear((current) => Object.fromEntries(Object.entries(current).filter(([year]) => !years.includes(Number(year)))));
    }
  }

  function applyVisibleMonthData(monthData: TimesheetMonthData) {
    const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);
    const monthDrafts = buildDraftsFromMonthData(monthData);
    const selectedDirtyDateKey = isDirty ? selectedDateKey : "";

    setVacationColorsByYear({ [monthCursor.year]: monthData.vacationColors });
    setHolidayWarning(monthData.holidayWarning ?? "");
    setHolidayWarningMonthKeys((current) => {
      const next = new Set(current);

      if (monthData.holidayWarning) {
        next.add(monthKey);
      } else {
        next.delete(monthKey);
      }

      return next;
    });
    setRecords((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([dateKey]) => !dateKey.startsWith(monthKey)));

      if (selectedDirtyDateKey && current[selectedDirtyDateKey]) {
        next[selectedDirtyDateKey] = current[selectedDirtyDateKey];
      }

      return {
        ...next,
        ...Object.fromEntries(Object.entries(monthDrafts).filter(([dateKey]) => dateKey !== selectedDirtyDateKey))
      };
    });
    setSavedRecords((current) => ({
      ...Object.fromEntries(Object.entries(current).filter(([dateKey]) => !dateKey.startsWith(monthKey))),
      ...monthDrafts
    }));
    setSelectedEntryIdByDate((current) => ({
      ...Object.fromEntries(Object.entries(current).filter(([dateKey]) => !dateKey.startsWith(monthKey))),
      ...Object.fromEntries(Object.values(monthDrafts).flatMap((day) => day.dateKey !== selectedDirtyDateKey && day.entries[0] ? [[day.dateKey, day.entries[0].clientId]] : []))
    }));
    setProjects((current) => mergeProjects(current, monthData.projects));
    setSavedEntryDateKeys((current) => {
      const next = new Set(Array.from(current).filter((dateKey) => !dateKey.startsWith(monthKey)));

      for (const entry of monthData.entries) {
        next.add(entry.dateKey);
      }

      return next;
    });
    setLoadedMonthKeys((current) => new Set(current).add(monthKey));
    setMonthLoadState("idle");
    setIsInitialMonthSyncing(false);
  }

  async function loadVisibleMonthData() {
    setMonthLoadState("loading");
    setMonthLoadError("");

    try {
      return await loadMonthAction(monthCursor.year, monthCursor.monthIndex);
    } catch (error) {
      setMonthLoadState("error");
      setMonthLoadError(error instanceof Error ? error.message : "월 데이터를 불러오지 못했습니다.");
      setIsInitialMonthSyncing(false);
      throw error;
    }
  }

  async function saveEntryAndNotify(entry: TimesheetDayDraft): Promise<TimesheetSaveResult> {
    const affectsVacationColors = entry.entries.some((dayEntry) => dayEntry.kind === "VACATION") || savedRecords[entry.dateKey]?.entries.some((dayEntry) => dayEntry.kind === "VACATION");
    const result = await saveEntryAction(entry);
    if (affectsVacationColors) {
      await refreshVacationColors([entry.dateKey]);
    }
    broadcastViewRefresh(["timesheet", "vacations", "notion-cards", "ai-summary", "projects"], "mutation");
    return result;
  }

  async function deleteEntryAndNotify(dateKey: string): Promise<TimesheetDeleteResult> {
    const affectsVacationColors = savedRecords[dateKey]?.entries.some((entry) => entry.kind === "VACATION");
    const result = await deleteEntryAction(dateKey);
    if (affectsVacationColors) {
      await refreshVacationColors([dateKey]);
    }
    broadcastViewRefresh(["timesheet", "vacations", "notion-cards", "ai-summary", "projects"], "mutation");
    return result;
  }

  useSharedViewRefresh<TimesheetMonthData>({
    apply: applyVisibleMonthData,
    getKey: getVisibleMonthKey,
    load: loadVisibleMonthData,
    scope: "timesheet"
  });

  useEffect(() => {
    const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);

    if (loadedMonthKeys.has(monthKey) && vacationColorsByYear[monthCursor.year]) {
      setMonthLoadState("idle");
      setMonthLoadError("");
      setIsInitialMonthSyncing(false);
      return;
    }

    let isActive = true;

    async function loadMonth() {
      setMonthLoadState("loading");
      setMonthLoadError("");

      try {
        const monthData = await loadMonthAction(monthCursor.year, monthCursor.monthIndex);

        if (!isActive) {
          return;
        }

        rememberVacationColors(monthCursor.year, monthData);
        const monthDrafts = buildDraftsFromMonthData(monthData);

        setHolidayWarning(monthData.holidayWarning ?? "");
        setHolidayWarningMonthKeys((current) => {
          const next = new Set(current);

          if (monthData.holidayWarning) {
            next.add(monthKey);
          } else {
            next.delete(monthKey);
          }

          return next;
        });
        setRecords((current) => ({
          ...current,
          ...monthDrafts
        }));
        setSavedRecords((current) => ({
          ...current,
          ...monthDrafts
        }));
        setSelectedEntryIdByDate((current) => ({
          ...current,
          ...Object.fromEntries(Object.values(monthDrafts).flatMap((day) => day.entries[0] ? [[day.dateKey, day.entries[0].clientId]] : []))
        }));
        setProjects((current) => mergeProjects(current, monthData.projects));
        setSavedEntryDateKeys((current) => {
          const next = new Set(current);

          for (const entry of monthData.entries) {
            next.add(entry.dateKey);
          }

          return next;
        });
        setLoadedMonthKeys((current) => new Set(current).add(monthKey));
        setMonthLoadState("idle");
        setIsInitialMonthSyncing(false);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMonthLoadState("error");
        setMonthLoadError(error instanceof Error ? error.message : "월 데이터를 불러오지 못했습니다.");
        setIsInitialMonthSyncing(false);
      }
    }

    void loadMonth();

    return () => {
      isActive = false;
    };
  }, [loadMonthAction, loadedMonthKeys, monthCursor.monthIndex, monthCursor.year, vacationColorsByYear]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    recommendPreviousNotionCardsForDraft(selectedDateKey, records[selectedDateKey]);
  }, [records, savedEntryDateKeys, selectedDateKey]);

  function resetEntryFeedback() {
    setSaveState("idle");
    setSaveError("");
    setDeleteState("idle");
    setDeleteError("");
  }

  function showNotionSyncError(message: string) {
    if (message) {
      setNotionSyncError(message);
    }
  }

  function getEditingNotionLinkedPageIds(): string[] {
    if (!editingNotionEntryClientId) {
      return [];
    }

    return selectedDay.entries.find((entry) => (entry.clientId || entry.id) === editingNotionEntryClientId)?.notionCards.map((link) => link.notionPageId) ?? [];
  }

  function refreshNotionCandidatesForEditing(includeDone = includeDoneNotionCandidates) {
    notionCandidates.refreshCandidates({
      dateKey: selectedDateKey,
      includeDone,
      linkedPageIds: getEditingNotionLinkedPageIds()
    });
  }

  async function fillPreviousProjectFromDatabase(dateKey: string, clientId: string) {
    const loadingKey = `${dateKey}:${clientId}`;

    setProjectRecommendationLoadingKeys((current) => new Set(current).add(loadingKey));

    try {
      const project = (await findPreviousProjectAction(dateKey)).trim();

      if (!project) {
        return;
      }

      setProjects((current) => mergeProjects(current, [project]));
      setRecords((current) => {
        const day = current[dateKey];

        if (!day) {
          return current;
        }

        const entries = day.entries.map((entry) => {
          if (entry.clientId !== clientId || entry.kind !== "WORK" || entry.project.trim()) {
            return entry;
          }

          return {
            ...entry,
            project
          };
        });

        return {
          ...current,
          [dateKey]: {
            ...day,
            entries
          }
        };
      });
    } catch {
      // Auto-fill is a convenience path; leave the draft editable if lookup fails.
    } finally {
      setProjectRecommendationLoadingKeys((current) => {
        const next = new Set(current);

        next.delete(loadingKey);

        return next;
      });
    }
  }

  async function fillPreviousNotionCardsFromDatabase(dateKey: string, clientId: string) {
    const loadingKey = `${dateKey}:${clientId}`;

    setNotionRecommendationLoadingKeys((current) => new Set(current).add(loadingKey));

    try {
      const cards = await findPreviousNotionCardsAction(dateKey);

      if (cards.length === 0) {
        return;
      }

      setRecords((current) => {
        const day = current[dateKey];

        if (!day) {
          return current;
        }

        const entries = day.entries.map((entry) => {
          if (entry.clientId !== clientId || entry.kind !== "WORK" || entry.notionCards.some((card) => card.source !== "weekday_default")) {
            return entry;
          }

          const cardsByPageId = new Map(cards.map((card) => [card.notionPageId, card]));
          const nextCards = entry.notionCards.map((card) => mergeNotionCardSnapshot(card, cardsByPageId.get(card.notionPageId)));
          const nextPageIds = new Set(nextCards.map((card) => card.notionPageId));

          nextCards.push(...cards.filter((card) => !nextPageIds.has(card.notionPageId)));

          return {
            ...entry,
            notionCards: allocateDefaultNotionCards(nextCards, entry.hours)
          };
        });

        return {
          ...current,
          [dateKey]: {
            ...day,
            entries
          }
        };
      });
    } catch {
      // Auto-fill is a convenience path; leave the draft editable if lookup fails.
    } finally {
      setNotionRecommendationLoadingKeys((current) => {
        const next = new Set(current);

        next.delete(loadingKey);

        return next;
      });
    }
  }

  function recommendPreviousProjectForDraft(dateKey: string, day: TimesheetDayDraft | undefined) {
    if (isWeekendDateKey(dateKey) || savedEntryDateKeys.has(dateKey)) {
      return;
    }

    const entry = day?.entries[0];

    if (entry?.kind === "WORK" && !entry.project.trim()) {
      void fillPreviousProjectFromDatabase(dateKey, entry.clientId);
    }
  }

  function recommendPreviousNotionCardsForDraft(dateKey: string, day: TimesheetDayDraft | undefined) {
    if (isWeekendDateKey(dateKey) || savedEntryDateKeys.has(dateKey)) {
      return;
    }

    const entry = day?.entries[0];

    if (entry?.kind === "WORK" && entry.notionCards.length === 0) {
      const recommendationKey = `${dateKey}:${entry.clientId}`;

      if (previousNotionCardRecommendationKeys.current.has(recommendationKey)) {
        return;
      }

      previousNotionCardRecommendationKeys.current.add(recommendationKey);

      const snapshotsByPageId = buildNotionCardSnapshotMap({
        candidatesByDate: notionCandidates.candidatesByDate,
        savedRecords
      });
      const weekdayCards = mergeNotionCardSnapshots(
        createWeekdayDefaultNotionCards(dateKey, initialNotionWeeklyDefaults),
        snapshotsByPageId
      );
      const previousCards = findLocalPreviousNotionCards({
        dateKey,
        doneStatusValues: initialNotionDoneStatusValues,
        savedRecords
      });
      const localCards = [...weekdayCards, ...previousCards.cards];

      if (localCards.length > 0) {
        setRecords((current) => {
          const currentDay = current[dateKey];

          if (!currentDay) {
            return current;
          }

          const entries = currentDay.entries.map((currentEntry) => {
            if (currentEntry.clientId !== entry.clientId || currentEntry.kind !== "WORK" || currentEntry.notionCards.length > 0) {
              return currentEntry;
            }

            return {
              ...currentEntry,
              notionCards: allocateDefaultNotionCards(localCards, currentEntry.hours)
            };
          });

          return {
            ...current,
            [dateKey]: {
              ...currentDay,
              entries
            }
          };
        });
      }

      if (!previousCards.foundPreviousEntry) {
        void fillPreviousNotionCardsFromDatabase(dateKey, entry.clientId);
      }
    }
  }

  function discardSelectedDraft() {
    setRecords((current) => {
      const next = { ...current };
      const saved = savedRecords[selectedDateKey];

      if (saved) {
        next[selectedDateKey] = { ...saved };
      } else {
        delete next[selectedDateKey];
      }

      return next;
    });
    setIsDirty(false);
    resetEntryFeedback();
  }

  function prepareDraftForDate(dateKey: string, currentTodayKey = todayKey) {
    if (isWeekendDateKey(dateKey)) {
      return;
    }

    const existing = records[dateKey];

    if (existing?.entries.length) {
      recommendPreviousProjectForDraft(dateKey, existing);
      recommendPreviousNotionCardsForDraft(dateKey, existing);
      return;
    }

    const baseDraft = dateKey > currentTodayKey ? createFutureDraftForDate(dateKey) : createDraftForDate(dateKey, records);
    const draft = existing ? { ...existing, entries: baseDraft.entries } : baseDraft;

    setRecords((current) => {
      const currentDay = current[dateKey];

      if (currentDay?.entries.length) {
        recommendPreviousProjectForDraft(dateKey, currentDay);
        recommendPreviousNotionCardsForDraft(dateKey, currentDay);
        return current;
      }

      setSelectedEntryIdByDate((selected) => ({
        ...selected,
        [dateKey]: draft.entries[0]?.clientId ?? ""
      }));

      return {
        ...current,
        [dateKey]: draft
      };
    });

    recommendPreviousProjectForDraft(dateKey, draft);
    recommendPreviousNotionCardsForDraft(dateKey, draft);
  }

  function removeSelectedAutoProjectDraft(nextSelectedDateKey?: string) {
    if (nextSelectedDateKey === selectedDateKey) {
      return;
    }

    setRecords((current) => {
      if (savedRecords[selectedDateKey] || !isAutoProjectOnlyDraft(current[selectedDateKey])) {
        return current;
      }

      const next = { ...current };
      delete next[selectedDateKey];

      return next;
    });
  }

  function updateMonthCursor(nextCursor: { monthIndex: number; year: number }) {
    if (!loadedMonthKeys.has(getMonthCacheKey(nextCursor.year, nextCursor.monthIndex))) {
      setMonthLoadState("loading");
      setMonthLoadError("");
    }

    setMonthCursor(nextCursor);
  }

  function runNavigation(navigation: PendingNavigation) {
    if (navigation.kind === "closeEditor") {
      setIsDailyEditorRequested(false);
      requestAnimationFrame(() => (
        document.getElementById(viewMode === "calendar" ? `timesheet-calendar-date-${selectedDateKey}` : `timesheet-list-row-${selectedListRowKey}`)
        ?? workspaceViewRef.current
      )?.focus());
      return;
    }

    if (navigation.kind === "date") {
      const nextCursor = getDateKeyMonthCursor(navigation.dateKey);

      removeSelectedAutoProjectDraft(navigation.dateKey);
      prepareDraftForDate(navigation.dateKey);
      setSelectedDateKey(navigation.dateKey);
      updateMonthCursor(nextCursor);
      const entryClientId = navigation.entryClientId;
      if (entryClientId) {
        setSelectedEntryIdByDate((current) => ({
          ...current,
          [navigation.dateKey]: entryClientId
        }));
      }
      resetEntryFeedback();
      return;
    }

    if (navigation.kind === "today") {
      const today = new Date();
      const currentTodayKey = toBrowserDateKey(today);

      setTodayKey(currentTodayKey);
      removeSelectedAutoProjectDraft(currentTodayKey);
      setSelectedDateKey(currentTodayKey);
      prepareDraftForDate(currentTodayKey, currentTodayKey);
      updateMonthCursor({
        monthIndex: today.getMonth(),
        year: today.getFullYear()
      });
      resetEntryFeedback();
      return;
    }

    const next = new Date(monthCursor.year, monthCursor.monthIndex + navigation.delta, 1);
    const nextSelectedDateKey = getDefaultSelectedDateForMonth(
      next.getFullYear(),
      next.getMonth()
    );

    removeSelectedAutoProjectDraft(nextSelectedDateKey);
    setSelectedDateKey(nextSelectedDateKey);
    prepareDraftForDate(nextSelectedDateKey);
    updateMonthCursor({
      monthIndex: next.getMonth(),
      year: next.getFullYear()
    });
    resetEntryFeedback();
  }

  function requestNavigation(navigation: PendingNavigation) {
    if (isDirty) {
      setPendingNavigation(navigation);
      return;
    }

    runNavigation(navigation);
  }

  function confirmPendingNavigation() {
    if (!pendingNavigation) {
      return;
    }

    const navigation = pendingNavigation;

    discardSelectedDraft();
    setPendingNavigation(null);
    runNavigation(navigation);
  }

  function cancelPendingNavigation() {
    const restoreCloseButtonFocus = pendingNavigation?.kind === "closeEditor";

    setPendingNavigation(null);
    if (restoreCloseButtonFocus) {
      requestAnimationFrame(() => closeEditorButtonRef.current?.focus());
    }
  }

  function selectDate(dateKey: string) {
    setIsDailyEditorRequested(true);
    requestNavigation({ dateKey, kind: "date" });
  }

  function selectDateEntry(dateKey: string, entryClientId: string) {
    setIsDailyEditorRequested(true);

    if (dateKey === selectedDateKey) {
      selectEntry(entryClientId);
      return;
    }

    requestNavigation({ dateKey, entryClientId, kind: "date" });
  }

  function moveMonth(delta: number) {
    requestNavigation({ delta, kind: "month" });
  }

  function goToday() {
    requestNavigation({ kind: "today" });
  }

  function closeDailyEditor() {
    requestNavigation({ kind: "closeEditor" });
  }

  function updateShowFullListContent(checked: boolean) {
    setShowFullListContent(checked);

    try {
      localStorage.setItem(fullListContentStorageKey, String(checked));
    } catch {
      // Keep the toggle working even when browser storage is unavailable.
    }
  }

  async function loadDateKeysForVacation(dateKeys: string[]): Promise<Record<string, TimesheetDayDraft>> {
    const monthKeys = new Set(dateKeys.map((dateKey) => {
      const cursor = getDateKeyMonthCursor(dateKey);
      return getMonthCacheKey(cursor.year, cursor.monthIndex);
    }));
    const knownMonthKeys = new Set(loadedMonthKeys);
    const warningMonthKeys = new Set(holidayWarningMonthKeys);
    let loadedDrafts: Record<string, TimesheetDayDraft> = {};

    for (const monthKey of monthKeys) {
      if (knownMonthKeys.has(monthKey) && !warningMonthKeys.has(monthKey)) {
        continue;
      }

      const [year, month] = monthKey.split("-").map(Number);
      const targetYear = year ?? monthCursor.year;
      const monthData = await loadMonthAction(targetYear, (month ?? 1) - 1);
      const monthDrafts = buildDraftsFromMonthData(monthData);

      rememberVacationColors(targetYear, monthData);
      loadedDrafts = {
        ...loadedDrafts,
        ...monthDrafts
      };
      knownMonthKeys.add(monthKey);

      setRecords((current) => ({
        ...current,
        ...monthDrafts
      }));
      setSavedRecords((current) => ({
        ...current,
        ...monthDrafts
      }));
      setSelectedEntryIdByDate((current) => ({
        ...current,
        ...Object.fromEntries(Object.values(monthDrafts).flatMap((day) => day.entries[0] ? [[day.dateKey, day.entries[0].clientId]] : []))
      }));
      setHolidayWarning(monthData.holidayWarning ?? "");
      setHolidayWarningMonthKeys((current) => {
        const next = new Set(current);

        if (monthData.holidayWarning) {
          next.add(monthKey);
        } else {
          next.delete(monthKey);
        }

        return next;
      });
      setProjects((current) => mergeProjects(current, monthData.projects));
      setSavedEntryDateKeys((current) => {
        const next = new Set(current);

        for (const entry of monthData.entries) {
          next.add(entry.dateKey);
        }

        return next;
      });
      setLoadedMonthKeys((current) => new Set(current).add(monthKey));
    }

    return loadedDrafts;
  }

  function getDraftForVacationDate(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): TimesheetDayDraft | undefined {
    return records[dateKey] ?? loadedDrafts[dateKey] ?? savedRecords[dateKey];
  }

  function getSavedDraftForVacationDate(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): TimesheetDayDraft | undefined {
    return loadedDrafts[dateKey] ?? savedRecords[dateKey];
  }

  function isHolidayVacationDate(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): boolean {
    const draft = getDraftForVacationDate(dateKey, loadedDrafts);
    const row = rows[dateKey];

    return Boolean(row?.status === "HOLIDAY" || draft?.holidayName || draft?.entries.some((entry) => entry.kind === "HOLIDAY"));
  }

  function isSavedHolidayDate(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): boolean {
    const draft = getSavedDraftForVacationDate(dateKey, loadedDrafts);

    return Boolean(draft?.holidayName || draft?.entries.some((entry) => entry.kind === "HOLIDAY"));
  }

  function getVacationEntryIndex(draft: TimesheetDayDraft | undefined, vacationStatus?: VacationStatus, vacationName?: string): number {
    const hasVacationNameFilter = vacationName !== undefined;
    const trimmedVacationName = vacationName?.trim() ?? "";

    return (
      draft?.entries.findIndex(
        (entry) =>
          entry.kind === "VACATION" &&
          (!vacationStatus || entry.vacationStatus === vacationStatus) &&
          (!hasVacationNameFilter || entry.vacationName.trim() === trimmedVacationName)
      ) ?? -1
    );
  }

  function getVacationBoundary(draft: TimesheetDayDraft | undefined, vacationStatus?: VacationStatus, vacationName?: string) {
    const vacationIndex = getVacationEntryIndex(draft, vacationStatus, vacationName);

    if (!draft || vacationIndex < 0) {
      return null;
    }

    return {
      endsDay: vacationIndex === draft.entries.length - 1,
      startsDay: vacationIndex === 0
    };
  }

  function selectedVacationBoundary() {
    if (selectedEntry?.kind !== "VACATION") {
      return null;
    }

    const vacationIndex = selectedDay.entries.findIndex((entry) => entry.clientId === selectedEntry.clientId);

    if (vacationIndex < 0) {
      return null;
    }

    return {
      endsDay: vacationIndex === selectedDay.entries.length - 1,
      startsDay: vacationIndex === 0
    };
  }

  function findConnectedVacationDateKeysInDirection(
    dateKey: string,
    direction: -1 | 1,
    loadedDrafts: Record<string, TimesheetDayDraft>,
    vacationStatus?: VacationStatus,
    vacationName?: string
  ): string[] {
    const dateKeys: string[] = [];
    let cursor = addBusinessDays(dateKey, direction);

    while (true) {
      if (isSavedHolidayDate(cursor, loadedDrafts)) {
        cursor = addBusinessDays(cursor, direction);
        continue;
      }

      const boundary = getVacationBoundary(getSavedDraftForVacationDate(cursor, loadedDrafts), vacationStatus, vacationName);

      if (!boundary) {
        break;
      }

      const connectsToCursor = direction === 1 ? boundary.startsDay : boundary.endsDay;

      if (!connectsToCursor) {
        break;
      }

      dateKeys.push(cursor);

      const continuesPastCursor = direction === 1 ? boundary.endsDay : boundary.startsDay;

      if (!continuesPastCursor) {
        break;
      }

      cursor = addBusinessDays(cursor, direction);
    }

    return dateKeys;
  }

  function hasReplaceableRecord(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): boolean {
    const draft = getSavedDraftForVacationDate(dateKey, loadedDrafts);

    return Boolean(savedEntryDateKeys.has(dateKey) || draft?.entries.length || draft?.shortVersion.trim());
  }

  async function saveVacationDays(dateKeys: string[], vacationName: string, hours: number, vacationStatus: VacationStatus = "CONFIRMED", onProgress?: (completed: number, total: number) => void): Promise<TimesheetDayDraft[]> {
    const savedDays: TimesheetDayDraft[] = [];
    const total = dateKeys.length;

    try {
      for (const dateKey of dateKeys) {
        const saveResult = await saveEntryAction(sanitizeDayForSave(createVacationDay(dateKey, vacationName, hours, vacationStatus)));
        const savedDay = withClientIds(saveResult.day);

        showNotionSyncError(saveResult.notionSyncError);
        savedDays.push(savedDay);
        onProgress?.(savedDays.length, total);

        setRecords((current) => ({
          ...current,
          [savedDay.dateKey]: savedDay
        }));
        setSavedRecords((current) => ({
          ...current,
          [savedDay.dateKey]: savedDay
        }));
        setSavedEntryDateKeys((current) => new Set(current).add(savedDay.dateKey));
        setSelectedEntryIdByDate((current) => ({
          ...current,
          [savedDay.dateKey]: savedDay.entries[0]?.clientId ?? ""
        }));
      }
    } finally {
      if (savedDays.length > 0) {
        await refreshVacationColors(savedDays.map((day) => day.dateKey));
        broadcastViewRefresh(["timesheet", "vacations", "notion-cards", "ai-summary", "projects"], "mutation");
      }
    }

    return savedDays;
  }

  function updateVacationEntryForConnectedSave(day: TimesheetDayDraft, vacationName: string, matchVacationName: string, matchVacationStatus: VacationStatus, vacationStatus: VacationStatus): TimesheetDayDraft {
    return {
      ...day,
      entries: day.entries.map((entry) =>
        entry.kind === "VACATION" && entry.vacationStatus === matchVacationStatus && entry.vacationName.trim() === matchVacationName.trim()
          ? { ...entry, vacationName, vacationStatus }
          : entry
      )
    };
  }

  async function saveConnectedVacationDaysPreservingHours(dateKeys: string[], vacationName: string, matchVacationName: string, matchVacationStatus: VacationStatus, vacationStatus: VacationStatus, loadedDrafts: Record<string, TimesheetDayDraft>, onProgress?: (completed: number, total: number) => void): Promise<TimesheetDayDraft[]> {
    const savedDays: TimesheetDayDraft[] = [];
    const total = dateKeys.length;

    try {
      for (const dateKey of dateKeys) {
        const sourceDay = dateKey === selectedDateKey ? selectedDay : getSavedDraftForVacationDate(dateKey, loadedDrafts);

        if (!sourceDay?.entries.some((entry) => entry.kind === "VACATION" && entry.vacationStatus === matchVacationStatus && entry.vacationName.trim() === matchVacationName.trim())) {
          continue;
        }

        const saveResult = await saveEntryAction(sanitizeDayForSave(updateVacationEntryForConnectedSave(sourceDay, vacationName, matchVacationName, matchVacationStatus, vacationStatus)));
        const savedDay = withClientIds(saveResult.day);

        showNotionSyncError(saveResult.notionSyncError);
        savedDays.push(savedDay);
        onProgress?.(savedDays.length, total);

        setRecords((current) => ({
          ...current,
          [savedDay.dateKey]: savedDay
        }));
        setSavedRecords((current) => ({
          ...current,
          [savedDay.dateKey]: savedDay
        }));
        setSavedEntryDateKeys((current) => new Set(current).add(savedDay.dateKey));
        setSelectedEntryIdByDate((current) => ({
          ...current,
          [savedDay.dateKey]: savedDay.entries.find((entry) => entry.kind === "VACATION")?.clientId ?? savedDay.entries[0]?.clientId ?? ""
        }));
      }
    } finally {
      if (savedDays.length > 0) {
        await refreshVacationColors(savedDays.map((day) => day.dateKey));
        broadcastViewRefresh(["timesheet", "vacations", "notion-cards", "ai-summary", "projects"], "mutation");
      }
    }

    return savedDays;
  }

  function createDraftForSelectedDate(current: Record<string, TimesheetDayDraft>): TimesheetDayDraft {
    if (selectedDateKey > todayKey) {
      return createFutureDraftForDate(selectedDateKey);
    }

    const draft = createDraftForDate(selectedDateKey, current);

    if (draft.entries[0]?.kind === "WORK" && !draft.entries[0].project.trim()) {
      void fillPreviousProjectFromDatabase(selectedDateKey, draft.entries[0].clientId);
    }

    return draft;
  }

  function getSelectedEntryIdForDay(dateKey: string, day: TimesheetDayDraft): string {
    const currentSelectedId = selectedEntryIdByDate[dateKey];

    if (currentSelectedId && day.entries.some((entry) => entry.clientId === currentSelectedId)) {
      return currentSelectedId;
    }

    return day.entries[0]?.clientId ?? "";
  }

  function updateSelectedDay(patch: Partial<TimesheetDayDraft>) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const next = {
        ...previous,
        ...patch
      };

      return {
        ...current,
        [selectedDateKey]: next
      };
    });
  }

  function updateSelectedEntry(patch: Partial<TimesheetEntryDraft>) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const selectedId = getSelectedEntryIdForDay(selectedDateKey, previous);
      const entries = previous.entries.map((entry) => entry.clientId === selectedId ? { ...entry, ...patch, hoursTouched: patch.hours !== undefined ? true : entry.hoursTouched } : entry);

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries
        }
      };
    });
  }

  function updateSelectedEntryHours(hours: number) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const selectedId = getSelectedEntryIdForDay(selectedDateKey, previous);
      const entries = previous.entries.map((entry) => {
        if (entry.clientId !== selectedId) {
          return entry;
        }

        const nextEntry = {
          ...entry,
          hours,
          hoursTouched: true
        };

        if (entry.kind !== "WORK" || entry.notionCards.length === 0) {
          return nextEntry;
        }

        try {
          return {
            ...nextEntry,
            notionCards: allocateNotionCardHours({
              entryHours: hours,
              links: entry.notionCards
            })
          };
        } catch {
          return nextEntry;
        }
      });

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries
        }
      };
    });
  }

  function toggleNotionCardForEntry(entryClientId: string, notionPageId: string) {
    resetEntryFeedback();
    setIsDirty(true);
    const selectedCandidates = notionCandidates.candidatesByDate[selectedDateKey] ?? [];

    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const entries = previous.entries.map((entry) => {
        if ((entry.clientId || entry.id) !== entryClientId || entry.kind !== "WORK") {
          return entry;
        }

        const exists = entry.notionCards.some((link) => link.notionPageId === notionPageId);
        const candidate = selectedCandidates.find((card) => card.notionPageId === notionPageId);
        const nextLinks = exists
          ? entry.notionCards.filter((link) => link.notionPageId !== notionPageId)
          : [
              ...entry.notionCards,
              {
                allocatedHours: 0,
                allocationMode: "auto" as const,
                category: candidate?.category ?? "",
                endDate: candidate?.endDate ?? "",
                lastWorkedDate: candidate?.lastWorkedDate ?? "",
                linkedHours: candidate?.linkedHours ?? 0,
                notionPageId,
                source: "manual" as const,
                startDate: candidate?.startDate ?? "",
                status: candidate?.status ?? "",
                title: candidate?.title ?? "",
                workDayCount: candidate?.workDayCount ?? 0
              }
            ];

        try {
          return {
            ...entry,
            notionCards: allocateNotionCardHours({
              entryHours: entry.hours,
              links: nextLinks
            })
          };
        } catch {
          return {
            ...entry,
            notionCards: nextLinks
          };
        }
      });

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries
        }
      };
    });
  }

  function updateNotionCardAllocatedHours(entryClientId: string, notionPageId: string, allocatedHours: number) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const entries = previous.entries.map((entry) => {
        if ((entry.clientId || entry.id) !== entryClientId || entry.kind !== "WORK") {
          return entry;
        }

        const nextLinks = entry.notionCards.map((link) => ({
          ...link,
          allocatedHours: link.notionPageId === notionPageId ? Math.max(allocatedHours, 0) : link.allocatedHours,
          allocationMode: link.notionPageId === notionPageId ? "manual" as const : link.allocationMode
        }));

        try {
          return {
            ...entry,
            notionCards: allocateNotionCardHours({
              entryHours: entry.hours,
              links: nextLinks
            })
          };
        } catch {
          return {
            ...entry,
            notionCards: nextLinks
          };
        }
      });

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries
        }
      };
    });
  }

  function resetNotionCardAutoAllocation(entryClientId: string) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const entries = previous.entries.map((entry) => {
        if ((entry.clientId || entry.id) !== entryClientId || entry.kind !== "WORK") {
          return entry;
        }

        return {
          ...entry,
          notionCards: allocateNotionCardHours({
            entryHours: entry.hours,
            links: entry.notionCards.map((link) => ({
              ...link,
              allocatedHours: 0,
              allocationMode: "auto" as const
            }))
          })
        };
      });

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries
        }
      };
    });
  }

  function updateHolidayName(holidayName: string) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const selectedId = getSelectedEntryIdForDay(selectedDateKey, previous);
      const existingHoliday = previous.entries.find((entry) => entry.clientId === selectedId && entry.kind === "HOLIDAY");

      if (existingHoliday) {
        return {
          ...current,
          [selectedDateKey]: {
            ...previous,
            entries: previous.entries.map((entry) => entry.clientId === selectedId ? { ...entry, holidayName } : entry),
            holidayName
          }
        };
      }

      const entry = {
        ...createEntryForDate(selectedDateKey, current, "HOLIDAY"),
        holidayName,
        sortOrder: previous.entries.length
      };

      setSelectedEntryIdByDate((selected) => ({
        ...selected,
        [selectedDateKey]: entry.clientId
      }));

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries: [...previous.entries, entry],
          holidayName
        }
      };
    });
  }

  async function openVacationRangeModal() {
    if (!selectedIsSingleVacation) {
      return;
    }

    setVacationRangeStart(selectedDateKey);
    setVacationRangeEnd(selectedDateKey);
    setVacationRangeName(selectedEntry?.kind === "VACATION" ? selectedEntry.vacationName : "");
    setVacationRangeHours(selectedEntry?.kind === "VACATION" ? selectedEntry.hours || 8 : 8);
    setVacationRangeStatus(selectedEntry?.kind === "VACATION" ? selectedEntry.vacationStatus : "CONFIRMED");
    setCanEditVacationRangeStart(false);
    setVacationRangeState("idle");
    setVacationRangeError("");
    setVacationRangeMessage("");
    setVacationRangeProgress({ completed: 0, total: 0 });
    setVacationRangeConflictKeys([]);
    setIsVacationRangeOpen(true);

    try {
      const windowKeys = getBusinessDateKeysInRange(addDays(selectedDateKey, -45), addDays(selectedDateKey, 45));
      const loadedDrafts = await loadDateKeysForVacation(windowKeys);
      const baseVacationStatus = selectedEntry?.kind === "VACATION" ? selectedEntry.vacationStatus : "CONFIRMED";
      const baseVacationName = selectedEntry?.kind === "VACATION" ? savedSelectedVacation?.vacationName ?? selectedEntry.vacationName : undefined;
      const boundary = selectedVacationBoundary();
      const leftVacationKeys = boundary?.startsDay ? findConnectedVacationDateKeysInDirection(selectedDateKey, -1, loadedDrafts, baseVacationStatus, baseVacationName) : [];
      const rightVacationKeys = boundary?.endsDay ? findConnectedVacationDateKeysInDirection(selectedDateKey, 1, loadedDrafts, baseVacationStatus, baseVacationName) : [];

      if (leftVacationKeys.length === 0 && rightVacationKeys.length === 0) {
        return;
      }

      const connectedDateKeys = [...leftVacationKeys, selectedDateKey, ...rightVacationKeys].sort();
      const nextStart = leftVacationKeys.length > 0 ? connectedDateKeys[0] ?? selectedDateKey : selectedDateKey;
      const nextEnd = connectedDateKeys[connectedDateKeys.length - 1] ?? selectedDateKey;

      setVacationRangeStart(nextStart);
      setVacationRangeEnd(nextEnd);
      setCanEditVacationRangeStart(leftVacationKeys.length > 0);
      setVacationRangeMessage(`연결된 휴가를 감지해서 ${formatKoreanDate(nextStart)} - ${formatKoreanDate(nextEnd)} 범위를 자동으로 채웠습니다.`);
    } catch {
      setVacationRangeMessage("연결된 휴가 확인에 실패했습니다. 선택 날짜부터 직접 끝 날짜를 지정해 주세요.");
    }
  }

  function closeVacationRangeModal() {
    if (vacationRangeState === "saving") {
      return;
    }

    setIsVacationRangeOpen(false);
    setCanEditVacationRangeStart(false);
    setVacationRangeConflictKeys([]);
    setVacationRangeError("");
    setVacationRangeMessage("");
    setVacationRangeProgress({ completed: 0, total: 0 });
  }

  async function applyVacationRange(confirmReplace = false, vacationStatus: VacationStatus = vacationRangeStatus) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vacationRangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(vacationRangeEnd)) {
      setVacationRangeState("error");
      setVacationRangeError("시작날짜와 끝날짜를 선택해 주세요.");
      return;
    }

    if (vacationRangeEnd < vacationRangeStart) {
      setVacationRangeState("error");
      setVacationRangeError("끝나는 날짜는 시작 날짜보다 과거일 수 없습니다.");
      return;
    }

    if (getInclusiveDateSpan(vacationRangeStart, vacationRangeEnd) > 30) {
      setVacationRangeState("error");
      setVacationRangeError("기간 설정은 최대 30일까지 가능합니다.");
      return;
    }

    const businessDateKeys = getBusinessDateKeysInRange(vacationRangeStart, vacationRangeEnd);

    setVacationRangeState("saving");
    setVacationRangeError("");
    setVacationRangeMessage("");
    setVacationRangeProgress({ completed: 0, total: 0 });

    try {
      const loadedDrafts = await loadDateKeysForVacation(businessDateKeys);
      const holidayKeys = businessDateKeys.filter((dateKey) => isHolidayVacationDate(dateKey, loadedDrafts));
      const targetDateKeys = businessDateKeys.filter((dateKey) => !holidayKeys.includes(dateKey));
      const conflictKeys = targetDateKeys.filter((dateKey) => hasReplaceableRecord(dateKey, loadedDrafts));

      if (conflictKeys.length > 0 && !confirmReplace) {
        setVacationRangeConflictKeys(conflictKeys);
        setVacationRangeProgress({ completed: 0, total: 0 });
        setVacationRangeState("idle");
        return;
      }

      if (targetDateKeys.length === 0) {
        setVacationRangeState("error");
        setVacationRangeError("저장할 업무일이 없습니다.");
        setVacationRangeMessage(holidayKeys.length > 0 ? `공휴일 ${holidayKeys.length}일 제외` : "");
        return;
      }

      setVacationRangeProgress({ completed: 0, total: targetDateKeys.length });
      const savedDays = await saveVacationDays(targetDateKeys, vacationRangeName, vacationRangeHours, vacationStatus, (completed, total) => {
        setVacationRangeProgress({ completed, total });
      });
      const selectedSavedDay = savedDays.find((day) => day.dateKey === selectedDateKey);

      if (selectedSavedDay) {
        setSelectedEntryIdByDate((current) => ({
          ...current,
          [selectedDateKey]: selectedSavedDay.entries[0]?.clientId ?? ""
        }));
      }

      setVacationRangeState("idle");
      setVacationRangeConflictKeys([]);
      setVacationRangeMessage(`휴가 ${savedDays.length}일 저장됨${holidayKeys.length > 0 ? `, 공휴일 ${holidayKeys.length}일 제외` : ""}`);
      setIsDirty(false);
      setSaveState("saved");
      setIsVacationRangeOpen(false);
    } catch {
      setVacationRangeState("error");
      setVacationRangeError("휴가 기간을 저장하지 못했습니다. 저장된 날짜가 있다면 화면에 반영되어 있습니다.");
    }
  }

  async function findConnectedVacationPrompt(
    matchVacationStatus: VacationStatus = selectedEntry?.vacationStatus ?? "CONFIRMED",
    actionLabel = "저장",
    nextVacationStatus: VacationStatus = matchVacationStatus
  ): Promise<ConnectedVacationPrompt | null> {
    if (selectedEntry?.kind !== "VACATION") {
      return null;
    }

    const windowKeys = getBusinessDateKeysInRange(addDays(selectedDateKey, -45), addDays(selectedDateKey, 45));
    const loadedDrafts = await loadDateKeysForVacation(windowKeys);
    const savedWasVacation = savedRecords[selectedDateKey]?.entries.some((entry) => entry.kind === "VACATION") ?? false;
    const matchVacationName = savedSelectedVacation?.vacationName ?? selectedEntry.vacationName;
    const boundary = selectedVacationBoundary();
    const leftVacationKeys = boundary?.startsDay ? findConnectedVacationDateKeysInDirection(selectedDateKey, -1, loadedDrafts, matchVacationStatus, matchVacationName) : [];
    const rightVacationKeys = boundary?.endsDay ? findConnectedVacationDateKeysInDirection(selectedDateKey, 1, loadedDrafts, matchVacationStatus, matchVacationName) : [];
    const hasLeftVacation = leftVacationKeys.length > 0;
    const hasRightVacation = rightVacationKeys.length > 0;

    if (!savedWasVacation && hasLeftVacation && hasRightVacation) {
      return null;
    }

    if (!savedWasVacation && !hasLeftVacation && !hasRightVacation) {
      return null;
    }

    const dateKeys = new Set([selectedDateKey]);

    if (savedWasVacation || hasLeftVacation) {
      leftVacationKeys.forEach((dateKey) => dateKeys.add(dateKey));
    }

    if (savedWasVacation || hasRightVacation) {
      rightVacationKeys.forEach((dateKey) => dateKeys.add(dateKey));
    }

    const sortedDateKeys = Array.from(dateKeys).sort();

    if (sortedDateKeys.length <= 1) {
      return null;
    }

    return {
      actionLabel,
      dateKeys: sortedDateKeys,
      matchVacationName,
      matchVacationStatus,
      vacationName: selectedEntry.vacationName,
      vacationStatus: nextVacationStatus
    };
  }

  async function saveConnectedVacationPrompt() {
    if (!connectedVacationPrompt) {
      return;
    }

    setIsConnectedVacationSaving(true);
    setSaveError("");
    setConnectedVacationProgress({ completed: 0, total: 0 });

    try {
      const loadedDrafts = await loadDateKeysForVacation(connectedVacationPrompt.dateKeys);
      const targetDateKeys = connectedVacationPrompt.dateKeys.filter((dateKey) => !isHolidayVacationDate(dateKey, loadedDrafts));
      setConnectedVacationProgress({ completed: 0, total: targetDateKeys.length });
      await saveConnectedVacationDaysPreservingHours(targetDateKeys, connectedVacationPrompt.vacationName, connectedVacationPrompt.matchVacationName, connectedVacationPrompt.matchVacationStatus, connectedVacationPrompt.vacationStatus, loadedDrafts, (completed, total) => {
        setConnectedVacationProgress({ completed, total });
      });
      setConnectedVacationPrompt(null);
      setConnectedVacationProgress({ completed: 0, total: 0 });
      setIsDirty(false);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setSaveError("연결된 휴가를 함께 저장하지 못했습니다.");
    } finally {
      setIsConnectedVacationSaving(false);
    }
  }

  function removeDeletedDates(dateKeys: string[]) {
    setRecords((current) => {
      const next = { ...current };

      for (const dateKey of dateKeys) {
        delete next[dateKey];
      }

      if (dateKeys.includes(selectedDateKey)) {
        const draft = selectedDateKey > todayKey ? createFutureDraftForDate(selectedDateKey) : createDraftForDate(selectedDateKey, next);

        if (draft.entries.length > 0) {
          next[selectedDateKey] = draft;
        }

        setSelectedEntryIdByDate((selected) => ({
          ...selected,
          [selectedDateKey]: draft.entries[0]?.clientId ?? ""
        }));
      }

      return next;
    });
    setSavedRecords((current) => {
      const next = { ...current };

      for (const dateKey of dateKeys) {
        delete next[dateKey];
      }

      return next;
    });
    setSavedEntryDateKeys((current) => {
      const next = new Set(current);

      for (const dateKey of dateKeys) {
        next.delete(dateKey);
      }

      return next;
    });
    setAiRewriteRequests((current) => current.filter((request) => !dateKeys.includes(request.dateKey)));
  }

  async function deleteConnectedVacationPrompt() {
    if (!connectedVacationPrompt) {
      return;
    }

    setIsConnectedVacationSaving(true);
    setDeleteError("");
    setConnectedVacationProgress({ completed: 0, total: 0 });
    let didMutate = false;

    try {
      const loadedDrafts = await loadDateKeysForVacation(connectedVacationPrompt.dateKeys);
      const targetDateKeys = connectedVacationPrompt.dateKeys.filter((dateKey) => !isSavedHolidayDate(dateKey, loadedDrafts));
      setConnectedVacationProgress({ completed: 0, total: targetDateKeys.length });
      let completed = 0;
      const removedDateKeys: string[] = [];

      for (const dateKey of targetDateKeys) {
        const sourceDay = dateKey === selectedDateKey ? selectedDay : getSavedDraftForVacationDate(dateKey, loadedDrafts);
        const preservedEntries =
          sourceDay?.entries.filter(
            (entry) =>
              entry.kind !== "VACATION" ||
              entry.vacationStatus !== connectedVacationPrompt.matchVacationStatus ||
              entry.vacationName.trim() !== connectedVacationPrompt.matchVacationName.trim()
          ) ?? [];

        if (sourceDay && preservedEntries.length > 0) {
          const saveResult = await saveEntryAction(sanitizeDayForSave({
            ...sourceDay,
            entries: preservedEntries.map((entry, index) => ({ ...entry, sortOrder: index }))
          }));
          const savedDay = withClientIds(saveResult.day);

          showNotionSyncError(saveResult.notionSyncError);
          setRecords((current) => ({
            ...current,
            [savedDay.dateKey]: savedDay
          }));
          setSavedRecords((current) => ({
            ...current,
            [savedDay.dateKey]: savedDay
          }));
          setSelectedEntryIdByDate((current) => ({
            ...current,
            [savedDay.dateKey]: savedDay.entries[0]?.clientId ?? ""
          }));
          didMutate = true;
        } else {
          const deleteResult = await deleteEntryAction(dateKey);

          showNotionSyncError(deleteResult.notionSyncError);
          removedDateKeys.push(dateKey);
          didMutate = true;
        }

        completed += 1;
        setConnectedVacationProgress({ completed, total: targetDateKeys.length });
      }

      removeDeletedDates(removedDateKeys);
      setConnectedVacationPrompt(null);
      setConnectedVacationProgress({ completed: 0, total: 0 });
      setIsDirty(false);
      resetEntryFeedback();
    } catch {
      setDeleteState("error");
      setDeleteError("연결된 휴가를 함께 삭제하지 못했습니다.");
    } finally {
      if (didMutate) {
        await refreshVacationColors(connectedVacationPrompt.dateKeys);
        broadcastViewRefresh(["timesheet", "vacations", "notion-cards", "ai-summary", "projects"], "mutation");
      }

      setIsConnectedVacationSaving(false);
    }
  }

  function updateKind(kind: WorkRecordKind) {
    if (selectedDateKey > todayKey && kind === "WORK") {
      return;
    }

    if (!selectedEntry) {
      addEntry(kind);
      return;
    }

    const shouldUseDefaultHours = selectedEntry.kind === "HOLIDAY" && kind !== "HOLIDAY";

    updateSelectedEntry({
      aiTranslation: kind === "WORK" ? selectedEntry.aiTranslation : "",
      content: kind === "WORK" ? selectedEntry.content : "",
      holidayName: kind === "HOLIDAY" ? selectedEntry.holidayName : "",
      hours: kind === "HOLIDAY" ? 0 : shouldUseDefaultHours ? 8 : selectedEntry.hours,
      hoursTouched: kind === "HOLIDAY" ? false : selectedEntry.hoursTouched,
      kind,
      project: kind === "WORK" ? selectedEntry.project || findPreviousProject(selectedDateKey, records) : "",
      vacationName: kind === "VACATION" ? selectedEntry.vacationName : "",
      vacationStatus: kind === "VACATION" ? selectedEntry.vacationStatus : "CONFIRMED"
    });

    recommendPreviousNotionCardsForDraft(selectedDateKey, {
      ...selectedDay,
      entries: [{
        ...selectedEntry,
        kind,
        notionCards: kind === "WORK" ? selectedEntry.notionCards : []
      }]
    });
  }

  function addEntry(kind: WorkRecordKind) {
    const nextKind = selectedDateKey > todayKey && kind === "WORK" ? "VACATION" : kind;
    const entryClientId = createClientId();

    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const entry = {
        ...createEntryForDate(selectedDateKey, current, nextKind),
        clientId: entryClientId,
        sortOrder: previous.entries.length
      };

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries: rebalanceDefaultWorkHours(previous.entries, entry)
        }
      };
    });
    setSelectedEntryIdByDate((selected) => ({
      ...selected,
      [selectedDateKey]: entryClientId
    }));

    if (nextKind === "WORK") {
      recommendPreviousNotionCardsForDraft(selectedDateKey, {
        ...createEmptyDraft(selectedDateKey),
        entries: [{
          ...createEmptyEntryDraft(),
          clientId: entryClientId,
          kind: "WORK"
        }]
      });
    }
  }

  function removeEntry(clientId: string) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const entries = previous.entries.filter((entry) => entry.clientId !== clientId).map((entry, index) => ({ ...entry, sortOrder: index }));
      const nextSelectedId = entries[0]?.clientId ?? "";

      setSelectedEntryIdByDate((selected) => ({
        ...selected,
        [selectedDateKey]: nextSelectedId
      }));

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries
        }
      };
    });
  }

  function moveEntry(clientId: string, direction: -1 | 1) {
    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const currentIndex = previous.entries.findIndex((entry) => entry.clientId === clientId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previous.entries.length) {
        return current;
      }

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries: arrayMove(previous.entries, currentIndex, nextIndex).map((entry, index) => ({ ...entry, sortOrder: index }))
        }
      };
    });
  }

  function handleEntryDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) {
      return;
    }

    resetEntryFeedback();
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForSelectedDate(current);
      const oldIndex = previous.entries.findIndex((entry) => entry.clientId === event.active.id);
      const newIndex = previous.entries.findIndex((entry) => entry.clientId === event.over?.id);

      if (oldIndex < 0 || newIndex < 0) {
        return current;
      }

      return {
        ...current,
        [selectedDateKey]: {
          ...previous,
          entries: arrayMove(previous.entries, oldIndex, newIndex).map((entry, index) => ({ ...entry, sortOrder: index }))
        }
      };
    });
  }

  function selectEntry(clientId: string) {
    setSelectedEntryIdByDate((current) => ({
      ...current,
      [selectedDateKey]: clientId
    }));
    resetEntryFeedback();
  }

  function updateProject(event: ChangeEvent<HTMLSelectElement>) {
    if (event.target.value === newProjectOptionValue) {
      setNewProjectName("");
      setProjectAddState("idle");
      setProjectAddError("");
      setIsProjectModalOpen(true);
      return;
    }

    updateSelectedEntry({ project: event.target.value });
  }

  function closeProjectModal() {
    if (projectAddState === "saving") {
      return;
    }

    setIsProjectModalOpen(false);
    setNewProjectName("");
    setProjectAddState("idle");
    setProjectAddError("");
  }

  async function addProject() {
    const name = newProjectName.trim();

    if (!name) {
      setProjectAddState("error");
      setProjectAddError("프로젝트명을 입력해 주세요.");
      return;
    }

    setProjectAddState("saving");
    setProjectAddError("");

    try {
      const savedProject = await addProjectAction(name);

      setProjects((current) => mergeProjects(current, [savedProject]));
      setNewProjectName("");
      setProjectAddState("idle");
      setIsProjectModalOpen(false);
      updateSelectedEntry({ project: savedProject });
      broadcastViewRefresh(["projects", "timesheet", "ai-summary"], "mutation");
    } catch {
      setProjectAddState("error");
      setProjectAddError("프로젝트를 추가하지 못했습니다.");
    }
  }

  function mergeSavedDays(days: TimesheetDayDraft[]) {
    if (days.length === 0) {
      return;
    }

    const nextDays = days.map(withClientIds);
    updateAiRewriteRequestsFromDays(nextDays);

    setRecords((current) => ({
      ...current,
      ...Object.fromEntries(nextDays.map((day) => [day.dateKey, day]))
    }));
    setSavedRecords((current) => ({
      ...current,
      ...Object.fromEntries(nextDays.map((day) => [day.dateKey, day]))
    }));
    setSavedEntryDateKeys((current) => {
      const next = new Set(current);

      for (const day of nextDays) {
        next.add(day.dateKey);
      }

      return next;
    });
  }

  function updateAiRewriteRequestsFromDays(days: TimesheetDayDraft[]) {
    setAiRewriteRequests((current) => {
      const next = new Map(current.map((request) => [request.dateKey, request]));

      for (const day of days) {
        const request = toAiRewriteRequest(day);

        if (request) {
          next.set(day.dateKey, request);
        } else {
          next.delete(day.dateKey);
        }
      }

      return Array.from(next.values()).sort((left, right) => right.dateKey.localeCompare(left.dateKey));
    });
  }

  async function refreshAiRewriteRequests() {
    try {
      setAiRewriteRequests(await listAiRewriteRequestsAction());
    } catch {
      // The settings modal can still show the last known queue state.
    }
  }

  function shouldPromptForAiRewrite(day: TimesheetDayDraft): boolean {
    const savedDay = savedRecords[day.dateKey];

    if (!savedDay) {
      return false;
    }

    return (
      aiSetting.enabled &&
      aiSetting.apiKeySaved &&
      hasExistingAiFields(savedDay) &&
      hasWorkContentChange(savedDay, day)
    );
  }

  function isScheduledOverwriteActive() {
    const savedDay = savedRecords[selectedDateKey];

    return (
      aiSetting.enabled &&
      aiSetting.apiKeySaved &&
      aiSetting.cleanupMode === "scheduled" &&
      Boolean(selectedDay.aiRewriteRequested || savedDay?.aiRewriteRequested)
    );
  }

  function isSelectedDayScheduledCleanupPending() {
    if (!aiSetting.enabled || !aiSetting.apiKeySaved || aiSetting.cleanupMode !== "scheduled" || isFutureWork) {
      return false;
    }

    const savedDay = savedRecords[selectedDateKey];

    if (!savedDay || !savedEntryDateKeys.has(selectedDateKey)) {
      return false;
    }

    return savedDay.aiRewriteRequested ? hasWorkContent(savedDay) : hasMissingAiFields(savedDay);
  }

  function shouldWarnScheduledOverwriteField() {
    return isScheduledOverwriteActive() && hasWorkContent(selectedDay) && !isFutureWork;
  }

  function promptForScheduledOverwriteEdit(prompt: NonNullable<typeof aiOverwriteEditPrompt>) {
    if (!shouldWarnScheduledOverwriteField() || aiOverwriteEditPrompt) {
      return;
    }

    setAiOverwriteEditPrompt(prompt);
  }

  function updateSelectedShortVersion(value: string) {
    promptForScheduledOverwriteEdit({
      field: "summary",
      previousValue: selectedDay.shortVersion
    });
    updateSelectedDay({ shortVersion: value });
  }

  function updateSelectedAiTranslation(value: string) {
    if (!selectedEntry) {
      return;
    }

    promptForScheduledOverwriteEdit({
      entryClientId: selectedEntry.clientId,
      field: "translation",
      previousValue: selectedEntry.aiTranslation
    });
    updateSelectedEntry({ aiTranslation: value });
  }

  function keepScheduledOverwriteAfterManualEdit() {
    setAiOverwriteEditPrompt(null);
  }

  function revertScheduledOverwriteManualEdit() {
    if (!aiOverwriteEditPrompt) {
      return;
    }

    if (aiOverwriteEditPrompt.field === "summary") {
      updateSelectedDay({ shortVersion: aiOverwriteEditPrompt.previousValue });
    } else {
      updateSelectedEntry({ aiTranslation: aiOverwriteEditPrompt.previousValue });
    }

    setAiOverwriteEditPrompt(null);
  }

  function disableScheduledOverwriteAfterManualEdit() {
    updateSelectedDay({ aiRewriteRequested: false });
    setAiOverwriteEditPrompt(null);
  }

  async function runAiCleanup(dateKey: string, options?: AiCleanupOptions) {
    setAiCleanupDateKey(dateKey);

    if (!aiSetting.enabled || !aiSetting.apiKeySaved) {
      setAiCleanupState("skipped");
      setAiCleanupMessage(!aiSetting.enabled ? "AI 자동 정리 꺼짐" : "Gemini API key 없음");
      return;
    }

    setAiCleanupState("running");
    setAiCleanupMessage("AI 정리 중");

    try {
      const result = await runAiCleanupAction(dateKey, options);

      mergeSavedDays(result.days);
      setAiCleanupState(result.skipped ? "skipped" : "done");
      setAiCleanupMessage(result.message);
      broadcastViewRefresh(["timesheet", "ai-summary"], "mutation");
    } catch (error) {
      setAiCleanupState("error");
      setAiCleanupMessage(error instanceof Error ? error.message : "AI 정리에 실패했습니다.");
    }
  }

  async function saveSelectedDraft(options: { forceImmediateAiAfterSave?: boolean; overwriteAiAfterSave?: boolean; skipAiRewritePrompt?: boolean; skipConnectedVacation?: boolean; vacationActionLabel?: string; vacationStatus?: VacationStatus } = {}) {
    if (selectedEntry?.kind === "VACATION" && !options.skipConnectedVacation) {
      try {
        const prompt = await findConnectedVacationPrompt(selectedEntry.vacationStatus, options.vacationActionLabel, options.vacationStatus ?? selectedEntry.vacationStatus);

        if (prompt) {
          setConnectedVacationProgress({ completed: 0, total: 0 });
          setConnectedVacationAction("save");
          setConnectedVacationPrompt(prompt);
          return;
        }
      } catch {
        setSaveState("error");
        setSaveError("연결된 휴가를 확인하지 못했습니다.");
        return;
      }
    }

    const dayToSave =
      selectedEntry?.kind === "VACATION" && options.vacationStatus
        ? {
            ...selectedDay,
            entries: selectedDay.entries.map((entry) => (entry.clientId === selectedEntry.clientId ? { ...entry, vacationStatus: options.vacationStatus! } : entry))
          }
        : selectedDay;
    const sanitizedEntry = sanitizeDayForSave(dayToSave);
    const shouldScheduleAiRewrite =
      Boolean(options.overwriteAiAfterSave) &&
      aiSetting.cleanupMode === "scheduled" &&
      !options.forceImmediateAiAfterSave;
    const entry = {
      ...sanitizedEntry,
      aiRewriteRequested: shouldScheduleAiRewrite ? true : sanitizedEntry.aiRewriteRequested
    };

    if (!options.forceImmediateAiAfterSave && !options.skipAiRewritePrompt && shouldPromptForAiRewrite(entry)) {
      setAiRewritePromptDateKey(entry.dateKey);
      return;
    }

    const selectedIndexBeforeSave = selectedDay.entries.findIndex((dayEntry) => dayEntry.clientId === selectedEntryId);
    const isNewSavedDate = !savedEntryDateKeys.has(entry.dateKey);

    setSaveState("saving");
    setSaveError("");
    setDeleteState("idle");
    setDeleteError("");

    try {
      const saveResult = await saveEntryAndNotify(entry);
      const savedEntry = withClientIds(saveResult.day);

      updateAiRewriteRequestsFromDays([savedEntry]);
      notionCandidates.updateCandidatesFromDay(savedEntry);
      showNotionSyncError(saveResult.notionSyncError);
      setRecords((current) => ({
        ...current,
        [savedEntry.dateKey]: savedEntry
      }));
      setSavedRecords((current) => ({
        ...current,
        [savedEntry.dateKey]: savedEntry
      }));
      setSavedEntryDateKeys((current) => new Set(current).add(savedEntry.dateKey));
      setSelectedEntryIdByDate((current) => ({
        ...current,
        [savedEntry.dateKey]: savedEntry.entries[Math.max(selectedIndexBeforeSave, 0)]?.clientId ?? savedEntry.entries[0]?.clientId ?? ""
      }));
      if (isNewSavedDate) {
        setCelebratingDateKey(savedEntry.dateKey);
      }
      setIsDirty(false);
      setSaveState("saved");
      if (
        options.forceImmediateAiAfterSave ||
        aiSetting.cleanupMode === "immediate" ||
        (options.overwriteAiAfterSave && aiSetting.cleanupMode === "manual")
      ) {
        void runAiCleanup(
          savedEntry.dateKey,
          options.forceImmediateAiAfterSave || options.overwriteAiAfterSave ? { overwriteCurrentDate: true } : undefined
        );
      }
    } catch {
      setSaveState("error");
      setSaveError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function isSaveDisabled() {
    return isSelectedWeekend || isFutureWork || saveState === "saving" || deleteState === "deleting" || vacationRangeState === "saving";
  }

  function requestDeleteSelectedDate() {
    if (!canDeleteSelected || deleteState === "deleting") {
      return;
    }

    setIsDeleteConfirmOpen(true);
  }

  function confirmDeleteSelectedDate() {
    setIsDeleteConfirmOpen(false);
    void deleteSelectedEntry();
  }

  function handleWorkspaceKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Delete" && !isTextEditingTarget(event.target) && canDeleteSelected && deleteState !== "deleting") {
      event.preventDefault();
      requestDeleteSelectedDate();
      return;
    }

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !isSaveDisabled()) {
      event.preventDefault();
      void saveSelectedDraft();
    }
  }

  const shortcutModalOpen = Boolean(
    editingNotionEntryClientId
    || isDeleteConfirmOpen
    || isProjectModalOpen
    || isSettingsOpen
    || isAiRewriteQueueOpen
    || pendingNavigation
    || isVacationRangeOpen
    || connectedVacationPrompt
    || aiRewritePromptDateKey
    || aiOverwriteEditPrompt
  );

  useEffect(() => {
    if (!isDailyEditorModalActive) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const frameId = requestAnimationFrame(() => dailyEditorRef.current?.focus());

    document.body.style.overflow = "hidden";

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !event.isComposing && !shortcutModalOpen) {
        event.preventDefault();
        closeDailyEditor();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      cancelAnimationFrame(frameId);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isDailyEditorModalActive, shortcutModalOpen]);

  useEffect(() => {
    if (!isDailyEditorModalActive) {
      return;
    }

    const frameId = requestAnimationFrame(() => dailyEditorRef.current?.scrollTo({ top: 0 }));

    return () => cancelAnimationFrame(frameId);
  }, [isDailyEditorModalActive, selectedDateKey]);

  useEffect(() => {
    function handleCalendarShortcut(event: globalThis.KeyboardEvent) {
      if (shouldIgnoreCalendarShortcut(event, shortcutModalOpen) || monthLoadState === "loading") {
        return;
      }

      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        setViewMode((current) => current === "calendar" ? "list" : "calendar");
        return;
      }

      if (event.key === "j" || event.key === "k" || event.key === "t") {
        event.preventDefault();

        if (event.key === "j") moveMonth(-1);
        if (event.key === "k") moveMonth(1);
        if (event.key === "t") goToday();
        return;
      }

      if (viewMode === "list" && event.key === "f") {
        event.preventDefault();
        updateShowFullListContent(!showFullListContent);
        return;
      }

      if (viewMode === "list" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        const target = adjacentListTarget(listNavigationTargets, selectedDateKey, selectedEntryId, event.key === "ArrowUp" ? -1 : 1);

        if (target?.entryClientId) {
          selectDateEntry(target.dateKey, target.entryClientId);
        } else if (target) {
          selectDate(target.dateKey);
        }

        return;
      }

      if (viewMode !== "calendar") {
        return;
      }

      const dayDelta = event.key === "ArrowUp" ? -7 : event.key === "ArrowDown" ? 7 : 0;
      const businessDirection = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;

      if (!dayDelta && !businessDirection) {
        return;
      }

      event.preventDefault();
      selectDate(dayDelta ? addDays(selectedDateKey, dayDelta) : addBusinessDays(selectedDateKey, businessDirection as -1 | 1));
    }

    window.addEventListener("keydown", handleCalendarShortcut);
    return () => window.removeEventListener("keydown", handleCalendarShortcut);
  });

  async function deleteSelectedEntry(options: { skipConnectedVacation?: boolean } = {}) {
    if (!canDeleteSelected || deleteState === "deleting") {
      return;
    }

    if (selectedIsSingleVacation && !options.skipConnectedVacation) {
      try {
        const prompt = await findConnectedVacationPrompt();

        if (prompt) {
          setConnectedVacationProgress({ completed: 0, total: 0 });
          setConnectedVacationAction("delete");
          setConnectedVacationPrompt(prompt);
          return;
        }
      } catch {
        setDeleteState("error");
        setDeleteError("연결된 휴가를 확인하지 못했습니다.");
        return;
      }
    }

    setDeleteState("deleting");
    setDeleteError("");

    try {
      const deleteResult = await deleteEntryAndNotify(selectedDateKey);

      showNotionSyncError(deleteResult.notionSyncError);
      removeDeletedDates([selectedDateKey]);
      setIsDirty(false);
      resetEntryFeedback();
    } catch {
      setDeleteState("error");
      setDeleteError("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  if (isInitialMonthSyncing) {
    return (
      <AppLoadingScreen
        description="현재 날짜 기준으로 공휴일과 기록을 확인하고 있습니다."
        title="월간 업무 기록을 불러오는 중"
      />
    );
  }

  return (
    <>
      <div
        className={cn(
          "mx-auto grid max-w-[1600px] gap-4 px-4 pb-0 pt-4",
          (viewMode === "calendar" || isDailyEditorRequested) &&
            "lg:grid-cols-[minmax(680px,1fr)_420px] xl:grid-cols-[minmax(760px,1fr)_460px]"
        )}
        onKeyDown={handleWorkspaceKeyDown}
      >
        <section
          aria-busy={monthLoadState === "loading"}
          aria-label={viewMode === "calendar" ? "업무 기록 캘린더" : "업무 기록 목록"}
          className="relative min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
          ref={workspaceViewRef}
          tabIndex={-1}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button className="h-11 w-11 shrink-0 p-0" disabled={monthLoadState === "loading"} onClick={() => moveMonth(-1)} title="이전 달 (J)" variant="ghost">
                <ChevronLeft aria-hidden="true" className="h-10 w-10 stroke-3" />
                <span className="sr-only">이전 달</span>
              </Button>
              <div className="min-w-44 text-center">
                <h2 className="text-lg font-bold text-slate-950">{getMonthLabel(monthCursor.year, monthCursor.monthIndex)}</h2>
              </div>
              <Button className="h-11 w-11 shrink-0 p-0" disabled={monthLoadState === "loading"} onClick={() => moveMonth(1)} title="다음 달 (K)" variant="ghost">
                <ChevronRight aria-hidden="true" className="h-10 w-10 stroke-3" />
                <span className="sr-only">다음 달</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewMode === "list" ? (
                <button
                  aria-label={showFullListContent ? "내용 줄여 보기" : "내용 전체 보기"}
                  aria-pressed={showFullListContent}
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100",
                    showFullListContent && "bg-slate-100 text-slate-950"
                  )}
                  onClick={() => updateShowFullListContent(!showFullListContent)}
                  title={showFullListContent ? "내용 줄여 보기 (F)" : "내용 전체 보기 (F)"}
                  type="button"
                >
                  <WrapText aria-hidden="true" className="size-5" strokeWidth={2.4} />
                </button>
              ) : null}
              <Button className="h-9 px-3" disabled={monthLoadState === "loading"} onClick={goToday} title="오늘 (T)" variant="secondary">
                <TimerReset aria-hidden="true" className="size-4" />
                오늘
              </Button>
              <SegmentedControl
                items={[
                  { icon: <CalendarDays aria-hidden="true" className="size-4" />, label: "캘린더", title: "캘린더 (Tab)", value: "calendar" },
                  { icon: <ListChecks aria-hidden="true" className="size-4" />, label: "리스트", title: "리스트 (Tab)", value: "list" }
                ]}
                onChange={setViewMode}
                value={viewMode}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-2 py-2 sm:px-4 sm:py-3">
            <Metric icon={CalendarDays} label="업무일" value={`${businessDayCount}일`} />
            <Metric icon={Sparkles} label="입력완료" value={`${completedCount}일`} />
            <Metric icon={Search} label="입력안됨" tone="red" value={`${missingCount}일`} />
            <Metric icon={Clock3} label="휴가" value={vacationMetricValue} />
          </div>

          {holidayWarning ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              공휴일 정보를 불러오지 못했습니다. 설정에서 API 키를 확인해주세요. {holidayWarning}
            </div>
          ) : null}

          {monthLoadState === "error" ? (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              월 데이터를 불러오지 못했습니다. {monthLoadError}
            </div>
          ) : null}

          {viewMode === "calendar" ? (
            <CalendarView
              celebratingDateKey={celebratingDateKey}
              rows={rows}
              selectedDateKey={selectedDateKey}
              setSelectedDateKey={selectDate}
              todayKey={todayKey}
              vacationColors={visibleVacationColors}
              weeks={calendarWeeks}
            />
          ) : (
            <ListView
              dateKeys={listDateKeys}
              rows={rows}
              savedRecords={savedRecords}
              selectedDateKey={selectedDateKey}
              selectedEntryId={selectedEntryId}
              selectedRowKey={selectedListRowKey}
              setSelectedDateKey={selectDate}
              setSelectedEntry={selectDateEntry}
              showFullContent={showFullListContent}
            />
          )}

          {monthLoadState === "loading" ? (
            <AppLoadingOverlay
              description="선택한 월의 업무 기록을 준비하고 있습니다."
              title="월 데이터를 불러오는 중"
            />
          ) : null}
        </section>

        {viewMode === "calendar" || isDailyEditorRequested ? (
          <DailyEditor
            ai={{
              cleanupMessage: aiCleanupMessage,
              cleanupState: aiCleanupState,
              isCleanupStatusVisible: aiCleanupDateKey === selectedDateKey && aiCleanupState !== "idle",
              isScheduledCleanupPending: isSelectedDayScheduledCleanupPending()
            }}
            day={{
              dateKey: selectedDateKey,
              draft: selectedDay,
              editorKind: selectedEditorKind,
              hasWork: selectedHasWork,
              isFutureWork,
              isHoliday: selectedIsHoliday,
              isSingleVacation: selectedIsSingleVacation,
              isViewingToday,
              isWeekend: isSelectedWeekend,
              kindOptions: editorKindOptions,
              selectedEntry,
              totalHours: selectedTotalHours
            }}
            editing={{
              isProjectRecommendationLoading: isSelectedProjectRecommendationLoading,
              newProjectOptionValue,
              onAiTranslationChange: updateSelectedAiTranslation,
              onContentChange: (value) => updateSelectedEntry({ content: value }),
              onHolidayNameChange: updateHolidayName,
              onHoursChange: updateSelectedEntryHours,
              onKindChange: updateKind,
              onProjectChange: updateProject,
              onSelectedEntryChange: updateSelectedEntry,
              onShortVersionChange: updateSelectedShortVersion,
              projects
            }}
            entryList={{
              onAddEntry: addEntry,
              onDragEnd: handleEntryDragEnd,
              onMoveEntry: moveEntry,
              onRemoveEntry: removeEntry,
              onSelectEntry: selectEntry
            }}
            navigation={{
              closeButtonRef: closeEditorButtonRef,
              editorRef: dailyEditorRef,
              isActive: isDailyEditorModalActive,
              isMonthLoading: monthLoadState === "loading",
              isRequested: isDailyEditorRequested,
              onClose: closeDailyEditor,
              onFocusCapture: () => setIsDailyEditorRequested(true),
              onGoToday: goToday,
              onSelectDate: selectDate,
              showCloseButton: viewMode === "list" || isDailyEditorModalActive
            }}
            notion={{
              allocationError: selectedNotionAllocationError,
              candidates: notionCandidates.candidatesByDate[selectedDateKey] ?? [],
              cardDateRanges: monthCardDateRanges,
              isRecommendationLoading: isSelectedNotionRecommendationLoading,
              onAllocatedHoursChange: (notionPageId, allocatedHours) => updateNotionCardAllocatedHours(selectedNotionEntryClientId, notionPageId, allocatedHours),
              onOpenPicker: () => {
                setIncludeDoneNotionCandidates(false);
                setEditingNotionEntryClientId(selectedNotionEntryClientId);
                notionCandidates.loadCandidates({
                  dateKey: selectedDateKey,
                  includeDone: false,
                  linkedPageIds: selectedEntryLinkedNotionPageIds
                });
              },
              onRemoveCard: (notionPageId) => toggleNotionCardForEntry(selectedNotionEntryClientId, notionPageId),
              onResetAutoAllocation: () => resetNotionCardAutoAllocation(selectedNotionEntryClientId)
            }}
            persistence={{
              canDelete: canDeleteSelected,
              deleteError,
              deleteState,
              isSaveDisabled: isSaveDisabled(),
              onSave: (event) => void saveSelectedDraft({ forceImmediateAiAfterSave: event.ctrlKey || event.metaKey }),
              onSaveWithVacationAction: (action) => void saveSelectedDraft({ vacationActionLabel: action.label, vacationStatus: action.status }),
              onRequestDelete: requestDeleteSelectedDate,
              primaryVacationSaveAction: primarySelectedVacationSaveAction,
              saveError,
              saveState,
              secondaryVacationSaveActions: secondarySelectedVacationSaveActions,
              shortcutModifierKey
            }}
            vacation={{
              isRangeSaving: vacationRangeState === "saving",
              onOpenRangeModal: () => void openVacationRangeModal()
            }}
          />
        ) : null}
      </div>

      {isSettingsOpen ? (
        <SettingsModal {...settingsModalProps} />
      ) : null}

      {isAiRewriteQueueOpen ? (
        <AiRewriteQueueModal
          cleanupMode={rewriteQueueCleanupMode}
          onClose={() => setIsAiRewriteQueueOpen(false)}
          requests={aiRewriteRequests}
        />
      ) : null}

      {isProjectModalOpen ? (
        <ProjectCreateModal
          error={projectAddState === "error" ? projectAddError : ""}
          name={newProjectName}
          onClose={closeProjectModal}
          onNameChange={setNewProjectName}
          onSubmit={() => {
            void addProject();
          }}
          saving={projectAddState === "saving"}
        />
      ) : null}

      {isVacationRangeOpen ? (
        <VacationRangeModal
          canEditStart={canEditVacationRangeStart}
          conflictCount={vacationRangeConflictKeys.length}
          error={vacationRangeError}
          fallbackStatus={vacationRangeStatus}
          message={vacationRangeMessage}
          onApply={(confirmReplace, status) => void applyVacationRange(confirmReplace, status)}
          onClose={closeVacationRangeModal}
          onEndChange={(value) => { setVacationRangeEnd(value); setVacationRangeConflictKeys([]); }}
          onHoursChange={setVacationRangeHours}
          onNameChange={setVacationRangeName}
          onStartChange={(value) => { setVacationRangeStart(value); setVacationRangeConflictKeys([]); if (vacationRangeEnd < value) setVacationRangeEnd(value); }}
          primaryAction={primaryVacationRangeSaveAction}
          progress={vacationRangeProgress}
          rangeEnd={vacationRangeEnd}
          rangeHours={vacationRangeHours}
          rangeName={vacationRangeName}
          rangeStart={vacationRangeStart}
          saving={vacationRangeState === "saving"}
          secondaryActions={secondaryVacationRangeSaveActions}
          showError={vacationRangeState === "error"}
        />
      ) : null}

      {connectedVacationPrompt && connectedVacationAction === "delete" ? (
        <ConnectedVacationDeleteModal
          dateCount={connectedVacationPrompt.dateKeys.length}
          endDateKey={connectedVacationPrompt.dateKeys[connectedVacationPrompt.dateKeys.length - 1]!}
          onCancel={() => setConnectedVacationPrompt(null)}
          onDeleteAll={() => void deleteConnectedVacationPrompt()}
          onDeleteCurrentDate={() => { setConnectedVacationPrompt(null); void deleteSelectedEntry({ skipConnectedVacation: true }); }}
          progress={connectedVacationProgress}
          saving={isConnectedVacationSaving}
          startDateKey={connectedVacationPrompt.dateKeys[0]!}
        />
      ) : null}

      {connectedVacationPrompt && connectedVacationAction === "save" ? (
        <ConnectedVacationSaveModal
          actionLabel={connectedVacationPrompt.actionLabel}
          dateCount={connectedVacationPrompt.dateKeys.length}
          endDateKey={connectedVacationPrompt.dateKeys[connectedVacationPrompt.dateKeys.length - 1]!}
          onCancel={() => setConnectedVacationPrompt(null)}
          onSaveAll={() => void saveConnectedVacationPrompt()}
          onSaveCurrentDate={() => { setConnectedVacationPrompt(null); void saveSelectedDraft({ skipConnectedVacation: true, vacationStatus: connectedVacationPrompt.vacationStatus }); }}
          progress={connectedVacationProgress}
          saving={isConnectedVacationSaving}
          startDateKey={connectedVacationPrompt.dateKeys[0]!}
        />
      ) : null}

      {aiRewritePromptDateKey ? (
        <AiRewritePromptModal
          dateKey={aiRewritePromptDateKey}
          onCancel={() => setAiRewritePromptDateKey("")}
          onSaveOnly={() => { setAiRewritePromptDateKey(""); void saveSelectedDraft({ skipAiRewritePrompt: true }); }}
          onSaveWithAi={() => { setAiRewritePromptDateKey(""); void saveSelectedDraft({ overwriteAiAfterSave: true, skipAiRewritePrompt: true }); }}
          scheduled={aiSetting.cleanupMode === "scheduled"}
        />
      ) : null}

      {aiOverwriteEditPrompt ? (
        <AiOverwritePromptModal
          isSummary={aiOverwriteEditPrompt.field === "summary"}
          onDisable={disableScheduledOverwriteAfterManualEdit}
          onKeep={keepScheduledOverwriteAfterManualEdit}
          onRevert={revertScheduledOverwriteManualEdit}
        />
      ) : null}

      {isDeleteConfirmOpen ? (
        <DeleteConfirmModal
          dateKey={selectedDateKey}
          isDeleting={deleteState === "deleting"}
          onCancel={() => setIsDeleteConfirmOpen(false)}
          onConfirm={confirmDeleteSelectedDate}
        />
      ) : null}

      {notionSyncError ? (
        <NotionSyncErrorModal error={notionSyncError} onClose={() => setNotionSyncError("")} />
      ) : null}

      <NotionCardPickerModal
        candidates={notionCandidates.candidatesByDate[selectedDateKey] ?? []}
        error={notionCandidates.error}
        includeDone={includeDoneNotionCandidates}
        isLoading={notionCandidates.isPending}
        linkedPageIds={getEditingNotionLinkedPageIds()}
        onClose={() => {
          setEditingNotionEntryClientId(null);
          setIncludeDoneNotionCandidates(false);
        }}
        onIncludeDoneChange={(includeDone) => {
          setIncludeDoneNotionCandidates(includeDone);
          refreshNotionCandidatesForEditing(includeDone);
        }}
        onRefresh={() => refreshNotionCandidatesForEditing()}
        onToggleCard={(notionPageId) => {
          if (editingNotionEntryClientId) {
            toggleNotionCardForEntry(editingNotionEntryClientId, notionPageId);
          }
        }}
        open={Boolean(editingNotionEntryClientId)}
        sync={notionCandidates.syncByDate[selectedDateKey]}
      />

      {pendingNavigation ? (
        <PendingNavigationConfirmModal
          kind={pendingNavigation.kind === "closeEditor" ? "closeEditor" : "navigate"}
          onCancel={cancelPendingNavigation}
          onConfirm={confirmPendingNavigation}
        />
      ) : null}
    </>
  );
}

function getSystemModifierKey(): string {
  if (typeof navigator === "undefined") {
    return "Ctrl";
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  return platform.includes("mac") || userAgent.includes("mac os") ? "⌘" : "Ctrl";
}

function isTextEditingTarget(target: EventTarget): boolean {
  const element = target instanceof HTMLElement ? target : null;

  if (!element) {
    return false;
  }

  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

