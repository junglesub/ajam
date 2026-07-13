"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, RefreshCw, Webhook } from "lucide-react";

import type { NotionWebhookSettings } from "@timesheet/db";
import { Badge, Button, Input } from "@timesheet/ui";

export function NotionWebhookPanel({
  loadWebhookSettingsAction,
  resetWebhookSettingsAction,
  revealWebhookVerificationTokenAction,
  saveWebhookVerificationTokenAction
}: {
  loadWebhookSettingsAction: () => Promise<NotionWebhookSettings>;
  resetWebhookSettingsAction: () => Promise<NotionWebhookSettings>;
  revealWebhookVerificationTokenAction: () => Promise<string>;
  saveWebhookVerificationTokenAction: (token: string) => Promise<NotionWebhookSettings>;
}) {
  const [settings, setSettings] = useState<NotionWebhookSettings | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [revealedToken, setRevealedToken] = useState("");

  async function load() {
    setError("");
    try {
      setSettings(await loadWebhookSettingsAction());
      setRevealedToken("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Webhook 설정을 불러오지 못했습니다.");
    }
  }

  async function reset() {
    if (!window.confirm("기존 Notion webhook 구독을 삭제한 뒤 새 URL로 다시 설정해야 합니다. 계속할까요?")) {
      return;
    }
    setError("");
    try {
      setSettings(await resetWebhookSettingsAction());
      setRevealedToken("");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Webhook 설정을 재설정하지 못했습니다.");
    }
  }

  async function saveVerificationToken() {
    setError("");
    try {
      const next = await saveWebhookVerificationTokenAction(verificationToken);
      setSettings(next);
      setVerificationToken("");
      setRevealedToken("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Verification token을 저장하지 못했습니다.");
    }
  }

  async function toggleTokenVisibility() {
    if (revealedToken) {
      setRevealedToken("");
      return;
    }
    setError("");
    try {
      setRevealedToken(await revealWebhookVerificationTokenAction());
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Verification token을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);

  const webhookUrl = settings ? `${origin}/api/notion/webhook/${settings.connectionId}` : "";
  const statusLabel = settings?.status === "active"
    ? "자동 동기화 연결됨"
    : settings?.status === "token_received"
      ? "검증 토큰 수신됨"
      : "구독 설정 필요";

  return (
    <section className="grid gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white"><Webhook className="size-5" /></div>
          <div><h2 className="text-lg font-bold">Notion 자동 동기화</h2><p className="text-sm text-slate-500">무료 Connection Webhook 사용</p></div>
        </div>
        <Badge tone={settings?.status === "active" ? "green" : "gray"}>{statusLabel}</Badge>
      </div>

      {error || settings?.lastError ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error || settings?.lastError}</p> : null}

      <ol className="grid list-decimal gap-3 pl-5 text-sm text-slate-700">
        <li><a className="font-bold underline" href="https://www.notion.so/profile/integrations" rel="noreferrer" target="_blank">Notion integration</a>을 만들고 콘텐츠 읽기·업데이트 권한을 켭니다.</li>
        <li>연결할 데이터 소스에서 해당 integration을 connection으로 추가하고, 기본 연결 탭에 token과 필드를 저장합니다.</li>
        <li>integration의 <strong>Webhooks</strong> 탭에서 아래 공개 HTTPS URL로 subscription을 만들고 <code>page.created</code>, <code>page.properties_updated</code>, <code>page.deleted</code>, <code>page.undeleted</code>를 선택합니다. localhost는 사용할 수 없습니다.</li>
      </ol>

      <CopyField label="Webhook URL" value={webhookUrl} />

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-sm font-bold">Verification token</p>
        {settings?.hasVerificationToken ? (
          <>
            <label className="grid gap-2 text-sm font-bold">
              Notion의 Verify 화면에 붙여넣기
              <span className="flex gap-2"><Input readOnly type={revealedToken ? "text" : "password"} value={revealedToken || "verification-token"} /><Button onClick={() => void toggleTokenVisibility()} type="button" variant="secondary">{revealedToken ? "숨기기" : "보기"}</Button><Button aria-label="Verification token 복사" disabled={!revealedToken} onClick={() => void navigator.clipboard.writeText(revealedToken)} type="button" variant="secondary"><Clipboard className="size-4" /></Button></span>
            </label>
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" />Notion의 verification 요청을 받았습니다.</p>
          </>
        ) : <p className="text-sm text-slate-500">Webhook URL을 등록한 뒤 새로고침하면 token이 표시됩니다.</p>}
      </div>

      <div className="grid gap-3 rounded-md border border-slate-200 p-4">
        <div><p className="text-sm font-bold">Verification token 직접 입력</p><p className="mt-1 text-xs text-slate-500">n8n이 Notion verification 요청을 받는 구성에서는 같은 token을 production과 development aJam에 각각 저장하세요.</p></div>
        <Input autoComplete="off" onChange={(event) => setVerificationToken(event.target.value)} placeholder={settings?.hasVerificationToken ? "새 token을 입력하면 기존 값 교체" : "secret_..."} type="password" value={verificationToken} />
        <div className="flex justify-end gap-2"><Button disabled={!settings?.hasVerificationToken} onClick={() => void saveWebhookVerificationTokenAction("").then((next) => { setSettings(next); setRevealedToken(""); }).catch((clearError) => setError(clearError instanceof Error ? clearError.message : "Token을 삭제하지 못했습니다."))} type="button" variant="secondary">저장된 token 삭제</Button><Button disabled={!verificationToken.trim()} onClick={() => void saveVerificationToken()} type="button">Token 저장</Button></div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>최근 이벤트: {settings?.lastEventAt || "없음"}</span>
        <span className="flex gap-2"><Button onClick={() => void load()} type="button" variant="secondary"><RefreshCw className="size-4" />상태 새로고침</Button><Button onClick={() => void reset()} type="button" variant="danger">구독 재설정</Button></span>
      </div>
    </section>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      {label}
      <span className="flex gap-2"><Input readOnly value={value} /><Button aria-label={`${label} 복사`} disabled={!value} onClick={() => void navigator.clipboard.writeText(value)} type="button" variant="secondary"><Clipboard className="size-4" /></Button></span>
    </label>
  );
}
