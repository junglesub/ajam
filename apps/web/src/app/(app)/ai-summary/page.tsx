import { getManagedUser } from "@timesheet/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MonthEndAiSummaryWorkspace } from "@/components/ai-summary/month-end-ai-summary-workspace";
import { destroySession, getSession } from "@/server/session";

import { applyMonthlyAiSummaryAction, loadMonthlyAiSummaryAction } from "./actions";

export const metadata: Metadata = {
  title: "AI 월말 정리"
};

export default async function AiSummaryPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const currentUser = await getManagedUser(session.userId);

  if (!currentUser) {
    await destroySession();
    redirect("/login");
  }

  const today = new Date();
  const initialYear = today.getFullYear();
  const initialMonthIndex = today.getMonth();
  const initialData = await loadMonthlyAiSummaryAction(initialYear, initialMonthIndex);

  return (
    <MonthEndAiSummaryWorkspace
      applyMonthlyAiSummaryAction={applyMonthlyAiSummaryAction}
      initialData={initialData}
      initialMonthIndex={initialMonthIndex}
      initialYear={initialYear}
      loadMonthlyAiSummaryAction={loadMonthlyAiSummaryAction}
    />
  );
}
