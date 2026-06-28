"use client";

import { CSS } from "@dnd-kit/utilities";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import confetti from "canvas-confetti";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";

import {
  allocateNotionCardHours,
  createEmptyDraft,
  createEmptyEntryDraft,
  formatKoreanDate,
  getBusinessCalendarWeeks,
  getBusinessDateKeysUntil,
  getDisplayContent,
  getMonthLabel,
  isWeekendDateKey,
  parseDateKey,
  resolveStatus,
  statusLabel,
  toBrowserDateKey,
  type TimesheetRow,
  type TimesheetStatus,
  type TimesheetDayDraft,
  type TimesheetEntryDraft,
  type TimesheetEntryNotionCardDraft,
  type WorkRecordKind
} from "@timesheet/domain";
import { Badge, Button, Input, Label, SegmentedControl, Textarea, cn } from "@timesheet/ui";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  ListChecks,
  Plus,
  Trash2,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  TimerReset,
  type LucideIcon
} from "lucide-react";

import { NotionCardLinkSection } from "./notion-card-link-section";
import { NotionCardPickerModal } from "./notion-card-picker-modal";
import { useNotionCardCandidates, type LoadNotionCardCandidatesInput, type NotionCardCandidatesResult } from "./use-notion-card-candidates";

type ViewMode = "calendar" | "list";

type UserRole = "ADMIN" | "USER";
type AiCleanupMode = "immediate" | "manual" | "scheduled";

type ManagedUser = {
  email: string;
  id: string;
  role: UserRole;
  username: string;
};

type TimesheetMonthData = {
  entries: TimesheetDayDraft[];
  holidayWarning?: string;
  holidays: Array<{ dateKey: string; name: string }>;
  projects: string[];
  vacations: Array<{ dateKey: string; hours: number; name: string }>;
};

type HolidayApiKeyTestResult = {
  holidays: Array<{ dateKey: string; name: string }>;
  ok: boolean;
};

type UserAiSetting = {
  apiKeySaved: boolean;
  backfillLimit: number;
  backfillMissing: boolean;
  contextDays: number;
  cleanupMode: AiCleanupMode;
  enabled: boolean;
  model: string;
  provider: "GEMINI";
};

type UserAiSettingUpdate = {
  apiKey?: string;
  backfillLimit: number;
  backfillMissing: boolean;
  clearApiKey?: boolean;
  contextDays: number;
  cleanupMode: AiCleanupMode;
  enabled: boolean;
  model: string;
};

type NotionWeeklyDefaultCard = {
  allocatedHours: number;
  category: string;
  enabled: boolean;
  endDate: string;
  notionPageId: string;
  startDate: string;
  status: string;
  title: string;
  weekday: number;
};

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

type GeminiApiKeyTestResult = {
  ok: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type AiCleanupState = "idle" | "running" | "done" | "skipped" | "error";
type DeleteState = "idle" | "deleting" | "error";
type ProjectAddState = "idle" | "saving" | "error";
type SettingsSaveState = "idle" | "saving" | "saved" | "error";
type HolidayResetState = "idle" | "saving" | "saved" | "error";
type VacationRangeSaveState = "idle" | "saving" | "error";
type MonthLoadState = "idle" | "loading" | "error";
type PendingNavigation =
  | { kind: "date"; dateKey: string; entryClientId?: string }
  | { delta: number; kind: "month" }
  | { kind: "today" };

type ConnectedVacationPrompt = {
  dateKeys: string[];
  hours: number;
  vacationName: string;
};
type ConnectedVacationAction = "delete" | "save";

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

const weekdays = ["월", "화", "수", "목", "금"];
const todayRefreshIntervalMs = 60_000;

const badgeToneByStatus: Record<TimesheetStatus, "blue" | "gray" | "green" | "orange" | "white"> = {
  COMPLETED: "green",
  FUTURE: "gray",
  HOLIDAY: "orange",
  MISSING: "white",
  VACATION: "blue"
};

const cellToneByStatus: Record<TimesheetStatus, string> = {
  COMPLETED: "border-emerald-200 bg-white hover:border-emerald-300",
  FUTURE: "border-slate-200 bg-slate-100 text-slate-400",
  HOLIDAY: "border-orange-200 bg-orange-50/80 hover:border-orange-300",
  MISSING: "border-slate-200 bg-white hover:border-slate-300",
  VACATION: "border-blue-200 bg-blue-50/80 hover:border-blue-300"
};

const newProjectOptionValue = "__new_project__";

const kindOptions: Array<{ label: string; value: WorkRecordKind }> = [
  { label: "업무", value: "WORK" },
  { label: "휴가", value: "VACATION" },
  { label: "공휴일", value: "HOLIDAY" }
];

const aiModelPresets = [
  { label: "빠름/저렴 - gemini-3.1-flash-lite", value: "gemini-3.1-flash-lite" },
  { label: "균형 - gemini-3.5-flash", value: "gemini-3.5-flash" },
  { label: "안정 대안 - gemini-2.5-flash", value: "gemini-2.5-flash" },
  { label: "품질 우선 - gemini-2.5-pro", value: "gemini-2.5-pro" },
  { label: "직접 입력", value: "__custom__" }
];

function truncateContent(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 42) {
    return trimmed;
  }

  return `${trimmed.slice(0, 42)}...`;
}

function createClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `entry-${Date.now()}-${Math.random()}`;
}

function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toBrowserDateKey(date);
}

function addBusinessDays(dateKey: string, direction: -1 | 1): string {
  let next = addDays(dateKey, direction);

  while (isWeekendDateKey(next)) {
    next = addDays(next, direction);
  }

  return next;
}

function getBusinessDateKeysInRange(startDateKey: string, endDateKey: string): string[] {
  const start = startDateKey <= endDateKey ? startDateKey : endDateKey;
  const end = startDateKey <= endDateKey ? endDateKey : startDateKey;
  const dateKeys: string[] = [];
  const cursor = parseDateKey(start);

  while (toBrowserDateKey(cursor) <= end) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey)) {
      dateKeys.push(dateKey);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

function getDateKeyMonthCursor(dateKey: string): { monthIndex: number; year: number } {
  const date = parseDateKey(dateKey);

  return {
    monthIndex: date.getMonth(),
    year: date.getFullYear()
  };
}

function getInclusiveDateSpan(startDateKey: string, endDateKey: string): number {
  const start = parseDateKey(startDateKey).getTime();
  const end = parseDateKey(endDateKey).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.floor((end - start) / dayMs) + 1;
}

function getDefaultSelectedDateForMonth(year: number, monthIndex: number): string {
  const cursor = new Date(year, monthIndex, 1);

  while (cursor.getMonth() === monthIndex) {
    const dateKey = toBrowserDateKey(cursor);

    if (!isWeekendDateKey(dateKey)) {
      return dateKey;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return toBrowserDateKey(new Date(year, monthIndex, 1));
}

function createVacationDay(dateKey: string, vacationName: string, hours: number): TimesheetDayDraft {
  return {
    ...createEmptyDraft(dateKey),
    entries: [
      {
        ...createEmptyEntryDraft(0),
        clientId: createClientId(),
        hours,
        kind: "VACATION",
        vacationName
      }
    ]
  };
}

function withClientIds(day: TimesheetDayDraft): TimesheetDayDraft {
  return {
    ...day,
    entries: day.entries
      .map((entry, index) => ({
        ...entry,
        clientId: entry.clientId || entry.id || createClientId(),
        hoursTouched: entry.hoursTouched ?? (entry.kind === "WORK" && day.entries.length === 1 && entry.hours !== 8),
        sortOrder: index
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  };
}

function buildDraftsFromMonthData(monthData: TimesheetMonthData): Record<string, TimesheetDayDraft> {
  const drafts: Record<string, TimesheetDayDraft> = {};

  for (const holiday of monthData.holidays) {
    drafts[holiday.dateKey] = {
      ...createEmptyDraft(holiday.dateKey),
      holidayName: holiday.name
    };
  }

  for (const entry of monthData.entries) {
    const current = drafts[entry.dateKey] ?? createEmptyDraft(entry.dateKey);
    drafts[entry.dateKey] = withClientIds({
      ...current,
      ...entry,
      holidayName: current.holidayName || entry.holidayName
    });
  }

  return drafts;
}

function buildInitialDrafts(monthData: TimesheetMonthData, todayKey: string): Record<string, TimesheetDayDraft> {
  const drafts = buildDraftsFromMonthData(monthData);

  if (drafts[todayKey]) {
    return drafts;
  }

  const todayDraft = createDraftForDate(todayKey, drafts);

  if (!todayDraft.entries[0]?.project) {
    return drafts;
  }

  return {
    ...drafts,
    [todayKey]: todayDraft
  };
}

function buildSelectedEntryIds(drafts: Record<string, TimesheetDayDraft>): Record<string, string> {
  return Object.fromEntries(Object.values(drafts).flatMap((day) => day.entries[0] ? [[day.dateKey, day.entries[0].clientId]] : []));
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

function findPreviousProject(dateKey: string, records: Record<string, TimesheetDayDraft>): string {
  const previousRecord = Object.values(records)
    .flatMap((record) => record.entries.map((entry) => ({ dateKey: record.dateKey, entry })))
    .filter((record) => record.dateKey < dateKey && record.entry.kind === "WORK" && record.entry.project.trim())
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))[0];

  return previousRecord?.entry.project ?? "";
}

function allocateDefaultNotionCards(cards: TimesheetEntryNotionCardDraft[], entryHours: number): TimesheetEntryNotionCardDraft[] {
  return allocateNotionCardHours({
    entryHours,
    links: dedupeNotionCardsByPageId(cards).map((card) => ({
      ...card,
      allocationMode: card.source === "weekday_default" ? "manual" : "auto",
      source: card.source === "weekday_default" ? "weekday_default" : "previous_business_day_default"
    }))
  });
}

function dedupeNotionCardsByPageId(cards: TimesheetEntryNotionCardDraft[]): TimesheetEntryNotionCardDraft[] {
  const cardsByPageId = new Map<string, TimesheetEntryNotionCardDraft>();

  for (const card of cards) {
    const pageId = card.notionPageId.trim();

    if (pageId && !cardsByPageId.has(pageId)) {
      cardsByPageId.set(pageId, {
        ...card,
        notionPageId: pageId
      });
    }
  }

  return Array.from(cardsByPageId.values());
}

function getDateKeyWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getDay();
}

function createWeekdayDefaultNotionCards(dateKey: string, defaults: NotionWeeklyDefaultCard[]): TimesheetEntryNotionCardDraft[] {
  const weekday = getDateKeyWeekday(dateKey);

  return defaults
    .filter((card) => card.enabled && card.weekday === weekday && card.notionPageId.trim())
    .map((card) => ({
      allocatedHours: card.allocatedHours,
      allocationMode: "manual",
      category: card.category,
      endDate: card.endDate,
      notionPageId: card.notionPageId,
      source: "weekday_default",
      startDate: card.startDate,
      status: card.status,
      title: card.title
    }));
}

function isNotionCardOpenForDate(card: TimesheetEntryNotionCardDraft, dateKey: string, doneStatusValues: string[]): boolean {
  if (!card.startDate || card.startDate > dateKey) {
    return false;
  }

  if (card.endDate && card.endDate < dateKey) {
    return false;
  }

  return Boolean(card.endDate) || !doneStatusValues.includes(card.status ?? "");
}

function findLocalPreviousNotionCards(params: {
  dateKey: string;
  doneStatusValues: string[];
  savedRecords: Record<string, TimesheetDayDraft>;
}): { cards: TimesheetEntryNotionCardDraft[]; foundPreviousEntry: boolean } {
  const previousEntry = Object.values(params.savedRecords)
    .flatMap((record) =>
      record.entries.map((entry) => ({
        dateKey: record.dateKey,
        entry
      }))
    )
    .filter((record) =>
      record.dateKey < params.dateKey &&
      record.entry.kind === "WORK" &&
      record.entry.notionCards.some((card) => card.source !== "weekday_default")
    )
    .sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey) ||
      left.entry.sortOrder - right.entry.sortOrder
    )[0];

  if (!previousEntry) {
    return {
      cards: [],
      foundPreviousEntry: false
    };
  }

  return {
    cards: previousEntry.entry.notionCards
      .filter((card) => card.source !== "weekday_default")
      .filter((card) => isNotionCardOpenForDate(card, params.dateKey, params.doneStatusValues))
      .map((card) => ({
        ...card,
        allocatedHours: 0,
        allocationMode: "auto",
        source: "previous_business_day_default"
      })),
    foundPreviousEntry: true
  };
}

function createEntryForDate(dateKey: string, records: Record<string, TimesheetDayDraft>, kind: WorkRecordKind = "WORK"): TimesheetEntryDraft {
  const entry = createEmptyEntryDraft(0);

  return {
    ...entry,
    clientId: createClientId(),
    hours: kind === "HOLIDAY" ? 0 : 8,
    hoursTouched: false,
    kind,
    project: kind === "WORK" ? findPreviousProject(dateKey, records) : ""
  };
}

function rebalanceDefaultWorkHours(entries: TimesheetEntryDraft[], newEntry: TimesheetEntryDraft): TimesheetEntryDraft[] {
  if (newEntry.kind !== "WORK") {
    return [...entries, newEntry];
  }

  const fixedWorkHours = entries
    .filter((entry) => entry.kind === "WORK" && entry.hoursTouched)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const flexibleWorkCount = entries.filter((entry) => entry.kind === "WORK" && !entry.hoursTouched).length + 1;
  const sharedHours = Math.max(8 - fixedWorkHours, 0) / flexibleWorkCount;
  const normalizedSharedHours = Number(sharedHours.toFixed(2));

  return [
    ...entries.map((entry) => entry.kind === "WORK" && !entry.hoursTouched ? withRebalancedNotionCards(entry, normalizedSharedHours) : entry),
    withRebalancedNotionCards(newEntry, normalizedSharedHours)
  ];
}

function withRebalancedNotionCards(entry: TimesheetEntryDraft, hours: number): TimesheetEntryDraft {
  const nextEntry = {
    ...entry,
    hours,
    hoursTouched: false
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
}

function createDraftForDate(dateKey: string, records: Record<string, TimesheetDayDraft>): TimesheetDayDraft {
  const entry = createEntryForDate(dateKey, records);

  return {
    ...createEmptyDraft(dateKey),
    entries: [entry]
  };
}

function createFutureDraftForDate(dateKey: string): TimesheetDayDraft {
  return createVacationDay(dateKey, "휴가", 8);
}

function firstWorkEntry(day: TimesheetDayDraft): TimesheetEntryDraft | undefined {
  return day.entries.find((entry) => entry.kind === "WORK");
}

function firstHolidayEntry(day: TimesheetDayDraft): TimesheetEntryDraft | undefined {
  return day.entries.find((entry) => entry.kind === "HOLIDAY");
}

function hasHolidayMarker(day: TimesheetDayDraft | undefined): boolean {
  return Boolean(day?.holidayName || day?.entries.some((entry) => entry.kind === "HOLIDAY"));
}

function uniqueWorkProjectCount(day: TimesheetDayDraft): number {
  return new Set(day.entries.filter((entry) => entry.kind === "WORK").map((entry) => entry.project.trim()).filter(Boolean)).size;
}

function rowFromDraft(dateKey: string, todayKey: string, draft: TimesheetDayDraft | undefined, isSaved: boolean): TimesheetRow {
  const row = draft ?? createEmptyDraft(dateKey);
  const firstWork = firstWorkEntry(row);
  const firstHoliday = firstHolidayEntry(row);
  const previewContent = firstWork ? row.shortVersion || firstWork.content : "";
  const hasContent = isSaved && row.entries.length > 0;
  const hasVacation = row.entries.some((entry) => entry.kind === "VACATION");
  const hasHoliday = Boolean(firstHoliday || row.holidayName);
  const isVacationOnly = hasVacation && !firstWork && !hasHoliday;
  const shouldWarnForMissingNotionCards = isSaved || !isAutoProjectOnlyDraft(row);
  const hasUnlinkedNotionWork = shouldWarnForMissingNotionCards && row.entries.some((entry) => entry.kind === "WORK" && entry.notionCards.length === 0);
  const hasNotionCardWarning = row.entries.some((entry) => entryHasNotionCardWarning(entry, shouldWarnForMissingNotionCards));

  return {
    ...row,
    aiTranslation: firstWork?.aiTranslation ?? "",
    content: firstWork?.content ?? "",
    entryCount: row.entries.length,
    hasNotionCardWarning,
    hasUnlinkedNotionWork,
    hasVacation,
    hours: row.entries.reduce((sum, entry) => sum + entry.hours, 0),
    kind: firstWork?.kind ?? (hasHoliday ? "HOLIDAY" : hasVacation ? "VACATION" : "WORK"),
    previewContent,
    project: firstWork?.project ?? "",
    projectCount: uniqueWorkProjectCount(row),
    status: isVacationOnly
      ? "VACATION"
      : resolveStatus({
          dateKey,
          hasContent: hasContent || Boolean(row.shortVersion.trim()),
          kind: hasHoliday ? "HOLIDAY" : "WORK",
          todayKey
        }),
    holidayName: row.holidayName || firstHoliday?.holidayName || "",
    vacationName: row.entries.find((entry) => entry.kind === "VACATION")?.vacationName ?? ""
  };
}

function isAutoProjectOnlyDraft(draft: TimesheetDayDraft | undefined): boolean {
  if (!draft) {
    return false;
  }

  const [entry] = draft.entries;

  return (
    draft.entries.length === 1 &&
    entry !== undefined &&
    entry.kind === "WORK" &&
    entry.hours === 8 &&
    Boolean(entry.project.trim()) &&
    !entry.content.trim() &&
    !entry.aiTranslation.trim() &&
    !draft.shortVersion.trim()
  );
}

function draftPreviewText(row: TimesheetRow): string {
  return truncateContent(row.previewContent);
}

function toHourCents(value: number): number {
  return Math.round(value * 100);
}

function toHoursFromCents(value: number): number {
  return value / 100;
}

function getNotionAllocationError(entry: TimesheetEntryDraft): string {
  if (entry.kind !== "WORK" || entry.notionCards.length === 0) {
    return "";
  }

  if (!Number.isFinite(entry.hours) || entry.hours < 0) {
    return "업무 시간이 올바르지 않습니다.";
  }

  if (entry.notionCards.some((link) => !Number.isFinite(link.allocatedHours) || link.allocatedHours < 0)) {
    return "카드 배분 시간이 올바르지 않습니다.";
  }

  const entryHourCents = toHourCents(entry.hours);
  const allocatedHourCents = entry.notionCards.reduce((sum, link) => sum + toHourCents(link.allocatedHours), 0);

  if (allocatedHourCents === entryHourCents) {
    return "";
  }

  return `배분 합계 ${toHoursFromCents(allocatedHourCents)}h / 업무 ${toHoursFromCents(entryHourCents)}h`;
}

function entryHasNotionCardWarning(entry: TimesheetEntryDraft, isSaved: boolean): boolean {
  if (entry.kind !== "WORK") {
    return false;
  }

  return (isSaved && entry.notionCards.length === 0) || Boolean(getNotionAllocationError(entry));
}

function sanitizeDayForSave(day: TimesheetDayDraft): TimesheetDayDraft {
  const hasWork = day.entries.some((entry) => entry.kind === "WORK");

  return {
    ...day,
    shortVersion: hasWork ? day.shortVersion : "",
    entries: day.entries.map((entry, index) => ({
      ...entry,
      aiTranslation: entry.kind === "WORK" ? entry.aiTranslation : "",
      content: entry.kind === "WORK" ? entry.content : "",
      holidayName: entry.kind === "HOLIDAY" ? entry.holidayName : "",
      hoursTouched: undefined,
      project: entry.kind === "WORK" ? entry.project : "",
      sortOrder: index,
      vacationName: entry.kind === "VACATION" ? entry.vacationName : ""
    }))
  };
}

function entryKey(entry: TimesheetEntryDraft): string {
  return entry.id || entry.clientId;
}

function hasExistingAiFields(day: TimesheetDayDraft): boolean {
  return Boolean(day.shortVersion.trim() || day.entries.some((entry) => entry.kind === "WORK" && entry.aiTranslation.trim()));
}

function hasWorkContent(day: TimesheetDayDraft): boolean {
  return day.entries.some((entry) => entry.kind === "WORK" && entry.content.trim());
}

function hasMissingAiFields(day: TimesheetDayDraft): boolean {
  const workEntries = day.entries.filter((entry) => entry.kind === "WORK" && entry.content.trim());

  return workEntries.length > 0 && (workEntries.some((entry) => !entry.aiTranslation.trim()) || !day.shortVersion.trim());
}

function hasWorkContentChange(savedDay: TimesheetDayDraft | undefined, currentDay: TimesheetDayDraft): boolean {
  if (!savedDay) {
    return false;
  }

  const savedWorkEntries = new Map(savedDay.entries.filter((entry) => entry.kind === "WORK").map((entry) => [entryKey(entry), entry]));

  return currentDay.entries.some((entry) => {
    if (entry.kind !== "WORK") {
      return false;
    }

    const savedEntry = savedWorkEntries.get(entryKey(entry));

    return !savedEntry || savedEntry.content.trim() !== entry.content.trim();
  });
}

function isDefaultFutureVacationDraft(draft: TimesheetDayDraft | undefined): boolean {
  if (!draft) {
    return false;
  }

  const [entry] = draft.entries;

  return (
    draft.entries.length === 1 &&
    entry !== undefined &&
    entry.kind === "VACATION" &&
    entry.hours === 8 &&
    entry.vacationName === "휴가" &&
    !entry.content.trim() &&
    !entry.aiTranslation.trim() &&
    !draft.shortVersion.trim()
  );
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

function statusText(row: TimesheetRow): string {
  if (row.hasVacation && row.entries.every((entry) => entry.kind === "VACATION")) {
    return row.vacationName || "휴가";
  }

  if (row.status === "MISSING") {
    if (row.kind === "WORK" && row.project.trim() && !draftPreviewText(row)) {
      return "작성 예정";
    }

    return draftPreviewText(row) || "미기입";
  }

  return truncateContent(getDisplayContent(row)) || (row.kind === "WORK" ? "(내용 없음)" : "작성 예정");
}

function calendarStatusText(row: TimesheetRow, isSelected: boolean): string {
  if (isSelected && row.status === "MISSING" && row.kind === "WORK" && !draftPreviewText(row)) {
    return "작성 예정";
  }

  return statusText(row);
}

function listSummaryText(row: TimesheetRow): string {
  if (row.hasVacation && row.entries.every((entry) => entry.kind === "VACATION")) {
    return row.vacationName || "휴가";
  }

  if (row.kind === "HOLIDAY") {
    return row.holidayName || "공휴일";
  }

  const firstWork = firstWorkEntry(row);
  const content = truncateContent(firstWork?.content ?? row.content ?? "");

  if (row.status === "MISSING") {
    if (row.kind === "WORK" && row.project.trim() && !content) {
      return "작성 예정";
    }

    return content || "미기입";
  }

  return content || (row.kind === "WORK" ? "(내용 없음)" : "작성 예정");
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
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);
  const [records, setRecords] = useState<Record<string, TimesheetDayDraft>>(() => buildInitialDrafts(initialMonthData, todayKey));
  const [savedRecords, setSavedRecords] = useState<Record<string, TimesheetDayDraft>>(() => buildDraftsFromMonthData(initialMonthData));
  const [savedEntryDateKeys, setSavedEntryDateKeys] = useState(() => new Set(initialMonthData.entries.map((entry) => entry.dateKey)));
  const [celebratingDateKey, setCelebratingDateKey] = useState("");
  const [selectedEntryIdByDate, setSelectedEntryIdByDate] = useState<Record<string, string>>(() => buildSelectedEntryIds(records));
  const [editingNotionEntryClientId, setEditingNotionEntryClientId] = useState<string | null>(null);
  const [includeDoneNotionCandidates, setIncludeDoneNotionCandidates] = useState(false);
  const notionCandidates = useNotionCardCandidates({ loadNotionCardCandidatesAction, refreshNotionCardCandidatesAction });
  const [projects, setProjects] = useState(() => mergeProjects([], initialMonthData.projects));
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState(initialCurrentUser.username);
  const [profileEmail, setProfileEmail] = useState(initialCurrentUser.email);
  const [profilePassword, setProfilePassword] = useState("");
  const [profileState, setProfileState] = useState<SettingsSaveState>("idle");
  const [profileError, setProfileError] = useState("");
  const [holidayApiKey, setHolidayApiKey] = useState(initialHolidayApiKey);
  const [holidayApiKeyState, setHolidayApiKeyState] = useState<SettingsSaveState>("idle");
  const [holidayApiKeyError, setHolidayApiKeyError] = useState("");
  const [holidayApiKeyTestState, setHolidayApiKeyTestState] = useState<SettingsSaveState>("idle");
  const [holidayApiKeyTestMessage, setHolidayApiKeyTestMessage] = useState("");
  const [aiSetting, setAiSetting] = useState(initialAiSetting);
  const [aiRewriteRequests, setAiRewriteRequests] = useState(initialAiRewriteRequests);
  const [isAiRewriteQueueOpen, setIsAiRewriteQueueOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(initialAiSetting.enabled);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiClearApiKey, setAiClearApiKey] = useState(false);
  const [aiModel, setAiModel] = useState(initialAiSetting.model);
  const [aiCustomModel, setAiCustomModel] = useState(aiModelPresets.some((preset) => preset.value === initialAiSetting.model) ? "" : initialAiSetting.model);
  const [aiContextDays, setAiContextDays] = useState(initialAiSetting.contextDays);
  const [aiBackfillMissing, setAiBackfillMissing] = useState(initialAiSetting.backfillMissing);
  const [aiBackfillLimit, setAiBackfillLimit] = useState(initialAiSetting.backfillLimit);
  const [aiCleanupMode, setAiCleanupMode] = useState<AiCleanupMode>(initialAiSetting.cleanupMode);
  const [aiSettingState, setAiSettingState] = useState<SettingsSaveState>("idle");
  const [aiSettingMessage, setAiSettingMessage] = useState("");
  const [aiTestState, setAiTestState] = useState<SettingsSaveState>("idle");
  const [aiTestMessage, setAiTestMessage] = useState("");
  const [holidayWarning, setHolidayWarning] = useState(initialMonthData.holidayWarning ?? "");
  const [holidayWarningMonthKeys, setHolidayWarningMonthKeys] = useState(() => {
    const initialMonthKey = getMonthCacheKey(initialYear, initialMonthIndex);

    return new Set(initialMonthData.holidayWarning ? [initialMonthKey] : []);
  });
  const [holidayResetState, setHolidayResetState] = useState<HolidayResetState>("idle");
  const [holidayResetError, setHolidayResetError] = useState("");
  const [managedUsers, setManagedUsers] = useState(initialManagedUsers);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("USER");
  const [userCreateState, setUserCreateState] = useState<SettingsSaveState>("idle");
  const [userCreateError, setUserCreateError] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [isVacationRangeOpen, setIsVacationRangeOpen] = useState(false);
  const [vacationRangeStart, setVacationRangeStart] = useState(todayKey);
  const [vacationRangeEnd, setVacationRangeEnd] = useState(todayKey);
  const [vacationRangeName, setVacationRangeName] = useState("휴가");
  const [vacationRangeHours, setVacationRangeHours] = useState(8);
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
  const [notionRecommendationLoadingKeys, setNotionRecommendationLoadingKeys] = useState<Set<string>>(() => new Set());
  const previousNotionCardRecommendationKeys = useRef(new Set<string>());

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
    function refreshTodayKey() {
      const browserTodayKey = toBrowserDateKey(new Date());

      if (browserTodayKey === todayKey) {
        return;
      }

      setTodayKey(browserTodayKey);

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

    const intervalId = window.setInterval(refreshTodayKey, todayRefreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [savedEntryDateKeys, selectedDateKey, todayKey]);

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
  const selectedEditorKind: WorkRecordKind = selectedEntry?.kind ?? (selectedDay.holidayName ? "HOLIDAY" : isFutureDate ? "VACATION" : "WORK");
  const selectedNotionAllocationError = selectedEntry ? getNotionAllocationError(selectedEntry) : "";
  const isSelectedNotionRecommendationLoading = Boolean(selectedEntry && notionRecommendationLoadingKeys.has(`${selectedDateKey}:${selectedEntry.clientId}`));

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
  const isFutureWork = false;
  const shortcutModifierKey = useMemo(() => getSystemModifierKey(), []);
  const editorKindOptions = isFutureDate ? kindOptions.filter((option) => option.value !== "WORK") : kindOptions;
  const canDeleteSelected = savedEntryDateKeys.has(selectedDateKey);
  const isAdmin = currentUser.role === "ADMIN";
  const selectedTotalHours = selectedDay.entries.reduce((sum, entry) => sum + entry.hours, 0);
  const selectedHasWork = selectedDay.entries.some((entry) => entry.kind === "WORK");
  const selectedIsHoliday = selectedEditorKind === "HOLIDAY";
  const selectedIsSingleVacation = selectedDay.entries.length === 1 && selectedEntry?.kind === "VACATION";
  const isDevelopment = process.env.NODE_ENV === "development";
  const entryDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);

    if (loadedMonthKeys.has(monthKey)) {
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
  }, [loadMonthAction, loadedMonthKeys, monthCursor.monthIndex, monthCursor.year]);

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

          const existingPageIds = new Set(entry.notionCards.map((card) => card.notionPageId));
          const nextCards = [
            ...entry.notionCards,
            ...cards.filter((card) => !existingPageIds.has(card.notionPageId))
          ];

          if (nextCards.length === entry.notionCards.length) {
            return entry;
          }

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
    if (savedEntryDateKeys.has(dateKey)) {
      return;
    }

    const entry = day?.entries[0];

    if (entry?.kind === "WORK" && !entry.project.trim()) {
      void fillPreviousProjectFromDatabase(dateKey, entry.clientId);
    }
  }

  function recommendPreviousNotionCardsForDraft(dateKey: string, day: TimesheetDayDraft | undefined) {
    if (savedEntryDateKeys.has(dateKey)) {
      return;
    }

    const entry = day?.entries[0];

    if (entry?.kind === "WORK" && entry.notionCards.length === 0) {
      const recommendationKey = `${dateKey}:${entry.clientId}`;

      if (previousNotionCardRecommendationKeys.current.has(recommendationKey)) {
        return;
      }

      previousNotionCardRecommendationKeys.current.add(recommendationKey);

      const weekdayCards = createWeekdayDefaultNotionCards(dateKey, initialNotionWeeklyDefaults);
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
    if (records[dateKey]) {
      recommendPreviousProjectForDraft(dateKey, records[dateKey]);
      recommendPreviousNotionCardsForDraft(dateKey, records[dateKey]);
      return;
    }

    const draft = dateKey > currentTodayKey ? createFutureDraftForDate(dateKey) : createDraftForDate(dateKey, records);

    setRecords((current) => {
      if (current[dateKey]) {
        recommendPreviousProjectForDraft(dateKey, current[dateKey]);
        recommendPreviousNotionCardsForDraft(dateKey, current[dateKey]);
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

  function runNavigation(navigation: PendingNavigation) {
    if (navigation.kind === "date") {
      removeSelectedAutoProjectDraft(navigation.dateKey);
      prepareDraftForDate(navigation.dateKey);
      setSelectedDateKey(navigation.dateKey);
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
      setMonthCursor({
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
    setMonthCursor({
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

  function selectDate(dateKey: string) {
    requestNavigation({ dateKey, kind: "date" });
  }

  function selectDateEntry(dateKey: string, entryClientId: string) {
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
      const monthData = await loadMonthAction(year ?? monthCursor.year, (month ?? 1) - 1);
      const monthDrafts = buildDraftsFromMonthData(monthData);

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

  function isSavedVacationOnlyDate(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): boolean {
    const draft = getSavedDraftForVacationDate(dateKey, loadedDrafts);

    return Boolean(draft?.entries.length === 1 && draft.entries[0]?.kind === "VACATION");
  }

  function findConnectedVacationDateKeysInDirection(dateKey: string, direction: -1 | 1, loadedDrafts: Record<string, TimesheetDayDraft>): string[] {
    const dateKeys: string[] = [];
    let cursor = addBusinessDays(dateKey, direction);

    while (isSavedHolidayDate(cursor, loadedDrafts) || isSavedVacationOnlyDate(cursor, loadedDrafts)) {
      if (isSavedVacationOnlyDate(cursor, loadedDrafts)) {
        dateKeys.push(cursor);
      }

      cursor = addBusinessDays(cursor, direction);
    }

    return dateKeys;
  }

  function hasReplaceableRecord(dateKey: string, loadedDrafts: Record<string, TimesheetDayDraft> = {}): boolean {
    const draft = getSavedDraftForVacationDate(dateKey, loadedDrafts);

    return Boolean(savedEntryDateKeys.has(dateKey) || draft?.entries.length || draft?.shortVersion.trim());
  }

  async function saveVacationDays(dateKeys: string[], vacationName: string, hours: number, onProgress?: (completed: number, total: number) => void): Promise<TimesheetDayDraft[]> {
    const savedDays: TimesheetDayDraft[] = [];
    const total = dateKeys.length;

    for (const dateKey of dateKeys) {
      const saveResult = await saveEntryAction(sanitizeDayForSave(createVacationDay(dateKey, vacationName || "휴가", hours)));
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
                notionPageId,
                source: "manual" as const,
                startDate: candidate?.startDate ?? "",
                status: candidate?.status ?? "",
                title: candidate?.title ?? ""
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
    setVacationRangeName(selectedEntry?.kind === "VACATION" ? selectedEntry.vacationName || "휴가" : "휴가");
    setVacationRangeHours(selectedEntry?.kind === "VACATION" ? selectedEntry.hours || 8 : 8);
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
      const leftVacationKeys = findConnectedVacationDateKeysInDirection(selectedDateKey, -1, loadedDrafts);
      const rightVacationKeys = findConnectedVacationDateKeysInDirection(selectedDateKey, 1, loadedDrafts);

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

  async function applyVacationRange(confirmReplace = false) {
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
      const savedDays = await saveVacationDays(targetDateKeys, vacationRangeName, vacationRangeHours, (completed, total) => {
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

  async function findConnectedVacationPrompt(): Promise<ConnectedVacationPrompt | null> {
    if (selectedEntry?.kind !== "VACATION") {
      return null;
    }

    const windowKeys = getBusinessDateKeysInRange(addDays(selectedDateKey, -45), addDays(selectedDateKey, 45));
    const loadedDrafts = await loadDateKeysForVacation(windowKeys);
    const savedWasVacation = savedRecords[selectedDateKey]?.entries.some((entry) => entry.kind === "VACATION") ?? false;
    const leftVacationKeys = findConnectedVacationDateKeysInDirection(selectedDateKey, -1, loadedDrafts);
    const rightVacationKeys = findConnectedVacationDateKeysInDirection(selectedDateKey, 1, loadedDrafts);
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
      dateKeys: sortedDateKeys,
      hours: selectedEntry.hours || 8,
      vacationName: selectedEntry.vacationName || "휴가"
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
      await saveVacationDays(targetDateKeys, connectedVacationPrompt.vacationName, connectedVacationPrompt.hours, (completed, total) => {
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

    try {
      const loadedDrafts = await loadDateKeysForVacation(connectedVacationPrompt.dateKeys);
      const targetDateKeys = connectedVacationPrompt.dateKeys.filter((dateKey) => !isSavedHolidayDate(dateKey, loadedDrafts));
      setConnectedVacationProgress({ completed: 0, total: targetDateKeys.length });
      let completed = 0;

      for (const dateKey of targetDateKeys) {
        const deleteResult = await deleteEntryAction(dateKey);

        showNotionSyncError(deleteResult.notionSyncError);
        completed += 1;
        setConnectedVacationProgress({ completed, total: targetDateKeys.length });
      }

      removeDeletedDates(targetDateKeys);
      setConnectedVacationPrompt(null);
      setConnectedVacationProgress({ completed: 0, total: 0 });
      setIsDirty(false);
      resetEntryFeedback();
    } catch {
      setDeleteState("error");
      setDeleteError("연결된 휴가를 함께 삭제하지 못했습니다.");
    } finally {
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
      vacationName: kind === "VACATION" ? selectedEntry.vacationName : ""
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
    } catch {
      setProjectAddState("error");
      setProjectAddError("프로젝트를 추가하지 못했습니다.");
    }
  }

  function getSelectedAiModel(): string {
    return aiModel === "__custom__" ? aiCustomModel.trim() || "gemini-3.1-flash-lite" : aiModel;
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
    } catch (error) {
      setAiCleanupState("error");
      setAiCleanupMessage(error instanceof Error ? error.message : "AI 정리에 실패했습니다.");
    }
  }

  async function saveSelectedDraft(options: { forceImmediateAiAfterSave?: boolean; overwriteAiAfterSave?: boolean; skipAiRewritePrompt?: boolean; skipConnectedVacation?: boolean } = {}) {
    if (selectedIsSingleVacation && !options.skipConnectedVacation) {
      try {
        const prompt = await findConnectedVacationPrompt();

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

    const sanitizedEntry = sanitizeDayForSave(selectedDay);
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
      const saveResult = await saveEntryAction(entry);
      const savedEntry = withClientIds(saveResult.day);

      updateAiRewriteRequestsFromDays([savedEntry]);
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
    return isFutureWork || saveState === "saving" || deleteState === "deleting" || vacationRangeState === "saving";
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
      const deleteResult = await deleteEntryAction(selectedDateKey);

      showNotionSyncError(deleteResult.notionSyncError);
      removeDeletedDates([selectedDateKey]);
      setIsDirty(false);
      resetEntryFeedback();
    } catch {
      setDeleteState("error");
      setDeleteError("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function openSettings() {
    setProfileUsername(currentUser.username);
    setProfileEmail(currentUser.email);
    setProfilePassword("");
    setProfileState("idle");
    setProfileError("");
    setHolidayApiKeyState("idle");
    setHolidayApiKeyError("");
    setHolidayApiKeyTestState("idle");
    setHolidayApiKeyTestMessage("");
    setAiEnabled(aiSetting.enabled);
    setAiApiKey("");
    setAiClearApiKey(false);
    setAiModel(aiModelPresets.some((preset) => preset.value === aiSetting.model) ? aiSetting.model : "__custom__");
    setAiCustomModel(aiModelPresets.some((preset) => preset.value === aiSetting.model) ? "" : aiSetting.model);
    setAiContextDays(aiSetting.contextDays);
    setAiBackfillMissing(aiSetting.backfillMissing);
    setAiBackfillLimit(aiSetting.backfillLimit);
    setAiCleanupMode(aiSetting.cleanupMode);
    setAiSettingState("idle");
    setAiSettingMessage("");
    setAiTestState("idle");
    setAiTestMessage("");
    void refreshAiRewriteRequests();
    setHolidayResetState("idle");
    setHolidayResetError("");
    setUserCreateState("idle");
    setUserCreateError("");
    setIsSettingsOpen(true);
  }

  async function saveProfile() {
    setProfileState("saving");
    setProfileError("");

    try {
      const updatedUser = await updateProfileAction({
        email: profileEmail,
        password: profilePassword || undefined,
        username: profileUsername
      });

      setCurrentUser(updatedUser);
      setProfilePassword("");
      setManagedUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
      setProfileState("saved");
    } catch (error) {
      setProfileState("error");
      setProfileError(error instanceof Error ? error.message : "계정 정보를 저장하지 못했습니다.");
    }
  }

  async function saveHolidayApiKey() {
    setHolidayApiKeyState("saving");
    setHolidayApiKeyError("");

    try {
      await saveHolidayApiKeyAction(holidayApiKey);
      setHolidayApiKeyState("saved");
    } catch (error) {
      setHolidayApiKeyState("error");
      setHolidayApiKeyError(error instanceof Error ? error.message : "API 키를 저장하지 못했습니다.");
    }
  }

  async function testHolidayApiKey() {
    setHolidayApiKeyTestState("saving");
    setHolidayApiKeyTestMessage("");

    try {
      const result = await testHolidayApiKeyAction(holidayApiKey, monthCursor.year, monthCursor.monthIndex);
      const label = getMonthLabel(monthCursor.year, monthCursor.monthIndex);
      setHolidayApiKeyTestState("saved");
      setHolidayApiKeyTestMessage(result.holidays.length > 0 ? label + " 공휴일 " + result.holidays.length + "건 확인됨" : label + " 응답은 정상이며 공휴일은 없습니다.");
    } catch (error) {
      setHolidayApiKeyTestState("error");
      setHolidayApiKeyTestMessage(error instanceof Error ? error.message : "API 키 테스트에 실패했습니다.");
    }
  }

  async function saveAiSetting() {
    setAiSettingState("saving");
    setAiSettingMessage("");

    try {
      const updated = await updateAiSettingAction({
        apiKey: aiApiKey || undefined,
        backfillLimit: aiBackfillLimit,
        backfillMissing: aiBackfillMissing,
        clearApiKey: aiClearApiKey,
        contextDays: aiContextDays,
        cleanupMode: aiCleanupMode,
        enabled: aiEnabled,
        model: getSelectedAiModel()
      });

      setAiSetting(updated);
      setAiApiKey("");
      setAiClearApiKey(false);
      setAiSettingState("saved");
      setAiSettingMessage("AI 자동 정리 설정을 저장했습니다.");
    } catch (error) {
      setAiSettingState("error");
      setAiSettingMessage(error instanceof Error ? error.message : "AI 설정을 저장하지 못했습니다.");
    }
  }

  async function testAiSetting() {
    setAiTestState("saving");
    setAiTestMessage("");

    try {
      await testGeminiApiKeyAction({ apiKey: aiApiKey || undefined, model: getSelectedAiModel() });
      setAiTestState("saved");
      setAiTestMessage("Gemini API key를 확인했습니다.");
    } catch (error) {
      setAiTestState("error");
      setAiTestMessage(error instanceof Error ? error.message : "Gemini API key 테스트에 실패했습니다.");
    }
  }

  async function createUser() {
    setUserCreateState("saving");
    setUserCreateError("");

    try {
      const user = await createUserAction({
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        username: newUserUsername
      });

      setManagedUsers((current) => [...current, user].sort((left, right) => left.username.localeCompare(right.username, "ko-KR")));
      setNewUserUsername("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("USER");
      setUserCreateState("saved");
    } catch (error) {
      setUserCreateState("error");
      setUserCreateError(error instanceof Error ? error.message : "사용자를 추가하지 못했습니다.");
    }
  }

  async function resetCurrentMonthHolidays() {
    if (!isAdmin) {
      return;
    }

    setHolidayResetState("saving");
    setHolidayResetError("");

    try {
      const monthData = await resetHolidayCacheAction(monthCursor.year, monthCursor.monthIndex);
      const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);
      const monthDrafts = buildDraftsFromMonthData(monthData);
      const mergeResetMonth = (current: Record<string, TimesheetDayDraft>) => {
        const next = { ...current };

        for (const [dateKey, draft] of Object.entries(next)) {
          if (dateKey.startsWith(monthKey + "-") && draft.entries.length === 0 && draft.holidayName) {
            delete next[dateKey];
          }
        }

        return {
          ...next,
          ...monthDrafts
        };
      };

      setRecords(mergeResetMonth);
      setSavedRecords(mergeResetMonth);
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
      setHolidayResetState("saved");
    } catch {
      setHolidayResetState("error");
      setHolidayResetError("공휴일 정보를 다시 불러오지 못했습니다.");
    }
  }

  async function resetAllHolidays() {
    if (!isAdmin || !isDevelopment) {
      return;
    }

    setHolidayResetState("saving");
    setHolidayResetError("");

    try {
      const monthData = await resetAllHolidayCacheAction(monthCursor.year, monthCursor.monthIndex);
      const monthDrafts = buildDraftsFromMonthData(monthData);
      const removeApiHolidayDrafts = (current: Record<string, TimesheetDayDraft>) => {
        const next = { ...current };

        for (const [dateKey, draft] of Object.entries(next)) {
          if (draft.entries.length === 0 && draft.holidayName) {
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
      setHolidayWarningMonthKeys(new Set());
      setProjects((current) => mergeProjects(current, monthData.projects));
      setSavedEntryDateKeys((current) => {
        const next = new Set(current);

        for (const entry of monthData.entries) {
          next.add(entry.dateKey);
        }

        return next;
      });
      setLoadedMonthKeys(new Set([getMonthCacheKey(monthCursor.year, monthCursor.monthIndex)]));
      setHolidayResetState("saved");
    } catch (error) {
      setHolidayResetState("error");
      setHolidayResetError(error instanceof Error ? error.message : "공휴일 정보를 삭제하지 못했습니다.");
    }
  }

  if (isInitialMonthSyncing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 px-6" role="status">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="size-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
          <div>
            <p className="text-base font-bold text-slate-950">월간 업무 기록을 불러오는 중</p>
            <p className="mt-1 text-sm font-medium text-slate-500">현재 날짜 기준으로 공휴일과 기록을 확인하고 있습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-0 pt-4 lg:grid-cols-[minmax(680px,1fr)_420px] xl:grid-cols-[minmax(760px,1fr)_460px]" onKeyDown={handleWorkspaceKeyDown}>
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button className="h-11 w-11 shrink-0 p-0" onClick={() => moveMonth(-1)} variant="ghost">
                <ChevronLeft aria-hidden="true" className="h-10 w-10 stroke-3" />
                <span className="sr-only">이전 달</span>
              </Button>
              <div className="min-w-44 text-center">
                <h2 className="text-lg font-bold text-slate-950">{getMonthLabel(monthCursor.year, monthCursor.monthIndex)}</h2>
                {monthLoadState === "loading" ? <p className="text-xs font-semibold text-slate-400">불러오는 중</p> : null}
              </div>
              <Button className="h-11 w-11 shrink-0 p-0" onClick={() => moveMonth(1)} variant="ghost">
                <ChevronRight aria-hidden="true" className="h-10 w-10 stroke-3" />
                <span className="sr-only">다음 달</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-9 px-3" onClick={goToday} variant="secondary">
                <TimerReset aria-hidden="true" className="size-4" />
                오늘
              </Button>
              <Button className="h-9 px-3" onClick={openSettings} variant="secondary">
                <Settings aria-hidden="true" className="size-4" />
                설정
              </Button>
              <SegmentedControl
                items={[
                  { icon: <CalendarDays aria-hidden="true" className="size-4" />, label: "캘린더", value: "calendar" },
                  { icon: <ListChecks aria-hidden="true" className="size-4" />, label: "리스트", value: "list" }
                ]}
                onChange={setViewMode}
                value={viewMode}
              />
            </div>
          </div>

          <div className="grid border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-4">
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
              weeks={calendarWeeks}
            />
          ) : (
            <ListView
              dateKeys={listDateKeys}
              rows={rows}
              selectedDateKey={selectedDateKey}
              selectedEntryId={selectedEntryId}
              setSelectedDateKey={selectDate}
              setSelectedEntry={selectDateEntry}
            />
          )}
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{formatKoreanDate(selectedDateKey)}</h2>
              </div>
              {!isViewingToday ? (
                <Button className="h-9 px-3" onClick={goToday} variant="secondary">
                  <RotateCcw aria-hidden="true" className="size-4" />
                  오늘로 돌아가기
                </Button>
              ) : null}
            </div>
          </div>

          <div className={cn("space-y-5 p-5", isFutureWork && "opacity-70")}>
            {selectedHasWork ? (
              <Field label="짧은 버전">
                <Input disabled={isFutureWork} onChange={(event) => updateSelectedShortVersion(event.target.value)} placeholder="월간 캘린더에 표시할 한 줄 요약" value={selectedDay.shortVersion} />
              </Field>
            ) : null}

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-base font-bold", selectedTotalHours > 8 ? "text-red-600" : "text-slate-950")}>{selectedTotalHours}h</span>
                  <span className="text-xs font-medium text-slate-400">업무시간</span>
                </div>
                <div className="flex gap-2">
                  <Button className="h-9 px-3" disabled={isFutureWork} onClick={() => addEntry(selectedEditorKind)} type="button" variant="secondary">
                    <Plus aria-hidden="true" className="size-4" />
                    추가
                  </Button>
                </div>
              </div>
              {selectedTotalHours > 8 ? <p className="mt-2 text-sm font-semibold text-red-600">하루 합계가 8시간을 초과했습니다.</p> : null}
            </div>

            <div className="space-y-2">
              <SegmentedControl items={editorKindOptions} onChange={updateKind} value={selectedEditorKind} />
            </div>

            {selectedDay.entries.length > 1 ? (
              <DndContext collisionDetection={closestCenter} onDragEnd={handleEntryDragEnd} sensors={entryDragSensors}>
                <SortableContext items={selectedDay.entries.map((entry) => entry.clientId)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {selectedDay.entries.map((entry, index) => (
                      <SortableEntryItem
                        entry={entry}
                        index={index}
                        isSelected={entry.clientId === selectedEntry?.clientId}
                        key={entry.clientId}
                        notionCardWarning={entryHasNotionCardWarning(entry, true)}
                        onMoveDown={() => moveEntry(entry.clientId, 1)}
                        onMoveUp={() => moveEntry(entry.clientId, -1)}
                        onRemove={() => removeEntry(entry.clientId)}
                        onSelect={() => selectEntry(entry.clientId)}
                        totalCount={selectedDay.entries.length}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : null}
            {selectedDay.entries.length === 0 && !selectedIsHoliday ? <p className="rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-sm font-medium text-slate-500">등록된 업무나 휴가가 없습니다.</p> : null}

            {selectedIsHoliday ? (
              <Field label="공휴일명">
                <Input disabled={isFutureWork} onChange={(event) => updateHolidayName(event.target.value)} placeholder="예: 어린이날" value={selectedEntry?.kind === "HOLIDAY" ? selectedEntry.holidayName : selectedDay.holidayName} />
              </Field>
            ) : selectedEntry ? (
              selectedEntry.kind === "WORK" ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
                    <Field label="진행한 프로젝트">
                      <select
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        disabled={isFutureWork}
                        onChange={updateProject}
                        value={selectedEntry.project}
                      >
                        <option value="">프로젝트 선택</option>
                        {projects.map((project) => (
                          <option key={project} value={project}>
                            {project}
                          </option>
                        ))}
                        <option value={newProjectOptionValue}>새 프로젝트 등록...</option>
                      </select>
                    </Field>

                    <Field label="일한 시간">
                      <Input disabled={isFutureWork} max={24} min={0} onChange={(event) => updateSelectedEntryHours(Number(event.target.value))} step={0.5} type="number" value={selectedEntry.hours} />
                    </Field>
                  </div>

                  <Field label="내용">
                    <Textarea disabled={isFutureWork} onChange={(event) => updateSelectedEntry({ content: event.target.value })} placeholder="오늘 진행한 일을 간단히 적어주세요." rows={5} value={selectedEntry.content} />
                  </Field>

                  <NotionCardLinkSection
                    allocationError={selectedNotionAllocationError}
                    candidates={notionCandidates.candidatesByDate[selectedDateKey] ?? []}
                    disabled={isFutureWork}
                    entry={selectedEntry}
                    isAutoLoading={isSelectedNotionRecommendationLoading}
                    onAllocatedHoursChange={(notionPageId, allocatedHours) => updateNotionCardAllocatedHours(selectedEntry.clientId || selectedEntry.id, notionPageId, allocatedHours)}
                    onOpenPicker={() => {
                      setIncludeDoneNotionCandidates(false);
                      setEditingNotionEntryClientId(selectedEntry.clientId || selectedEntry.id);
                      notionCandidates.loadCandidates({
                        dateKey: selectedDateKey,
                        includeDone: false,
                        linkedPageIds: selectedEntry.notionCards.map((link) => link.notionPageId)
                      });
                    }}
                    onRemoveCard={(notionPageId) => toggleNotionCardForEntry(selectedEntry.clientId || selectedEntry.id, notionPageId)}
                    onResetAutoAllocation={() => resetNotionCardAutoAllocation(selectedEntry.clientId || selectedEntry.id)}
                  />

                  <Field label="영문 번역본">
                    <Textarea disabled={isFutureWork} onChange={(event) => updateSelectedAiTranslation(event.target.value)} placeholder="오늘 진행한 일을 영어로 간단히 적어주세요." rows={4} value={selectedEntry.aiTranslation} />
                  </Field>
                </>
              ) : selectedEntry.kind === "VACATION" ? (
                <>
                  <Field label="휴가 유형">
                    <Input disabled={isFutureWork} onChange={(event) => updateSelectedEntry({ vacationName: event.target.value })} placeholder="예: 연차, 오전 반차" value={selectedEntry.vacationName} />
                  </Field>
                  <Field label="휴가 시간">
                    <Input disabled={isFutureWork} max={24} min={0} onChange={(event) => updateSelectedEntry({ hours: Number(event.target.value) })} step={0.5} type="number" value={selectedEntry.hours} />
                  </Field>
                </>
              ) : null
            ) : null}

            <div className="border-t border-slate-100 pt-5">
              {isSelectedDayScheduledCleanupPending() ? (
                <p className="mb-3 inline-flex w-full items-center justify-end gap-1 text-right text-xs font-semibold leading-5 text-amber-700">
                  <span>AI 예약 정리 대기 ·</span>
                  <ShortcutHint keys={[shortcutModifierKey]} />
                  <span>저장 클릭으로 즉시 정리</span>
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div>
                  {canDeleteSelected ? (
                    <button
                      className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 underline-offset-4 transition hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-red-300"
                      disabled={deleteState === "deleting"}
                      onClick={requestDeleteSelectedDate}
                      type="button"
                    >
                      {deleteState === "deleting" ? "삭제 중" : "삭제"}
                      <ShortcutHint keys={["Del"]} />
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={cn("text-sm font-medium", saveState === "error" || deleteState === "error" ? "text-red-600" : "text-slate-500")}>
                      {deleteState === "error" ? deleteError : saveState === "saved" ? "저장됨" : saveState === "saving" ? "저장 중" : saveError}
                    </p>
                  </div>
                  {selectedIsSingleVacation ? (
                    <Button className="h-10 px-4" disabled={saveState === "saving" || deleteState === "deleting" || vacationRangeState === "saving"} onClick={() => void openVacationRangeModal()} type="button" variant="secondary">
                      기간 설정
                    </Button>
                  ) : null}
                  <Button className="h-10 px-4" disabled={isSaveDisabled()} onClick={(event) => void saveSelectedDraft({ forceImmediateAiAfterSave: event.ctrlKey || event.metaKey })}>
                    {saveState === "saving" ? "저장 중" : "저장"}
                    <ShortcutHint keys={[shortcutModifierKey, "↵"]} />
                  </Button>
                </div>
              </div>
              {aiCleanupDateKey === selectedDateKey && aiCleanupState !== "idle" ? (
                <p className={cn("mt-2 text-right text-xs font-semibold leading-5", aiCleanupState === "error" ? "text-red-600" : aiCleanupState === "running" ? "text-slate-700" : "text-emerald-700")}>
                  {aiCleanupState === "running" ? "AI 정리 중" : aiCleanupMessage}
                </p>
              ) : null}
            </div>
          </div>

          {isFutureWork ? (
            <div className="mx-5 mb-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
              미래 날짜는 아직 작성하지 않습니다.
            </div>
          ) : null}
        </aside>
      </div>

      {isSettingsOpen ? (
        <ModalShell onClose={() => setIsSettingsOpen(false)} title="설정">
          <div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1">
            <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">내 설정</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">계정 정보와 개인 AI 자동 정리를 관리합니다.</p>
                </div>
                <Badge tone={isAdmin ? "green" : "gray"}>{isAdmin ? "관리자" : "일반"}</Badge>
              </div>

              <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-bold text-slate-950">계정 정보</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="아이디">
                    <Input onChange={(event) => setProfileUsername(event.target.value)} value={profileUsername} />
                  </Field>
                  <Field label="이메일">
                    <Input autoComplete="email" onChange={(event) => setProfileEmail(event.target.value)} placeholder="reminder@example.com" type="email" value={profileEmail} />
                  </Field>
                  <Field label="새 비밀번호">
                    <Input autoComplete="new-password" onChange={(event) => setProfilePassword(event.target.value)} placeholder="변경 시에만 입력" type="password" value={profilePassword} />
                  </Field>
                </div>
                {profileState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">계정 정보를 저장했습니다.</p> : null}
                {profileState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{profileError}</p> : null}
                <div className="mt-4 flex justify-end">
                  <Button disabled={profileState === "saving"} onClick={() => void saveProfile()} type="button">
                    {profileState === "saving" ? "저장 중" : "계정 저장"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-950">개인 AI 자동 정리</h4>
                    <p className="mt-1 text-sm leading-6 text-slate-600">내 Gemini API key로 빈 영문 번역본과 짧은 버전을 채웁니다.</p>
                  </div>
                  <Badge tone={aiSetting.apiKeySaved ? "green" : "gray"}>{aiSetting.apiKeySaved ? "개인 key 저장됨" : "개인 key 없음"}</Badge>
                </div>

                <div className="mt-4 space-y-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input checked={aiEnabled} className="size-4 accent-slate-950" onChange={(event) => setAiEnabled(event.target.checked)} type="checkbox" />
                    AI 자동 정리 사용
                  </label>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-slate-700">AI 정리 방식</p>
                      <button
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs font-bold transition",
                          aiRewriteRequests.length > 0
                            ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        )}
                        onClick={() => setIsAiRewriteQueueOpen(true)}
                        type="button"
                      >
                        {aiRewriteRequests.length}개 대기중
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {[
                        { description: "저장 직후 실행", label: "즉시", value: "immediate" },
                        { description: "n8n에서 일괄 실행", label: "예약", value: "scheduled" },
                        { description: "직접 실행만 사용", label: "수동", value: "manual" }
                      ].map((option) => (
                        <label
                          className={cn(
                            "cursor-pointer rounded-md border bg-white px-3 py-2 transition",
                            aiCleanupMode === option.value ? "border-slate-950 ring-2 ring-slate-100" : "border-slate-200 hover:border-slate-300"
                          )}
                          key={option.value}
                        >
                          <input
                            checked={aiCleanupMode === option.value}
                            className="sr-only"
                            onChange={() => setAiCleanupMode(option.value as AiCleanupMode)}
                            type="radio"
                          />
                          <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                          <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{option.description}</span>
                        </label>
                      ))}
                    </div>
                    {aiRewriteRequests.length > 0 && aiCleanupMode !== "scheduled" ? (
                      <p className="mt-2 text-xs font-semibold leading-5 text-amber-700">
                        대기 목록은 보존되지만, 예약 모드가 아니면 n8n 예약 정리에서 처리되지 않습니다.
                      </p>
                    ) : null}
                  </div>

                <Field label="Gemini API key">
                  <Input
                    autoComplete="off"
                    onChange={(event) => {
                      setAiApiKey(event.target.value);
                      if (event.target.value) {
                        setAiClearApiKey(false);
                      }
                    }}
                    placeholder={aiSetting.apiKeySaved ? "새 key 입력 시 교체" : "Gemini API key"}
                    type="password"
                    value={aiApiKey}
                  />
                </Field>

                {aiSetting.apiKeySaved ? (
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                    <input checked={aiClearApiKey} className="size-4 accent-slate-950" disabled={Boolean(aiApiKey)} onChange={(event) => setAiClearApiKey(event.target.checked)} type="checkbox" />
                    저장된 API key 삭제
                  </label>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="모델">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      onChange={(event) => setAiModel(event.target.value)}
                      value={aiModel}
                    >
                      {aiModelPresets.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {aiModel === "__custom__" ? (
                    <Field label="직접 입력 모델명">
                      <Input onChange={(event) => setAiCustomModel(event.target.value)} placeholder="gemini-..." value={aiCustomModel} />
                    </Field>
                  ) : (
                    <Field label="참고할 이전 저장 WORK 날짜">
                      <select
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        onChange={(event) => setAiContextDays(Number(event.target.value))}
                        value={aiContextDays}
                      >
                        {[0, 3, 5, 10].map((value) => (
                          <option key={value} value={value}>
                            최근 {value}개
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>

                {aiModel === "__custom__" ? (
                  <Field label="참고할 이전 저장 WORK 날짜">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      onChange={(event) => setAiContextDays(Number(event.target.value))}
                      value={aiContextDays}
                    >
                      {[0, 3, 5, 10].map((value) => (
                        <option key={value} value={value}>
                          최근 {value}개
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input checked={aiBackfillMissing} className="size-4 accent-slate-950" onChange={(event) => setAiBackfillMissing(event.target.checked)} type="checkbox" />
                    이전 빈 번역/요약 보정
                  </label>
                  <Field label="한 번에 보정할 이전 날짜">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      disabled={!aiBackfillMissing}
                      onChange={(event) => setAiBackfillLimit(Number(event.target.value))}
                      value={aiBackfillLimit}
                    >
                      {[1, 3, 5].map((value) => (
                        <option key={value} value={value}>
                          {value}일
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                  <p className="text-xs font-medium leading-5 text-slate-500">미기입, 작성 예정, draft, 휴가, 공휴일, 빈 내용 업무는 참고/보정 대상에서 제외됩니다. 기존 번역본과 요약은 덮어쓰지 않습니다.</p>
                </div>

                {(aiSettingState !== "idle" || aiTestMessage) ? (
                  <div className="mt-3 space-y-1">
                    {aiSettingMessage ? <p className={cn("text-sm font-semibold", aiSettingState === "error" ? "text-red-600" : "text-emerald-700")}>{aiSettingMessage}</p> : null}
                    {aiTestMessage ? <p className={cn("text-sm font-semibold", aiTestState === "error" ? "text-red-600" : "text-emerald-700")}>{aiTestMessage}</p> : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button disabled={aiTestState === "saving"} onClick={() => void testAiSetting()} type="button" variant="secondary">
                    {aiTestState === "saving" ? "테스트 중" : "키 테스트"}
                  </Button>
                  <Button disabled={aiSettingState === "saving"} onClick={() => void saveAiSetting()} type="button">
                    {aiSettingState === "saving" ? "저장 중" : "AI 설정 저장"}
                  </Button>
                </div>
              </div>
            </section>

            {isAdmin ? (
              <section className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-950">사이트 설정</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">관리자만 공휴일, 캐시, 사용자 설정을 변경할 수 있습니다.</p>
                  </div>
                  <Badge tone="green">관리자 전용</Badge>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-bold text-slate-950">공휴일 API</h4>
                    <p className="mt-1 text-sm leading-6 text-slate-600">data.go.kr 서비스 키를 저장하고 현재 월 기준으로 테스트합니다.</p>
                    <div className="mt-4">
                      <Field label="공공데이터포털 서비스 키">
                        <Input onChange={(event) => setHolidayApiKey(event.target.value)} placeholder="서비스 키" type="password" value={holidayApiKey} />
                      </Field>
                    </div>
                    {(holidayApiKeyState === "saved" || holidayApiKeyState === "error" || holidayApiKeyTestMessage) ? (
                      <div className="mt-3 space-y-1">
                        {holidayApiKeyState === "saved" ? <p className="text-sm font-semibold text-emerald-700">API 키를 저장했습니다.</p> : null}
                        {holidayApiKeyState === "error" ? <p className="text-sm font-semibold text-red-600">{holidayApiKeyError}</p> : null}
                        {holidayApiKeyTestMessage ? (
                          <p className={cn("text-sm font-semibold", holidayApiKeyTestState === "error" ? "text-red-600" : "text-emerald-700")}>{holidayApiKeyTestMessage}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button disabled={holidayApiKeyTestState === "saving"} onClick={() => void testHolidayApiKey()} type="button" variant="secondary">
                        {holidayApiKeyTestState === "saving" ? "테스트 중" : "키 테스트"}
                      </Button>
                      <Button disabled={holidayApiKeyState === "saving"} onClick={() => void saveHolidayApiKey()} type="button">
                        {holidayApiKeyState === "saving" ? "저장 중" : "키 저장"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-bold text-slate-950">공휴일 캐시</h4>
                    <p className="mt-1 text-sm leading-6 text-slate-600">현재 표시 중인 월의 공휴일 캐시를 삭제하고 다시 조회합니다.</p>
                    {holidayResetState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">공휴일 정보를 다시 불러왔습니다.</p> : null}
                    {holidayResetState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{holidayResetError}</p> : null}
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      {isDevelopment ? (
                        <Button disabled={holidayResetState === "saving"} onClick={() => void resetAllHolidays()} type="button" variant="secondary">
                          <Trash2 aria-hidden="true" className="size-4" />
                          모든 API 공휴일 삭제
                        </Button>
                      ) : null}
                      <Button disabled={holidayResetState === "saving"} onClick={() => void resetCurrentMonthHolidays()} type="button" variant="secondary">
                        <RotateCcw aria-hidden="true" className="size-4" />
                        {holidayResetState === "saving" ? "다시 불러오는 중" : "현재 월 공휴일 리셋"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-bold text-slate-950">사용자 관리</h4>
                    <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                      {managedUsers.map((user) => (
                        <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm" key={user.id}>
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-slate-950">{user.username}</span>
                            <span className="block truncate text-xs font-medium text-slate-500">{user.email || "이메일 없음"}</span>
                          </div>
                          <Badge tone={user.role === "ADMIN" ? "green" : "gray"}>{user.role === "ADMIN" ? "관리자" : "일반"}</Badge>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label="아이디">
                        <Input onChange={(event) => setNewUserUsername(event.target.value)} value={newUserUsername} />
                      </Field>
                      <Field label="이메일">
                        <Input autoComplete="email" onChange={(event) => setNewUserEmail(event.target.value)} placeholder="reminder@example.com" type="email" value={newUserEmail} />
                      </Field>
                      <Field label="비밀번호">
                        <Input autoComplete="new-password" onChange={(event) => setNewUserPassword(event.target.value)} type="password" value={newUserPassword} />
                      </Field>
                      <Field label="권한">
                        <select
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                          onChange={(event) => setNewUserRole(event.target.value === "ADMIN" ? "ADMIN" : "USER")}
                          value={newUserRole}
                        >
                          <option value="USER">일반</option>
                          <option value="ADMIN">관리자</option>
                        </select>
                      </Field>
                    </div>
                    {userCreateState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">사용자를 추가했습니다.</p> : null}
                    {userCreateState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{userCreateError}</p> : null}
                    <div className="mt-4 flex justify-end">
                      <Button disabled={userCreateState === "saving"} onClick={() => void createUser()} type="button">
                        <Plus aria-hidden="true" className="size-4" />
                        {userCreateState === "saving" ? "추가 중" : "사용자 추가"}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <Button onClick={() => setIsSettingsOpen(false)} variant="secondary">
                닫기
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {isAiRewriteQueueOpen ? (
        <ModalShell onClose={() => setIsAiRewriteQueueOpen(false)} onConfirm={() => setIsAiRewriteQueueOpen(false)} title="AI 예약 정리 대기 목록">
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium leading-6 text-slate-600">
              {aiCleanupMode === "scheduled"
                ? "아래 날짜는 n8n 예약 정리 때 빈 AI 필드를 채우거나, 덮어쓰기 예약이 있으면 기존 값을 다시 작성합니다."
                : "대기 목록은 보존되어 있지만, AI 정리 방식이 예약이 아니면 n8n 예약 정리에서 처리되지 않습니다."}
            </div>
            {aiRewriteRequests.length > 0 ? (
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-slate-200">
                {aiRewriteRequests.map((request) => (
                  <div className="border-b border-slate-100 px-3 py-3 last:border-b-0" key={request.dateKey}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-950">{formatKoreanDate(request.dateKey)}</p>
                        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                          WORK {request.entryCount}개 · {request.cleanupType === "rewrite" ? "기존 AI 필드 덮어쓰기 예약" : "빈 AI 필드 채우기 대기"}
                        </p>
                      </div>
                      <Badge tone={aiCleanupMode === "scheduled" ? request.cleanupType === "rewrite" ? "orange" : "blue" : "gray"}>
                        {aiCleanupMode === "scheduled" ? request.cleanupType === "rewrite" ? "덮어쓰기" : "채우기" : "보류"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {request.shortVersion.trim() || truncateContent(request.previewContent) || "(내용 없음)"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm font-semibold text-slate-500">
                대기중인 AI 예약 정리가 없습니다.
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => setIsAiRewriteQueueOpen(false)} type="button">
                확인
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {isProjectModalOpen ? (
        <ModalShell onClose={closeProjectModal} title="새 프로젝트 등록">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void addProject(); }}>
            <Field label="프로젝트명">
              <Input autoFocus onChange={(event) => setNewProjectName(event.target.value)} placeholder="예: 고객 포털 개선" value={newProjectName} />
            </Field>
            {projectAddState === "error" ? <p className="text-sm font-semibold text-red-600">{projectAddError}</p> : null}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={closeProjectModal} type="button" variant="secondary">
                취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button disabled={projectAddState === "saving"} type="submit">
                <Plus aria-hidden="true" className="size-4" />
                {projectAddState === "saving" ? "등록 중" : "등록"}
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {isVacationRangeOpen ? (
        <ModalShell onClose={closeVacationRangeModal} onConfirm={() => void applyVacationRange(vacationRangeConflictKeys.length > 0)} title="휴가 기간 설정">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {canEditVacationRangeStart ? (
                <Field label="시작날짜">
                  <Input disabled={vacationRangeState === "saving"} onChange={(event) => { setVacationRangeStart(event.target.value); setVacationRangeConflictKeys([]); if (vacationRangeEnd < event.target.value) setVacationRangeEnd(event.target.value); }} type="date" value={vacationRangeStart} />
                </Field>
              ) : (
                <Field label="시작날짜">
                  <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                    {formatKoreanDate(vacationRangeStart)}
                  </div>
                </Field>
              )}
              <Field label="끝날짜">
                <Input disabled={vacationRangeState === "saving"} min={vacationRangeStart} onChange={(event) => { setVacationRangeEnd(event.target.value); setVacationRangeConflictKeys([]); }} type="date" value={vacationRangeEnd} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <Field label="휴가 유형">
                <Input disabled={vacationRangeState === "saving"} onChange={(event) => setVacationRangeName(event.target.value)} placeholder="예: 연차, 오전 반차" value={vacationRangeName} />
              </Field>
              <Field label="휴가 시간">
                <Input disabled={vacationRangeState === "saving"} max={24} min={0} onChange={(event) => setVacationRangeHours(Number(event.target.value))} step={0.5} type="number" value={vacationRangeHours} />
              </Field>
            </div>
            {vacationRangeConflictKeys.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-900">
                기존 기록이 있는 {vacationRangeConflictKeys.length}일이 휴가로 교체됩니다. 공휴일은 교체하지 않습니다.
              </div>
            ) : null}
            {vacationRangeProgress.total > 0 ? (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>저장 진행</span>
                  <span>{vacationRangeProgress.completed}/{vacationRangeProgress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-950 transition-all"
                    style={{ width: `${Math.round((vacationRangeProgress.completed / vacationRangeProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
            {vacationRangeMessage ? <p className="text-sm font-semibold text-emerald-700">{vacationRangeMessage}</p> : null}
            {vacationRangeState === "error" ? <p className="text-sm font-semibold text-red-600">{vacationRangeError}</p> : null}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button disabled={vacationRangeState === "saving"} onClick={closeVacationRangeModal} type="button" variant="secondary">
                취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button disabled={vacationRangeState === "saving"} onClick={() => void applyVacationRange(vacationRangeConflictKeys.length > 0)} type="button">
                {vacationRangeState === "saving" ? "저장 중" : vacationRangeConflictKeys.length > 0 ? "교체하고 기간 저장" : "기간 저장"}
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {connectedVacationPrompt && connectedVacationAction === "delete" ? (
        <ModalShell onClose={() => setConnectedVacationPrompt(null)} onConfirm={() => void deleteConnectedVacationPrompt()} title="연결된 휴가 삭제">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              붙어있는 휴가 {connectedVacationPrompt.dateKeys.length}일이 있습니다. 연결된 휴가를 함께 삭제할까요?
            </p>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
              {formatKoreanDate(connectedVacationPrompt.dateKeys[0]!)} - {formatKoreanDate(connectedVacationPrompt.dateKeys[connectedVacationPrompt.dateKeys.length - 1]!)}
            </div>
            <ProgressBar label="삭제 진행" progress={connectedVacationProgress} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button disabled={isConnectedVacationSaving} onClick={() => setConnectedVacationPrompt(null)} type="button" variant="secondary">
                취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button disabled={isConnectedVacationSaving} onClick={() => { setConnectedVacationPrompt(null); void deleteSelectedEntry({ skipConnectedVacation: true }); }} type="button" variant="secondary">
                현재 날짜만 삭제
              </Button>
              <Button disabled={isConnectedVacationSaving} onClick={() => void deleteConnectedVacationPrompt()} type="button" variant="danger">
                {isConnectedVacationSaving ? "삭제 중" : "함께 삭제"}
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {connectedVacationPrompt && connectedVacationAction === "save" ? (
        <ModalShell onClose={() => setConnectedVacationPrompt(null)} onConfirm={() => void saveConnectedVacationPrompt()} title="연결된 휴가 수정">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              붙어있는 휴가 {connectedVacationPrompt.dateKeys.length}일이 있습니다. 현재 휴가 유형과 시간을 연결된 휴가에 함께 적용할까요?
            </p>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
              {formatKoreanDate(connectedVacationPrompt.dateKeys[0]!)} - {formatKoreanDate(connectedVacationPrompt.dateKeys[connectedVacationPrompt.dateKeys.length - 1]!)}
            </div>
            <ProgressBar label="저장 진행" progress={connectedVacationProgress} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button disabled={isConnectedVacationSaving} onClick={() => setConnectedVacationPrompt(null)} type="button" variant="secondary">
                취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button disabled={isConnectedVacationSaving} onClick={() => { setConnectedVacationPrompt(null); void saveSelectedDraft({ skipConnectedVacation: true }); }} type="button" variant="secondary">
                현재 날짜만 저장
              </Button>
              <Button disabled={isConnectedVacationSaving} onClick={() => void saveConnectedVacationPrompt()} type="button">
                {isConnectedVacationSaving ? "저장 중" : "함께 저장"}
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {aiRewritePromptDateKey ? (
        <ModalShell onClose={() => setAiRewritePromptDateKey("")} onConfirm={() => { setAiRewritePromptDateKey(""); void saveSelectedDraft({ overwriteAiAfterSave: true, skipAiRewritePrompt: true }); }} title="AI 번역/요약 업데이트">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              {formatKoreanDate(aiRewritePromptDateKey)}의 내용이 변경되었고 기존 영문 번역본 또는 짧은 버전이 있습니다. {aiSetting.cleanupMode === "scheduled" ? "저장 후 이 날짜를 n8n 예약 정리의 덮어쓰기 대상으로 표시할까요?" : "저장 후 AI가 현재 날짜의 번역본과 요약을 새 내용 기준으로 다시 작성할까요?"}
            </p>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
              {aiSetting.cleanupMode === "scheduled"
                ? "예약 정리는 기본적으로 빈 AI 필드만 채우고, 덮어쓰기는 이 날짜에만 한 번 예약됩니다."
                : "이전 날짜 보정은 기존처럼 비어 있는 AI 필드만 채우고, 덮어쓰기는 현재 날짜에만 적용됩니다."}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => setAiRewritePromptDateKey("")} type="button" variant="secondary">
                취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button onClick={() => { setAiRewritePromptDateKey(""); void saveSelectedDraft({ skipAiRewritePrompt: true }); }} type="button" variant="secondary">
                저장만
              </Button>
              <Button onClick={() => { setAiRewritePromptDateKey(""); void saveSelectedDraft({ overwriteAiAfterSave: true, skipAiRewritePrompt: true }); }} type="button">
                AI도 업데이트
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {aiOverwriteEditPrompt ? (
        <ModalShell onClose={revertScheduledOverwriteManualEdit} onConfirm={disableScheduledOverwriteAfterManualEdit} title="예약 AI 덮어쓰기 경고">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              이 날짜는 예약 AI 정리에서 기존 {aiOverwriteEditPrompt.field === "summary" ? "짧은 버전" : "영문 번역본"}을 덮어쓰도록 대기 중입니다. 지금 수동으로 수정한 값을 보호하려면 이 날짜의 예약 덮어쓰기를 꺼주세요.
            </p>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-900">
              덮어쓰기를 유지하면 다음 n8n 예약 실행 때 이 값이 다시 작성될 수 있습니다.
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={revertScheduledOverwriteManualEdit} type="button" variant="secondary">
                수정 취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button onClick={keepScheduledOverwriteAfterManualEdit} type="button" variant="secondary">
                덮어쓰기 유지
              </Button>
              <Button onClick={disableScheduledOverwriteAfterManualEdit} type="button">
                이 날짜만 끄기
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {isDeleteConfirmOpen ? (
        <ModalShell onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={confirmDeleteSelectedDate} title="기록 삭제">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              {formatKoreanDate(selectedDateKey)}의 저장된 업무 기록을 삭제할까요? 이 날짜의 업무, 휴가, 공휴일 entry가 함께 삭제됩니다.
            </p>
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700">
              삭제 후에는 해당 날짜가 다시 미기입 상태로 돌아갑니다.
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => setIsDeleteConfirmOpen(false)} type="button" variant="secondary">
                취소
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button disabled={deleteState === "deleting"} onClick={confirmDeleteSelectedDate} type="button" variant="danger">
                {deleteState === "deleting" ? "삭제 중" : "삭제"}
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {notionSyncError ? (
        <ModalShell onClose={() => setNotionSyncError("")} onConfirm={() => setNotionSyncError("")} title="Notion 필드 업데이트 실패">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              업무 기록은 저장/삭제됐지만 연결된 Notion 카드의 숫자/날짜 필드 업데이트에 실패했습니다.
            </p>
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {notionSyncError}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
              Notion 연결 설정에서 업무 기간 시간, 작업일수, 가용 시간, 마지막 작업일, aJam 업데이트 시간 필드 매핑과 integration 권한을 확인해 주세요.
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => setNotionSyncError("")} type="button">
                확인
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
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
        <ModalShell onClose={() => setPendingNavigation(null)} onConfirm={confirmPendingNavigation} title="저장되지 않은 변경">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">현재 날짜의 변경사항이 아직 저장되지 않았습니다. 저장하지 않고 이동하면 마지막 저장 상태로 되돌아갑니다.</p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => setPendingNavigation(null)} variant="secondary">
                계속 작성
                <ShortcutHint keys={["Esc"]} />
              </Button>
              <Button onClick={confirmPendingNavigation} variant="danger">
                저장하지 않고 이동
                <ShortcutHint keys={["↵"]} />
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  tone,
  value
}: {
  icon: LucideIcon;
  label: string;
  tone?: "red";
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-slate-200 py-2 sm:border-r sm:px-4 sm:last:border-r-0">
      <div className={cn("flex size-9 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm", tone === "red" && "text-red-600")}>
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className={cn("text-lg font-bold text-slate-950", tone === "red" && "text-red-600")}>{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TimesheetStatus }) {
  if (status === "FUTURE") {
    return null;
  }

  return (
    <Badge tone={badgeToneByStatus[status]}>
      <span className="mr-1 size-1.5 rounded-full bg-current" />
      {statusLabel[status]}
    </Badge>
  );
}

function VacationDotBadge() {
  return (
    <Badge tone="blue">
      <span className="size-1.5 rounded-full bg-current" />
    </Badge>
  );
}

function CalendarStatusBadges({ row }: { row: TimesheetRow }) {
  const isVacationOnly = row.hasVacation && row.status === "VACATION";

  if (isVacationOnly) {
    return <StatusBadge status="VACATION" />;
  }

  return (
    <div className="flex items-center gap-1">
      {row.hasVacation ? <VacationDotBadge /> : null}
      <StatusBadge status={row.status} />
    </div>
  );
}

function hasTimeMismatch(row: TimesheetRow): boolean {
  return row.entryCount > 0 && row.status !== "MISSING" && row.status !== "HOLIDAY" && Math.abs(row.hours - 8) > 0.001;
}

function TimeMismatchIcon({ hours }: { hours: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-orange-600"
      title={`총 시간이 8시간이 아닙니다. 현재 ${hours}h입니다.`}
    >
      <Clock3 aria-label="총 시간 경고" className="size-3.5" />
    </span>
  );
}

function NotionCardWarningIcon() {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-amber-500"
      title="Notion 카드가 없거나 배분 시간이 업무 시간과 맞지 않습니다."
    >
      <AlertTriangle aria-label="Notion 카드 경고" className="size-3.5" />
    </span>
  );
}

function ProgressBar({ label, progress }: { label: string; progress: { completed: number; total: number } }) {
  if (progress.total <= 0) {
    return null;
  }

  const percentage = Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span>{progress.completed}/{progress.total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function CalendarView({
  celebratingDateKey,
  rows,
  selectedDateKey,
  setSelectedDateKey,
  todayKey,
  weeks
}: {
  celebratingDateKey: string;
  rows: Record<string, TimesheetRow>;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  todayKey: string;
  weeks: ReturnType<typeof getBusinessCalendarWeeks>;
}) {
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!celebratingDateKey) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const element = dateButtonRefs.current.get(celebratingDateKey);

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const origin = {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height / 2) / window.innerHeight
    };

    void confetti({
      colors: ["#fb7185", "#f59e0b", "#34d399", "#38bdf8", "#e879f9", "#a3e635"],
      origin,
      particleCount: 85,
      scalar: 0.85,
      spread: 78,
      startVelocity: 34,
      ticks: 180
    });
  }, [celebratingDateKey]);

  return (
    <div className="p-4">
      <div className="grid grid-cols-5 border-b border-slate-200 pb-2">
        {weekdays.map((weekday) => (
          <div className="px-2 text-xs font-bold text-slate-400" key={weekday}>
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid gap-2 pt-3">
        {weeks.map((week, index) => (
          <div className="grid grid-cols-5 gap-2" key={`${index}-${week.map((cell) => cell?.dateKey ?? "blank").join("-")}`}>
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return <div className="min-h-32 rounded-md border border-dashed border-slate-100 bg-slate-50/60" key={`blank-${cellIndex}`} />;
              }

              const row = rows[cell.dateKey];

              return (
                <button
                  className={cn(
                    "relative flex min-h-32 flex-col justify-between rounded-md border p-3 text-left transition",
                    row && cellToneByStatus[row.status],
                    selectedDateKey === cell.dateKey && "ring-2 ring-slate-950 ring-offset-2"
                  )}
                  key={cell.dateKey}
                  onClick={() => setSelectedDateKey(cell.dateKey)}
                  ref={(element) => {
                    if (element) {
                      dateButtonRefs.current.set(cell.dateKey, element);
                    } else {
                      dateButtonRefs.current.delete(cell.dateKey);
                    }
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-0.5">
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full text-sm font-bold",
                          cell.dateKey === todayKey ? "bg-slate-950 text-white" : "text-slate-950"
                        )}
                      >
                        {cell.day}
                      </span>
                      {row && hasTimeMismatch(row) ? <TimeMismatchIcon hours={row.hours} /> : null}
                      {row?.hasNotionCardWarning ? <NotionCardWarningIcon /> : null}
                    </span>
                    {row ? <CalendarStatusBadges row={row} /> : null}
                  </div>
                  <div className="mt-3 min-w-0 space-y-1">
                    {row?.kind === "WORK" && row.project ? (
                      <div className="flex min-w-0 items-center gap-1">
                        <p className="min-w-0 truncate text-xs font-bold text-slate-950">{row.project}</p>
                        {row.projectCount > 1 ? <span className="shrink-0 text-[10px] font-bold text-slate-500">+{row.projectCount}</span> : null}
                      </div>
                    ) : null}
                    <p className={cn("line-clamp-2 break-words text-sm leading-5 text-slate-600", row && row.entryCount > 1 && "pr-8", row?.status === "MISSING" && !draftPreviewText(row) && "font-bold text-red-600")}>
                      {row ? calendarStatusText(row, selectedDateKey === cell.dateKey) : ""}
                    </p>
                  </div>
                  {row && row.entryCount > 1 ? <span className="absolute bottom-3 right-3 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">{row.entryCount}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({
  dateKeys,
  rows,
  selectedEntryId,
  selectedDateKey,
  setSelectedDateKey,
  setSelectedEntry
}: {
  dateKeys: string[];
  rows: Record<string, TimesheetRow>;
  selectedEntryId: string;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  setSelectedEntry: (dateKey: string, entryClientId: string) => void;
}) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="grid min-w-[980px] grid-cols-[120px_112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-bold text-slate-400">
        <span>날짜</span>
        <span>상태</span>
        <span>시간</span>
        <span>프로젝트</span>
        <span>내용</span>
        <span>AI 번역본</span>
      </div>
      <div className="divide-y divide-slate-100">
        {dateKeys.map((dateKey) => {
          const row = rows[dateKey]!;
          const emptyStatusLabel = row.status === "MISSING" ? "입력안됨" : row.kind === "HOLIDAY" ? "공휴일" : row.kind === "VACATION" ? "휴가" : "업무";
          const emptyStatusTone: "blue" | "green" | "orange" | "white" = row.status === "MISSING" ? "white" : row.kind === "HOLIDAY" ? "orange" : row.kind === "VACATION" ? "blue" : "green";

          if (row.status === "MISSING" || row.entries.length === 0) {
            return (
              <button
                className={cn(
                  "grid min-w-[980px] grid-cols-[120px_112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-50",
                  row.status === "MISSING" && "bg-amber-50 hover:bg-amber-100/70",
                  selectedDateKey === dateKey && "bg-slate-100"
                )}
                key={dateKey}
                onClick={() => setSelectedDateKey(dateKey)}
                type="button"
              >
                <span className="flex items-center gap-1.5 font-semibold text-slate-950">
                  <span>{formatKoreanDate(dateKey)}</span>
                  {hasTimeMismatch(row) ? <TimeMismatchIcon hours={row.hours} /> : null}
                  {row.hasNotionCardWarning ? <NotionCardWarningIcon /> : null}
                </span>
                <span>
                  <Badge tone={emptyStatusTone}>{emptyStatusLabel}</Badge>
                </span>
                <span className="font-semibold text-slate-700">{row.status === "MISSING" ? "0h" : `${row.hours}h`}</span>
                <span className="truncate font-medium text-slate-700">{row.kind === "HOLIDAY" ? row.holidayName || "-" : row.kind === "VACATION" ? row.vacationName || "휴가" : row.project}</span>
                <span className={cn("truncate text-slate-600", row.status === "MISSING" && "font-bold text-red-600")}>{listSummaryText(row)}</span>
                <span className="truncate text-slate-500">-</span>
              </button>
            );
          }

          return row.entries.map((entry, index) => {
            const isSelected = selectedDateKey === dateKey && selectedEntryId === entry.clientId;
            const entryContent = entry.kind === "WORK" ? entry.content.trim() || "(내용 없음)" : "-";
            const entryTranslation = entry.kind === "WORK" ? entry.aiTranslation.trim() || "-" : "-";
            const hasEntryNotionWarning = entryHasNotionCardWarning(entry, row.status !== "MISSING");

            return (
              <button
                className={cn(
                  "grid min-w-[980px] grid-cols-[120px_112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-50",
                  isSelected && "bg-slate-50 ring-1 ring-inset ring-slate-300"
                )}
                key={`${dateKey}-${entry.clientId}`}
                onClick={() => setSelectedEntry(dateKey, entry.clientId)}
                type="button"
              >
                <span className="flex items-center gap-1.5 font-semibold text-slate-950">
                  {index === 0 ? (
                    <>
                      <span>{formatKoreanDate(dateKey)}</span>
                      {hasTimeMismatch(row) ? <TimeMismatchIcon hours={row.hours} /> : null}
                    </>
                  ) : null}
                </span>
                <span>
                  <span className="inline-flex items-center gap-1.5">
                    <Badge tone={entryKindTone(entry)}>{entryKindLabel(entry)}</Badge>
                    {hasEntryNotionWarning ? <NotionCardWarningIcon /> : null}
                  </span>
                </span>
                <span className="font-semibold text-slate-700">{entry.hours}h</span>
                <span className="truncate font-medium text-slate-700">{entryTitle(entry)}</span>
                <span className="line-clamp-2 min-w-0 break-words text-slate-600">{entryContent}</span>
                <span className="line-clamp-2 min-w-0 break-words text-slate-500">{entryTranslation}</span>
              </button>
            );
          });
        })}
      </div>
    </div>
  );
}

function entryTitle(entry: TimesheetEntryDraft): string {
  if (entry.kind === "VACATION") {
    return entry.vacationName || "휴가";
  }

  if (entry.kind === "HOLIDAY") {
    return entry.holidayName || "공휴일";
  }

  return entry.project;
}

function entryKindLabel(entry: TimesheetEntryDraft): string {
  if (entry.kind === "VACATION") {
    return "휴가";
  }

  if (entry.kind === "HOLIDAY") {
    return "공휴일";
  }

  return "업무";
}

function entryKindTone(entry: TimesheetEntryDraft) {
  if (entry.kind === "VACATION") {
    return "blue";
  }

  if (entry.kind === "HOLIDAY") {
    return "orange";
  }

  return "green";
}

function entryContentPreview(entry: TimesheetEntryDraft): string {
  return truncateContent(entry.content);
}

function SortableEntryItem({
  entry,
  index,
  isSelected,
  notionCardWarning,
  onMoveDown,
  onMoveUp,
  onRemove,
  onSelect,
  totalCount
}: {
  entry: TimesheetEntryDraft;
  index: number;
  isSelected: boolean;
  notionCardWarning: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  onSelect: () => void;
  totalCount: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: entry.clientId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      className={cn("rounded-md border bg-white p-3 shadow-sm transition", isSelected ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200")}
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-start gap-2">
        <button className="mt-0.5 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" type="button" {...attributes} {...listeners}>
          <GripVertical aria-hidden="true" className="size-4" />
          <span className="sr-only">순서 변경</span>
        </button>
        <button className="block min-w-0 flex-1 rounded-sm text-left" onClick={onSelect} type="button">
          <div className="flex items-center gap-2">
            <Badge tone={entryKindTone(entry)}>{entryKindLabel(entry)}</Badge>
            <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{entryTitle(entry)}</span>
            <span className="text-sm font-bold text-slate-950">{entry.hours}h</span>
            {notionCardWarning ? <NotionCardWarningIcon /> : null}
          </div>
          {entry.kind === "WORK" && entryContentPreview(entry) ? <p className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-slate-500">{entryContentPreview(entry)}</p> : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={index === 0} onClick={onMoveUp} type="button">
            <ArrowUp aria-hidden="true" className="size-4" />
            <span className="sr-only">위로 이동</span>
          </button>
          <button className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={index === totalCount - 1} onClick={onMoveDown} type="button">
            <ArrowDown aria-hidden="true" className="size-4" />
            <span className="sr-only">아래로 이동</span>
          </button>
          <button className="rounded-md p-1 text-red-500 transition hover:bg-red-50 hover:text-red-700" onClick={onRemove} type="button">
            <Trash2 aria-hidden="true" className="size-4" />
            <span className="sr-only">삭제</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
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

function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-current/20 bg-current/10 px-1.5 font-mono text-[10px] font-black leading-none tracking-normal">
      {children}
    </kbd>
  );
}

function ShortcutHint({ keys }: { keys: ReactNode[] }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1 opacity-80">
      {keys.map((key, index) => (
        <ShortcutKey key={index}>{key}</ShortcutKey>
      ))}
    </span>
  );
}

function ModalShell({ children, onClose, onConfirm, title }: { children: ReactNode; onClose: () => void; onConfirm?: () => void; title: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Enter" || !onConfirm) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.closest("button")) {
      return;
    }

    event.preventDefault();
    onConfirm();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div aria-labelledby="modal-title" aria-modal="true" className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20 outline-none" ref={dialogRef} role="dialog" tabIndex={-1}>
        <h2 className="text-lg font-bold text-slate-950" id="modal-title">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
