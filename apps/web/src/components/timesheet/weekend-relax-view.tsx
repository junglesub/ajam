"use client";

import { ArrowLeft, Coffee } from "lucide-react";
import { Button } from "@timesheet/ui";

type WeekendRelaxViewProps = {
  dateKey: string;
  onNavigatePreviousBusinessDay: () => void;
  onNavigateNextBusinessDay?: () => void;
};

export function WeekendRelaxView({
  onNavigatePreviousBusinessDay
}: WeekendRelaxViewProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center sm:py-16">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
        <Coffee aria-hidden="true" className="size-7 stroke-[2.2]" />
      </div>

      <h3 className="mt-4 text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">
        주말에는 푹 쉬세요! ☕️
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        주말에는 업무 기록을 작성하지 않아요.<br />
        월요일의 나를 믿고 오늘은 온전히 쉬어가세요 :)
      </p>

      <div className="mt-6">
        <Button
          className="h-8 text-xs font-semibold"
          onClick={onNavigatePreviousBusinessDay}
          type="button"
          variant="secondary"
        >
          <ArrowLeft aria-hidden="true" className="mr-1.5 size-3.5" />
          지난 금요일 기록하기
        </Button>
      </div>
    </div>
  );
}
