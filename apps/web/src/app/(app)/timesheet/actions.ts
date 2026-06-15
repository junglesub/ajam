"use server";

import {
  addProject,
  applyTimesheetAiSummaryPatches,
  createManagedUser,
  deleteTimesheetEntry,
  findLatestWorkNotionCardsBefore,
  findLatestWorkProjectBefore,
  getLatestNotionSyncRun,
  getUserAiSetting,
  getUserGeminiApiKey,
  getUserNotionConnection,
  getManagedUser,
  listCachedNotionCards,
  listCachedNotionCardsByPageIds,
  listHolidays,
  listProjects,
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
  type UserRole
} from "@timesheet/db";
import { filterOpenNotionCardCandidates, type TimesheetEntryNotionCardDraft } from "@timesheet/domain";
import { redirect } from "next/navigation";

import { createSession, destroySession, getSession } from "@/server/session";

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

export type TimesheetAiCleanupResult = {
  appliedDateKeys: string[];
  days: StoredTimesheetDraft[];
  message: string;
  skipped: boolean;
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

type AiCleanupTargetDay = StoredTimesheetDraft;

type AiCleanupResponse = {
  days: Array<{
    dateKey: string;
    entries: Array<{
      aiTranslation: string;
      id: string;
    }>;
    shortVersion: string;
  }>;
};

type AiCleanupOptions = {
  overwriteCurrentDate?: boolean;
};

type AiCleanupPatch = {
  dateKey: string;
  entries: Array<{ aiTranslation: string; id: string }>;
  shortVersion: string;
};

type AiNoChangeReason = "blank-ai-response" | "none" | "protected-existing" | "same-as-existing" | "unknown-response";

function selectAiCleanupTargets(params: {
  currentDateKey: string;
  days: StoredTimesheetDraft[];
  overwriteCurrentDate: boolean;
  setting: UserAiSetting;
}): AiCleanupTargetDay[] {
  const currentDay = params.days.find((day) => day.dateKey === params.currentDateKey);
  const targets: AiCleanupTargetDay[] = [];

  if (currentDay && (needsAiCleanup(currentDay) || (params.overwriteCurrentDate && hasSavedWorkContent(currentDay)))) {
    targets.push(currentDay);
  }

  if (!params.setting.backfillMissing) {
    return targets;
  }

  const previousTargets = params.days
    .filter((day) => day.dateKey < params.currentDateKey && needsAiCleanup(day))
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, params.setting.backfillLimit);

  return [...targets, ...previousTargets];
}

function selectAiCleanupContext(params: {
  currentDateKey: string;
  days: StoredTimesheetDraft[];
  excludeDateKeys: Set<string>;
  limit: number;
}): StoredTimesheetDraft[] {
  if (params.limit <= 0) {
    return [];
  }

  return params.days
    .filter((day) => day.dateKey < params.currentDateKey && !params.excludeDateKeys.has(day.dateKey) && hasSavedWorkContent(day))
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, params.limit);
}

function hasSavedWorkContent(day: StoredTimesheetDraft): boolean {
  return day.entries.some((entry) => entry.kind === "WORK" && entry.content.trim());
}

function needsAiCleanup(day: StoredTimesheetDraft): boolean {
  const workEntries = day.entries.filter((entry) => entry.kind === "WORK" && entry.content.trim());

  return workEntries.length > 0 && (workEntries.some((entry) => !entry.aiTranslation.trim()) || !day.shortVersion.trim());
}

function toAiCleanupBaselineDay(day: StoredTimesheetDraft) {
  return {
    dateKey: day.dateKey,
    entries: day.entries.map((entry) => ({
      aiTranslation: entry.aiTranslation,
      clientId: entry.clientId,
      id: entry.id,
      kind: entry.kind
    })),
    shortVersion: day.shortVersion
  };
}

async function requestGeminiAiCleanup(params: {
  apiKey: string;
  contextDays: StoredTimesheetDraft[];
  model: string;
  overwriteDateKey?: string;
  targetDays: AiCleanupTargetDay[];
}): Promise<AiCleanupResponse> {
  const text = await requestGeminiText({
    apiKey: params.apiKey,
    model: params.model,
    prompt: buildAiCleanupPrompt(params)
  });
  const parsed = parseGeminiJson(text);

  if (!isAiCleanupResponse(parsed)) {
    throw new Error("Gemini 응답 JSON 구조가 올바르지 않습니다.");
  }

  return parsed;
}

async function requestGeminiText(params: { apiKey: string; model: string; prompt: string }): Promise<string> {
  const model = params.model.trim() || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const response = await fetch(url, {
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: params.prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Gemini 요청에 실패했습니다. (${response.status})`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  return text;
}

function buildAiCleanupPrompt(params: {
  contextDays: StoredTimesheetDraft[];
  overwriteDateKey?: string;
  targetDays: AiCleanupTargetDay[];
}) {
  const overwriteInstruction = params.overwriteDateKey
    ? `For target date ${params.overwriteDateKey}, rewrite all returned WORK entry aiTranslation values and the day shortVersion even if existing values are present. Use existing English only as reference context, not as a locked value.`
    : "There is no overwrite target in this request.";

  return `You help prepare concise English work-report text from Korean timesheet records.

Return ONLY valid JSON. Do not include Markdown, comments, explanations, or code fences.

Rules:
1. Translate only saved WORK entries with Korean content.
2. Fill only fields that are empty in the target JSON, except for the explicit overwrite target.
3. Do not overwrite existing aiTranslation or shortVersion values for non-overwrite targets.
4. Do not invent work that is not in the Korean content or project name.
5. Keep English concise, professional, and suitable for a monthly report.
6. Exclude vacation, holiday, missing, future, and draft-only dates.
7. Use context examples only for style and terminology.
8. ${overwriteInstruction}
9. Return only this shape:
{
  "days": [
    {
      "dateKey": "YYYY-MM-DD",
      "shortVersion": "Short English day summary.",
      "entries": [
        {
          "id": "entry-id",
          "aiTranslation": "Concise English work translation."
        }
      ]
    }
  ]
}

Context examples:
${JSON.stringify(params.contextDays.map((day) => toAiCleanupPromptDay(day)), null, 2)}

Targets:
${JSON.stringify(params.targetDays.map((day) => toAiCleanupPromptDay(day, { overwriteDateKey: params.overwriteDateKey })), null, 2)}`;
}

function toAiCleanupPromptDay(day: StoredTimesheetDraft, options: { overwriteDateKey?: string } = {}) {
  const shouldRewrite = day.dateKey === options.overwriteDateKey;

  return {
    dateKey: day.dateKey,
    previousShortVersion: shouldRewrite ? day.shortVersion : undefined,
    shortVersion: shouldRewrite ? "" : day.shortVersion,
    entries: day.entries
      .filter((entry) => entry.kind === "WORK" && entry.content.trim())
      .map((entry) => ({
        aiTranslation: shouldRewrite ? "" : entry.aiTranslation,
        content: entry.content,
        id: entry.id || entry.clientId,
        previousAiTranslation: shouldRewrite ? entry.aiTranslation : undefined,
        project: entry.project
      }))
  };
}

function parseGeminiJson(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(withoutFence);
}

function isAiCleanupResponse(value: unknown): value is AiCleanupResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { days?: unknown }).days) &&
    (value as { days: unknown[] }).days.every(
      (day) =>
        typeof day === "object" &&
        day !== null &&
        typeof (day as { dateKey?: unknown }).dateKey === "string" &&
        typeof (day as { shortVersion?: unknown }).shortVersion === "string" &&
        Array.isArray((day as { entries?: unknown }).entries) &&
        (day as { entries: unknown[] }).entries.every(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { id?: unknown }).id === "string" &&
            typeof (entry as { aiTranslation?: unknown }).aiTranslation === "string"
        )
    )
  );
}

function buildAiCleanupPatches(params: {
  overwriteDateKey?: string;
  payload: AiCleanupResponse;
  targetDays: AiCleanupTargetDay[];
}) {
  const targetDaysByDate = new Map(params.targetDays.map((day) => [day.dateKey, day]));
  const skipped = {
    blankAiResponse: 0,
    protectedExisting: 0,
    sameAsExisting: 0,
    unknownResponse: 0
  };
  const patches: AiCleanupPatch[] = [];

  for (const day of params.payload.days) {
    const targetDay = targetDaysByDate.get(day.dateKey);

    if (!targetDay) {
      skipped.unknownResponse += 1;
      continue;
    }

    const canOverwriteDay = targetDay.dateKey === params.overwriteDateKey;
    const workEntriesById = new Map(
      targetDay.entries
        .filter((entry) => entry.kind === "WORK" && entry.content.trim())
        .map((entry) => [entry.id || entry.clientId, entry])
    );
    const entries = day.entries.flatMap((entry) => {
      const targetEntry = workEntriesById.get(entry.id);
      const nextTranslation = entry.aiTranslation.trim();

      if (!targetEntry) {
        skipped.unknownResponse += 1;
        return [];
      }

      if (!nextTranslation) {
        skipped.blankAiResponse += 1;
        return [];
      }

      if (!canOverwriteDay && targetEntry.aiTranslation.trim()) {
        skipped.protectedExisting += 1;
        return [];
      }

      if (targetEntry.aiTranslation === nextTranslation) {
        skipped.sameAsExisting += 1;
        return [];
      }

      return [{ id: entry.id, aiTranslation: nextTranslation }];
    });
    const nextShortVersion = day.shortVersion.trim();
    const shortVersion = canOverwriteDay
      ? nextShortVersion || targetDay.shortVersion
      : targetDay.shortVersion.trim() ? targetDay.shortVersion : nextShortVersion;

    if (!nextShortVersion && !targetDay.shortVersion.trim()) {
      skipped.blankAiResponse += 1;
    } else if (!canOverwriteDay && targetDay.shortVersion.trim() && nextShortVersion) {
      skipped.protectedExisting += 1;
    } else if (targetDay.shortVersion === shortVersion) {
      skipped.sameAsExisting += 1;
    }

    if (entries.length === 0 && shortVersion === targetDay.shortVersion) {
      continue;
    }

    patches.push({
      dateKey: targetDay.dateKey,
      entries,
      shortVersion
    });
  }

  return {
    patches,
    reason: getAiNoChangeReason(skipped)
  };
}

function getAiNoChangeReason(skipped: {
  blankAiResponse: number;
  protectedExisting: number;
  sameAsExisting: number;
  unknownResponse: number;
}): AiNoChangeReason {
  if (skipped.protectedExisting > 0) {
    return "protected-existing";
  }

  if (skipped.sameAsExisting > 0) {
    return "same-as-existing";
  }

  if (skipped.blankAiResponse > 0) {
    return "blank-ai-response";
  }

  if (skipped.unknownResponse > 0) {
    return "unknown-response";
  }

  return "none";
}

function getAiNoChangeMessage(reason: AiNoChangeReason): string {
  if (reason === "protected-existing") {
    return "사유 1: 기존 AI 번역본/짧은 버전이 이미 있고 덮어쓰기 요청이 아니어서 업데이트하지 않았습니다. 내용 수정 후에는 'AI도 업데이트'를 선택해 주세요.";
  }

  if (reason === "same-as-existing") {
    return "사유 2: AI가 기존 번역/요약과 같은 내용을 반환해서 업데이트할 차이가 없습니다.";
  }

  if (reason === "blank-ai-response") {
    return "사유 3: AI가 빈 번역/요약을 반환해서 업데이트하지 않았습니다. 내용을 조금 더 구체적으로 적고 다시 저장해 주세요.";
  }

  if (reason === "unknown-response") {
    return "AI 응답에 알 수 없는 날짜나 항목이 포함되어 업데이트하지 않았습니다.";
  }

  return "AI가 적용 가능한 변경사항을 반환하지 않았습니다.";
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

export async function saveTimesheetEntryAction(day: StoredTimesheetDraft): Promise<TimesheetSaveResult> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  for (const entry of day.entries) {
    if (!["WORK", "VACATION", "HOLIDAY"].includes(entry.kind)) {
    throw new Error("업무 유형이 올바르지 않습니다.");
    }
  }

  const previousDay = await listTimesheetEntries({ endDateKey: day.dateKey, startDateKey: day.dateKey, userId: user.id });
  const affectedNotionPageIds = collectNotionPageIds([...previousDay, day]);
  const savedDay = await saveTimesheetDay({ day, userId: user.id });

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

  const setting = await getUserAiSetting(user.id);
  const apiKey = await getUserGeminiApiKey(user.id);

  if (!setting.enabled || !apiKey) {
    return {
      appliedDateKeys: [],
      days: [],
      message: !setting.enabled ? "AI 자동 정리가 꺼져 있습니다." : "Gemini API key가 없어 AI 정리를 건너뛰었습니다.",
      skipped: true
    };
  }

  const year = Number(dateKey.slice(0, 4));
  const monthIndex = Number(dateKey.slice(5, 7)) - 1;
  const range = getMonthRange(year, monthIndex);
  const days = await listTimesheetEntries({ ...range, userId: user.id });
  const overwriteDateKey = options.overwriteCurrentDate ? dateKey : undefined;
  const targetDays = selectAiCleanupTargets({ currentDateKey: dateKey, days, overwriteCurrentDate: Boolean(overwriteDateKey), setting });
  const currentDay = days.find((day) => day.dateKey === dateKey);

  if (targetDays.length === 0) {
    return {
      appliedDateKeys: [],
      days: [],
      message: currentDay && hasSavedWorkContent(currentDay) && !needsAiCleanup(currentDay) && !overwriteDateKey
        ? getAiNoChangeMessage("protected-existing")
        : "AI로 채울 빈 번역/요약이 없습니다.",
      skipped: true
    };
  }

  const contextDays = selectAiCleanupContext({ currentDateKey: dateKey, days, excludeDateKeys: new Set(targetDays.map((day) => day.dateKey)), limit: setting.contextDays });
  const payload = overwriteDateKey
    ? await requestGeminiAiCleanup({ apiKey, contextDays, model: setting.model, overwriteDateKey, targetDays })
    : await requestGeminiAiCleanup({ apiKey, contextDays, model: setting.model, targetDays });
  const patchResult = overwriteDateKey
    ? buildAiCleanupPatches({ overwriteDateKey, payload, targetDays })
    : buildAiCleanupPatches({ payload, targetDays });
  const patches = patchResult.patches;

  if (patches.length === 0) {
    return {
      appliedDateKeys: [],
      days: [],
      message: getAiNoChangeMessage(patchResult.reason),
      skipped: true
    };
  }

  await applyTimesheetAiSummaryPatches({
    baseline: { days: targetDays.map(toAiCleanupBaselineDay) },
    days: targetDays,
    patches,
    userId: user.id
  });

  const appliedDateKeys = patches.map((patch) => patch.dateKey);
  const sortedAppliedDateKeys = [...appliedDateKeys].sort((left, right) => left.localeCompare(right));
  const refreshedDays = await listTimesheetEntries({ endDateKey: sortedAppliedDateKeys[sortedAppliedDateKeys.length - 1]!, startDateKey: sortedAppliedDateKeys[0]!, userId: user.id });
  const previousCount = appliedDateKeys.filter((appliedDateKey) => appliedDateKey < dateKey).length;

  return {
    appliedDateKeys,
    days: refreshedDays.filter((day) => appliedDateKeys.includes(day.dateKey)),
    message: previousCount > 0 ? `AI 정리 완료 · 이전 ${previousCount}일 보정됨` : "AI 정리 완료",
    skipped: false
  };
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

  const [connection, previousCards] = await Promise.all([
    getUserNotionConnection(user.id),
    findLatestWorkNotionCardsBefore({ beforeDateKey: dateKey, userId: user.id })
  ]);
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

  return previousCards
    .filter((card) => openPageIds.has(card.notionPageId))
    .map((card) => ({
      ...card,
      allocatedHours: 0,
      allocationMode: "auto",
      source: "previous_business_day_default"
    }));
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

  await requestGeminiText({
    apiKey,
    model: params.model.trim() || "gemini-3.1-flash-lite",
    prompt: "Return only this JSON: {\"ok\":true}"
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
