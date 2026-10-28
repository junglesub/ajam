"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  formatKoreanDate,
  getNotionCardWorkDateRole,
  getSavedNotionCardDateRanges,
  type TimesheetDayDraft,
  type TimesheetRow
} from "@timesheet/domain";
import { Badge, cn } from "@timesheet/ui";
import { hasTimeMismatch, NotionCardWarningIcon, TimeMismatchIcon, truncateContent } from "./timesheet-row-display";
import { effectiveEntryHours, entryHasNotionCardWarning, entryKindLabel, entryKindTone, entryTitle, firstWorkEntry, listRowKey } from "./timesheet-entry-display";

function formatAllocatedHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`;
}

function listSummaryText(row: TimesheetRow, showFullContent = false): string {
  if (row.hasVacation && row.entries.every((entry) => entry.kind === "VACATION")) {
    return row.vacationName || "휴가";
  }

  if (row.kind === "HOLIDAY") {
    return row.holidayName || "공휴일";
  }

  const firstWork = firstWorkEntry(row);
  const rawContent = (firstWork?.content ?? row.content ?? "").trim();
  const content = showFullContent ? rawContent : truncateContent(rawContent);

  if (row.status === "MISSING") {
    if (row.kind === "WORK" && row.project.trim() && !content) {
      return "작성 예정";
    }

    return content || "미기입";
  }

  return content || (row.kind === "WORK" ? "(내용 없음)" : "작성 예정");
}

function listDayMeta(row: TimesheetRow): string {
  if (row.status === "MISSING") {
    return "0h";
  }

  const workHours = row.entries.filter((entry) => entry.kind === "WORK").reduce((sum, entry) => sum + effectiveEntryHours(entry), 0);
  const vacationNames = row.entries.filter((entry) => entry.kind === "VACATION").map((entry) => entry.vacationName.trim() || "휴가");
  const parts = [workHours ? `업무 ${workHours}h` : "", ...vacationNames, row.holidayName.trim()].filter(Boolean);

  return parts.join(" · ") || `${row.hours}h`;
}

export function ListView({
  dateKeys,
  rows,
  savedRecords,
  selectedEntryId,
  selectedDateKey,
  selectedRowKey,
  setSelectedDateKey,
  setSelectedEntry,
  showFullContent
}: {
  dateKeys: string[];
  rows: Record<string, TimesheetRow>;
  savedRecords: Record<string, TimesheetDayDraft>;
  selectedEntryId: string;
  selectedDateKey: string;
  selectedRowKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  setSelectedEntry: (dateKey: string, entryClientId: string) => void;
  showFullContent: boolean;
}) {
  const rowButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousSelectedRowKeyRef = useRef(selectedRowKey);
  const cardDateRanges = useMemo(() => getSavedNotionCardDateRanges(savedRecords, dateKeys), [dateKeys, savedRecords]);

  useEffect(() => {
    if (previousSelectedRowKeyRef.current === selectedRowKey) {
      return;
    }

    previousSelectedRowKeyRef.current = selectedRowKey;
    rowButtonRefs.current.get(selectedRowKey)?.focus({ preventScroll: true });
  }, [selectedRowKey]);

  return (
    <div className="overflow-x-auto p-4">
      <div className="grid min-w-[980px] grid-cols-[112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-bold text-slate-400">
        <span>상태</span>
        <span>시간</span>
        <span>프로젝트</span>
        <span>내용</span>
        <span>AI 번역본</span>
      </div>
      <div className="divide-y divide-slate-100">
        {dateKeys.map((dateKey) => {
          const row = rows[dateKey]!;
          const emptyRowKey = listRowKey(dateKey, "");
          const emptyStatusLabel = row.status === "MISSING" ? "입력안됨" : row.kind === "HOLIDAY" ? "공휴일" : row.kind === "VACATION" && row.vacationStatus === "TEMPORARY" ? "임시" : row.kind === "VACATION" ? "휴가" : "업무";
          const emptyStatusTone: "blue" | "green" | "orange" | "white" = row.status === "MISSING" ? "white" : row.kind === "HOLIDAY" ? "orange" : row.kind === "VACATION" ? "blue" : "green";
          const dayHeader = (
            <div className={cn("grid grid-cols-[112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2", selectedDateKey === dateKey && "bg-blue-50/70")}>
              <div className="col-span-2 flex min-w-0 items-center gap-2">
                <span className="font-bold text-slate-950">{formatKoreanDate(dateKey)}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-500">{listDayMeta(row)}</span>
                {hasTimeMismatch(row) ? <TimeMismatchIcon hours={row.hours} /> : null}
                {row.hasNotionCardWarning ? <NotionCardWarningIcon /> : null}
              </div>
              {row.shortVersion.trim() ? (
                <p className={cn("col-span-3 min-w-0 text-sm font-semibold text-slate-700", showFullContent ? "whitespace-pre-wrap break-words" : "truncate")}>{row.shortVersion.trim()}</p>
              ) : null}
            </div>
          );

          if (row.status === "MISSING" || row.entries.length === 0) {
            return (
              <div className="min-w-[980px]" key={dateKey}>
                {dayHeader}
                <button
                  className={cn(
                    "grid w-full grid-cols-[112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-50",
                    row.status === "MISSING" && "bg-amber-50 hover:bg-amber-100/70",
                    selectedDateKey === dateKey && "bg-slate-100"
                  )}
                  id={`timesheet-list-row-${emptyRowKey}`}
                  onClick={() => setSelectedDateKey(dateKey)}
                  ref={(element) => {
                    if (element) rowButtonRefs.current.set(emptyRowKey, element);
                    else rowButtonRefs.current.delete(emptyRowKey);
                  }}
                  type="button"
                >
                  <span><Badge tone={emptyStatusTone}>{emptyStatusLabel}</Badge></span>
                  <span className="font-semibold text-slate-700">{row.status === "MISSING" ? "0h" : `${row.hours}h`}</span>
                  <span className="truncate font-medium text-slate-700">{row.kind === "HOLIDAY" ? row.holidayName || "-" : row.kind === "VACATION" ? row.vacationName || "휴가" : row.project}</span>
                  <span className={cn(showFullContent ? "whitespace-pre-wrap break-words" : "truncate", "text-slate-600", row.status === "MISSING" && "font-bold text-red-600")}>{listSummaryText(row, showFullContent)}</span>
                  <span className="truncate text-slate-500">-</span>
                </button>
              </div>
            );
          }

          return (
            <div className="min-w-[980px]" key={dateKey}>
              {dayHeader}
              <div className="divide-y divide-slate-100">
                {row.entries.map((entry) => {
                  const entryRowKey = listRowKey(dateKey, entry.clientId);
                  const isSelected = selectedDateKey === dateKey && selectedEntryId === entry.clientId;
                  const entryContent = entry.kind === "WORK" ? entry.content.trim() || "(내용 없음)" : "-";
                  const entryTranslation = entry.kind === "WORK" ? entry.aiTranslation.trim() || "-" : "-";
                  const hasEntryNotionWarning = entryHasNotionCardWarning(entry, row.status !== "MISSING");

                  return (
                    <button
                      className={cn(
                        "grid w-full grid-cols-[112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-50",
                        isSelected && "bg-slate-50 ring-1 ring-inset ring-slate-300"
                      )}
                      id={`timesheet-list-row-${entryRowKey}`}
                      key={entry.clientId}
                      onClick={() => setSelectedEntry(dateKey, entry.clientId)}
                      ref={(element) => {
                        if (element) rowButtonRefs.current.set(entryRowKey, element);
                        else rowButtonRefs.current.delete(entryRowKey);
                      }}
                      type="button"
                    >
                      <span><span className="inline-flex items-center gap-1.5"><Badge tone={entryKindTone(entry)}>{entryKindLabel(entry)}</Badge>{hasEntryNotionWarning ? <NotionCardWarningIcon /> : null}</span></span>
                      <span className="font-semibold text-slate-700">{effectiveEntryHours(entry)}h</span>
                      <span className="truncate font-medium text-slate-700">{entryTitle(entry)}</span>
                      <span className={cn("min-w-0 break-words text-slate-600", showFullContent ? "whitespace-pre-wrap" : "line-clamp-2")}>{entryContent}</span>
                      <span className={cn("min-w-0 break-words text-slate-500", showFullContent ? "whitespace-pre-wrap" : "line-clamp-2")}>{entryTranslation}</span>
                      {entry.kind === "WORK" && entry.notionCards.length > 0 ? (
                        <span className="col-span-3 col-start-3 flex min-w-0 flex-wrap items-center gap-1.5 pt-1">
                          {entry.notionCards.map((card) => {
                            const role = getNotionCardWorkDateRole(dateKey, card.notionPageId, cardDateRanges);
                            const roleBadge = role === "first"
                              ? { className: "bg-emerald-200/80 text-emerald-800", label: "시작" }
                              : role === "last"
                                ? { className: "bg-purple-200/80 text-purple-800", label: "종료" }
                                : role === "single"
                                  ? { className: "bg-teal-200/80 text-teal-800", label: "시작/종료" }
                                  : null;

                            return (
                              <span
                                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-100/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700"
                                key={card.notionPageId}
                                title={`${card.title || card.notionPageId} · ${formatAllocatedHours(card.allocatedHours)}${card.status ? ` · ${card.status}` : ""}`}
                              >
                                {roleBadge ? <span className={`shrink-0 rounded px-1 py-0.2 text-[10px] font-bold ${roleBadge.className}`}>{roleBadge.label}</span> : null}
                                <span className="min-w-0 truncate">{card.title || card.notionPageId}</span>
                                <span className="shrink-0 font-bold text-slate-950">{formatAllocatedHours(card.allocatedHours)}</span>
                                {card.status ? <span className="shrink-0 text-[10px] text-slate-400">{card.status}</span> : null}
                              </span>
                            );
                          })}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
