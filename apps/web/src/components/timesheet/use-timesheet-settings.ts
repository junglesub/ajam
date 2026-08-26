"use client";

import { useEffect, useState } from "react";

import { getMonthLabel } from "@timesheet/domain";
import { broadcastViewRefresh } from "@/lib/view-refresh";
import type { SettingsModalProps } from "./timesheet-settings-modal";
import type { TimesheetMonthData } from "./timesheet-draft-utils";

export type UserRole = "ADMIN" | "USER";
export type AiCleanupMode = "immediate" | "manual" | "scheduled";

export type ManagedUser = {
  email: string;
  id: string;
  role: UserRole;
  username: string;
};

export type HolidayApiKeyTestResult = {
  holidays: Array<{ dateKey: string; name: string }>;
  ok: boolean;
};

export type UserAiSetting = {
  apiKeySaved: boolean;
  backfillLimit: number;
  backfillMissing: boolean;
  contextDays: number;
  cleanupMode: AiCleanupMode;
  enabled: boolean;
  model: string;
  provider: "GEMINI";
};

export type UserAiSettingUpdate = {
  apiKey?: string;
  backfillLimit: number;
  backfillMissing: boolean;
  clearApiKey?: boolean;
  contextDays: number;
  cleanupMode: AiCleanupMode;
  enabled: boolean;
  model: string;
};

export type GeminiApiKeyTestResult = {
  ok: boolean;
};

type SettingsSaveState = "idle" | "saving" | "saved" | "error";
type HolidayResetState = "idle" | "saving" | "saved" | "error";

const aiModelPresets = [
  { label: "빠름/저렴 - gemini-3.1-flash-lite", value: "gemini-3.1-flash-lite" },
  { label: "균형 - gemini-3.5-flash", value: "gemini-3.5-flash" },
  { label: "안정 대안 - gemini-2.5-flash", value: "gemini-2.5-flash" },
  { label: "품질 우선 - gemini-2.5-pro", value: "gemini-2.5-pro" },
  { label: "직접 입력", value: "__custom__" }
];

export type UseTimesheetSettingsInput = {
  createUserAction: (params: { email?: string; password: string; role: UserRole; username: string }) => Promise<ManagedUser>;
  currentUser: ManagedUser;
  currentMonth: { monthIndex: number; year: number };
  initialAiSetting: UserAiSetting;
  initialHolidayApiKey: string;
  initialManagedUsers: ManagedUser[];
  onHolidayCacheReset: (scope: "all" | "currentMonth", monthData: TimesheetMonthData) => void;
  onOpenRewriteQueue: () => void;
  onProfileUpdated: (user: ManagedUser) => void;
  refreshRewriteQueue: () => void | Promise<void>;
  resetAllHolidayCacheAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  resetCurrentMonthHolidayCacheAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  rewriteQueueCount: number;
  saveHolidayApiKeyAction: (serviceKey: string) => Promise<void>;
  testGeminiApiKeyAction: (params: { apiKey?: string; model: string }) => Promise<GeminiApiKeyTestResult>;
  testHolidayApiKeyAction: (serviceKey: string, year: number, monthIndex: number) => Promise<HolidayApiKeyTestResult>;
  updateAiSettingAction: (input: UserAiSettingUpdate) => Promise<UserAiSetting>;
  updateProfileAction: (params: { email?: string; password?: string; username: string }) => Promise<ManagedUser>;
};

export function useTimesheetSettings({
  createUserAction,
  currentUser,
  currentMonth,
  initialAiSetting,
  initialHolidayApiKey,
  initialManagedUsers,
  onHolidayCacheReset,
  onOpenRewriteQueue,
  onProfileUpdated,
  refreshRewriteQueue,
  resetAllHolidayCacheAction,
  resetCurrentMonthHolidayCacheAction,
  rewriteQueueCount,
  saveHolidayApiKeyAction,
  testGeminiApiKeyAction,
  testHolidayApiKeyAction,
  updateAiSettingAction,
  updateProfileAction
}: UseTimesheetSettingsInput) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState(currentUser.username);
  const [profileEmail, setProfileEmail] = useState(currentUser.email);
  const [profilePassword, setProfilePassword] = useState("");
  const [profileState, setProfileState] = useState<SettingsSaveState>("idle");
  const [profileError, setProfileError] = useState("");
  const [holidayApiKey, setHolidayApiKey] = useState(initialHolidayApiKey);
  const [holidayApiKeyState, setHolidayApiKeyState] = useState<SettingsSaveState>("idle");
  const [holidayApiKeyError, setHolidayApiKeyError] = useState("");
  const [holidayApiKeyTestState, setHolidayApiKeyTestState] = useState<SettingsSaveState>("idle");
  const [holidayApiKeyTestMessage, setHolidayApiKeyTestMessage] = useState("");
  const [aiSetting, setAiSetting] = useState(initialAiSetting);
  const [aiEnabled, setAiEnabled] = useState(initialAiSetting.enabled);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiClearApiKey, setAiClearApiKey] = useState(false);
  const [aiModel, setAiModel] = useState(initialAiSetting.model);
  const [aiCustomModel, setAiCustomModel] = useState(aiModelPresets.some((preset) => preset.value === initialAiSetting.model) ? "" : initialAiSetting.model);
  const [aiContextDays, setAiContextDays] = useState(initialAiSetting.contextDays);
  const [aiBackfillMissing, setAiBackfillMissing] = useState(initialAiSetting.backfillMissing);
  const [aiBackfillLimit, setAiBackfillLimit] = useState(initialAiSetting.backfillLimit);
  const [aiCleanupMode, setAiCleanupMode] = useState<AiCleanupMode>(initialAiSetting.cleanupMode);
  const [aiSettingState, setAiSettingState] = useState<SettingsSaveState>("idle");
  const [aiSettingMessage, setAiSettingMessage] = useState("");
  const [aiTestState, setAiTestState] = useState<SettingsSaveState>("idle");
  const [aiTestMessage, setAiTestMessage] = useState("");
  const [holidayResetState, setHolidayResetState] = useState<HolidayResetState>("idle");
  const [holidayResetError, setHolidayResetError] = useState("");
  const [managedUsers, setManagedUsers] = useState(initialManagedUsers);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("USER");
  const [userCreateState, setUserCreateState] = useState<SettingsSaveState>("idle");
  const [userCreateError, setUserCreateError] = useState("");

  const isAdmin = currentUser.role === "ADMIN";
  const isDevelopment = process.env.NODE_ENV === "development";

  function getSelectedAiModel(): string {
    return aiModel === "__custom__" ? aiCustomModel.trim() || "gemini-3.1-flash-lite" : aiModel;
  }

  function openSettings() {
    setProfileUsername(currentUser.username);
    setProfileEmail(currentUser.email);
    setProfilePassword("");
    setProfileState("idle");
    setProfileError("");
    setHolidayApiKeyState("idle");
    setHolidayApiKeyError("");
    setHolidayApiKeyTestState("idle");
    setHolidayApiKeyTestMessage("");
    setAiEnabled(aiSetting.enabled);
    setAiApiKey("");
    setAiClearApiKey(false);
    setAiModel(aiModelPresets.some((preset) => preset.value === aiSetting.model) ? aiSetting.model : "__custom__");
    setAiCustomModel(aiModelPresets.some((preset) => preset.value === aiSetting.model) ? "" : aiSetting.model);
    setAiContextDays(aiSetting.contextDays);
    setAiBackfillMissing(aiSetting.backfillMissing);
    setAiBackfillLimit(aiSetting.backfillLimit);
    setAiCleanupMode(aiSetting.cleanupMode);
    setAiSettingState("idle");
    setAiSettingMessage("");
    setAiTestState("idle");
    setAiTestMessage("");
    void refreshRewriteQueue();
    setHolidayResetState("idle");
    setHolidayResetError("");
    setUserCreateState("idle");
    setUserCreateError("");
    setIsSettingsOpen(true);
  }

  async function saveProfile() {
    setProfileState("saving");
    setProfileError("");

    try {
      const updatedUser = await updateProfileAction({
        email: profileEmail,
        password: profilePassword || undefined,
        username: profileUsername
      });

      onProfileUpdated(updatedUser);
      setProfilePassword("");
      setManagedUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
      setProfileState("saved");
    } catch (error) {
      setProfileState("error");
      setProfileError(error instanceof Error ? error.message : "계정 정보를 저장하지 못했습니다.");
    }
  }

  async function saveHolidayApiKey() {
    setHolidayApiKeyState("saving");
    setHolidayApiKeyError("");

    try {
      await saveHolidayApiKeyAction(holidayApiKey);
      setHolidayApiKeyState("saved");
    } catch (error) {
      setHolidayApiKeyState("error");
      setHolidayApiKeyError(error instanceof Error ? error.message : "API 키를 저장하지 못했습니다.");
    }
  }

  async function testHolidayApiKey() {
    setHolidayApiKeyTestState("saving");
    setHolidayApiKeyTestMessage("");

    try {
      const result = await testHolidayApiKeyAction(holidayApiKey, currentMonth.year, currentMonth.monthIndex);
      const label = getMonthLabel(currentMonth.year, currentMonth.monthIndex);
      setHolidayApiKeyTestState("saved");
      setHolidayApiKeyTestMessage(result.holidays.length > 0 ? label + " 공휴일 " + result.holidays.length + "건 확인됨" : label + " 응답은 정상이며 공휴일은 없습니다.");
    } catch (error) {
      setHolidayApiKeyTestState("error");
      setHolidayApiKeyTestMessage(error instanceof Error ? error.message : "API 키 테스트에 실패했습니다.");
    }
  }

  async function saveAiSetting() {
    setAiSettingState("saving");
    setAiSettingMessage("");

    try {
      const updated = await updateAiSettingAction({
        apiKey: aiApiKey || undefined,
        backfillLimit: aiBackfillLimit,
        backfillMissing: aiBackfillMissing,
        clearApiKey: aiClearApiKey,
        contextDays: aiContextDays,
        cleanupMode: aiCleanupMode,
        enabled: aiEnabled,
        model: getSelectedAiModel()
      });

      setAiSetting(updated);
      setAiApiKey("");
      setAiClearApiKey(false);
      setAiSettingState("saved");
      setAiSettingMessage("AI 자동 정리 설정을 저장했습니다.");
    } catch (error) {
      setAiSettingState("error");
      setAiSettingMessage(error instanceof Error ? error.message : "AI 설정을 저장하지 못했습니다.");
    }
  }

  async function testAiSetting() {
    setAiTestState("saving");
    setAiTestMessage("");

    try {
      await testGeminiApiKeyAction({ apiKey: aiApiKey || undefined, model: getSelectedAiModel() });
      setAiTestState("saved");
      setAiTestMessage("Gemini API key를 확인했습니다.");
    } catch (error) {
      setAiTestState("error");
      setAiTestMessage(error instanceof Error ? error.message : "Gemini API key 테스트에 실패했습니다.");
    }
  }

  async function createUser() {
    setUserCreateState("saving");
    setUserCreateError("");

    try {
      const user = await createUserAction({
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        username: newUserUsername
      });

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

  async function resetCurrentMonthHolidays() {
    if (!isAdmin) {
      return;
    }

    setHolidayResetState("saving");
    setHolidayResetError("");

    try {
      const monthData = await resetCurrentMonthHolidayCacheAction(currentMonth.year, currentMonth.monthIndex);

      onHolidayCacheReset("currentMonth", monthData);
      setHolidayResetState("saved");
      broadcastViewRefresh(["timesheet", "vacations", "ai-summary"], "mutation");
    } catch {
      setHolidayResetState("error");
      setHolidayResetError("공휴일 정보를 다시 불러오지 못했습니다.");
    }
  }

  async function resetAllHolidays() {
    if (!isAdmin || !isDevelopment) {
      return;
    }

    setHolidayResetState("saving");
    setHolidayResetError("");

    try {
      const monthData = await resetAllHolidayCacheAction(currentMonth.year, currentMonth.monthIndex);

      onHolidayCacheReset("all", monthData);
      setHolidayResetState("saved");
      broadcastViewRefresh(["timesheet", "vacations", "ai-summary"], "mutation");
    } catch (error) {
      setHolidayResetState("error");
      setHolidayResetError(error instanceof Error ? error.message : "공휴일 정보를 삭제하지 못했습니다.");
    }
  }

  useEffect(() => {
    function openTimesheetSettings(event: Event) {
      event.preventDefault();
      openSettings();
    }

    window.addEventListener("ajam:open-settings", openTimesheetSettings);
    return () => window.removeEventListener("ajam:open-settings", openTimesheetSettings);
  });

  const modalProps: SettingsModalProps = {
    ai: {
      apiKey: aiApiKey,
      backfillLimit: aiBackfillLimit,
      backfillMissing: aiBackfillMissing,
      cleanupMode: aiCleanupMode,
      clearApiKey: aiClearApiKey,
      contextDays: aiContextDays,
      customModel: aiCustomModel,
      enabled: aiEnabled,
      keySaved: aiSetting.apiKeySaved,
      model: aiModel,
      modelPresets: aiModelPresets,
      onApiKeyChange: (value) => { setAiApiKey(value); if (value) { setAiClearApiKey(false); } },
      onBackfillLimitChange: setAiBackfillLimit,
      onBackfillMissingChange: setAiBackfillMissing,
      onCleanupModeChange: setAiCleanupMode,
      onClearApiKeyChange: setAiClearApiKey,
      onContextDaysChange: setAiContextDays,
      onCustomModelChange: setAiCustomModel,
      onEnabledChange: setAiEnabled,
      onModelChange: setAiModel,
      onOpenRewriteQueue,
      onSave: () => void saveAiSetting(),
      onTest: () => void testAiSetting(),
      rewriteQueueCount,
      saveMessage: aiSettingMessage,
      saveState: aiSettingState,
      testMessage: aiTestMessage,
      testState: aiTestState
    },
    holidayApi: {
      apiKey: holidayApiKey,
      onApiKeyChange: setHolidayApiKey,
      onSave: () => void saveHolidayApiKey(),
      onTest: () => void testHolidayApiKey(),
      saveError: holidayApiKeyError,
      saveState: holidayApiKeyState,
      testMessage: holidayApiKeyTestMessage,
      testState: holidayApiKeyTestState
    },
    holidayCache: {
      error: holidayResetError,
      onResetAll: () => void resetAllHolidays(),
      onResetCurrentMonth: () => void resetCurrentMonthHolidays(),
      state: holidayResetState
    },
    isAdmin,
    isDevelopment,
    onClose: () => setIsSettingsOpen(false),
    profile: {
      email: profileEmail,
      error: profileError,
      onEmailChange: setProfileEmail,
      onPasswordChange: setProfilePassword,
      onSave: () => void saveProfile(),
      onUsernameChange: setProfileUsername,
      password: profilePassword,
      state: profileState,
      username: profileUsername
    },
    users: {
      createError: userCreateError,
      createState: userCreateState,
      existingUsers: managedUsers,
      newEmail: newUserEmail,
      newPassword: newUserPassword,
      newRole: newUserRole,
      newUsername: newUserUsername,
      onCreate: () => void createUser(),
      onNewEmailChange: setNewUserEmail,
      onNewPasswordChange: setNewUserPassword,
      onNewRoleChange: setNewUserRole,
      onNewUsernameChange: setNewUserUsername
    }
  };

  return {
    aiSetting,
    isOpen: isSettingsOpen,
    modalProps,
    rewriteQueueCleanupMode: aiCleanupMode
  };
}




