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

export type LoadNotionCardCandidatesInput = {
  dateKey: string;
  linkedPageIds?: string[];
};

export function useNotionCardCandidates(params: {
  loadNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
  refreshNotionCardCandidatesAction: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>;
}) {
  const [candidatesByDate, setCandidatesByDate] = useState<Record<string, NotionCardCandidate[]>>({});
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [syncByDate, setSyncByDate] = useState<Record<string, NotionCardCandidateSyncMeta>>({});

  function loadCandidates(input: LoadNotionCardCandidatesInput) {
    requestCandidates(input, params.loadNotionCardCandidatesAction);
  }

  function refreshCandidates(input: LoadNotionCardCandidatesInput) {
    requestCandidates(input, params.refreshNotionCardCandidatesAction);
  }

  function requestCandidates(input: LoadNotionCardCandidatesInput, action: (input: LoadNotionCardCandidatesInput) => Promise<NotionCardCandidatesResult>) {
    startTransition(async () => {
      try {
        setError("");
        const result = await action(input);
        setCandidatesByDate((current) => ({ ...current, [input.dateKey]: result.candidates }));
        setSyncByDate((current) => ({ ...current, [input.dateKey]: result.sync }));
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
