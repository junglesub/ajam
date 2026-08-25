"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { logoutAction } from "@/app/(app)/timesheet/actions";
import { ThemeSetting } from "@/components/theme-setting";
import { Badge, Button, Input } from "@timesheet/ui";
import { cn } from "@timesheet/ui";
import { Field, ModalShell } from "./timesheet-ui-primitives";

type SettingsSaveStatus = "error" | "idle" | "saved" | "saving";

export function SettingsModal({
  ai,
  holidayApi,
  holidayCache,
  isAdmin,
  isDevelopment,
  onClose,
  profile,
  users
}: {
  ai: {
    apiKey: string;
    backfillLimit: number;
    backfillMissing: boolean;
    cleanupMode: "immediate" | "manual" | "scheduled";
    clearApiKey: boolean;
    contextDays: number;
    customModel: string;
    enabled: boolean;
    keySaved: boolean;
    model: string;
    modelPresets: Array<{ label: string; value: string }>;
    onApiKeyChange: (value: string) => void;
    onBackfillLimitChange: (value: number) => void;
    onBackfillMissingChange: (checked: boolean) => void;
    onCleanupModeChange: (mode: "immediate" | "manual" | "scheduled") => void;
    onClearApiKeyChange: (checked: boolean) => void;
    onContextDaysChange: (value: number) => void;
    onCustomModelChange: (value: string) => void;
    onEnabledChange: (checked: boolean) => void;
    onModelChange: (value: string) => void;
    onOpenRewriteQueue: () => void;
    onSave: () => void;
    onTest: () => void;
    rewriteQueueCount: number;
    saveMessage: string;
    saveState: SettingsSaveStatus;
    testMessage: string;
    testState: SettingsSaveStatus;
  };
  holidayApi: {
    apiKey: string;
    onApiKeyChange: (value: string) => void;
    onSave: () => void;
    onTest: () => void;
    saveError: string;
    saveState: SettingsSaveStatus;
    testMessage: string;
    testState: SettingsSaveStatus;
  };
  holidayCache: {
    error: string;
    onResetAll: () => void;
    onResetCurrentMonth: () => void;
    state: SettingsSaveStatus;
  };
  isAdmin: boolean;
  isDevelopment: boolean;
  onClose: () => void;
  profile: {
    email: string;
    error: string;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onSave: () => void;
    onUsernameChange: (value: string) => void;
    password: string;
    state: SettingsSaveStatus;
    username: string;
  };
  users: {
    createState: SettingsSaveStatus;
    createError: string;
    existingUsers: Array<{ email: string; id: string; role: "ADMIN" | "USER"; username: string }>;
    newEmail: string;
    newPassword: string;
    newRole: "ADMIN" | "USER";
    newUsername: string;
    onCreate: () => void;
    onNewEmailChange: (value: string) => void;
    onNewPasswordChange: (value: string) => void;
    onNewRoleChange: (role: "ADMIN" | "USER") => void;
    onNewUsernameChange: (value: string) => void;
  };
}) {
  return (
    <ModalShell onClose={onClose} title="설정">
      <div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1">
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">내 설정</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">계정 정보와 개인 AI 자동 정리를 관리합니다.</p>
            </div>
            <Badge tone={isAdmin ? "green" : "gray"}>{isAdmin ? "관리자" : "일반"}</Badge>
          </div>

          <div className="mt-4">
            <ThemeSetting />
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-bold text-slate-950">계정 정보</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="아이디">
                <Input onChange={(event) => profile.onUsernameChange(event.target.value)} value={profile.username} />
              </Field>
              <Field label="이메일">
                <Input autoComplete="email" onChange={(event) => profile.onEmailChange(event.target.value)} placeholder="reminder@example.com" type="email" value={profile.email} />
              </Field>
              <Field label="새 비밀번호">
                <Input autoComplete="new-password" onChange={(event) => profile.onPasswordChange(event.target.value)} placeholder="변경 시에만 입력" type="password" value={profile.password} />
              </Field>
            </div>
            {profile.state === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">계정 정보를 저장했습니다.</p> : null}
            {profile.state === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{profile.error}</p> : null}
            <div className="mt-4 flex items-end justify-between gap-3">
              <form action={logoutAction}>
                <button className="text-sm font-semibold text-red-600 transition hover:text-red-700" type="submit">
                  로그아웃
                </button>
              </form>
              <Button disabled={profile.state === "saving"} onClick={profile.onSave} type="button">
                {profile.state === "saving" ? "저장 중" : "계정 저장"}
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-950">개인 AI 자동 정리</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">내 Gemini API key로 빈 영문 번역본과 짧은 버전을 채웁니다.</p>
              </div>
              <Badge tone={ai.keySaved ? "green" : "gray"}>{ai.keySaved ? "개인 key 저장됨" : "개인 key 없음"}</Badge>
            </div>

            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input checked={ai.enabled} className="size-4 accent-slate-950" onChange={(event) => ai.onEnabledChange(event.target.checked)} type="checkbox" />
                AI 자동 정리 사용
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-700">AI 정리 방식</p>
                  <button
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-bold transition",
                      ai.rewriteQueueCount > 0
                        ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    )}
                    onClick={ai.onOpenRewriteQueue}
                    type="button"
                  >
                    {ai.rewriteQueueCount}개 대기중
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {[
                    { description: "저장 직후 실행", label: "즉시", value: "immediate" },
                    { description: "n8n에서 일괄 실행", label: "예약", value: "scheduled" },
                    { description: "직접 실행만 사용", label: "수동", value: "manual" }
                  ].map((option) => (
                    <label
                      className={cn(
                        "cursor-pointer rounded-md border bg-white px-3 py-2 transition",
                        ai.cleanupMode === option.value ? "border-slate-950 ring-2 ring-slate-100" : "border-slate-200 hover:border-slate-300"
                      )}
                      key={option.value}
                    >
                      <input
                        checked={ai.cleanupMode === option.value}
                        className="sr-only"
                        onChange={() => ai.onCleanupModeChange(option.value as "immediate" | "manual" | "scheduled")}
                        type="radio"
                      />
                      <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{option.description}</span>
                    </label>
                  ))}
                </div>
                {ai.rewriteQueueCount > 0 && ai.cleanupMode !== "scheduled" ? (
                  <p className="mt-2 text-xs font-semibold leading-5 text-amber-700">
                    대기 목록은 보존되지만, 예약 모드가 아니면 n8n 예약 정리에서 처리되지 않습니다.
                  </p>
                ) : null}
              </div>

              <Field label="Gemini API key">
                <Input
                  autoComplete="off"
                  onChange={(event) => ai.onApiKeyChange(event.target.value)}
                  placeholder={ai.keySaved ? "새 key 입력 시 교체" : "Gemini API key"}
                  type="password"
                  value={ai.apiKey}
                />
              </Field>

              {ai.keySaved ? (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <input checked={ai.clearApiKey} className="size-4 accent-slate-950" disabled={Boolean(ai.apiKey)} onChange={(event) => ai.onClearApiKeyChange(event.target.checked)} type="checkbox" />
                  저장된 API key 삭제
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="모델">
                  <select
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    onChange={(event) => ai.onModelChange(event.target.value)}
                    value={ai.model}
                  >
                    {ai.modelPresets.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {ai.model === "__custom__" ? (
                  <Field label="직접 입력 모델명">
                    <Input onChange={(event) => ai.onCustomModelChange(event.target.value)} placeholder="gemini-..." value={ai.customModel} />
                  </Field>
                ) : (
                  <Field label="참고할 이전 저장 WORK 날짜">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      onChange={(event) => ai.onContextDaysChange(Number(event.target.value))}
                      value={ai.contextDays}
                    >
                      {[0, 3, 5, 10].map((value) => (
                        <option key={value} value={value}>
                          최근 {value}개
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {ai.model === "__custom__" ? (
                <Field label="참고할 이전 저장 WORK 날짜">
                  <select
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    onChange={(event) => ai.onContextDaysChange(Number(event.target.value))}
                    value={ai.contextDays}
                  >
                    {[0, 3, 5, 10].map((value) => (
                      <option key={value} value={value}>
                        최근 {value}개
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input checked={ai.backfillMissing} className="size-4 accent-slate-950" onChange={(event) => ai.onBackfillMissingChange(event.target.checked)} type="checkbox" />
                  이전 빈 번역/요약 보정
                </label>
                <Field label="한 번에 보정할 이전 날짜">
                  <select
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    disabled={!ai.backfillMissing}
                    onChange={(event) => ai.onBackfillLimitChange(Number(event.target.value))}
                    value={ai.backfillLimit}
                  >
                    {[1, 3, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}일
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <p className="text-xs font-medium leading-5 text-slate-500">미기입, 작성 예정, draft, 휴가, 공휴일, 빈 내용 업무는 참고/보정 대상에서 제외됩니다. 기존 번역본과 요약은 덮어쓰지 않습니다.</p>

              {(ai.saveState !== "idle" || ai.testMessage) ? (
                <div className="mt-3 space-y-1">
                  {ai.saveMessage ? <p className={cn("text-sm font-semibold", ai.saveState === "error" ? "text-red-600" : "text-emerald-700")}>{ai.saveMessage}</p> : null}
                  {ai.testMessage ? <p className={cn("text-sm font-semibold", ai.testState === "error" ? "text-red-600" : "text-emerald-700")}>{ai.testMessage}</p> : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button disabled={ai.testState === "saving"} onClick={ai.onTest} type="button" variant="secondary">
                  {ai.testState === "saving" ? "테스트 중" : "키 테스트"}
                </Button>
                <Button disabled={ai.saveState === "saving"} onClick={ai.onSave} type="button">
                  {ai.saveState === "saving" ? "저장 중" : "AI 설정 저장"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {isAdmin ? (
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">사이트 설정</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">관리자만 공휴일, 캐시, 사용자 설정을 변경할 수 있습니다.</p>
              </div>
              <Badge tone="green">관리자 전용</Badge>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-bold text-slate-950">공휴일 API</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">data.go.kr 서비스 키를 저장하고 현재 월 기준으로 테스트합니다.</p>
                <div className="mt-4">
                  <Field label="공공데이터포털 서비스 키">
                    <Input onChange={(event) => holidayApi.onApiKeyChange(event.target.value)} placeholder="서비스 키" type="password" value={holidayApi.apiKey} />
                  </Field>
                </div>
                {(holidayApi.saveState === "saved" || holidayApi.saveState === "error" || holidayApi.testMessage) ? (
                  <div className="mt-3 space-y-1">
                    {holidayApi.saveState === "saved" ? <p className="text-sm font-semibold text-emerald-700">API 키를 저장했습니다.</p> : null}
                    {holidayApi.saveState === "error" ? <p className="text-sm font-semibold text-red-600">{holidayApi.saveError}</p> : null}
                    {holidayApi.testMessage ? (
                      <p className={cn("text-sm font-semibold", holidayApi.testState === "error" ? "text-red-600" : "text-emerald-700")}>{holidayApi.testMessage}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button disabled={holidayApi.testState === "saving"} onClick={holidayApi.onTest} type="button" variant="secondary">
                    {holidayApi.testState === "saving" ? "테스트 중" : "키 테스트"}
                  </Button>
                  <Button disabled={holidayApi.saveState === "saving"} onClick={holidayApi.onSave} type="button">
                    {holidayApi.saveState === "saving" ? "저장 중" : "키 저장"}
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-bold text-slate-950">공휴일 캐시</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">현재 표시 중인 월의 공휴일 캐시를 삭제하고 다시 조회합니다.</p>
                {holidayCache.state === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">공휴일 정보를 다시 불러왔습니다.</p> : null}
                {holidayCache.state === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{holidayCache.error}</p> : null}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {isDevelopment ? (
                    <Button disabled={holidayCache.state === "saving"} onClick={holidayCache.onResetAll} type="button" variant="secondary">
                      <Trash2 aria-hidden="true" className="size-4" />
                      모든 API 공휴일 삭제
                    </Button>
                  ) : null}
                  <Button disabled={holidayCache.state === "saving"} onClick={holidayCache.onResetCurrentMonth} type="button" variant="secondary">
                    <RotateCcw aria-hidden="true" className="size-4" />
                    {holidayCache.state === "saving" ? "다시 불러오는 중" : "현재 월 공휴일 리셋"}
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-bold text-slate-950">사용자 관리</h4>
                <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                  {users.existingUsers.map((user) => (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm" key={user.id}>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-slate-950">{user.username}</span>
                        <span className="block truncate text-xs font-medium text-slate-500">{user.email || "이메일 없음"}</span>
                      </div>
                      <Badge tone={user.role === "ADMIN" ? "green" : "gray"}>{user.role === "ADMIN" ? "관리자" : "일반"}</Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="아이디">
                    <Input onChange={(event) => users.onNewUsernameChange(event.target.value)} value={users.newUsername} />
                  </Field>
                  <Field label="이메일">
                    <Input autoComplete="email" onChange={(event) => users.onNewEmailChange(event.target.value)} placeholder="reminder@example.com" type="email" value={users.newEmail} />
                  </Field>
                  <Field label="비밀번호">
                    <Input autoComplete="new-password" onChange={(event) => users.onNewPasswordChange(event.target.value)} type="password" value={users.newPassword} />
                  </Field>
                  <Field label="권한">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      onChange={(event) => users.onNewRoleChange(event.target.value === "ADMIN" ? "ADMIN" : "USER")}
                      value={users.newRole}
                    >
                      <option value="USER">일반</option>
                      <option value="ADMIN">관리자</option>
                    </select>
                  </Field>
                </div>
                {users.createState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">사용자를 추가했습니다.</p> : null}
                {users.createState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{users.createError}</p> : null}
                <div className="mt-4 flex justify-end">
                  <Button disabled={users.createState === "saving"} onClick={users.onCreate} type="button">
                    <Plus aria-hidden="true" className="size-4" />
                    {users.createState === "saving" ? "추가 중" : "사용자 추가"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={onClose} variant="secondary">
            닫기
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
