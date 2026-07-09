"use client";

import { useEffect, useState, useTransition } from "react";

import type { NotionCardCacheRecord } from "@timesheet/db";

import type { NotionMonthlyAnalysis } from "./types";

export function useNotionCardMonth(params: {
  buildMonthlyAnalysisAction?: (month: string) => Promise<NotionMonthlyAnalysis>;
  initialMonth: string;
  listCardsForMonthAction: (month: string) => Promise<NotionCardCacheRecord[]>;
}) {
  const [analysis, setAnalysis] = useState<NotionMonthlyAnalysis | null>(null);
  const [availableCards, setAvailableCards] = useState<NotionCardCacheRecord[]>([]);
  const [cards, setCards] = useState<NotionCardCacheRecord[]>([]);
  const [month, setMonth] = useState(params.initialMonth);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function getLoadErrorMessage(loadError: unknown) {
    return loadError instanceof Error ? loadError.message : "Notion 카드 목록을 불러오지 못했습니다.";
  }

  async function loadMonthData(nextMonth = month) {
    try {
      if (params.buildMonthlyAnalysisAction) {
        const [nextAnalysis, nextAvailableCards] = await Promise.all([
          params.buildMonthlyAnalysisAction(nextMonth),
          params.listCardsForMonthAction(nextMonth)
        ]);

        return {
          analysis: nextAnalysis,
          availableCards: nextAvailableCards,
          cards: nextAnalysis.cards
        };
      }

      const nextCards = await params.listCardsForMonthAction(nextMonth);

      return {
        analysis: null,
        availableCards: nextCards,
        cards: nextCards
      };
    } catch (loadError) {
      setError(getLoadErrorMessage(loadError));
      throw loadError;
    }
  }

  function applyMonthData(data: Awaited<ReturnType<typeof loadMonthData>>) {
    setError("");
    setAnalysis(data.analysis);
    setCards(data.cards);
    setAvailableCards(data.availableCards);
  }

  function loadMonth(nextMonth = month) {
    startTransition(async () => {
      try {
        setError("");
        applyMonthData(await loadMonthData(nextMonth));
      } catch {
        return;
      }
    });
  }

  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    loadMonth(nextMonth);
  }

  useEffect(() => {
    loadMonth(params.initialMonth);
  }, []);

  return {
    analysis,
    applyMonthData,
    availableCards,
    cards,
    error,
    isPending,
    loadMonth,
    loadMonthData,
    month,
    setCards,
    setMonth: changeMonth
  };
}
