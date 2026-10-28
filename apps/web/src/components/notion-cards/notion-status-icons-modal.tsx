"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { AlertCircle, AlertTriangle, Check, Play, RefreshCw, Save, Smile, X } from "lucide-react";

import { Button } from "@timesheet/ui";
import { isValidEmoji } from "@timesheet/domain";
import type {
  NotionIconBulkJobStatus,
  NotionSelectOption,
  NotionStatusIconSettings,
  UserNotionConnection
} from "@timesheet/db";

import { StatusEmojiPicker } from "./status-emoji-picker";
import type { NotionStatusIconsModalProps } from "./types";

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
  });
}

export function NotionStatusIconsModal({
  connection: initialConnectionProp,
  getIconBulkStatusAction,
  getStatusIconSettingsAction,
  onClose,
  onMessage,
  open,
  saveStatusIconSettingsAction,
  startIconBulkAction
}: NotionStatusIconsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pickerScopeRef = useRef<HTMLDivElement>(null);
  const loadRequestIdRef = useRef(0);
  const pollRequestIdRef = useRef(0);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [pollError, setPollError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const [isConnectionLoaded, setIsConnectionLoaded] = useState(false);
  const [currentConnection, setCurrentConnection] = useState<UserNotionConnection | null>(initialConnectionProp);
  const [hasWebhook, setHasWebhook] = useState(false);
  const [schemaError, setSchemaError] = useState<string | undefined>(undefined);
  const [options, setOptions] = useState<NotionSelectOption[]>([]);
  const [statusPropertyName, setStatusPropertyName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [emojiByOptionId, setEmojiByOptionId] = useState<Record<string, string>>({});
  const [pickerOptionId, setPickerOptionId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [job, setJob] = useState<NotionIconBulkJobStatus | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isStartingBulk, startBulkTransition] = useTransition();

  // Focus trap, focus restore, and body scroll lock
  useEffect(() => {
    if (!open) {
      setPickerOptionId(null);
      return;
    }

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.body.style.overflow = originalOverflow;
      previousActive?.focus();
    };
  }, [open]);

  const loadData = useCallback(() => {
    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setLoadError("");
    setSaveError("");
    setBulkError("");
    setPollError("");
    setConfirmClose(false);

    getStatusIconSettingsAction()
      .then((data) => {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        setCurrentConnection(data.connection ?? null);
        setIsConnectionLoaded(true);
        setHasWebhook(data.hasWebhook);
        setSchemaError(data.schemaError);
        setOptions(data.options);
        setStatusPropertyName(data.statusPropertyName);
        setEnabled(data.settings?.enabled ?? false);
        setEmojiByOptionId(data.settings?.emojiByOptionId ?? {});
        setJob(data.latestJob);
        setIsDirty(false);
      })
      .catch((error) => {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (requestId === loadRequestIdRef.current) {
          setIsLoading(false);
        }
      });
  }, [getStatusIconSettingsAction]);

  // Load modal data when opened (with stale-response guard & cleanup invalidation)
  useEffect(() => {
    if (!open) {
      return;
    }
    loadData();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [open, loadData]);

  // Poll bulk status while job is running (with stale-response guard and error state)
  useEffect(() => {
    if (!open || !job || job.status !== "running") {
      return;
    }

    const interval = setInterval(() => {
      const pollReqId = ++pollRequestIdRef.current;
      getIconBulkStatusAction()
        .then((updated) => {
          if (pollReqId !== pollRequestIdRef.current) {
            return;
          }
          if (updated) {
            setJob(updated);
            setPollError("");
          }
        })
        .catch(() => {
          if (pollReqId === pollRequestIdRef.current) {
            setPollError("동기화 상태 확인 중 일시적인 오류가 발생했습니다.");
          }
        });
    }, 2000);

    return () => {
      pollRequestIdRef.current += 1;
      clearInterval(interval);
    };
  }, [open, job, getIconBulkStatusAction]);

  function requestClose() {
    if (isSaving || isStartingBulk) {
      return;
    }
    if (isDirty) {
      setConfirmClose(true);
      return;
    }
    loadRequestIdRef.current += 1;
    pollRequestIdRef.current += 1;
    onClose();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (pickerOptionId) {
        closeEmojiPicker();
        return;
      }
      if (confirmClose) {
        setConfirmClose(false);
        return;
      }
      requestClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const scope = pickerOptionId ? pickerScopeRef.current : dialogRef.current;
    if (!scope) {
      return;
    }

    const focusable = getFocusableElements(scope);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    const isFocusOnFirst = document.activeElement === first;
    const isFocusOutsideOrContainer = document.activeElement === scope || !scope.contains(document.activeElement);

    if (event.shiftKey) {
      if (isFocusOnFirst || isFocusOutsideOrContainer) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last || isFocusOutsideOrContainer) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  if (!open) {
    return null;
  }

  const activeConnection = isConnectionLoaded ? currentConnection : initialConnectionProp;
  const dataSourceName = activeConnection?.dataSourceName || activeConnection?.dataSourceId || "연결된 데이터 소스";
  const hasOptions = options.length > 0;
  const hasAnyInvalidEmoji = Object.values(emojiByOptionId).some((val) => val.trim() !== "" && !isValidEmoji(val));

  function handleEmojiChange(optionId: string, value: string) {
    setEmojiByOptionId((prev) => ({
      ...prev,
      [optionId]: value
    }));
    setIsDirty(true);
    setSaveError("");
    setConfirmClose(false);
  }

  function closeEmojiPicker() {
    const optionId = pickerOptionId;
    setPickerOptionId(null);
    requestAnimationFrame(() => {
      if (!optionId) {
        return;
      }
      document.getElementById(`emoji-trigger-${optionId}`)?.focus();
    });
  }

  const pickerOption = pickerOptionId ? options.find((option) => option.id === pickerOptionId) : undefined;

  function handleSaveSettings() {
    if (!activeConnection?.dataSourceId || !activeConnection?.statusProperty?.id) {
      setSaveError("Notion 상태 속성 매핑이 필요합니다.");
      return;
    }

    if (hasAnyInvalidEmoji) {
      setSaveError("올바르지 않은 이모지가 포함되어 있습니다. 단일 Unicode 이모지만 입력해 주세요.");
      return;
    }

    setSaveError("");
    startSaveTransition(async () => {
      try {
        const cleanedMapping: Record<string, string> = {};
        for (const [optId, emo] of Object.entries(emojiByOptionId)) {
          const trimmed = emo.trim();
          if (trimmed && isValidEmoji(trimmed)) {
            cleanedMapping[optId] = trimmed;
          }
        }

        const statusPropertyId = activeConnection?.statusProperty?.id ?? "";
        if (!statusPropertyId) {
          setSaveError("Notion 상태 속성 매핑이 필요합니다.");
          return;
        }

        const settingsToSave: NotionStatusIconSettings = {
          dataSourceId: activeConnection.dataSourceId,
          emojiByOptionId: cleanedMapping,
          enabled,
          statusPropertyId
        };

        const saved = await saveStatusIconSettingsAction(settingsToSave);
        setEnabled(saved.enabled);
        setEmojiByOptionId(saved.emojiByOptionId);
        setIsDirty(false);
        setConfirmClose(false);
        onMessage("상태별 아이콘 설정을 저장했습니다.");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "설정 저장에 실패했습니다.");
      }
    });
  }

  function handleStartBulk() {
    pollRequestIdRef.current += 1;
    setBulkError("");
    startBulkTransition(async () => {
      try {
        const started = await startIconBulkAction();
        setJob(started);
        onMessage("전체 아이콘 동기화가 백그라운드에서 시작되었습니다.");
      } catch (error) {
        setBulkError(error instanceof Error ? error.message : "아이콘 동기화 시작에 실패했습니다.");
      }
    });
  }

  const isJobRunning = job?.status === "running";
  const canStartBulk =
    !isLoading &&
    !loadError &&
    !isSaving &&
    !isStartingBulk &&
    !isJobRunning &&
    enabled &&
    !isDirty &&
    !hasAnyInvalidEmoji &&
    !schemaError &&
    Boolean(activeConnection?.hasToken);

  // Calculate progress
  const totalItems = job?.totalKnown && job?.totalCount !== null ? job.totalCount : null;
  const progressPercent = totalItems && totalItems > 0 && job
    ? Math.min(100, Math.round((job.processedCount / totalItems) * 100))
    : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 py-6"
      onKeyDown={handleDialogKeyDown}
      onMouseDown={(event) => {
        if (pickerOptionId) {
          return;
        }
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        aria-labelledby="notion-status-icons-title"
        aria-modal={pickerOption ? undefined : true}
        className="max-h-full w-full max-w-[800px] overflow-y-auto rounded-lg bg-white shadow-2xl focus:outline-none"
        role="dialog"
        tabIndex={-1}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <Smile aria-hidden="true" className="size-5 text-slate-800" />
            <h3 id="notion-status-icons-title" className="text-lg font-bold text-slate-950">
              상태별 페이지 아이콘 설정
            </h3>
          </div>
          <Button aria-label="닫기" className="h-9 px-3" onClick={requestClose} type="button" variant="secondary">
            <X aria-hidden="true" className="size-4" />
            닫기
          </Button>
        </div>

        {confirmClose ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-900">
                ⚠️ 저장되지 않은 설정 변경이 있습니다. 닫으시면 변경사항이 취소됩니다.
              </p>
              <div className="flex items-center gap-2">
                <Button className="h-7 text-xs" onClick={() => setConfirmClose(false)} type="button" variant="secondary">
                  계속 편집
                </Button>
                <Button
                  className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                  onClick={onClose}
                  type="button"
                >
                  취소하고 닫기
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-5 p-5">
          {/* Scope & Overwrite Policy Notice */}
          <p className="text-xs font-semibold text-slate-500">
            대상: <span className="text-slate-800">{dataSourceName}</span>. 휴지통과 보관함은 제외합니다.
          </p>

          {/* Webhook Automation Availability Notice */}
          {!hasWebhook ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">자동 동기화가 꺼져 있습니다. 아래에서 전체를 동기화할 수 있습니다.</p>
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <span>{loadError}</span>
              <Button
                className="h-7 shrink-0 px-2.5 text-xs bg-red-100 hover:bg-red-200 text-red-800"
                onClick={loadData}
                type="button"
                variant="secondary"
              >
                다시 시도
              </Button>
            </div>
          ) : null}

          {schemaError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {schemaError}
            </div>
          ) : null}

          {/* Settings Section */}
          <div className="space-y-4 rounded-md border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-900">
                <input
                  checked={enabled}
                  className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  disabled={isSaving || isLoading}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    setIsDirty(true);
                  }}
                  type="checkbox"
                />
                상태별 아이콘 자동 적용 사용
              </label>
              {statusPropertyName ? (
                <span className="text-xs font-semibold text-slate-500">
                  상태 속성: <span className="text-slate-800">{statusPropertyName}</span>
                </span>
              ) : null}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-sm font-semibold text-slate-500">
                <RefreshCw aria-hidden="true" className="mr-2 size-4 animate-spin" />
                옵션 목록을 불러오는 중...
              </div>
            ) : !hasOptions ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                상태 옵션을 가져오지 못했습니다. Notion 연결을 확인해 주세요.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                      <th className="py-2 pr-4">상태 옵션</th>
                      <th className="w-[180px] py-2 pr-4">이모지</th>
                      <th className="py-2">동작</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {options.map((option) => {
                      const currentVal = emojiByOptionId[option.id] ?? "";
                      const isInvalid = currentVal.trim() !== "" && !isValidEmoji(currentVal);

                      return (
                        <tr key={option.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 pr-4">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                              <span
                                className="size-2.5 rounded-full"
                                style={{
                                  backgroundColor: mapNotionColor(option.color)
                                }}
                              />
                              {option.name}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4">
                            <div>
                              <button
                                aria-expanded={pickerOptionId === option.id}
                                aria-haspopup="dialog"
                                aria-label={`${option.name} 이모지 선택`}
                                className={`inline-flex h-8 w-24 items-center justify-center rounded-md border bg-white text-lg transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${isInvalid ? "border-red-500" : "border-slate-200"}`}
                                disabled={isSaving}
                                id={`emoji-trigger-${option.id}`}
                                onClick={() => setPickerOptionId(option.id)}
                                type="button"
                              >
                                {currentVal.trim() ? currentVal : <span className="text-xs font-semibold text-slate-400">선택</span>}
                              </button>
                              {isInvalid ? (
                                <p className="mt-1 text-[11px] font-medium text-red-600">유효한 이모지만 가능</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2.5 text-xs text-slate-500">
                            {currentVal.trim() ? (
                              <button
                                className="font-semibold text-slate-400 hover:text-red-600 disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() => handleEmojiChange(option.id, "")}
                                type="button"
                              >
                                비우기
                              </button>
                            ) : (
                              <span className="italic text-slate-400">변경 안 함</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {saveError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                {saveError}
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button
                disabled={!isDirty || isSaving || isLoading || hasAnyInvalidEmoji}
                onClick={handleSaveSettings}
                type="button"
              >
                <Save aria-hidden="true" className="size-4" />
                {isSaving ? "저장 중..." : "설정 저장"}
              </Button>
            </div>
          </div>

          {/* Bulk Operation Section */}
          <div className="space-y-4 rounded-md border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900">전체 아이콘 동기화</h4>

              <Button
                disabled={!canStartBulk}
                onClick={handleStartBulk}
                type="button"
                variant={isJobRunning ? "secondary" : "primary"}
              >
                {isJobRunning ? (
                  <>
                    <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
                    동기화 진행 중...
                  </>
                ) : (
                  <>
                    <Play aria-hidden="true" className="size-4" />
                    실행
                  </>
                )}
              </Button>
            </div>

            {isDirty ? (
              <p className="text-xs font-semibold text-amber-600">
                저장한 뒤 동기화할 수 있습니다.
              </p>
            ) : null}

            {bulkError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                {bulkError}
              </div>
            ) : null}

            {pollError ? (
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <span>{pollError}</span>
                <Button
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    getIconBulkStatusAction().then((s) => s && setJob(s)).catch(() => {});
                  }}
                  type="button"
                  variant="secondary"
                >
                  다시 확인
                </Button>
              </div>
            ) : null}

            {/* Current / Last Job Status Display */}
            {job ? (
              <div className="space-y-3 rounded-md bg-slate-50 p-3.5 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    {job.status === "running" ? (
                      <span className="inline-flex size-2 rounded-full bg-blue-500 animate-pulse" />
                    ) : job.status === "completed" ? (
                      <Check aria-hidden="true" className="size-3.5 text-emerald-600" />
                    ) : (
                      <AlertCircle aria-hidden="true" className="size-3.5 text-amber-600" />
                    )}
                    작업 상태:{" "}
                    <span className={job.status === "running" ? "text-blue-600" : job.status === "completed" ? "text-emerald-700" : "text-amber-700"}>
                      {mapJobStatusKorean(job.status)}
                    </span>
                  </span>
                  <span className="text-slate-400">
                    시작: {formatDateDisplay(job.startedAt)}
                  </span>
                </div>

                {/* Visual Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-medium text-slate-500">
                    <span>
                      진행률: {progressPercent !== null ? `${progressPercent}%` : `${job.processedCount}건 처리됨 (전체 탐색 중)`}
                    </span>
                    <span>
                      {job.processedCount} / {job.totalKnown && job.totalCount !== null ? job.totalCount : `${job.discoveredCount} 발견`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={progressPercent ?? undefined}
                      className={`h-full transition-all duration-300 ${
                        job.status === "completed"
                          ? "bg-emerald-500"
                          : job.status === "failed" || job.status === "interrupted"
                          ? "bg-amber-500"
                          : "bg-blue-600"
                      }`}
                      role="progressbar"
                      style={{ width: `${progressPercent ?? (job.discoveredCount > 0 ? Math.min(100, Math.round((job.processedCount / job.discoveredCount) * 100)) : 10)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded bg-white p-2 border border-slate-200">
                    <span className="text-[11px] text-slate-500">처리 건수</span>
                    <p className="text-sm font-bold text-slate-800">
                      {job.processedCount} / {job.totalKnown && job.totalCount !== null ? job.totalCount : `${job.discoveredCount} 발견`}
                    </p>
                  </div>
                  <div className="rounded bg-white p-2 border border-slate-200">
                    <span className="text-[11px] text-slate-500">아이콘 변경</span>
                    <p className="text-sm font-bold text-emerald-600">{job.updatedCount}건</p>
                  </div>
                  <div className="rounded bg-white p-2 border border-slate-200">
                    <span className="text-[11px] text-slate-500">동일/미매핑 건너뜀</span>
                    <p className="text-sm font-bold text-slate-600">{job.skippedCount}건</p>
                  </div>
                  <div className="rounded bg-white p-2 border border-slate-200">
                    <span className="text-[11px] text-slate-500">실패 / API 요청</span>
                    <p className="text-sm font-bold text-slate-800">
                      <span className={job.failedCount > 0 ? "text-red-600" : "text-slate-800"}>{job.failedCount}건</span> / {job.requestCount}회
                    </p>
                  </div>
                </div>

                {job.errorMessage ? (
                  <p className="font-semibold text-red-600">안내: {job.errorMessage}</p>
                ) : null}

                {(job.status === "interrupted" || job.status === "failed") ? (
                  <div className="pt-1">
                    <Button
                      className="h-7 text-xs"
                      disabled={!canStartBulk}
                      onClick={handleStartBulk}
                      type="button"
                      variant="secondary"
                    >
                      <RefreshCw aria-hidden="true" className="size-3" />
                      중단된 동기화 다시 실행
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {pickerOption ? (
        <StatusEmojiPicker
          current={emojiByOptionId[pickerOption.id] ?? ""}
          disabled={isSaving}
          onClose={closeEmojiPicker}
          onSelect={(emoji) => {
            handleEmojiChange(pickerOption.id, emoji);
            closeEmojiPicker();
          }}
          optionName={pickerOption.name}
          scopeRef={pickerScopeRef}
        />
      ) : null}
    </div>
  );
}

function mapNotionColor(color?: string): string {
  switch (color) {
    case "blue":
      return "#3b82f6";
    case "brown":
      return "#92400e";
    case "default":
    case "gray":
      return "#94a3b8";
    case "green":
      return "#10b981";
    case "orange":
      return "#f97316";
    case "pink":
      return "#ec4899";
    case "purple":
      return "#8b5cf6";
    case "red":
      return "#ef4444";
    case "yellow":
      return "#eab308";
    default:
      return "#94a3b8";
  }
}

function mapJobStatusKorean(status: string): string {
  switch (status) {
    case "running":
      return "진행 중";
    case "completed":
      return "완료됨";
    case "partial":
      return "부분 완료됨";
    case "interrupted":
      return "중단됨 (재실행 가능)";
    case "failed":
      return "실패";
    default:
      return status;
  }
}

function formatDateDisplay(iso: string): string {
  if (!iso) {
    return "";
  }
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}
