"use client";

import { X } from "lucide-react";

import { Button } from "@timesheet/ui";

import { NotionWeeklyDefaultsPanel } from "./notion-weekly-defaults-panel";
import type { NotionCardWorkspaceProps, UserNotionWeeklyDefaultCard } from "./types";

type NotionWeeklyDefaultsModalProps = {
  availableCards: Array<{
    category: string;
    notionPageId: string;
    status: string;
    title: string;
  }>;
  defaults: UserNotionWeeklyDefaultCard[];
  onClose: () => void;
  onDefaultsSaved: (defaults: UserNotionWeeklyDefaultCard[]) => void;
  onMessage: (message: string) => void;
  open: boolean;
  saveWeeklyDefaultsAction: NotionCardWorkspaceProps["saveWeeklyDefaultsAction"];
};

export function NotionWeeklyDefaultsModal({
  availableCards,
  defaults,
  onClose,
  onDefaultsSaved,
  onMessage,
  open,
  saveWeeklyDefaultsAction
}: NotionWeeklyDefaultsModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="max-h-full w-full max-w-[980px] overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
      >
        <div className="sticky top-0 z-20 flex justify-end border-b border-slate-200 bg-white px-4 py-3">
          <Button aria-label="요일별 자동 카드 닫기" className="h-9 px-3" onClick={onClose} type="button" variant="secondary">
            <X aria-hidden="true" className="size-4" />
            닫기
          </Button>
        </div>
        <div className="[&>section]:border-0">
          <NotionWeeklyDefaultsPanel
            availableCards={availableCards}
            defaults={defaults}
            onDefaultsSaved={onDefaultsSaved}
            onMessage={onMessage}
            saveWeeklyDefaultsAction={saveWeeklyDefaultsAction}
          />
        </div>
      </div>
    </div>
  );
}
