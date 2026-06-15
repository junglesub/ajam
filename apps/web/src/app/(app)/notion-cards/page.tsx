import type { Metadata } from "next";

import { NotionCardWorkspace } from "@/components/notion-cards/notion-card-workspace";

import {
  buildNotionMonthlyAnalysisAction,
  getNotionConnectionAction,
  listNotionCardsForMonthAction,
  saveNotionConnectionAction,
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
  const connection = await getNotionConnectionAction();

  return (
    <NotionCardWorkspace
      initialConnection={connection}
      initialMonth={month}
      buildMonthlyAnalysisAction={buildNotionMonthlyAnalysisAction}
      listCardsForMonthAction={listNotionCardsForMonthAction}
      saveConnectionAction={saveNotionConnectionAction}
      syncCardFieldsAction={syncNotionCardFieldsAction}
      syncDateCandidatesAction={syncNotionDateCandidatesAction}
      testDataSourceAction={testNotionDataSourceAction}
    />
  );
}
