"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@timesheet/ui";

import { NotionConnectionPanel } from "./notion-connection-panel";
import { NotionWebhookPanel } from "./notion-webhook-panel";
import type { NotionConnectionModalProps } from "./types";

export function NotionConnectionModal({
  loadWebhookSettingsAction,
  resetWebhookSettingsAction,
  revealWebhookVerificationTokenAction,
  saveWebhookVerificationTokenAction,
  onClose,
  open,
  ...panelProps
}: NotionConnectionModalProps) {
  const [tab, setTab] = useState<"connection" | "webhook">("connection");
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
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div aria-label="Notion 연결 설정" className="flex gap-1" role="tablist">
            <Button aria-controls="notion-connection-panel" aria-selected={tab === "connection"} id="notion-connection-tab" onClick={() => setTab("connection")} role="tab" type="button" variant={tab === "connection" ? "primary" : "secondary"}>기본 연결</Button>
            <Button aria-controls="notion-webhook-panel" aria-selected={tab === "webhook"} id="notion-webhook-tab" onClick={() => setTab("webhook")} role="tab" type="button" variant={tab === "webhook" ? "primary" : "secondary"}>자동 동기화</Button>
          </div>
          <Button aria-label="Notion 연결 닫기" className="h-9 px-3" onClick={onClose} type="button" variant="secondary">
            <X aria-hidden="true" className="size-4" />
            닫기
          </Button>
        </div>
        <div aria-labelledby={tab === "connection" ? "notion-connection-tab" : "notion-webhook-tab"} className="[&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none" id={tab === "connection" ? "notion-connection-panel" : "notion-webhook-panel"} role="tabpanel">
          {tab === "connection"
            ? <NotionConnectionPanel {...panelProps} />
            : <NotionWebhookPanel
                loadWebhookSettingsAction={loadWebhookSettingsAction}
                resetWebhookSettingsAction={resetWebhookSettingsAction}
                revealWebhookVerificationTokenAction={revealWebhookVerificationTokenAction}
                saveWebhookVerificationTokenAction={saveWebhookVerificationTokenAction}
              />}
        </div>
      </div>
    </div>
  );
}
