"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { Button, Input } from "@timesheet/ui";

import type { NotionCardWorkspaceProps, UserNotionWeeklyDefaultCard } from "./types";

type WeeklyDefaultDraft = {
  allocatedHours: number;
  clientId: string;
  enabled: boolean;
  notionPageId: string;
  weekdays: number[];
};

type NotionWeeklyDefaultsPanelProps = {
  availableCards: Array<{
    category: string;
    notionPageId: string;
    status: string;
    title: string;
  }>;
  defaults: UserNotionWeeklyDefaultCard[];
  onDefaultsSaved: (defaults: UserNotionWeeklyDefaultCard[]) => void;
  onMessage: (message: string) => void;
  saveWeeklyDefaultsAction: NotionCardWorkspaceProps["saveWeeklyDefaultsAction"];
};

const weekdays = [
  { label: "월", value: 1 },
  { label: "화", value: 2 },
  { label: "수", value: 3 },
  { label: "목", value: 4 },
  { label: "금", value: 5 }
];

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createDraft(defaults: UserNotionWeeklyDefaultCard[]): WeeklyDefaultDraft[] {
  const draftsByRule = new Map<string, WeeklyDefaultDraft>();

  for (const item of defaults) {
    const key = `${item.notionPageId}:${item.allocatedHours}:${item.enabled ? "1" : "0"}`;
    const draft = draftsByRule.get(key);

    if (draft) {
      draft.weekdays = [...draft.weekdays, item.weekday].sort((left, right) => left - right);
      continue;
    }

    draftsByRule.set(key, {
      allocatedHours: item.allocatedHours,
      clientId: createClientId(),
      enabled: item.enabled,
      notionPageId: item.notionPageId,
      weekdays: [item.weekday]
    });
  }

  return Array.from(draftsByRule.values());
}

function buildCardLabel(card: { category: string; notionPageId: string; status: string; title: string }): string {
  const metadata = [card.status, card.category].filter(Boolean).join(" · ");

  return metadata ? `${card.title || card.notionPageId} (${metadata})` : card.title || card.notionPageId;
}

export function NotionWeeklyDefaultsPanel({
  availableCards,
  defaults,
  onDefaultsSaved,
  onMessage,
  saveWeeklyDefaultsAction
}: NotionWeeklyDefaultsPanelProps) {
  const [drafts, setDrafts] = useState(() => createDraft(defaults));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const cardOptions = useMemo(() => {
    const cards = new Map<string, { category: string; notionPageId: string; status: string; title: string }>();

    for (const card of [...availableCards, ...defaults]) {
      if (card.notionPageId) {
        cards.set(card.notionPageId, {
          category: card.category,
          notionPageId: card.notionPageId,
          status: card.status,
          title: card.title
        });
      }
    }

    return Array.from(cards.values()).sort((left, right) => buildCardLabel(left).localeCompare(buildCardLabel(right), "ko-KR"));
  }, [availableCards, defaults]);

  function addDraft() {
    setDrafts((current) => [
      ...current,
      {
        allocatedHours: 1,
        clientId: createClientId(),
        enabled: true,
        notionPageId: cardOptions[0]?.notionPageId ?? "",
        weekdays: [1]
      }
    ]);
  }

  function updateDraft(clientId: string, patch: Partial<WeeklyDefaultDraft>) {
    setDrafts((current) => current.map((draft) => draft.clientId === clientId ? { ...draft, ...patch } : draft));
  }

  function removeDraft(clientId: string) {
    setDrafts((current) => current.filter((draft) => draft.clientId !== clientId));
  }

  function toggleDraftWeekday(clientId: string, weekday: number) {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.clientId !== clientId) {
          return draft;
        }

        const nextWeekdays = draft.weekdays.includes(weekday)
          ? draft.weekdays.filter((value) => value !== weekday)
          : [...draft.weekdays, weekday].sort((left, right) => left - right);

        return {
          ...draft,
          weekdays: nextWeekdays
        };
      })
    );
  }

  function saveDefaults() {
    setError("");
    startTransition(async () => {
      try {
        const saved = await saveWeeklyDefaultsAction(
          drafts.flatMap((draft) =>
            draft.weekdays.map((weekday) => ({
              allocatedHours: draft.allocatedHours,
              enabled: draft.enabled,
              notionPageId: draft.notionPageId,
              weekday
            }))
          )
        );

        setDrafts(createDraft(saved));
        onDefaultsSaved(saved);
        onMessage("요일별 자동 Notion 카드를 저장했습니다.");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "요일별 자동 카드를 저장하지 못했습니다.");
      }
    });
  }

  return (
    <section className="border-t border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-950">요일별 자동 카드</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">새 업무 작성 시 요일에 맞는 카드를 먼저 넣고, 남은 시간은 이전 카드가 나눠 갖습니다.</p>
        </div>
        <div className="flex gap-2">
          <Button className="h-9 px-3" onClick={addDraft} type="button" variant="secondary">
            <Plus aria-hidden="true" className="size-4" />
            추가
          </Button>
          <Button className="h-9 px-3" disabled={isPending} onClick={saveDefaults} type="button">
            <Save aria-hidden="true" className="size-4" />
            저장
          </Button>
        </div>
      </div>

      {error ? <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-2 px-5 pb-5">
        {drafts.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm font-semibold text-slate-500">설정된 요일별 자동 카드가 없습니다.</div>
        ) : (
          drafts.map((draft) => (
            <div className="grid grid-cols-[minmax(180px,auto)_minmax(220px,1fr)_92px_72px_32px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2" key={draft.clientId}>
              <div className="flex flex-wrap gap-1">
                {weekdays.map((weekday) => (
                  <button
                    aria-pressed={draft.weekdays.includes(weekday.value)}
                    className={draft.weekdays.includes(weekday.value)
                      ? "inline-flex size-8 items-center justify-center rounded-md bg-slate-950 text-xs font-bold text-white transition"
                      : "inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-500 transition hover:text-slate-950"}
                    key={weekday.value}
                    onClick={() => toggleDraftWeekday(draft.clientId, weekday.value)}
                    type="button"
                  >
                    {weekday.label}
                  </button>
                ))}
                {draft.weekdays.length === 0 ? <span className="self-center text-xs font-bold text-amber-600">요일 없음</span> : null}
              </div>

              <select
                className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700"
                onChange={(event) => updateDraft(draft.clientId, { notionPageId: event.target.value })}
                value={draft.notionPageId}
              >
                <option value="">카드 선택</option>
                {cardOptions.map((card) => (
                  <option key={card.notionPageId} value={card.notionPageId}>
                    {buildCardLabel(card)}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1">
                <Input
                  className="h-9 text-right"
                  min={0}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;

                    if (Number.isFinite(nextValue)) {
                      updateDraft(draft.clientId, { allocatedHours: nextValue });
                    }
                  }}
                  step={0.25}
                  type="number"
                  value={draft.allocatedHours}
                />
                <span className="text-xs font-bold text-slate-400">h</span>
              </label>

              <label className="inline-flex items-center justify-center gap-1 text-xs font-bold text-slate-500">
                <input
                  checked={draft.enabled}
                  className="size-4 accent-slate-950"
                  onChange={(event) => updateDraft(draft.clientId, { enabled: event.target.checked })}
                  type="checkbox"
                />
                사용
              </label>

              <button
                aria-label="요일별 자동 카드 삭제"
                className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                onClick={() => removeDraft(draft.clientId)}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
