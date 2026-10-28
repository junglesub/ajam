"use client";
import { useState } from "react";
import type { TimesheetDayDraft } from "@timesheet/domain";
import { broadcastViewRefresh } from "@/lib/view-refresh";
import { hasExistingAiFields, hasMissingAiFields, hasWorkContent, hasWorkContentChange } from "./timesheet-draft-utils";

export type TimesheetAiCleanupResult = {
  appliedDateKeys: string[];
  days: TimesheetDayDraft[];
  message: string;
  skipped: boolean;
};

export type TimesheetAiRewriteRequest = {
  cleanupType: "fill_missing" | "rewrite";
  dateKey: string;
  entryCount: number;
  previewContent: string;
  rewriteRequested: boolean;
  shortVersion: string;
};

export type AiCleanupOptions = {
  overwriteCurrentDate?: boolean;
};


export function toAiRewriteRequest(day: TimesheetDayDraft): TimesheetAiRewriteRequest | null {
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


export function reconcileAiRequests(current: TimesheetAiRewriteRequest[], days: TimesheetDayDraft[]) {
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
}

type Setting = { enabled: boolean; apiKeySaved: boolean; cleanupMode: string };

export function shouldPromptForRewrite(setting: Setting, saved: TimesheetDayDraft | undefined, day: TimesheetDayDraft) {
  return Boolean(saved && setting.enabled && setting.apiKeySaved && hasExistingAiFields(saved) && hasWorkContentChange(saved, day));
}

export function isScheduledOverwrite(setting: Setting, saved: TimesheetDayDraft | undefined, day: TimesheetDayDraft) {
  return setting.enabled && setting.apiKeySaved && setting.cleanupMode === "scheduled" && Boolean(day.aiRewriteRequested || saved?.aiRewriteRequested);
}

export function isScheduledCleanupPending(setting: Setting, saved: TimesheetDayDraft | undefined, isSaved: boolean, isFutureWork: boolean) {
  if (!setting.enabled || !setting.apiKeySaved || setting.cleanupMode !== "scheduled" || isFutureWork || !saved || !isSaved) {
    return false;
  }
  return saved.aiRewriteRequested ? hasWorkContent(saved) : hasMissingAiFields(saved);
}

export async function performAiCleanup(
  dateKey: string,
  options: AiCleanupOptions | undefined,
  setting: Pick<Setting, "enabled" | "apiKeySaved">,
  cleanup: (dateKey: string, options?: AiCleanupOptions) => Promise<TimesheetAiCleanupResult>,
  applyDays: (days: TimesheetDayDraft[]) => void = () => {}
) {
  if (!setting.enabled || !setting.apiKeySaved) {
    return { kind: "disabled" as const, message: !setting.enabled ? "AI 자동 정리 꺼짐" : "Gemini API key 없음" };
  }
  try {
    const result = await cleanup(dateKey, options);
    applyDays(result.days);
    return { kind: "result" as const, result };
  } catch (error) {
    return { kind: "error" as const, message: error instanceof Error ? error.message : "AI 정리에 실패했습니다." };
  }
}

type CleanupState = "idle" | "running" | "done" | "skipped" | "error";
type Prompt = { entryClientId?: string; field: "summary" | "translation"; previousValue: string };
type OverwriteDecision = "keep" | "revert" | "disable";

export function overwriteDecisionPatch(prompt: Prompt | null, decision: OverwriteDecision) {
  if (decision === "disable") return { day: { aiRewriteRequested: false } };
  if (decision !== "revert" || !prompt) return {};
  return prompt.field === "summary"
    ? { day: { shortVersion: prompt.previousValue } }
    : { entry: { aiTranslation: prompt.previousValue } };
}
export function useTimesheetAi(
  initial: TimesheetAiRewriteRequest[],
  list: () => Promise<TimesheetAiRewriteRequest[]>,
  cleanup: (dateKey: string, options?: AiCleanupOptions) => Promise<TimesheetAiCleanupResult>
) {
  const [aiRewriteRequests, setRequests] = useState(initial);
  const [isAiRewriteQueueOpen, setQueueOpen] = useState(false);
  const [aiRewritePromptDateKey, setRewritePrompt] = useState("");
  const [aiOverwriteEditPrompt, setOverwritePrompt] = useState<Prompt | null>(null);
  const [aiCleanupState, setState] = useState<CleanupState>("idle");
  const [aiCleanupDateKey, setDateKey] = useState("");
  const [aiCleanupMessage, setMessage] = useState("");

  function updateAiRewriteRequestsFromDays(days: TimesheetDayDraft[]) {
    setRequests((current) => reconcileAiRequests(current, days));
  }
  function removeAiRewriteRequests(keys: string[]) {
    setRequests((current) => current.filter((request) => !keys.includes(request.dateKey)));
  }
  async function refreshAiRewriteRequests() {
    try {
      setRequests(await list());
    } catch {
      // Keep the last known queue.
    }
  }
  function requestOverwritePrompt(prompt: Prompt, shouldWarn: boolean) {
    if (shouldWarn && !aiOverwriteEditPrompt) {
      setOverwritePrompt(prompt);
    }
  }
  function resolveOverwritePrompt(
    decision: OverwriteDecision,
    updateDay: (patch: Partial<TimesheetDayDraft>) => void,
    updateEntry: (patch: { aiTranslation: string }) => void
  ) {
    const patch = overwriteDecisionPatch(aiOverwriteEditPrompt, decision);
    if (patch.day) updateDay(patch.day);
    if (patch.entry) updateEntry(patch.entry);
    setOverwritePrompt(null);
  }
  async function runAiCleanup(
    dateKey: string,
    options: AiCleanupOptions | undefined,
    setting: Pick<Setting, "enabled" | "apiKeySaved">,
    applyDays: (days: TimesheetDayDraft[]) => void
  ) {
    setDateKey(dateKey);
    if (!setting.enabled || !setting.apiKeySaved) {
      setState("skipped");
      setMessage(!setting.enabled ? "AI 자동 정리 꺼짐" : "Gemini API key 없음");
      return;
    }
    setState("running");
    setMessage("AI 정리 중");
    const outcome = await performAiCleanup(dateKey, options, setting, cleanup, applyDays);
    if (outcome.kind === "disabled") {
      setState("skipped");
      setMessage(outcome.message);
    } else if (outcome.kind === "error") {
      setState("error");
      setMessage(outcome.message);
    } else {
      try {
        setState(outcome.result.skipped ? "skipped" : "done");
        setMessage(outcome.result.message);
        broadcastViewRefresh(["timesheet", "ai-summary"], "mutation");
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "AI 정리에 실패했습니다.");
      }
    }
  }
  return {
    aiCleanupState, aiCleanupDateKey, aiCleanupMessage, aiRewriteRequests, isAiRewriteQueueOpen,
    aiRewritePromptDateKey, aiOverwriteEditPrompt, updateAiRewriteRequestsFromDays, removeAiRewriteRequests,
    refreshAiRewriteRequests, runAiCleanup, requestOverwritePrompt, resolveOverwritePrompt,
    openQueue: () => setQueueOpen(true), closeQueue: () => setQueueOpen(false),
    openRewritePrompt: (dateKey: string) => setRewritePrompt(dateKey), closeRewritePrompt: () => setRewritePrompt("")
  };
}
