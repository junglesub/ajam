"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@timesheet/ui";

import { formatNotionDuration } from "./duration-format";
import type { NotionAnalysisCard, NotionCardTableProps } from "./types";

type NotionCardSortKey =
  | "lastWorkedDesc"
  | "linkedHoursDesc"
  | "workDayCountDesc"
  | "availableHoursDesc"
  | "estimateDesc"
  | "titleAsc";

const sortStorageKey = "ajam:notion-card-table-sort";

const sortOptions: Array<{ label: string; value: NotionCardSortKey }> = [
  { label: "마지막 작업 날짜", value: "lastWorkedDesc" },
  { label: "업무 기간", value: "linkedHoursDesc" },
  { label: "작업일수", value: "workDayCountDesc" },
  { label: "가용 시간", value: "availableHoursDesc" },
  { label: "기간 추정", value: "estimateDesc" },
  { label: "카드 제목", value: "titleAsc" }
];

export function NotionCardTable({ cards }: NotionCardTableProps) {
  const [sortKey, setSortKey] = useState<NotionCardSortKey>("lastWorkedDesc");
  const sortedCards = useMemo(() => sortCards(cards, sortKey), [cards, sortKey]);

  useEffect(() => {
    setSortKey(readStoredSortKey());
  }, []);

  return (
    <div className="overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-end">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          정렬
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            onChange={(event) => updateSortKey(toSortKey(event.target.value), setSortKey)}
            value={sortKey}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid min-w-[1510px] grid-cols-[minmax(260px,1.5fr)_130px_130px_110px_110px_90px_130px_130px_130px_130px] gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-bold text-slate-400">
        <span>카드</span>
        <span>상태</span>
        <span>분류</span>
        <span>시작</span>
        <span>완료</span>
        <span>작업일수</span>
        <span>가용 시간</span>
        <span>업무 기간</span>
        <span>마지막 작업 날짜</span>
        <span>기간 추정</span>
      </div>

      {sortedCards.length === 0 ? (
        <div className="px-3 py-12 text-center text-sm font-semibold text-slate-500">선택한 월에 캐시된 Notion 카드가 없습니다.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sortedCards.map((card) => (
            <div
              className="grid min-w-[1510px] grid-cols-[minmax(260px,1.5fr)_130px_130px_110px_110px_90px_130px_130px_130px_130px] items-center gap-3 px-3 py-3 text-sm"
              key={card.notionPageId}
            >
              <div className="min-w-0">
                {card.url ? (
                  <a
                    className="block truncate font-bold text-slate-950 transition hover:text-blue-700 hover:underline"
                    href={card.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {card.title || "제목 없음"}
                  </a>
                ) : (
                  <div className="truncate font-bold text-slate-950">{card.title || "제목 없음"}</div>
                )}
                <div className="mt-1 flex gap-1">
                  {card.stale ? <Badge tone="gray">stale</Badge> : null}
                  {card.archived ? <Badge tone="gray">archived</Badge> : null}
                </div>
              </div>
              <span className="truncate font-semibold text-slate-700">{card.status || "-"}</span>
              <span className="truncate font-medium text-slate-600">{card.category || "-"}</span>
              <span className="font-medium text-slate-600">{card.startDate || "-"}</span>
              <span className="font-medium text-slate-600">{card.endDate || "-"}</span>
              <span className="font-semibold text-slate-700">{card.workDayCount ?? 0}일</span>
              <span className="font-semibold text-slate-700">
                {card.availableHours?.unavailableReason ? "계산 불가" : formatNotionDuration(card.availableHours?.availableHours)}
              </span>
              <span className="font-semibold text-slate-700">{formatNotionDuration(card.linkedHours)}</span>
              <span className="font-semibold text-slate-700">{formatLastWorkedDate(card.lastWorkedDate)}</span>
              <span className="font-semibold text-slate-700">
                {card.estimate?.unavailableReason ? "계산 불가" : formatNotionDuration(card.estimate?.estimatedHours)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function updateSortKey(nextSortKey: NotionCardSortKey, setSortKey: (sortKey: NotionCardSortKey) => void) {
  setSortKey(nextSortKey);

  try {
    window.localStorage.setItem(sortStorageKey, nextSortKey);
  } catch {
    // Sorting still works for the current session if localStorage is unavailable.
  }
}

function readStoredSortKey(): NotionCardSortKey {
  if (typeof window === "undefined") {
    return "lastWorkedDesc";
  }

  try {
    return toSortKey(window.localStorage.getItem(sortStorageKey) ?? "");
  } catch {
    return "lastWorkedDesc";
  }
}

function toSortKey(value: string): NotionCardSortKey {
  return sortOptions.some((option) => option.value === value) ? value as NotionCardSortKey : "lastWorkedDesc";
}

function sortCards(cards: NotionAnalysisCard[], sortKey: NotionCardSortKey): NotionAnalysisCard[] {
  return [...cards].sort((left, right) => {
    const titleComparison = (left.title || "").localeCompare(right.title || "", "ko-KR");

    switch (sortKey) {
      case "linkedHoursDesc":
        return compareDesc(left.linkedHours, right.linkedHours) || titleComparison;
      case "workDayCountDesc":
        return compareDesc(left.workDayCount, right.workDayCount) || titleComparison;
      case "availableHoursDesc":
        return compareDesc(left.availableHours?.availableHours, right.availableHours?.availableHours) || titleComparison;
      case "estimateDesc":
        return compareDesc(left.estimate?.estimatedHours, right.estimate?.estimatedHours) || titleComparison;
      case "titleAsc":
        return titleComparison;
      case "lastWorkedDesc":
      default:
        return (right.lastWorkedDate || "").localeCompare(left.lastWorkedDate || "") || titleComparison;
    }
  });
}

function compareDesc(left: number | null | undefined, right: number | null | undefined): number {
  return (right ?? 0) - (left ?? 0);
}

function formatLastWorkedDate(dateKey: string | undefined) {
  if (!dateKey) {
    return "-";
  }

  return (
    <span title={dateKey}>
      {formatRelativeDate(dateKey)}
    </span>
  );
}

function formatRelativeDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  return new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(diffDays, "day");
}
