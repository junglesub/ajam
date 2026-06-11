"use server";

import {
  addProject,
  applyTimesheetAiSummaryPatches,
  createManagedUser,
  deleteTimesheetEntry,
  findLatestWorkProjectBefore,
  getUserAiSetting,
  getUserGeminiApiKey,
  getManagedUser,
  listHolidays,
  listProjects,
  listTimesheetEntries,
  listVacations,
  resetHolidayCache,
  setAppSetting,
  updateManagedUser,
  updateUserAiSetting,
  type UserAiSetting,
  type UserAiSettingUpdate,
  saveTimesheetDay,
  type ManagedUser,
  type StoredTimesheetDraft,
  type StoredTimesheetEntry,
  type UserRole
} from "@timesheet/db";
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

export type GeminiApiKeyTestResult = {
  ok: boolean;
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

function selectAiCleanupTargets(params: {
  currentDateKey: string;
  days: StoredTimesheetDraft[];
  setting: UserAiSetting;
}): AiCleanupTargetDay[] {
  const currentDay = params.days.find((day) => day.dateKey === params.currentDateKey);
  const targets: AiCleanupTargetDay[] = [];

  if (currentDay && needsAiCleanup(currentDay)) {
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
  targetDays: AiCleanupTargetDay[];
}) {
  return `You help prepare concise English work-report text from Korean timesheet records.

Return ONLY valid JSON. Do not include Markdown, comments, explanations, or code fences.

Rules:
1. Translate only saved WORK entries with Korean content.
2. Fill only fields that are empty in the target JSON.
3. Do not overwrite existing aiTranslation or shortVersion values.
4. Do not invent work that is not in the Korean content or project name.
5. Keep English concise, professional, and suitable for a monthly report.
6. Exclude vacation, holiday, missing, future, and draft-only dates.
7. Use context examples only for style and terminology.
8. Return only this shape:
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
${JSON.stringify(params.contextDays.map(toAiCleanupPromptDay), null, 2)}

Targets:
${JSON.stringify(params.targetDays.map(toAiCleanupPromptDay), null, 2)}`;
}

function toAiCleanupPromptDay(day: StoredTimesheetDraft) {
  return {
    dateKey: day.dateKey,
    shortVersion: day.shortVersion,
    entries: day.entries
      .filter((entry) => entry.kind === "WORK" && entry.content.trim())
      .map((entry) => ({
        aiTranslation: entry.aiTranslation,
        content: entry.content,
        id: entry.id || entry.clientId,
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
  payload: AiCleanupResponse;
  targetDays: AiCleanupTargetDay[];
}) {
  const targetDaysByDate = new Map(params.targetDays.map((day) => [day.dateKey, day]));

  return params.payload.days.flatMap((day) => {
    const targetDay = targetDaysByDate.get(day.dateKey);

    if (!targetDay) {
      return [];
    }

    const workEntriesById = new Map(
      targetDay.entries
        .filter((entry) => entry.kind === "WORK" && entry.content.trim())
        .map((entry) => [entry.id || entry.clientId, entry])
    );
    const entries = day.entries.flatMap((entry) => {
      const targetEntry = workEntriesById.get(entry.id);

      if (!targetEntry || targetEntry.aiTranslation.trim() || !entry.aiTranslation.trim()) {
        return [];
      }

      return [{ id: entry.id, aiTranslation: entry.aiTranslation.trim() }];
    });
    const shortVersion = targetDay.shortVersion.trim() ? targetDay.shortVersion : day.shortVersion.trim();

    if (entries.length === 0 && shortVersion === targetDay.shortVersion) {
      return [];
    }

    return [
      {
        dateKey: targetDay.dateKey,
        entries,
        shortVersion
      }
    ];
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

export async function saveTimesheetEntryAction(day: StoredTimesheetDraft) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  for (const entry of day.entries) {
    if (!["WORK", "VACATION", "HOLIDAY"].includes(entry.kind)) {
    throw new Error("업무 유형이 올바르지 않습니다.");
    }
  }

  return saveTimesheetDay({ day, userId: user.id });
}

export async function runTimesheetAiCleanupAction(dateKey: string): Promise<TimesheetAiCleanupResult> {
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
  const targetDays = selectAiCleanupTargets({ currentDateKey: dateKey, days, setting });

  if (targetDays.length === 0) {
    return {
      appliedDateKeys: [],
      days: [],
      message: "AI로 채울 빈 번역/요약이 없습니다.",
      skipped: true
    };
  }

  const contextDays = selectAiCleanupContext({ currentDateKey: dateKey, days, excludeDateKeys: new Set(targetDays.map((day) => day.dateKey)), limit: setting.contextDays });
  const payload = await requestGeminiAiCleanup({ apiKey, contextDays, model: setting.model, targetDays });
  const patches = buildAiCleanupPatches({ payload, targetDays });

  if (patches.length === 0) {
    return {
      appliedDateKeys: [],
      days: [],
      message: "AI가 적용 가능한 변경사항을 반환하지 않았습니다.",
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

export async function deleteTimesheetEntryAction(dateKey: string) {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  await deleteTimesheetEntry({ dateKey, userId: user.id });
}

export async function findPreviousProjectAction(dateKey: string): Promise<string> {
  const user = await requireSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }

  return findLatestWorkProjectBefore({ beforeDateKey: dateKey, userId: user.id });
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
