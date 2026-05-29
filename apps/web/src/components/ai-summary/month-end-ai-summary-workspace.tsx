"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  FileJson,
  RefreshCw,
  Save,
  Sparkles
} from "lucide-react";

import {
  buildMonthlyAiSummaryPrompt,
  buildMonthlyAiSummaryRevisionPrompt,
  getMonthlyAiSummaryPatches,
  validateMonthlyAiSummaryImport,
  type MonthlyAiSummaryEntry,
  type MonthlyAiSummaryPayload
} from "@timesheet/domain";
import { Badge, Button, Textarea, cn } from "@timesheet/ui";

type MonthlyAiSummaryLoadResult = {
  payload: MonthlyAiSummaryPayload;
  projects: string[];
};

type MonthlyAiSummaryApplyResult = {
  appliedDateKeys: string[];
};

type MonthEndAiSummaryWorkspaceProps = {
  applyMonthlyAiSummaryAction: (params: {
    baseline: MonthlyAiSummaryPayload;
    imported: MonthlyAiSummaryPayload;
    monthIndex: number;
    year: number;
  }) => Promise<MonthlyAiSummaryApplyResult>;
  initialData: MonthlyAiSummaryLoadResult;
  initialMonthIndex: number;
  initialYear: number;
  loadMonthlyAiSummaryAction: (year: number, monthIndex: number) => Promise<MonthlyAiSummaryLoadResult>;
};

type CopyTarget = "export" | "mainPrompt" | "revisionPrompt";
type SaveState = "idle" | "saving" | "saved" | "error";

type ParsedImport =
  | { error: string; payload: null }
  | { error: ""; payload: MonthlyAiSummaryPayload };

const defaultRevisionInstruction = "Make the English more concise and suitable for a professional monthly report.";

export function MonthEndAiSummaryWorkspace({
  applyMonthlyAiSummaryAction,
  initialData,
  initialMonthIndex,
  initialYear,
  loadMonthlyAiSummaryAction
}: MonthEndAiSummaryWorkspaceProps) {
  const [year, setYear] = useState(initialYear);
  const [monthIndex, setMonthIndex] = useState(initialMonthIndex);
  const [data, setData] = useState(initialData);
  const [importText, setImportText] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isPending, startTransition] = useTransition();

  const exportJson = useMemo(() => JSON.stringify(data.payload, null, 2), [data.payload]);
  const mainPrompt = useMemo(() => buildMonthlyAiSummaryPrompt().replace("[PASTE_JSON_HERE]", exportJson), [exportJson]);
  const revisionPrompt = useMemo(() => {
    const currentJson = importText.trim() || exportJson;
    const instruction = revisionInstruction.trim() || defaultRevisionInstruction;

    return buildMonthlyAiSummaryRevisionPrompt()
      .replace("[WRITE_REVISION_REQUEST_HERE]", instruction)
      .replace("[PASTE_CURRENT_JSON_HERE]", currentJson);
  }, [exportJson, importText, revisionInstruction]);

  const parsedImport = useMemo<ParsedImport>(() => parseMonthlyPayload(importText), [importText]);
  const validation = useMemo(() => {
    if (!parsedImport.payload) {
      return {
        errors: parsedImport.error ? [parsedImport.error] : [],
        patches: []
      };
    }

    try {
      const result = validateMonthlyAiSummaryImport({ baseline: data.payload, imported: parsedImport.payload });

      return {
        errors: result.errors,
        patches: result.errors.length === 0 ? getMonthlyAiSummaryPatches({ baseline: data.payload, imported: parsedImport.payload }) : []
      };
    } catch (error) {
      return {
        errors: [error instanceof Error ? error.message : "가져온 JSON 구조를 확인할 수 없습니다."],
        patches: []
      };
    }
  }, [data.payload, parsedImport]);

  const previewRows = useMemo(
    () =>
      validation.patches.map((patch) => {
        const baselineDay = data.payload.days.find((day) => day.dateKey === patch.dateKey);
        const importedDay = parsedImport.payload?.days.find((day) => day.dateKey === patch.dateKey);
        const shortVersionChanged = Boolean(baselineDay && importedDay && importedDay.shortVersion !== baselineDay.shortVersion);

        return {
          ...patch,
          changeCount: patch.entries.length + (shortVersionChanged ? 1 : 0),
          shortVersionChanged
        };
      }),
    [data.payload.days, parsedImport.payload, validation.patches]
  );

  const monthLabel = `${year}년 ${monthIndex + 1}월`;
  const hasValidationErrors = validation.errors.length > 0;
  const canApply = Boolean(parsedImport.payload) && !hasValidationErrors && saveState !== "saving" && !isPending;

  function changeMonth(delta: number) {
    const next = new Date(year, monthIndex + delta, 1);
    const nextYear = next.getFullYear();
    const nextMonthIndex = next.getMonth();

    setLoadError("");
    setSaveState("idle");
    setStatusMessage("");

    startTransition(async () => {
      try {
        const nextData = await loadMonthlyAiSummaryAction(nextYear, nextMonthIndex);

        setYear(nextYear);
        setMonthIndex(nextMonthIndex);
        setData(nextData);
        setImportText("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "월 데이터를 불러오지 못했습니다.");
      }
    });
  }

  function copyText(target: CopyTarget, value: string) {
    setCopyError("");

    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopiedTarget(target);
        window.setTimeout(() => setCopiedTarget(null), 1400);
      })
      .catch(() => {
        setCopiedTarget(null);
        setCopyError("클립보드에 복사하지 못했습니다.");
      });
  }

  function applyImport() {
    if (!parsedImport.payload || hasValidationErrors) {
      return;
    }

    const imported = parsedImport.payload;
    const baseline = data.payload;

    setSaveState("saving");
    setStatusMessage("");

    startTransition(async () => {
      try {
        const result = await applyMonthlyAiSummaryAction({ baseline, imported, monthIndex, year });
        const refreshed = await loadMonthlyAiSummaryAction(year, monthIndex);

        setData(refreshed);
        setImportText(JSON.stringify(refreshed.payload, null, 2));
        setSaveState("saved");
        setStatusMessage(result.appliedDateKeys.length > 0 ? `${result.appliedDateKeys.length}개 날짜를 적용했습니다.` : "변경된 날짜가 없습니다.");
      } catch (error) {
        setSaveState("error");
        setStatusMessage(error instanceof Error ? error.message : "가져온 JSON을 적용하지 못했습니다.");
      }
    });
  }

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-0 pt-4 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <Sparkles aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-950">AI 월말 정리</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {monthLabel} · {data.payload.days.length}일 · 프로젝트 {data.projects.length}개
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="h-9 px-3" disabled={isPending} onClick={() => changeMonth(-1)} type="button" variant="secondary">
              <ChevronLeft aria-hidden="true" className="size-4" />
              이전 달
            </Button>
            <Button className="h-9 px-3" disabled={isPending} onClick={() => changeMonth(1)} type="button" variant="secondary">
              다음 달
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        {loadError ? <StatusBanner tone="error">{loadError}</StatusBanner> : null}
        {copyError ? <StatusBanner tone="error">{copyError}</StatusBanner> : null}

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <Panel
            actions={
              <>
                <CopyButton copied={copiedTarget === "mainPrompt"} label="프롬프트 복사" onClick={() => copyText("mainPrompt", mainPrompt)} />
                <CopyButton copied={copiedTarget === "export"} label="JSON만 복사" onClick={() => copyText("export", exportJson)} variant="secondary" />
              </>
            }
            icon={<Sparkles aria-hidden="true" className="size-4" />}
            title="메인 프롬프트"
          >
            <Textarea className="h-[520px] font-mono text-xs leading-5" readOnly value={mainPrompt} />
          </Panel>

          <Panel
            actions={<CopyButton copied={copiedTarget === "revisionPrompt"} label="수정 프롬프트 복사" onClick={() => copyText("revisionPrompt", revisionPrompt)} variant="secondary" />}
            icon={<RefreshCw aria-hidden="true" className="size-4" />}
            title="수정 프롬프트"
          >
            <div className="space-y-3">
              <Textarea
                className="h-24"
                onChange={(event) => setRevisionInstruction(event.target.value)}
                placeholder={defaultRevisionInstruction}
                value={revisionInstruction}
              />
              <Textarea className="h-[384px] font-mono text-xs leading-5" readOnly value={revisionPrompt} />
            </div>
          </Panel>
        </div>
      </section>

      <aside className="space-y-4">
        <Panel
          actions={
            <Button className="h-9 px-3" disabled={!canApply} onClick={applyImport} type="button">
              <Save aria-hidden="true" className="size-4" />
              {saveState === "saving" ? "적용 중" : "적용"}
            </Button>
          }
          icon={<FileJson aria-hidden="true" className="size-4" />}
          title="가져오기"
        >
          <Textarea
            className="h-[372px] font-mono text-xs leading-5"
            onChange={(event) => {
              setImportText(event.target.value);
              setSaveState("idle");
              setStatusMessage("");
            }}
            placeholder="LLM이 반환한 전체 JSON을 붙여넣으세요."
            value={importText}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ImportStatus error={validation.errors[0] ?? ""} patchCount={previewRows.length} />
            {saveState === "saved" && statusMessage ? <Badge tone="green">{statusMessage}</Badge> : null}
            {saveState === "error" && statusMessage ? <Badge tone="orange">{statusMessage}</Badge> : null}
          </div>
        </Panel>

        <Panel icon={<CheckCircle2 aria-hidden="true" className="size-4" />} title="변경 미리보기">
          {previewRows.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">
              검증 가능한 변경사항이 아직 없습니다.
            </p>
          ) : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {previewRows.map((patch) => (
                <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm" key={patch.dateKey}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-950">{patch.dateKey}</p>
                    <Badge tone="green">{patch.changeCount}개 변경</Badge>
                  </div>
                  {patch.shortVersionChanged ? (
                    <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm font-semibold leading-5 text-slate-700">
                      {patch.shortVersion || "(빈 shortVersion)"}
                    </p>
                  ) : null}
                  {patch.entries.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {patch.entries.map((entry) => (
                        <PreviewEntry entry={entry} key={entry.id} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </aside>
    </main>
  );
}

function parseMonthlyPayload(value: string): ParsedImport {
  if (!value.trim()) {
    return { error: "LLM이 반환한 JSON을 붙여넣어 주세요.", payload: null };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isMonthlyAiSummaryPayload(parsed)) {
      return { error: "month, schemaVersion, days 배열을 포함한 JSON이어야 합니다.", payload: null };
    }

    return { error: "", payload: parsed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "JSON을 파싱할 수 없습니다.", payload: null };
  }
}

function isMonthlyAiSummaryPayload(value: unknown): value is MonthlyAiSummaryPayload {
  if (!isRecord(value) || typeof value.month !== "string" || typeof value.schemaVersion !== "number" || !Array.isArray(value.days)) {
    return false;
  }

  return value.days.every(
    (day) =>
      isRecord(day) &&
      typeof day.dateKey === "string" &&
      typeof day.holidayName === "string" &&
      typeof day.shortVersion === "string" &&
      Array.isArray(day.entries) &&
      day.entries.every(isMonthlyAiSummaryEntry)
  );
}

function isMonthlyAiSummaryEntry(value: unknown): value is MonthlyAiSummaryEntry {
  return (
    isRecord(value) &&
    typeof value.aiTranslation === "string" &&
    typeof value.clientId === "string" &&
    typeof value.content === "string" &&
    typeof value.holidayName === "string" &&
    typeof value.hours === "number" &&
    typeof value.id === "string" &&
    (value.kind === "WORK" || value.kind === "VACATION" || value.kind === "HOLIDAY") &&
    typeof value.project === "string" &&
    typeof value.sortOrder === "number" &&
    typeof value.vacationName === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function Panel({
  actions,
  children,
  icon,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-950">
          {icon}
          <h3 className="text-base font-bold">{title}</h3>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CopyButton({
  copied,
  label,
  onClick,
  variant = "primary"
}: {
  copied: boolean;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button className="h-9 px-3" onClick={onClick} type="button" variant={variant}>
      {copied ? <ClipboardCheck aria-hidden="true" className="size-4" /> : <Clipboard aria-hidden="true" className="size-4" />}
      {copied ? "복사됨" : label}
    </Button>
  );
}

function ImportStatus({ error, patchCount }: { error: string; patchCount: number }) {
  if (error) {
    return (
      <Badge className="max-w-full gap-1 truncate" tone="orange">
        <AlertCircle aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">{error}</span>
      </Badge>
    );
  }

  return (
    <Badge className="gap-1" tone="green">
      <CheckCircle2 aria-hidden="true" className="size-3" />
      {patchCount}개 날짜 변경 가능
    </Badge>
  );
}

function PreviewEntry({ entry }: { entry: { aiTranslation: string; id: string } }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
      <p className="text-[11px] font-bold text-slate-400">{entry.id}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-slate-700">{entry.aiTranslation || "(빈 aiTranslation)"}</p>
    </div>
  );
}

function StatusBanner({ children, tone }: { children: ReactNode; tone: "error" }) {
  return (
    <div
      className={cn(
        "border-b px-5 py-3 text-sm font-semibold",
        tone === "error" && "border-red-100 bg-red-50 text-red-700"
      )}
    >
      {children}
    </div>
  );
}
