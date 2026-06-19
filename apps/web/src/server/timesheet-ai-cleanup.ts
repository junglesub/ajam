import {
  applyTimesheetAiSummaryPatches,
  clearTimesheetAiRewriteRequests,
  getUserAiSetting,
  getUserGeminiApiKey,
  listManagedUsers,
  listTimesheetEntries,
  type StoredTimesheetDraft,
  type UserAiSetting
} from "@timesheet/db";

export type AiCleanupOptions = {
  overwriteCurrentDate?: boolean;
};

export type TimesheetAiCleanupResult = {
  appliedDateKeys: string[];
  days: StoredTimesheetDraft[];
  message: string;
  skipped: boolean;
};

export type ScheduledTimesheetAiCleanupUserResult = {
  appliedDateKeys: string[];
  failed: boolean;
  message: string;
  skipped: boolean;
  userId: string;
  username: string;
};

export type ScheduledTimesheetAiCleanupResult = {
  dateKey: string;
  errors: Array<{
    message: string;
    userId: string;
    username: string;
  }>;
  lookbackDays: number;
  userResults: ScheduledTimesheetAiCleanupUserResult[];
};

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

type AiCleanupPatch = {
  dateKey: string;
  entries: Array<{ aiTranslation: string; id: string }>;
  shortVersion: string;
};

type AiNoChangeReason = "blank-ai-response" | "none" | "protected-existing" | "same-as-existing" | "unknown-response";

export async function runTimesheetAiCleanupForUser(params: {
  dateKey: string;
  options?: AiCleanupOptions;
  userId: string;
}): Promise<TimesheetAiCleanupResult> {
  const setting = await getUserAiSetting(params.userId);
  const apiKey = await getUserGeminiApiKey(params.userId);

  if (!setting.enabled || !apiKey) {
    return {
      appliedDateKeys: [],
      days: [],
      message: !setting.enabled ? "AI 자동 정리가 꺼져 있습니다." : "Gemini API key가 없어 AI 정리를 건너뛰었습니다.",
      skipped: true
    };
  }

  const year = Number(params.dateKey.slice(0, 4));
  const monthIndex = Number(params.dateKey.slice(5, 7)) - 1;
  const range = getMonthRange(year, monthIndex);
  const days = await listTimesheetEntries({ ...range, userId: params.userId });
  const overwriteDateKey = params.options?.overwriteCurrentDate ? params.dateKey : undefined;
  const targetDays = selectAiCleanupTargets({
    currentDateKey: params.dateKey,
    days,
    overwriteCurrentDate: Boolean(overwriteDateKey),
    setting
  });
  const currentDay = days.find((day) => day.dateKey === params.dateKey);

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

  return runAiCleanupForTargets({
    apiKey,
    currentDateKey: params.dateKey,
    days,
    overwriteDateKey,
    setting,
    targetDays,
    userId: params.userId
  });
}

export async function runScheduledTimesheetAiCleanup(params: {
  dateKey: string;
  lookbackDays?: number;
}): Promise<ScheduledTimesheetAiCleanupResult> {
  const lookbackDays = normalizeLookbackDays(params.lookbackDays);
  const startDateKey = addDays(params.dateKey, -(lookbackDays - 1));
  const users = await listManagedUsers();
  const userResults: ScheduledTimesheetAiCleanupUserResult[] = [];
  const errors: ScheduledTimesheetAiCleanupResult["errors"] = [];

  for (const user of users) {
    try {
      const setting = await getUserAiSetting(user.id);

      if (!setting.enabled || setting.cleanupMode !== "scheduled") {
        userResults.push({
          appliedDateKeys: [],
          failed: false,
          message: !setting.enabled ? "AI 자동 정리 꺼짐" : "예약 실행 대상 아님",
          skipped: true,
          userId: user.id,
          username: user.username
        });
        continue;
      }

      const apiKey = await getUserGeminiApiKey(user.id);

      if (!apiKey) {
        userResults.push({
          appliedDateKeys: [],
          failed: false,
          message: "Gemini API key 없음",
          skipped: true,
          userId: user.id,
          username: user.username
        });
        continue;
      }

      const days = await listTimesheetEntries({
        endDateKey: params.dateKey,
        startDateKey,
        userId: user.id
      });
      const targetDays = days
        .filter((day) => setting.backfillMissing ? isScheduledAiCleanupTarget(day) : day.dateKey === params.dateKey && isScheduledAiCleanupTarget(day))
        .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
        .slice(0, setting.backfillLimit);

      if (targetDays.length === 0) {
        userResults.push({
          appliedDateKeys: [],
          failed: false,
          message: "AI로 채울 빈 번역/요약이 없습니다.",
          skipped: true,
          userId: user.id,
          username: user.username
        });
        continue;
      }

      const result = await runAiCleanupForTargets({
        apiKey,
        currentDateKey: params.dateKey,
        days,
        overwriteDateKeys: new Set(targetDays.filter((day) => day.aiRewriteRequested).map((day) => day.dateKey)),
        setting,
        targetDays,
        userId: user.id
      });

      userResults.push({
        appliedDateKeys: result.appliedDateKeys,
        failed: false,
        message: result.message,
        skipped: result.skipped,
        userId: user.id,
        username: user.username
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 예약 정리에 실패했습니다.";

      errors.push({
        message,
        userId: user.id,
        username: user.username
      });
      userResults.push({
        appliedDateKeys: [],
        failed: true,
        message,
        skipped: false,
        userId: user.id,
        username: user.username
      });
    }
  }

  return {
    dateKey: params.dateKey,
    errors,
    lookbackDays,
    userResults
  };
}

export async function testGeminiAiCleanupConnection(params: {
  apiKey: string;
  model: string;
}): Promise<void> {
  await requestGeminiText({
    apiKey: params.apiKey,
    model: params.model,
    prompt: "Return only this JSON: {\"ok\":true}"
  });
}

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

function isScheduledAiCleanupTarget(day: StoredTimesheetDraft): boolean {
  return day.aiRewriteRequested ? hasSavedWorkContent(day) : needsAiCleanup(day);
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
  overwriteExisting?: boolean;
  overwriteDateKey?: string;
  overwriteDateKeys?: Set<string>;
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
  overwriteExisting?: boolean;
  overwriteDateKey?: string;
  overwriteDateKeys?: Set<string>;
  targetDays: AiCleanupTargetDay[];
}) {
  const overwriteDateKeys = [...(params.overwriteDateKeys ?? new Set<string>())].sort((left, right) => left.localeCompare(right));
  const overwriteInstruction = params.overwriteDateKey
    ? `For target date ${params.overwriteDateKey}, rewrite all returned WORK entry aiTranslation values and the day shortVersion even if existing values are present. Use existing English only as reference context, not as a locked value.`
    : overwriteDateKeys.length > 0
      ? `For target dates ${overwriteDateKeys.join(", ")}, rewrite returned WORK entry aiTranslation values and the day shortVersion even if existing values are present. For other target dates, fill only empty fields. Use existing English only as reference context, not as a locked value.`
    : params.overwriteExisting
      ? "For every target date, rewrite returned WORK entry aiTranslation values and the day shortVersion even if existing values are present. Use existing English only as reference context, not as a locked value."
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
${JSON.stringify(params.targetDays.map((day) => toAiCleanupPromptDay(day, { overwriteDateKeys: params.overwriteDateKeys, overwriteExisting: params.overwriteExisting, overwriteDateKey: params.overwriteDateKey })), null, 2)}`;
}

function toAiCleanupPromptDay(day: StoredTimesheetDraft, options: { overwriteExisting?: boolean; overwriteDateKey?: string; overwriteDateKeys?: Set<string> } = {}) {
  const shouldRewrite = Boolean(options.overwriteExisting) || day.dateKey === options.overwriteDateKey || Boolean(options.overwriteDateKeys?.has(day.dateKey));

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
  overwriteExisting?: boolean;
  overwriteDateKey?: string;
  overwriteDateKeys?: Set<string>;
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

    const canOverwriteDay = Boolean(params.overwriteExisting) || targetDay.dateKey === params.overwriteDateKey || Boolean(params.overwriteDateKeys?.has(targetDay.dateKey));
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

async function runAiCleanupForTargets(params: {
  apiKey: string;
  currentDateKey: string;
  days: StoredTimesheetDraft[];
  overwriteExisting?: boolean;
  overwriteDateKey?: string;
  overwriteDateKeys?: Set<string>;
  setting: UserAiSetting;
  targetDays: AiCleanupTargetDay[];
  userId: string;
}): Promise<TimesheetAiCleanupResult> {
  const contextDays = selectAiCleanupContext({
    currentDateKey: params.currentDateKey,
    days: params.days,
    excludeDateKeys: new Set(params.targetDays.map((day) => day.dateKey)),
    limit: params.setting.contextDays
  });
  const payload = params.overwriteDateKey
    ? await requestGeminiAiCleanup({
        apiKey: params.apiKey,
        contextDays,
        model: params.setting.model,
        overwriteDateKey: params.overwriteDateKey,
        targetDays: params.targetDays
      })
    : await requestGeminiAiCleanup({
        apiKey: params.apiKey,
        contextDays,
        model: params.setting.model,
        overwriteExisting: params.overwriteExisting,
        overwriteDateKeys: params.overwriteDateKeys,
        targetDays: params.targetDays
      });
  const patchResult = params.overwriteDateKey
    ? buildAiCleanupPatches({
        overwriteDateKey: params.overwriteDateKey,
        payload,
        targetDays: params.targetDays
      })
    : buildAiCleanupPatches({
        overwriteExisting: params.overwriteExisting,
        overwriteDateKeys: params.overwriteDateKeys,
        payload,
        targetDays: params.targetDays
      });
  const patches = patchResult.patches;
  const rewriteRequestDateKeys = [
    ...new Set([
      ...(params.overwriteDateKeys ?? new Set<string>()),
      ...(params.overwriteDateKey ? [params.overwriteDateKey] : [])
    ])
  ];

  if (patches.length === 0) {
    await clearTimesheetAiRewriteRequests({
      dateKeys: rewriteRequestDateKeys,
      userId: params.userId
    });
    const refreshedDays = rewriteRequestDateKeys.length > 0
      ? await listTimesheetEntries({
          endDateKey: rewriteRequestDateKeys.sort((left, right) => left.localeCompare(right))[rewriteRequestDateKeys.length - 1]!,
          startDateKey: rewriteRequestDateKeys[0]!,
          userId: params.userId
        })
      : [];

    return {
      appliedDateKeys: [],
      days: refreshedDays.filter((day) => rewriteRequestDateKeys.includes(day.dateKey)),
      message: getAiNoChangeMessage(patchResult.reason),
      skipped: true
    };
  }

  await applyTimesheetAiSummaryPatches({
    baseline: { days: params.targetDays.map(toAiCleanupBaselineDay) },
    days: params.targetDays,
    patches,
    userId: params.userId
  });
  await clearTimesheetAiRewriteRequests({
    dateKeys: rewriteRequestDateKeys,
    userId: params.userId
  });

  const appliedDateKeys = patches.map((patch) => patch.dateKey);
  const sortedAppliedDateKeys = [...appliedDateKeys].sort((left, right) => left.localeCompare(right));
  const refreshedDays = await listTimesheetEntries({
    endDateKey: sortedAppliedDateKeys[sortedAppliedDateKeys.length - 1]!,
    startDateKey: sortedAppliedDateKeys[0]!,
    userId: params.userId
  });
  const previousCount = appliedDateKeys.filter((appliedDateKey) => appliedDateKey < params.currentDateKey).length;

  return {
    appliedDateKeys,
    days: refreshedDays.filter((day) => appliedDateKeys.includes(day.dateKey)),
    message: previousCount > 0 ? `AI 정리 완료 · 이전 ${previousCount}일 보정됨` : "AI 정리 완료",
    skipped: false
  };
}

function normalizeLookbackDays(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) {
    return 7;
  }

  return Math.min(Math.max(Math.floor(value), 1), 31);
}

function getMonthRange(year: number, monthIndex: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  return {
    endDateKey: toDateKey(year, monthIndex, lastDay),
    startDateKey: toDateKey(year, monthIndex, 1)
  };
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

  date.setDate(date.getDate() + days);

  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}
