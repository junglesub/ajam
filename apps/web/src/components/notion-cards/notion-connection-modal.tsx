"use client";

import { X } from "lucide-react";

import { Button } from "@timesheet/ui";

import { NotionConnectionPanel } from "./notion-connection-panel";
import type { NotionConnectionPanelProps } from "./types";

type NotionConnectionModalProps = NotionConnectionPanelProps & {
  onClose: () => void;
  open: boolean;
};

export function NotionConnectionModal({
  onClose,
  open,
  ...panelProps
}: NotionConnectionModalProps) {
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
        className="max-h-full w-full max-w-[900px] overflow-y-auto rounded-lg bg-white shadow-2xl"
        role="dialog"
      >
        <div className="sticky top-0 z-20 flex justify-end border-b border-slate-200 bg-white px-4 py-3">
          <Button aria-label="Notion 연결 닫기" className="h-9 px-3" onClick={onClose} type="button" variant="secondary">
            <X aria-hidden="true" className="size-4" />
            닫기
          </Button>
        </div>
        <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none">
          <NotionConnectionPanel {...panelProps} />
        </div>
      </div>
    </div>
  );
}
