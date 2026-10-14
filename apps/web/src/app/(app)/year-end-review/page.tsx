import { getManagedUser } from "@timesheet/db";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { YearEndReviewWorkspace } from "@/components/year-end-review/year-end-review-workspace";
import { destroySession, getSession } from "@/server/session";

import {
  loadNotionCardCandidatesAction,
  loadTimesheetMonthAction,
  refreshNotionCardCandidatesAction,
  saveTimesheetEntryAction
} from "../timesheet/actions";
import { loadYearEndReviewAction } from "./actions";

export const metadata: Metadata = {
  title: "연말 정리"
};

export default async function YearEndReviewPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const currentUser = await getManagedUser(session.userId);

  if (!currentUser) {
    await destroySession();
    redirect("/login");
  }

  return (
    <YearEndReviewWorkspace
      loadMonthAction={loadTimesheetMonthAction}
      loadNotionCardCandidatesAction={loadNotionCardCandidatesAction}
      loadYearEndReviewAction={loadYearEndReviewAction}
      refreshNotionCardCandidatesAction={refreshNotionCardCandidatesAction}
      saveEntryAction={saveTimesheetEntryAction}
    />
  );
}
