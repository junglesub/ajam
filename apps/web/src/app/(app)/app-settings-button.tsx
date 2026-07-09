"use client";

import type { AiCleanupMode, ManagedUser, TimesheetAiRewriteRequest, UserAiSetting, UserRole } from "@timesheet/db";
import { formatKoreanDate } from "@timesheet/domain";
import { Badge, Button, Input, Label, cn } from "@timesheet/ui";
import { Plus, RotateCcw, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { ThemeSetting } from "@/components/theme-setting";
import { broadcastViewRefresh } from "@/lib/view-refresh";

import {
  createUserAction,
  listTimesheetAiRewriteRequestsAction,
  logoutAction,
  resetAllHolidayCacheAction,
  resetHolidayCacheAction,
  saveHolidayApiKeyAction,
  testGeminiApiKeyAction,
  testHolidayApiKeyAction,
  updateProfileAction,
  updateUserAiSettingAction
} from "./timesheet/actions";

type SaveState = "error" | "idle" | "saved" | "saving";

type AppSettingsButtonProps = {
  aiRewriteRequests: TimesheetAiRewriteRequest[];
  aiSetting: UserAiSetting;
  currentUser: ManagedUser;
  initialHolidayApiKey: string;
  initialManagedUsers: ManagedUser[];
};

const aiModelPresets = [
  { label: "빠름/저렴 - gemini-3.1-flash-lite", value: "gemini-3.1-flash-lite" },
  { label: "균형 - gemini-3.5-flash", value: "gemini-3.5-flash" },
  { label: "안정 대안 - gemini-2.5-flash", value: "gemini-2.5-flash" },
  { label: "직접 입력", value: "__custom__" }
];

function truncateContent(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function AppSettingsButton({
  aiRewriteRequests: initialAiRewriteRequests,
  aiSetting: initialAiSetting,
  currentUser,
  initialHolidayApiKey,
  initialManagedUsers
}: AppSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState(currentUser.username);
  const [profileEmail, setProfileEmail] = useState(currentUser.email);
  const [profilePassword, setProfilePassword] = useState("");
  const [profileState, setProfileState] = useState<SaveState>("idle");
  const [profileError, setProfileError] = useState("");
  const [holidayApiKey, setHolidayApiKey] = useState(initialHolidayApiKey);
  const [holidayApiKeyState, setHolidayApiKeyState] = useState<SaveState>("idle");
  const [holidayApiKeyMessage, setHolidayApiKeyMessage] = useState("");
  const [holidayResetState, setHolidayResetState] = useState<SaveState>("idle");
  const [managedUsers, setManagedUsers] = useState(initialManagedUsers);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("USER");
  const [userCreateState, setUserCreateState] = useState<SaveState>("idle");
  const [userCreateError, setUserCreateError] = useState("");
  const [aiSetting, setAiSetting] = useState(initialAiSetting);
  const [aiRewriteRequests, setAiRewriteRequests] = useState(initialAiRewriteRequests);
  const [aiRewriteQueueOpen, setAiRewriteQueueOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(initialAiSetting.enabled);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiClearApiKey, setAiClearApiKey] = useState(false);
  const [aiModel, setAiModel] = useState(aiModelPresets.some((preset) => preset.value === initialAiSetting.model) ? initialAiSetting.model : "__custom__");
  const [aiCustomModel, setAiCustomModel] = useState(aiModel === "__custom__" ? initialAiSetting.model : "");
  const [aiContextDays, setAiContextDays] = useState(initialAiSetting.contextDays);
  const [aiBackfillMissing, setAiBackfillMissing] = useState(initialAiSetting.backfillMissing);
  const [aiBackfillLimit, setAiBackfillLimit] = useState(initialAiSetting.backfillLimit);
  const [aiCleanupMode, setAiCleanupMode] = useState<AiCleanupMode>(initialAiSetting.cleanupMode);
  const [aiState, setAiState] = useState<SaveState>("idle");
  const [aiMessage, setAiMessage] = useState("");
  const isAdmin = currentUser.role === "ADMIN";
  const isDevelopment = process.env.NODE_ENV === "development";

  function selectedAiModel() {
    return aiModel === "__custom__" ? aiCustomModel.trim() : aiModel;
  }

  function openSettings() {
    setOpen(true);
    void refreshAiRewriteRequests();
  }

  async function refreshAiRewriteRequests() {
    try {
      setAiRewriteRequests(await listTimesheetAiRewriteRequestsAction());
    } catch {
      // Settings can still open with the last known count.
    }
  }

  async function saveProfile() {
    setProfileState("saving");
    setProfileError("");
    try {
      const updated = await updateProfileAction({ email: profileEmail, password: profilePassword || undefined, username: profileUsername });
      setProfileUsername(updated.username);
      setProfileEmail(updated.email);
      setProfilePassword("");
      setProfileState("saved");
    } catch (error) {
      setProfileState("error");
      setProfileError(error instanceof Error ? error.message : "계정 정보를 저장하지 못했습니다.");
    }
  }

  async function saveAiSetting() {
    setAiState("saving");
    setAiMessage("");
    try {
      const updated = await updateUserAiSettingAction({
        apiKey: aiApiKey || undefined,
        backfillLimit: aiBackfillLimit,
        backfillMissing: aiBackfillMissing,
        clearApiKey: aiClearApiKey,
        contextDays: aiContextDays,
        cleanupMode: aiCleanupMode,
        enabled: aiEnabled,
        model: selectedAiModel()
      });
      setAiSetting(updated);
      setAiApiKey("");
      setAiClearApiKey(false);
      setAiState("saved");
      setAiMessage("AI 자동 정리 설정을 저장했습니다.");
    } catch (error) {
      setAiState("error");
      setAiMessage(error instanceof Error ? error.message : "AI 설정을 저장하지 못했습니다.");
    }
  }

  async function testAiSetting() {
    setAiState("saving");
    setAiMessage("");
    try {
      await testGeminiApiKeyAction({ apiKey: aiApiKey || undefined, model: selectedAiModel() });
      setAiState("saved");
      setAiMessage("Gemini API key를 확인했습니다.");
    } catch (error) {
      setAiState("error");
      setAiMessage(error instanceof Error ? error.message : "Gemini API key 테스트에 실패했습니다.");
    }
  }

  async function saveHolidayApiKey() {
    setHolidayApiKeyState("saving");
    setHolidayApiKeyMessage("");
    try {
      await saveHolidayApiKeyAction(holidayApiKey);
      setHolidayApiKeyState("saved");
      setHolidayApiKeyMessage("API 키를 저장했습니다.");
    } catch (error) {
      setHolidayApiKeyState("error");
      setHolidayApiKeyMessage(error instanceof Error ? error.message : "API 키를 저장하지 못했습니다.");
    }
  }

  async function testHolidayApiKey() {
    setHolidayApiKeyState("saving");
    setHolidayApiKeyMessage("");
    try {
      const now = new Date();
      const result = await testHolidayApiKeyAction(holidayApiKey, now.getFullYear(), now.getMonth());
      setHolidayApiKeyState(result.ok ? "saved" : "error");
      setHolidayApiKeyMessage(result.ok ? `공휴일 ${result.holidays.length}건을 확인했습니다.` : "공휴일 API 응답을 확인하지 못했습니다.");
    } catch (error) {
      setHolidayApiKeyState("error");
      setHolidayApiKeyMessage(error instanceof Error ? error.message : "API 키 테스트에 실패했습니다.");
    }
  }

  async function resetCurrentMonthHolidays() {
    setHolidayResetState("saving");
    try {
      const now = new Date();
      await resetHolidayCacheAction(now.getFullYear(), now.getMonth());
      setHolidayResetState("saved");
      broadcastViewRefresh(["timesheet", "vacations", "ai-summary"], "mutation");
    } catch {
      setHolidayResetState("error");
    }
  }

  async function resetAllHolidays() {
    setHolidayResetState("saving");
    try {
      const now = new Date();
      await resetAllHolidayCacheAction(now.getFullYear(), now.getMonth());
      setHolidayResetState("saved");
      broadcastViewRefresh(["timesheet", "vacations", "ai-summary"], "mutation");
    } catch {
      setHolidayResetState("error");
    }
  }

  async function createUser() {
    setUserCreateState("saving");
    setUserCreateError("");
    try {
      const user = await createUserAction({ email: newUserEmail, password: newUserPassword, role: newUserRole, username: newUserUsername });
      setManagedUsers((current) => [...current, user].sort((left, right) => left.username.localeCompare(right.username, "ko-KR")));
      setNewUserUsername("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("USER");
      setUserCreateState("saved");
    } catch (error) {
      setUserCreateState("error");
      setUserCreateError(error instanceof Error ? error.message : "사용자를 추가하지 못했습니다.");
    }
  }

  return (
    <>
      <button
        aria-label="설정 열기"
        className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
        onClick={openSettings}
        title="설정"
        type="button"
      >
        <Settings aria-hidden="true" className="size-5" strokeWidth={2.4} />
      </button>

      {open ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6" onClick={() => setOpen(false)} role="presentation">
          <div aria-modal="true" className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none" onClick={(event) => event.stopPropagation()} role="dialog">
            <h2 className="text-lg font-bold text-slate-950">설정</h2>
            <div className="mt-4 max-h-[78vh] space-y-5 overflow-y-auto pr-1">
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
                      <Input onChange={(event) => setProfileUsername(event.target.value)} value={profileUsername} />
                    </Field>
                    <Field label="이메일">
                      <Input autoComplete="email" onChange={(event) => setProfileEmail(event.target.value)} placeholder="reminder@example.com" type="email" value={profileEmail} />
                    </Field>
                    <Field label="새 비밀번호">
                      <Input autoComplete="new-password" onChange={(event) => setProfilePassword(event.target.value)} placeholder="변경 시에만 입력" type="password" value={profilePassword} />
                    </Field>
                  </div>
                  {profileState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">계정 정보를 저장했습니다.</p> : null}
                  {profileState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{profileError}</p> : null}
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <form action={logoutAction}>
                      <button className="text-sm font-semibold text-red-600 transition hover:text-red-700" type="submit">
                        로그아웃
                      </button>
                    </form>
                    <Button disabled={profileState === "saving"} onClick={() => void saveProfile()} type="button">
                      {profileState === "saving" ? "저장 중" : "계정 저장"}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">개인 AI 자동 정리</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">내 Gemini API key로 빈 영문 번역본과 짧은 버전을 채웁니다.</p>
                    </div>
                    <Badge tone={aiSetting.apiKeySaved ? "green" : "gray"}>{aiSetting.apiKeySaved ? "개인 key 저장됨" : "개인 key 없음"}</Badge>
                  </div>

                  <div className="mt-4 space-y-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input checked={aiEnabled} className="size-4 accent-slate-950" onChange={(event) => setAiEnabled(event.target.checked)} type="checkbox" />
                      AI 자동 정리 사용
                    </label>

                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-700">AI 정리 방식</p>
                        <button
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-bold transition",
                            aiRewriteRequests.length > 0
                              ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          )}
                          onClick={() => setAiRewriteQueueOpen(true)}
                          type="button"
                        >
                          {aiRewriteRequests.length}개 대기중
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
                              aiCleanupMode === option.value ? "border-slate-950 ring-2 ring-slate-100" : "border-slate-200 hover:border-slate-300"
                            )}
                            key={option.value}
                          >
                            <input checked={aiCleanupMode === option.value} className="sr-only" onChange={() => setAiCleanupMode(option.value as AiCleanupMode)} type="radio" />
                            <span className="block text-sm font-bold text-slate-950">{option.label}</span>
                            <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{option.description}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <Field label="Gemini API key">
                      <Input
                        autoComplete="off"
                        onChange={(event) => {
                          setAiApiKey(event.target.value);
                          if (event.target.value) setAiClearApiKey(false);
                        }}
                        placeholder={aiSetting.apiKeySaved ? "새 key 입력 시 교체" : "Gemini API key"}
                        type="password"
                        value={aiApiKey}
                      />
                    </Field>

                    {aiSetting.apiKeySaved ? (
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input checked={aiClearApiKey} className="size-4 accent-slate-950" disabled={Boolean(aiApiKey)} onChange={(event) => setAiClearApiKey(event.target.checked)} type="checkbox" />
                        저장된 API key 삭제
                      </label>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="모델">
                        <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" onChange={(event) => setAiModel(event.target.value)} value={aiModel}>
                          {aiModelPresets.map((preset) => (
                            <option key={preset.value} value={preset.value}>{preset.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={aiModel === "__custom__" ? "직접 입력 모델명" : "참고할 이전 저장 WORK 날짜"}>
                        {aiModel === "__custom__" ? (
                          <Input onChange={(event) => setAiCustomModel(event.target.value)} placeholder="gemini-..." value={aiCustomModel} />
                        ) : (
                          <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" onChange={(event) => setAiContextDays(Number(event.target.value))} value={aiContextDays}>
                            {[0, 3, 5, 10].map((value) => <option key={value} value={value}>최근 {value}개</option>)}
                          </select>
                        )}
                      </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input checked={aiBackfillMissing} className="size-4 accent-slate-950" onChange={(event) => setAiBackfillMissing(event.target.checked)} type="checkbox" />
                        이전 빈 번역/요약 보정
                      </label>
                      <Field label="한 번에 보정할 이전 날짜">
                        <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" disabled={!aiBackfillMissing} onChange={(event) => setAiBackfillLimit(Number(event.target.value))} value={aiBackfillLimit}>
                          {[1, 3, 5].map((value) => <option key={value} value={value}>{value}일</option>)}
                        </select>
                      </Field>
                    </div>
                  </div>

                  {aiMessage ? <p className={cn("mt-3 text-sm font-semibold", aiState === "error" ? "text-red-600" : "text-emerald-700")}>{aiMessage}</p> : null}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button disabled={aiState === "saving"} onClick={() => void testAiSetting()} type="button" variant="secondary">키 테스트</Button>
                    <Button disabled={aiState === "saving"} onClick={() => void saveAiSetting()} type="button">{aiState === "saving" ? "저장 중" : "AI 설정 저장"}</Button>
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
                      <div className="mt-4">
                        <Field label="공공데이터포털 서비스 키">
                          <Input onChange={(event) => setHolidayApiKey(event.target.value)} placeholder="서비스 키" type="password" value={holidayApiKey} />
                        </Field>
                      </div>
                      {holidayApiKeyMessage ? <p className={cn("mt-3 text-sm font-semibold", holidayApiKeyState === "error" ? "text-red-600" : "text-emerald-700")}>{holidayApiKeyMessage}</p> : null}
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <Button disabled={holidayApiKeyState === "saving"} onClick={() => void testHolidayApiKey()} type="button" variant="secondary">키 테스트</Button>
                        <Button disabled={holidayApiKeyState === "saving"} onClick={() => void saveHolidayApiKey()} type="button">{holidayApiKeyState === "saving" ? "저장 중" : "키 저장"}</Button>
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-sm font-bold text-slate-950">공휴일 캐시</h4>
                      {holidayResetState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">공휴일 정보를 다시 불러왔습니다.</p> : null}
                      {holidayResetState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">공휴일 정보를 다시 불러오지 못했습니다.</p> : null}
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        {isDevelopment ? (
                          <Button disabled={holidayResetState === "saving"} onClick={() => void resetAllHolidays()} type="button" variant="secondary">
                            <Trash2 aria-hidden="true" className="size-4" />
                            모든 API 공휴일 삭제
                          </Button>
                        ) : null}
                        <Button disabled={holidayResetState === "saving"} onClick={() => void resetCurrentMonthHolidays()} type="button" variant="secondary">
                          <RotateCcw aria-hidden="true" className="size-4" />
                          {holidayResetState === "saving" ? "다시 불러오는 중" : "현재 월 공휴일 리셋"}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-sm font-bold text-slate-950">사용자 관리</h4>
                      <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                        {managedUsers.map((user) => (
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
                        <Field label="아이디"><Input onChange={(event) => setNewUserUsername(event.target.value)} value={newUserUsername} /></Field>
                        <Field label="이메일"><Input autoComplete="email" onChange={(event) => setNewUserEmail(event.target.value)} placeholder="reminder@example.com" type="email" value={newUserEmail} /></Field>
                        <Field label="비밀번호"><Input autoComplete="new-password" onChange={(event) => setNewUserPassword(event.target.value)} type="password" value={newUserPassword} /></Field>
                        <Field label="권한">
                          <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" onChange={(event) => setNewUserRole(event.target.value === "ADMIN" ? "ADMIN" : "USER")} value={newUserRole}>
                            <option value="USER">일반</option>
                            <option value="ADMIN">관리자</option>
                          </select>
                        </Field>
                      </div>
                      {userCreateState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">사용자를 추가했습니다.</p> : null}
                      {userCreateState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{userCreateError}</p> : null}
                      <div className="mt-4 flex justify-end">
                        <Button disabled={userCreateState === "saving"} onClick={() => void createUser()} type="button">
                          <Plus aria-hidden="true" className="size-4" />
                          {userCreateState === "saving" ? "추가 중" : "사용자 추가"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button onClick={() => setOpen(false)} type="button" variant="secondary">닫기</Button>
              </div>
            </div>
          </div>
          {aiRewriteQueueOpen ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/35 px-4 py-6"
              onClick={(event) => {
                event.stopPropagation();
                setAiRewriteQueueOpen(false);
              }}
              role="presentation"
            >
              <div aria-modal="true" className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none" onClick={(event) => event.stopPropagation()} role="dialog">
                <h2 className="text-lg font-bold text-slate-950">AI 예약 정리 대기 목록</h2>
                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium leading-6 text-slate-600">
                    {aiCleanupMode === "scheduled"
                      ? "아래 날짜는 n8n 예약 정리 때 빈 AI 필드를 채우거나, 덮어쓰기 예약이 있으면 기존 값을 다시 작성합니다."
                      : "대기 목록은 보존되어 있지만, AI 정리 방식이 예약이 아니면 n8n 예약 정리에서 처리되지 않습니다."}
                  </div>
                  {aiRewriteRequests.length > 0 ? (
                    <div className="max-h-[420px] overflow-y-auto rounded-md border border-slate-200">
                      {aiRewriteRequests.map((request) => (
                        <div className="border-b border-slate-100 px-3 py-3 last:border-b-0" key={request.dateKey}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-slate-950">{formatKoreanDate(request.dateKey)}</p>
                              <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                                WORK {request.entryCount}개 · {request.cleanupType === "rewrite" ? "기존 AI 필드 덮어쓰기 예약" : "빈 AI 필드 채우기 대기"}
                              </p>
                            </div>
                            <Badge tone={aiCleanupMode === "scheduled" ? request.cleanupType === "rewrite" ? "orange" : "blue" : "gray"}>
                              {aiCleanupMode === "scheduled" ? request.cleanupType === "rewrite" ? "덮어쓰기" : "채우기" : "보류"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {request.shortVersion.trim() || truncateContent(request.previewContent) || "(내용 없음)"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-sm font-semibold text-slate-500">
                      대기중인 AI 예약 정리가 없습니다.
                    </div>
                  )}
                  <div className="flex justify-end border-t border-slate-100 pt-4">
                    <Button onClick={() => setAiRewriteQueueOpen(false)} type="button">확인</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}
    </>
  );
}
