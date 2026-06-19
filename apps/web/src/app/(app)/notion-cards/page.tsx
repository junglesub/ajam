import type { Metadata } from "next";

import { NotionCardWorkspace } from "@/components/notion-cards/notion-card-workspace";

import {
  buildNotionMonthlyAnalysisAction,
  getNotionConnectionAction,
  listNotionWeeklyDefaultsAction,
  listNotionCardsForMonthAction,
  saveNotionConnectionAction,
  saveNotionWeeklyDefaultsAction,
  syncNotionCardFieldsAction,
  syncNotionDateCandidatesAction,
  testNotionDataSourceAction
} from "./actions";

export const metadata: Metadata = {
  title: "Notion 카드"
};

export default async function NotionCardsPage() {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [connection, weeklyDefaults] = await Promise.all([
    getNotionConnectionAction(),
    listNotionWeeklyDefaultsAction()
  ]);

  return (
    <NotionCardWorkspace
      initialConnection={connection}
      initialMonth={month}
      initialWeeklyDefaults={weeklyDefaults}
      buildMonthlyAnalysisAction={buildNotionMonthlyAnalysisAction}
      listCardsForMonthAction={listNotionCardsForMonthAction}
      saveConnectionAction={saveNotionConnectionAction}
      saveWeeklyDefaultsAction={saveNotionWeeklyDefaultsAction}
      syncCardFieldsAction={syncNotionCardFieldsAction}
      syncDateCandidatesAction={syncNotionDateCandidatesAction}
      testDataSourceAction={testNotionDataSourceAction}
    />
  );
}
