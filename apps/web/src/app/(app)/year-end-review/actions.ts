"use server";

import { getManagedUser } from "@timesheet/db";
import type { YearEndReviewData, YearEndReviewPeriod } from "@timesheet/domain";
import { redirect } from "next/navigation";

import { destroySession, getSession } from "@/server/session";
import { loadYearEndReviewData } from "@/server/year-end-review";

export async function loadYearEndReviewAction(period: YearEndReviewPeriod): Promise<YearEndReviewData> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await getManagedUser(session.userId);

  if (!user) {
    await destroySession();
    redirect("/login");
  }

  return loadYearEndReviewData({ period, userId: user.id });
}
