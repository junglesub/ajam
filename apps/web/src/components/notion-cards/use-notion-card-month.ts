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

  function loadMonth(nextMonth = month) {
    startTransition(async () => {
      try {
        setError("");
        if (params.buildMonthlyAnalysisAction) {
          const [nextAnalysis, nextAvailableCards] = await Promise.all([
            params.buildMonthlyAnalysisAction(nextMonth),
            params.listCardsForMonthAction(nextMonth)
          ]);
          setAnalysis(nextAnalysis);
          setCards(nextAnalysis.cards);
          setAvailableCards(nextAvailableCards);
          return;
        }

        const nextCards = await params.listCardsForMonthAction(nextMonth);
        setCards(nextCards);
        setAvailableCards(nextCards);
        setAnalysis(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Notion 카드 목록을 불러오지 못했습니다.");
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
    availableCards,
    cards,
    error,
    isPending,
    loadMonth,
    month,
    setCards,
    setMonth: changeMonth
  };
}
