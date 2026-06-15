"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Database, RefreshCw, Rows3 } from "lucide-react";

import type { UserNotionConnection } from "@timesheet/db";
import { Button, Input } from "@timesheet/ui";

import { NotionCardTable } from "./notion-card-table";
import { NotionCategorySummary } from "./notion-category-summary";
import { NotionConnectionModal } from "./notion-connection-modal";
import { NotionDurationTotals } from "./notion-duration-totals";
import { NotionFieldUpdateModal } from "./notion-field-update-modal";
import type { NotionCardWorkspaceProps, NotionFieldUpdatePrompt } from "./types";
import { useNotionCardMonth } from "./use-notion-card-month";

function todayKey(): string {
  const today = new Date();

  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function NotionCardWorkspace({
  buildMonthlyAnalysisAction,
  initialConnection,
  initialMonth,
  listCardsForMonthAction,
  saveConnectionAction,
  syncCardFieldsAction,
  syncDateCandidatesAction,
  testDataSourceAction
}: NotionCardWorkspaceProps) {
  const [connection, setConnection] = useState<UserNotionConnection | null>(initialConnection);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [syncDateKey, setSyncDateKey] = useState(todayKey());
  const [syncError, setSyncError] = useState("");
  const [isSyncPending, startSyncTransition] = useTransition();
  const [fieldUpdatePrompt, setFieldUpdatePrompt] = useState<NotionFieldUpdatePrompt | null>(null);
  const [fieldUpdateError, setFieldUpdateError] = useState("");
  const [isFieldUpdatePending, startFieldUpdateTransition] = useTransition();
  const monthState = useNotionCardMonth({ buildMonthlyAnalysisAction, initialMonth, listCardsForMonthAction });

  function syncDate() {
    setSyncError("");
    setMessage("");
    startSyncTransition(async () => {
      try {
        const result = await syncDateCandidatesAction(syncDateKey);
        monthState.loadMonth();
        setMessage(`${result.cards.length}개 Notion 카드를 동기화했습니다.`);
        setFieldUpdatePrompt(result.notionFieldUpdate);
        setFieldUpdateError("");
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Notion 카드를 동기화하지 못했습니다.");
      }
    });
  }

  function updateSyncedCardFields() {
    if (!fieldUpdatePrompt) {
      return;
    }

    setFieldUpdateError("");
    startFieldUpdateTransition(async () => {
      try {
        const result = await syncCardFieldsAction(fieldUpdatePrompt.notionPageIds);

        setFieldUpdatePrompt(null);
        setMessage(`${result.updated}개 Notion 카드 필드를 업데이트했습니다.`);
        monthState.loadMonth();
      } catch (error) {
        setFieldUpdateError(error instanceof Error ? error.message : "Notion 필드를 업데이트하지 못했습니다.");
      }
    });
  }

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-0 pt-4">
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
              <Rows3 aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Notion 카드</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">업무 기록에 매핑할 카드 캐시</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsConnectionOpen(true)} type="button" variant="secondary">
              <Database aria-hidden="true" className="size-4" />
              Notion 연결
            </Button>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <CalendarDays aria-hidden="true" className="size-4" />
              <Input className="h-9 w-[150px]" onChange={(event) => monthState.setMonth(event.target.value)} type="month" value={monthState.month} />
            </label>
            <Button disabled={monthState.isPending} onClick={() => monthState.loadMonth()} type="button" variant="secondary">
              <RefreshCw aria-hidden="true" className="size-4" />
              새로고침
            </Button>
          </div>
        </div>

        {message ? <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
        {monthState.error || syncError ? (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{monthState.error || syncError}</div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <label className="grid gap-1 text-xs font-bold text-slate-500">
            후보 기준일
            <Input className="h-9 w-[150px]" onChange={(event) => setSyncDateKey(event.target.value)} type="date" value={syncDateKey} />
          </label>
          <Button disabled={isSyncPending || !connection?.hasToken} onClick={syncDate} type="button">
            <RefreshCw aria-hidden="true" className="size-4" />
            열린 카드 동기화
          </Button>
        </div>

        <NotionDurationTotals cards={monthState.cards} />
        <NotionCardTable cards={monthState.cards} />
      </section>

      <NotionCategorySummary items={monthState.analysis?.categorySummary ?? []} />

      <NotionConnectionModal
        connection={connection}
        onClose={() => setIsConnectionOpen(false)}
        onConnectionSaved={setConnection}
        onMessage={setMessage}
        open={isConnectionOpen}
        saveConnectionAction={saveConnectionAction}
        testDataSourceAction={testDataSourceAction}
      />
      <NotionFieldUpdateModal
        error={fieldUpdateError}
        isUpdating={isFieldUpdatePending}
        onClose={() => setFieldUpdatePrompt(null)}
        onConfirm={updateSyncedCardFields}
        prompt={fieldUpdatePrompt}
      />
    </main>
  );
}
