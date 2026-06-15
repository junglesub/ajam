"use client";

import { useState, useTransition } from "react";

export type NotionCardCandidate = {
  archived: boolean;
  category: string;
  endDate: string;
  lastEditedTime: string;
  notionPageId: string;
  rawPropertiesJson: string;
  stale: boolean;
  startDate: string;
  status: string;
  title: string;
  url: string;
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
  candidates: NotionCardCandidate[];
  sync: NotionCardCandidateSyncMeta;
};

export function useNotionCardCandidates(params: {
  loadNotionCardCandidatesAction: (dateKey: string) => Promise<NotionCardCandidatesResult>;
  refreshNotionCardCandidatesAction: (dateKey: string) => Promise<NotionCardCandidatesResult>;
}) {
  const [candidatesByDate, setCandidatesByDate] = useState<Record<string, NotionCardCandidate[]>>({});
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [syncByDate, setSyncByDate] = useState<Record<string, NotionCardCandidateSyncMeta>>({});

  function loadCandidates(dateKey: string) {
    requestCandidates(dateKey, params.loadNotionCardCandidatesAction);
  }

  function refreshCandidates(dateKey: string) {
    requestCandidates(dateKey, params.refreshNotionCardCandidatesAction);
  }

  function requestCandidates(dateKey: string, action: (dateKey: string) => Promise<NotionCardCandidatesResult>) {
    startTransition(async () => {
      try {
        setError("");
        const result = await action(dateKey);
        setCandidatesByDate((current) => ({ ...current, [dateKey]: result.candidates }));
        setSyncByDate((current) => ({ ...current, [dateKey]: result.sync }));
        setError(result.sync.errorMessage);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Notion 카드 후보를 불러오지 못했습니다.");
      }
    });
  }

  return {
    candidatesByDate,
    error,
    isPending,
    loadCandidates,
    refreshCandidates,
    syncByDate
  };
}
