"use server";

import {
  addProject,
  createManagedUser,
  deleteTimesheetEntry,
  findLatestWorkNotionCardsBefore,
  findLatestWorkProjectBefore,
  getLatestNotionSyncRun,
  getUserAiSetting,
  getUserGeminiApiKey,
  getUserNotionConnection,
  getManagedUser,
  listEnabledNotionWeeklyDefaultCardsForDate,
  listCachedNotionCards,
  listCachedNotionCardsByPageIds,
  listHolidays,
  listProjects,
  listTimesheetAiRewriteRequests,
  listTimesheetEntries,
  listVacations,
  resetHolidayCache,
  setAppSetting,
  syncNotionCardsForDate,
  syncNotionWorkHoursForPages,
  updateManagedUser,
  updateUserAiSetting,
  type NotionCardCacheRecord,
  type NotionSyncRunRecord,
  type UserAiSetting,
  type UserAiSettingUpdate,
  saveTimesheetDay,
  type ManagedUser,
  type StoredTimesheetDraft,
  type StoredTimesheetEntry,
  type TimesheetAiRewriteRequest,
  type UserRole
} from "@timesheet/db";
import { filterOpenNotionCardCandidates, type TimesheetDayDraft, type TimesheetEntryNotionCardDraft } from "@timesheet/domain";
import { redirect } from "next/navigation";

import { createSession, destroySession, getSession } from "@/server/session";
import {
  runTimesheetAiCleanupForUser,
  testGeminiAiCleanupConnection,
  type AiCleanupOptions,
  type TimesheetAiCleanupResult
} from "@/server/timesheet-ai-cleanup";

import { collectChangedNotionPageIdsForTimesheetSave } from "./notion-timesheet-sync-scope";

export type TimesheetMonthData = {
  entries: StoredTimesheetDraft[];
  holidayWarning?: string;
  holidays: Array<{ dateKey: string; name: string }>;
  projects: string[];
  vacations: Array<{ dateKey: string; hours: number; name: string }>;
};

export type HolidayApiKeyTestResult = {
  holidays: Array<{ dateKey: string; name: string }>;
  ok: boolean;
};

export type TimesheetDeleteResult = {
  notionSyncError: string;
};

export type TimesheetSaveResult = {
  day: StoredTimesheetDraft;
  notionSyncError: string;
};

export type GeminiApiKeyTestResult = {
  ok: boolean;
};

export type NotionCardCandidateSyncMeta = {
  cardsFetched: number;
  errorMessage: string;
  lastAttemptedAt: string;
  lastFetchedAt: string;
  partial: boolean;
  source: "cache" | "notion";
  status: "success" | "failed" | "";
};

export type NotionCardCandidatesResult = {
  candidates: NotionCardCacheRecord[];
  sync: NotionCardCandidateSyncMeta;
};

export type LoadNotionCardCandidatesInput =
  | string
  | {
      dateKey: string;
      includeDone?: boolean;
      linkedPageIds?: string[];
    };

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthRange(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    endDateKey: toDateKey(year, monthIndex, lastDay),
    startDateKey: toDateKey(year, monthIndex, 1)
  };
}

async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await getManagedUser(session.userId);

  if (!user) {
    await destroySession();
    redirect("/login");
  }

  return user;
}

async function requireAdmin() {
  const user = await requireSession();

  if (user.role !== "ADMIN") {
    throw new Error("관리자만 사용할 수 있습니다.");
  }

  return user;
}

function mergeLegacyVacations(entries: StoredTimesheetDraft[], vacations: Array<{ dateKey: string; hours: number; name: string }>): StoredTimesheetDraft[] {
  const days = new Map(entries.map((entry) => [entry.dateKey, { ...entry, entries: [...entry.entries] }]));

  for (const vacation of vacations) {
    const day = days.get(vacation.dateKey) ?? {
      aiRewriteRequested: false,
      dateKey: vacation.dateKey,
      entries: [],
      holidayName: "",
      shortVersion: ""
    };

    if (day.entries.some((entry) => entry.kind === "VACATION")) {
      days.set(vacation.dateKey, day);
      continue;
    }

    const vacationEntry: StoredTimesheetEntry = {
      aiTranslation: "",
      clientId: `legacy-vacation-${vacation.dateKey}`,
      content: "",
      holidayName: "",
      hours: vacation.hours,
      id: "",
      kind: "VACATION",
      notionCards: [],
      project: "",
      sortOrder: day.entries.length,
      vacationName: vacation.name
    };

    day.entries.push(vacationEntry);
    days.set(vacation.dateKey, day);
  }

  return Array.from(days.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function encodeServiceKey(serviceKey: string): string {
  return serviceKey.includes("%") ? serviceKey : encodeURIComponent(serviceKey);
}

function toDateKeyFromLocdate(locdate: number | string | undefined): string | null {
  const value = locdate?.toString();

  if (!value || !/^\d{8}$/.test(value)) {
    return null;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeHolidayItems(items: unknown): Array<{ dateName?: string; isHoliday?: string; locdate?: number | string }> {
  if (!items) {
    return [];
  }

  return Array.isArray(items) ? items : [items as { dateName?: string; isHoliday?: string; locdate?: number | string }];
}

async function fetchRestDeInfoWithKey(params: { serviceKey: string; solMonth: number; solYear: number }) {
  const serviceKey = params.serviceKey.trim();

  if (!serviceKey) {
    throw new Error("API 키를 입력해 주세요.");
  }

  const solMonth = String(params.solMonth).padStart(2, "0");
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?ServiceKey=${encodeServiceKey(serviceKey)}&solYear=${params.solYear}&solMonth=${solMonth}&numOfRows=100&_type=json`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`공휴일 정보를 불러오지 못했습니다. (${response.status})`);
  }

  const data = (await response.json()) as {
    response?: {
      body?: {
        items?: { item?: unknown };
      };
      header?: {
        resultCode?: string;
        resultMsg?: string;
      };
    };
  };

  if (data.response?.header?.resultCode && data.response.header.resultCode !== "00") {
    throw new Error(data.response.header.resultMsg || "API 키를 확인해 주세요.");
  }

  const items = normalizeHolidayItems(data.response?.body?.items?.item);

  return items.flatMap((item) => {
    if (item.isHoliday !== "Y") {
      return [];
    }

    const dateKey = toDateKeyFromLocdate(item.locdate);
    const name = item.dateName?.trim();

    return dateKey && name ? [{ dateKey, name }] : [];
  });
}

export async function loadTimesheetMonthAction(year: number, monthIndex: number): Promise<TimesheetMonthData> {
  const user = await requireSession();
  const range = getMonthRange(year, monthIndex);
  const [entries, holidayResult, projects, vacations] = await Promise.all([
    listTimesheetEntries({ ...range, userId: user.id }),
    listHolidays(range)
      .then((holidays) => ({ holidayWarning: undefined, holidays }))
      .catch((error) => ({
        holidayWarning: error instanceof Error ? error.message : "공휴일 정보를 불러오지 못했습니다.",
        holidays: []
      })),
    listProjects({ userId: user.id }),
    listVacations({ ...range, userId: user.id })
  ]);

  return {
    entries: mergeLegacyVacations(entries, vacations),
    holidayWarning: holidayResult.holidayWarning,
    holidays: holidayResult.holidays,
    projects,
    vacations
  };
}

export async function saveTimesheetEntryAction(day: TimesheetDayDraft): Promise<TimesheetSaveResult> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  for (const entry of day.entries) {
    if (!["WORK", "VACATION", "HOLIDAY"].includes(entry.kind)) {
    throw new Error("업무 유형이 올바르지 않습니다.");
    }
  }

  const normalizedDay: StoredTimesheetDraft = {
    ...day,
    aiRewriteRequested: Boolean(day.aiRewriteRequested)
  };
  const previousDay = await listTimesheetEntries({ endDateKey: normalizedDay.dateKey, startDateKey: normalizedDay.dateKey, userId: user.id });
  const affectedNotionPageIds = collectChangedNotionPageIdsForTimesheetSave({
    afterDay: normalizedDay,
    beforeDays: previousDay
  });
  const savedDay = await saveTimesheetDay({ day: normalizedDay, userId: user.id });

  const notionSyncError = await syncNotionWorkHoursAfterTimesheetSave({ notionPageIds: affectedNotionPageIds, userId: user.id });

  return {
    day: savedDay,
    notionSyncError
  };
}

export async function runTimesheetAiCleanupAction(dateKey: string, options: AiCleanupOptions = {}): Promise<TimesheetAiCleanupResult> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  return runTimesheetAiCleanupForUser({ dateKey, options, userId: user.id });
}

export async function listTimesheetAiRewriteRequestsAction(): Promise<TimesheetAiRewriteRequest[]> {
  const user = await requireSession();

  return listTimesheetAiRewriteRequests(user.id);
}

export async function deleteTimesheetEntryAction(dateKey: string): Promise<TimesheetDeleteResult> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  const previousDay = await listTimesheetEntries({ endDateKey: dateKey, startDateKey: dateKey, userId: user.id });
  const affectedNotionPageIds = collectNotionPageIds(previousDay);

  await deleteTimesheetEntry({ dateKey, userId: user.id });
  const notionSyncError = await syncNotionWorkHoursAfterTimesheetSave({ notionPageIds: affectedNotionPageIds, userId: user.id });

  return {
    notionSyncError
  };
}

function collectNotionPageIds(days: StoredTimesheetDraft[]): string[] {
  return [
    ...new Set(
      days.flatMap((day) =>
        day.entries.flatMap((entry) => entry.notionCards.map((link) => link.notionPageId.trim()).filter(Boolean))
      )
    )
  ];
}

async function syncNotionWorkHoursAfterTimesheetSave(params: {
  notionPageIds: string[];
  userId: string;
}): Promise<string> {
  if (params.notionPageIds.length === 0) {
    return "";
  }

  try {
    const result = await syncNotionWorkHoursForPages(params);

    if (result.errors.length > 0) {
      return result.errors.map((error) => `${error.notionPageId}: ${error.message}`).join("\n");
    }

    return "";
  } catch (error) {
    console.warn("Failed to sync Notion work hours after timesheet save.", error);
    return error instanceof Error ? error.message : "Notion 필드 업데이트에 실패했습니다.";
  }
}

export async function loadNotionCardCandidatesAction(input: LoadNotionCardCandidatesInput): Promise<NotionCardCandidatesResult> {
  const user = await requireSession();
  const { dateKey, linkedPageIds } = normalizeNotionCandidateInput(input);
  const includeDone = getNotionCandidateIncludeDone(input);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  const [latestSuccess, connection] = await Promise.all([
    getDateNotionSyncRun({ dateKey, status: "success", userId: user.id }),
    getUserNotionConnection(user.id)
  ]);
  const doneStatusValues = includeDone ? [] : connection?.doneStatusValues ?? [];

  if (latestSuccess) {
    const [candidates, latestRun] = await Promise.all([
      listCandidateCardsWithLinked({ dateKey, linkedPageIds, userId: user.id }),
      getDateNotionSyncRun({ dateKey, userId: user.id })
    ]);

    return buildNotionCardCandidatesResult({
      candidates,
      dateKey,
      doneStatusValues,
      latestRun,
      latestSuccess,
      linkedPageIds,
      source: "cache"
    });
  }

  return syncNotionCardCandidatesForDate({ dateKey, doneStatusValues, linkedPageIds, userId: user.id });
}

export async function refreshNotionCardCandidatesAction(input: LoadNotionCardCandidatesInput): Promise<NotionCardCandidatesResult> {
  const user = await requireSession();
  const { dateKey, linkedPageIds } = normalizeNotionCandidateInput(input);
  const includeDone = getNotionCandidateIncludeDone(input);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  const connection = await getUserNotionConnection(user.id);

  return syncNotionCardCandidatesForDate({
    dateKey,
    doneStatusValues: includeDone ? [] : connection?.doneStatusValues ?? [],
    linkedPageIds,
    userId: user.id
  });
}

async function syncNotionCardCandidatesForDate(params: {
  dateKey: string;
  doneStatusValues: string[];
  linkedPageIds?: string[];
  userId: string;
}): Promise<NotionCardCandidatesResult> {
  try {
    const candidates = await syncNotionCardsForDate(params);
    const latestSuccess = await getDateNotionSyncRun({ dateKey: params.dateKey, status: "success", userId: params.userId });
    const candidatesWithLinked = await mergeCandidateCardsWithLinked({
      candidates,
      linkedPageIds: params.linkedPageIds ?? [],
      userId: params.userId
    });

    return buildNotionCardCandidatesResult({
      candidates: candidatesWithLinked,
      dateKey: params.dateKey,
      doneStatusValues: params.doneStatusValues,
      linkedPageIds: params.linkedPageIds ?? [],
      latestRun: latestSuccess,
      latestSuccess,
      source: "notion"
    });
  } catch (error) {
    const [candidates, latestRun, latestSuccess] = await Promise.all([
      listCandidateCardsWithLinked({
        dateKey: params.dateKey,
        linkedPageIds: params.linkedPageIds ?? [],
        userId: params.userId
      }),
      getDateNotionSyncRun({ dateKey: params.dateKey, userId: params.userId }),
      getDateNotionSyncRun({ dateKey: params.dateKey, status: "success", userId: params.userId })
    ]);

    return buildNotionCardCandidatesResult({
      candidates,
      dateKey: params.dateKey,
      doneStatusValues: params.doneStatusValues,
      errorMessage: error instanceof Error ? error.message : "Notion 카드 후보를 동기화하지 못했습니다.",
      latestRun,
      latestSuccess,
      linkedPageIds: params.linkedPageIds ?? [],
      source: "cache"
    });
  }
}

async function listCandidateCardsWithLinked(params: {
  dateKey: string;
  linkedPageIds: string[];
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  const [dateCards, linkedCards] = await Promise.all([
    listCachedNotionCards({ endDateKey: params.dateKey, startDateKey: params.dateKey, userId: params.userId }),
    listCachedNotionCardsByPageIds({ notionPageIds: params.linkedPageIds, userId: params.userId })
  ]);
  const cardsByPageId = new Map<string, NotionCardCacheRecord>();

  for (const card of [...dateCards, ...linkedCards]) {
    cardsByPageId.set(card.notionPageId, card);
  }

  return Array.from(cardsByPageId.values());
}

async function mergeCandidateCardsWithLinked(params: {
  candidates: NotionCardCacheRecord[];
  linkedPageIds: string[];
  userId: string;
}): Promise<NotionCardCacheRecord[]> {
  if (params.linkedPageIds.length === 0) {
    return params.candidates;
  }

  const linkedCards = await listCachedNotionCardsByPageIds({
    notionPageIds: params.linkedPageIds,
    userId: params.userId
  });
  const cardsByPageId = new Map<string, NotionCardCacheRecord>();

  for (const card of [...params.candidates, ...linkedCards]) {
    cardsByPageId.set(card.notionPageId, card);
  }

  return Array.from(cardsByPageId.values());
}

function normalizeNotionCandidateInput(input: LoadNotionCardCandidatesInput): {
  dateKey: string;
  linkedPageIds: string[];
} {
  if (typeof input === "string") {
    return { dateKey: input, linkedPageIds: [] };
  }

  return {
    dateKey: input.dateKey,
    linkedPageIds: [...new Set((input.linkedPageIds ?? []).map((pageId) => pageId.trim()).filter(Boolean))]
  };
}

function getNotionCandidateIncludeDone(input: LoadNotionCardCandidatesInput): boolean {
  return typeof input === "string" ? false : Boolean(input.includeDone);
}

function getDateNotionSyncRun(params: {
  dateKey: string;
  status?: "success" | "failed";
  userId: string;
}): Promise<NotionSyncRunRecord | null> {
  return getLatestNotionSyncRun({
    scopeEndDate: params.dateKey,
    scopeStartDate: params.dateKey,
    scopeType: "date",
    status: params.status,
    userId: params.userId
  });
}

function buildNotionCardCandidatesResult(params: {
  candidates: NotionCardCacheRecord[];
  dateKey: string;
  doneStatusValues: string[];
  errorMessage?: string;
  latestRun: NotionSyncRunRecord | null;
  latestSuccess: NotionSyncRunRecord | null;
  linkedPageIds: string[];
  source: "cache" | "notion";
}): NotionCardCandidatesResult {
  const filteredCandidates = filterOpenNotionCardCandidates({
    cards: params.candidates,
    dateKey: params.dateKey,
    doneStatusValues: params.doneStatusValues,
    linkedPageIds: params.linkedPageIds
  });
  const filteredPageIds = new Set(filteredCandidates.map((candidate) => candidate.notionPageId));

  return {
    candidates: params.candidates.filter((candidate) => filteredPageIds.has(candidate.notionPageId)),
    sync: {
      cardsFetched: params.latestSuccess?.cardsFetched ?? 0,
      errorMessage: params.errorMessage ?? "",
      lastAttemptedAt: params.latestRun?.finishedAt ?? "",
      lastFetchedAt: params.latestSuccess?.finishedAt ?? "",
      partial: params.latestSuccess?.partial ?? false,
      source: params.source,
      status: params.latestRun?.status ?? ""
    }
  };
}

export async function findPreviousProjectAction(dateKey: string): Promise<string> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  return findLatestWorkProjectBefore({ beforeDateKey: dateKey, userId: user.id });
}

export async function findPreviousOpenNotionCardsAction(dateKey: string): Promise<TimesheetEntryNotionCardDraft[]> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  const [connection, weeklyDefaultCards, previousCards] = await Promise.all([
    getUserNotionConnection(user.id),
    listEnabledNotionWeeklyDefaultCardsForDate({ dateKey, userId: user.id }),
    findLatestWorkNotionCardsBefore({ beforeDateKey: dateKey, userId: user.id })
  ]);
  const weeklyDefaultPageIds = new Set(weeklyDefaultCards.map((card) => card.notionPageId));
  const openPageIds = new Set(
    filterOpenNotionCardCandidates({
      cards: previousCards.map((card) => ({
        archived: false,
        category: card.category ?? "",
        endDate: card.endDate ?? "",
        lastEditedTime: "",
        notionPageId: card.notionPageId,
        stale: false,
        startDate: card.startDate ?? "",
        status: card.status ?? "",
        title: card.title ?? "",
        url: ""
      })),
      dateKey,
      doneStatusValues: connection?.doneStatusValues ?? []
    }).map((card) => card.notionPageId)
  );
  const weeklyLinks: TimesheetEntryNotionCardDraft[] = weeklyDefaultCards.map((card) => ({
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
  const previousLinks: TimesheetEntryNotionCardDraft[] = previousCards
    .filter((card) => !weeklyDefaultPageIds.has(card.notionPageId))
    .filter((card) => openPageIds.has(card.notionPageId))
    .map((card) => ({
      ...card,
      allocatedHours: 0,
      allocationMode: "auto",
      source: "previous_business_day_default"
    }));

  return [...weeklyLinks, ...previousLinks];
}

export async function addProjectAction(name: string) {
  const user = await requireSession();

  return addProject({ name, userId: user.id });
}

export async function resetHolidayCacheAction(year: number, monthIndex: number): Promise<TimesheetMonthData> {
  await requireAdmin();
  await resetHolidayCache({ solMonth: monthIndex + 1, solYear: year });

  return loadTimesheetMonthAction(year, monthIndex);
}

export async function resetAllHolidayCacheAction(year: number, monthIndex: number): Promise<TimesheetMonthData> {
  const user = await requireAdmin();

  if (process.env.NODE_ENV !== "development") {
    throw new Error("개발 환경에서만 사용할 수 있습니다.");
  }

  await resetHolidayCache();

  const range = getMonthRange(year, monthIndex);
  const [entries, projects, vacations] = await Promise.all([
    listTimesheetEntries({ ...range, userId: user.id }),
    listProjects({ userId: user.id }),
    listVacations({ ...range, userId: user.id })
  ]);

  return {
    entries: mergeLegacyVacations(entries, vacations),
    holidayWarning: undefined,
    holidays: [],
    projects,
    vacations
  };
}

export async function saveHolidayApiKeyAction(serviceKey: string) {
  await requireAdmin();
  await setAppSetting("data_go_kr_service_key", serviceKey.trim());
}

export async function updateUserAiSettingAction(input: UserAiSettingUpdate): Promise<UserAiSetting> {
  const user = await requireSession();

  return updateUserAiSetting(user.id, input);
}

export async function testGeminiApiKeyAction(params: { apiKey?: string; model: string }): Promise<GeminiApiKeyTestResult> {
  const user = await requireSession();
  const apiKey = params.apiKey?.trim() || await getUserGeminiApiKey(user.id);

  if (!apiKey) {
    throw new Error("Gemini API key를 입력해 주세요.");
  }

  await testGeminiAiCleanupConnection({
    apiKey,
    model: params.model.trim() || "gemini-3.1-flash-lite"
  });

  return { ok: true };
}

export async function testHolidayApiKeyAction(serviceKey: string, year: number, monthIndex: number): Promise<HolidayApiKeyTestResult> {
  await requireAdmin();
  const holidays = await fetchRestDeInfoWithKey({ serviceKey, solMonth: monthIndex + 1, solYear: year });

  return {
    holidays,
    ok: true
  };
}

export async function updateProfileAction(params: { email?: string; password?: string; username: string }): Promise<ManagedUser> {
  const user = await requireSession();
  const updatedUser = await updateManagedUser({ email: params.email, password: params.password, userId: user.id, username: params.username });

  await createSession({
    role: updatedUser.role,
    userId: updatedUser.id,
    username: updatedUser.username
  });

  return updatedUser;
}

export async function createUserAction(params: { email?: string; password: string; role: UserRole; username: string }): Promise<ManagedUser> {
  await requireAdmin();

  return createManagedUser(params);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
