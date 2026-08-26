"use client";

import { useEffect, useRef, useState } from "react";

import { isWeekendDateKey, type TimesheetDayDraft, type TimesheetEntryNotionCardDraft } from "@timesheet/domain";
import {
  buildNotionCardSnapshotMap,
  createWeekdayDefaultNotionCards,
  findLocalPreviousNotionCards,
  mergeNotionCardSnapshots,
  type NotionWeeklyDefaultCard
} from "./timesheet-notion-recommendation";
import type { NotionCardCandidate } from "./use-notion-card-candidates";

export type ProjectRecommendationApplication = {
  clientId: string;
  dateKey: string;
  project: string;
};

export type LocalNotionRecommendationApplication = {
  cards: TimesheetEntryNotionCardDraft[];
  clientId: string;
  dateKey: string;
};

export type DatabaseNotionRecommendationApplication = {
  cards: TimesheetEntryNotionCardDraft[];
  clientId: string;
  dateKey: string;
};

export type UseTimesheetRecommendationsInput = {
  candidatesByDate: Record<string, NotionCardCandidate[]>;
  doneStatusValues: string[];
  findPreviousNotionCardsAction: (dateKey: string) => Promise<TimesheetEntryNotionCardDraft[]>;
  findPreviousProjectAction: (dateKey: string) => Promise<string>;
  onApplyDatabaseNotionCards: (application: DatabaseNotionRecommendationApplication) => void;
  onApplyLocalNotionCards: (application: LocalNotionRecommendationApplication) => void;
  onApplyProjectRecommendation: (application: ProjectRecommendationApplication) => void;
  records: Record<string, TimesheetDayDraft>;
  savedEntryDateKeys: Set<string>;
  savedRecords: Record<string, TimesheetDayDraft>;
  selectedDateKey: string;
  weeklyDefaults: NotionWeeklyDefaultCard[];
};

export function useTimesheetRecommendations({
  candidatesByDate,
  doneStatusValues,
  findPreviousNotionCardsAction,
  findPreviousProjectAction,
  onApplyDatabaseNotionCards,
  onApplyLocalNotionCards,
  onApplyProjectRecommendation,
  records,
  savedEntryDateKeys,
  savedRecords,
  selectedDateKey,
  weeklyDefaults
}: UseTimesheetRecommendationsInput) {
  const [projectRecommendationLoadingKeys, setProjectRecommendationLoadingKeys] = useState<Set<string>>(() => new Set());
  const [notionRecommendationLoadingKeys, setNotionRecommendationLoadingKeys] = useState<Set<string>>(() => new Set());
  const previousNotionCardRecommendationKeys = useRef(new Set<string>());

  useEffect(() => {
    recommendPreviousNotionCardsForDraft(selectedDateKey, records[selectedDateKey]);
  }, [records, savedEntryDateKeys, selectedDateKey]);

  async function fillPreviousProjectFromDatabase(dateKey: string, clientId: string) {
    const loadingKey = `${dateKey}:${clientId}`;

    setProjectRecommendationLoadingKeys((current) => new Set(current).add(loadingKey));

    try {
      const project = (await findPreviousProjectAction(dateKey)).trim();

      if (!project) {
        return;
      }

      onApplyProjectRecommendation({ clientId, dateKey, project });
    } catch {
      // Auto-fill is a convenience path; leave the draft editable if lookup fails.
    } finally {
      setProjectRecommendationLoadingKeys((current) => {
        const next = new Set(current);

        next.delete(loadingKey);

        return next;
      });
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

      onApplyDatabaseNotionCards({ cards, clientId, dateKey });
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
    if (isWeekendDateKey(dateKey) || savedEntryDateKeys.has(dateKey)) {
      return;
    }

    const entry = day?.entries[0];

    if (entry?.kind === "WORK" && !entry.project.trim()) {
      void fillPreviousProjectFromDatabase(dateKey, entry.clientId);
    }
  }

  function recommendPreviousNotionCardsForDraft(dateKey: string, day: TimesheetDayDraft | undefined) {
    if (isWeekendDateKey(dateKey) || savedEntryDateKeys.has(dateKey)) {
      return;
    }

    const entry = day?.entries[0];

    if (entry?.kind === "WORK" && entry.notionCards.length === 0) {
      const recommendationKey = `${dateKey}:${entry.clientId}`;

      if (previousNotionCardRecommendationKeys.current.has(recommendationKey)) {
        return;
      }

      previousNotionCardRecommendationKeys.current.add(recommendationKey);

      const snapshotsByPageId = buildNotionCardSnapshotMap({
        candidatesByDate,
        savedRecords
      });
      const weekdayCards = mergeNotionCardSnapshots(
        createWeekdayDefaultNotionCards(dateKey, weeklyDefaults),
        snapshotsByPageId
      );
      const previousCards = findLocalPreviousNotionCards({
        dateKey,
        doneStatusValues,
        savedRecords
      });
      const localCards = [...weekdayCards, ...previousCards.cards];

      if (localCards.length > 0) {
        onApplyLocalNotionCards({ cards: localCards, clientId: entry.clientId, dateKey });
      }

      if (!previousCards.foundPreviousEntry) {
        void fillPreviousNotionCardsFromDatabase(dateKey, entry.clientId);
      }
    }
  }

  function isProjectRecommendationLoading(dateKey: string, clientId: string) {
    return projectRecommendationLoadingKeys.has(`${dateKey}:${clientId}`);
  }

  function isNotionRecommendationLoading(dateKey: string, clientId: string) {
    return notionRecommendationLoadingKeys.has(`${dateKey}:${clientId}`);
  }

  return {
    fillPreviousProjectFromDatabase,
    isNotionRecommendationLoading,
    isProjectRecommendationLoading,
    recommendPreviousNotionCardsForDraft,
    recommendPreviousProjectForDraft
  };
}


