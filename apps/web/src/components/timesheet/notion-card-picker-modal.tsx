"use client";

import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, cn } from "@timesheet/ui";

import type { NotionCardCandidate, NotionCardCandidateSyncMeta } from "./use-notion-card-candidates";

type NotionCardPickerModalProps = {
  candidates: NotionCardCandidate[];
  error: string;
  isLoading?: boolean;
  linkedPageIds: string[];
  onClose: () => void;
  onRefresh: () => void;
  onToggleCard: (notionPageId: string) => void;
  open: boolean;
  sync?: NotionCardCandidateSyncMeta;
};

export function NotionCardPickerModal({
  candidates,
  error,
  isLoading = false,
  linkedPageIds,
  onClose,
  onRefresh,
  onToggleCard,
  open,
  sync
}: NotionCardPickerModalProps) {
  const relativeNow = useRelativeNow(open);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/30 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="text-lg font-bold text-slate-950">Notion 카드 연결</h3>
              <p className="text-xs font-semibold text-slate-400">{getSyncLabel(sync, relativeNow)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              onClick={onRefresh}
              title="Notion 카드 새로고침"
              type="button"
            >
              <RefreshCw aria-hidden="true" className={cn("size-4", isLoading && "animate-spin")} />
              <span className="sr-only">Notion 카드 새로고침</span>
            </button>
            <button className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950" onClick={onClose} type="button">
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">닫기</span>
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}

        <div className="mt-4 max-h-[420px] divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">
          {candidates.length === 0 && isLoading ? (
            <NotionCardSkeletonList />
          ) : candidates.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm font-semibold text-slate-500">해당 날짜에 열린 후보 카드가 없습니다.</div>
          ) : (
            candidates.map((card) => {
              const isLinked = linkedPageIds.includes(card.notionPageId);

              return (
                <div
                  className="flex w-full cursor-pointer items-center gap-2 px-2 py-3 text-sm transition hover:bg-slate-50"
                  key={card.notionPageId}
                  onClick={() => onToggleCard(card.notionPageId)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onToggleCard(card.notionPageId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                    <span className="flex min-w-0 items-center gap-3">
                      <SelectionCheckbox checked={isLinked} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-slate-950">{card.title || "(제목 없음)"}</span>
                        <span className="text-xs font-semibold text-slate-500">
                          {card.status || "-"} · {card.category || "미분류"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-slate-400">
                      {card.startDate}~{card.endDate || ""}
                    </span>
                  </div>
                  {card.url ? (
                    <a
                      aria-label={`${card.title || "Notion 카드"} 새 탭에서 열기`}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-950"
                      href={card.url}
                      onClick={(event) => event.stopPropagation()}
                      rel="noreferrer"
                      target="_blank"
                      title="Notion에서 열기"
                    >
                      <ExternalLink aria-hidden="true" className="size-4" />
                    </a>
                  ) : (
                    <span aria-hidden="true" className="inline-flex size-8 shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={onClose} type="button" variant="secondary">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotionCardSkeletonList() {
  return (
    <div className="grid gap-0">
      {[0, 1, 2].map((item) => (
        <div className="grid gap-2 px-2 py-3" key={item}>
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-sm transition",
        checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-transparent"
      )}
    >
      {checked ? <Check className="size-3" /> : null}
    </span>
  );
}

function useRelativeNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(intervalId);
  }, [enabled]);

  return now;
}

function getSyncLabel(sync: NotionCardCandidateSyncMeta | undefined, now: number): string {
  if (!sync?.lastFetchedAt) {
    return "동기화 기록 없음";
  }

  const relativeTime = formatRelativeTime(sync.lastFetchedAt, now);
  const count = ` · ${sync.cardsFetched}개`;

  return `마지막 동기화: ${relativeTime}${count}`;
}

function formatRelativeTime(value: unknown, now: number): string {
  const timestamp = parseSyncTimestamp(value);

  if (!Number.isFinite(timestamp)) {
    return String(value);
  }

  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return "방금 전";
  }

  const units = [
    { seconds: 60 * 60 * 24 * 365, unit: "year" },
    { seconds: 60 * 60 * 24 * 30, unit: "month" },
    { seconds: 60 * 60 * 24, unit: "day" },
    { seconds: 60 * 60, unit: "hour" },
    { seconds: 60, unit: "minute" }
  ] as const;
  const formatter = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
  const match = units.find((item) => absSeconds >= item.seconds) ?? units[units.length - 1]!;

  return formatter.format(Math.round(diffSeconds / match.seconds), match.unit);
}

function parseSyncTimestamp(value: unknown): number {
  if (!value) {
    return Number.NaN;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const text = String(value).trim();

  if (!text) {
    return Number.NaN;
  }

  const normalized = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;

  return new Date(normalized).getTime();
}
