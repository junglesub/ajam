"use client";

import { Badge } from "@timesheet/ui";

import { formatNotionDuration } from "./duration-format";
import type { NotionCardTableProps } from "./types";

export function NotionCardTable({ cards }: NotionCardTableProps) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="grid min-w-[1270px] grid-cols-[minmax(260px,1.5fr)_130px_130px_110px_110px_90px_110px_110px_110px] gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-bold text-slate-400">
        <span>카드</span>
        <span>상태</span>
        <span>분류</span>
        <span>시작</span>
        <span>완료</span>
        <span>작업일수</span>
        <span>가용 시간</span>
        <span>업무 기간</span>
        <span>기간 추정</span>
      </div>

      {cards.length === 0 ? (
        <div className="px-3 py-12 text-center text-sm font-semibold text-slate-500">선택한 월에 캐시된 Notion 카드가 없습니다.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {cards.map((card) => (
            <div
              className="grid min-w-[1270px] grid-cols-[minmax(260px,1.5fr)_130px_130px_110px_110px_90px_110px_110px_110px] items-center gap-3 px-3 py-3 text-sm"
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
