"use client";

import { useEffect, useMemo, useState, useTransition, type ChangeEvent, type ReactNode } from "react";

import {
  createEmptyDraft,
  formatKoreanDate,
  getBusinessCalendarWeeks,
  getBusinessDateKeysUntil,
  getDisplayContent,
  getMonthLabel,
  resolveStatus,
  statusLabel,
  toBrowserDateKey,
  type TimesheetDraft,
  type TimesheetRow,
  type TimesheetStatus,
  type WorkRecordKind
} from "@timesheet/domain";
import { Badge, Button, Input, Label, SegmentedControl, Textarea, cn } from "@timesheet/ui";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Plus,
  LogOut,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  TimerReset,
  type LucideIcon
} from "lucide-react";

type ViewMode = "calendar" | "list";

type UserRole = "ADMIN" | "USER";

type ManagedUser = {
  id: string;
  role: UserRole;
  username: string;
};

type TimesheetMonthData = {
  entries: TimesheetDraft[];
  holidays: Array<{ dateKey: string; name: string }>;
  projects: string[];
  vacations: Array<{ dateKey: string; hours: number; name: string }>;
};

type HolidayApiKeyTestResult = {
  holidays: Array<{ dateKey: string; name: string }>;
  ok: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type ProjectAddState = "idle" | "saving" | "error";
type SettingsSaveState = "idle" | "saving" | "saved" | "error";
type HolidayResetState = "idle" | "saving" | "saved" | "error";
type PendingNavigation =
  | { kind: "date"; dateKey: string }
  | { delta: number; kind: "month" }
  | { kind: "today" };

type TimesheetWorkspaceProps = {
  addProjectAction: (name: string) => Promise<string>;
  createUserAction: (params: { password: string; role: UserRole; username: string }) => Promise<ManagedUser>;
  currentUser: ManagedUser;
  initialHolidayApiKey: string;
  initialManagedUsers: ManagedUser[];
  initialMonthData: TimesheetMonthData;
  loadMonthAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  logoutAction: () => Promise<void>;
  resetHolidayCacheAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  saveEntryAction: (entry: TimesheetDraft) => Promise<TimesheetDraft>;
  saveHolidayApiKeyAction: (serviceKey: string) => Promise<void>;
  testHolidayApiKeyAction: (serviceKey: string, year: number, monthIndex: number) => Promise<HolidayApiKeyTestResult>;
  updateProfileAction: (params: { password?: string; username: string }) => Promise<ManagedUser>;
};

const weekdays = ["월", "화", "수", "목", "금"];

const badgeToneByStatus: Record<TimesheetStatus, "blue" | "gray" | "green" | "orange" | "white"> = {
  COMPLETED: "green",
  FUTURE: "gray",
  HOLIDAY: "orange",
  MISSING: "white",
  VACATION: "blue"
};

const cellToneByStatus: Record<TimesheetStatus, string> = {
  COMPLETED: "border-emerald-200 bg-white hover:border-emerald-300",
  FUTURE: "border-slate-200 bg-slate-100 text-slate-400",
  HOLIDAY: "border-orange-200 bg-orange-50/80 hover:border-orange-300",
  MISSING: "border-slate-200 bg-white hover:border-slate-300",
  VACATION: "border-blue-200 bg-blue-50/80 hover:border-blue-300"
};

const newProjectOptionValue = "__new_project__";

const kindOptions: Array<{ label: string; value: WorkRecordKind }> = [
  { label: "업무", value: "WORK" },
  { label: "휴가", value: "VACATION" },
  { label: "공휴일", value: "HOLIDAY" }
];

function truncateContent(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 42) {
    return trimmed;
  }

  return `${trimmed.slice(0, 42)}...`;
}

function buildDraftsFromMonthData(monthData: TimesheetMonthData): Record<string, TimesheetDraft> {
  const drafts: Record<string, TimesheetDraft> = {};

  for (const holiday of monthData.holidays) {
    drafts[holiday.dateKey] = {
      ...createEmptyDraft(holiday.dateKey),
      content: holiday.name,
      holidayName: holiday.name,
      hours: 0,
      kind: "HOLIDAY"
    };
  }

  for (const vacation of monthData.vacations) {
    drafts[vacation.dateKey] = {
      ...createEmptyDraft(vacation.dateKey),
      content: vacation.name,
      hours: vacation.hours,
      kind: "VACATION",
      vacationName: vacation.name
    };
  }

  for (const entry of monthData.entries) {
    drafts[entry.dateKey] = entry;
  }

  return drafts;
}

function getMonthCacheKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function mergeProjects(current: string[], projects: string[]): string[] {
  const next = new Set(current);

  for (const project of projects) {
    const name = project.trim();

    if (name) {
      next.add(name);
    }
  }

  return Array.from(next).sort((left, right) => left.localeCompare(right, "ko-KR"));
}

function findPreviousProject(dateKey: string, records: Record<string, TimesheetDraft>): string {
  const previousRecord = Object.values(records)
    .filter((record) => record.dateKey < dateKey && record.kind === "WORK" && record.project.trim())
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))[0];

  return previousRecord?.project ?? "";
}

function createDraftForDate(dateKey: string, records: Record<string, TimesheetDraft>): TimesheetDraft {
  return {
    ...createEmptyDraft(dateKey),
    project: findPreviousProject(dateKey, records)
  };
}

function rowFromDraft(dateKey: string, todayKey: string, draft: TimesheetDraft | undefined): TimesheetRow {
  const row = draft ?? createEmptyDraft(dateKey);
  const hasContent = Boolean(row.content.trim() || row.shortVersion.trim() || row.project.trim());

  return {
    ...row,
    status: resolveStatus({
      dateKey,
      hasContent,
      kind: row.kind,
      todayKey
    })
  };
}

function statusText(row: TimesheetRow): string {
  if (row.status === "MISSING") {
    return "미기입";
  }

  return truncateContent(getDisplayContent(row)) || "작성 예정";
}

export function TimesheetWorkspace({
  addProjectAction,
  createUserAction,
  currentUser: initialCurrentUser,
  initialHolidayApiKey,
  initialManagedUsers,
  initialMonthData,
  loadMonthAction,
  logoutAction,
  resetHolidayCacheAction,
  saveEntryAction,
  saveHolidayApiKeyAction,
  testHolidayApiKeyAction,
  updateProfileAction
}: TimesheetWorkspaceProps) {
  const [todayKey] = useState(() => toBrowserDateKey(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date();

    return {
      monthIndex: today.getMonth(),
      year: today.getFullYear()
    };
  });
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);
  const [records, setRecords] = useState<Record<string, TimesheetDraft>>(() => buildDraftsFromMonthData(initialMonthData));
  const [savedRecords, setSavedRecords] = useState<Record<string, TimesheetDraft>>(() => buildDraftsFromMonthData(initialMonthData));
  const [projects, setProjects] = useState(() => mergeProjects([], initialMonthData.projects));
  const [loadedMonthKeys, setLoadedMonthKeys] = useState(() => {
    const today = new Date();

    return new Set([getMonthCacheKey(today.getFullYear(), today.getMonth())]);
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectAddState, setProjectAddState] = useState<ProjectAddState>("idle");
  const [projectAddError, setProjectAddError] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState(initialCurrentUser.username);
  const [profilePassword, setProfilePassword] = useState("");
  const [profileState, setProfileState] = useState<SettingsSaveState>("idle");
  const [profileError, setProfileError] = useState("");
  const [holidayApiKey, setHolidayApiKey] = useState(initialHolidayApiKey);
  const [holidayApiKeyState, setHolidayApiKeyState] = useState<SettingsSaveState>("idle");
  const [holidayApiKeyError, setHolidayApiKeyError] = useState("");
  const [holidayApiKeyTestState, setHolidayApiKeyTestState] = useState<SettingsSaveState>("idle");
  const [holidayApiKeyTestMessage, setHolidayApiKeyTestMessage] = useState("");
  const [holidayResetState, setHolidayResetState] = useState<HolidayResetState>("idle");
  const [holidayResetError, setHolidayResetError] = useState("");
  const [managedUsers, setManagedUsers] = useState(initialManagedUsers);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("USER");
  const [userCreateState, setUserCreateState] = useState<SettingsSaveState>("idle");
  const [userCreateError, setUserCreateError] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [isMonthPending, startMonthTransition] = useTransition();

  const calendarWeeks = useMemo(
    () => getBusinessCalendarWeeks(monthCursor.year, monthCursor.monthIndex),
    [monthCursor.monthIndex, monthCursor.year]
  );
  const listDateKeys = useMemo(
    () => getBusinessDateKeysUntil(monthCursor.year, monthCursor.monthIndex, todayKey).toReversed(),
    [monthCursor.monthIndex, monthCursor.year, todayKey]
  );
  const rows = useMemo(() => {
    const entries: Record<string, TimesheetRow> = {};

    for (const week of calendarWeeks) {
      for (const cell of week) {
        if (cell) {
          entries[cell.dateKey] = rowFromDraft(cell.dateKey, todayKey, records[cell.dateKey]);
        }
      }
    }

    for (const dateKey of listDateKeys) {
      entries[dateKey] = rowFromDraft(dateKey, todayKey, records[dateKey]);
    }

    entries[selectedDateKey] = rowFromDraft(selectedDateKey, todayKey, records[selectedDateKey]);

    return entries;
  }, [calendarWeeks, listDateKeys, records, selectedDateKey, todayKey]);
  const selectedRow = rows[selectedDateKey] ?? rowFromDraft(selectedDateKey, todayKey, records[selectedDateKey]);

  const monthRows = Object.values(rows).filter((row) => row.dateKey.startsWith(`${monthCursor.year}-${String(monthCursor.monthIndex + 1).padStart(2, "0")}`));
  const completedCount = monthRows.filter((row) => row.status === "COMPLETED").length;
  const missingCount = monthRows.filter((row) => row.status === "MISSING").length;
  const dayOffCount = monthRows.filter((row) => row.status === "HOLIDAY" || row.status === "VACATION").length;
  const isViewingToday = selectedDateKey === todayKey;
  const isFuture = selectedRow.status === "FUTURE";
  const isAdmin = currentUser.role === "ADMIN";

  useEffect(() => {
    const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);

    if (loadedMonthKeys.has(monthKey)) {
      return;
    }

    startMonthTransition(async () => {
      const monthData = await loadMonthAction(monthCursor.year, monthCursor.monthIndex);

      const monthDrafts = buildDraftsFromMonthData(monthData);

      setRecords((current) => ({
        ...current,
        ...monthDrafts
      }));
      setSavedRecords((current) => ({
        ...current,
        ...monthDrafts
      }));
      setProjects((current) => mergeProjects(current, monthData.projects));
      setLoadedMonthKeys((current) => new Set(current).add(monthKey));
    });
  }, [loadMonthAction, loadedMonthKeys, monthCursor.monthIndex, monthCursor.year]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  function discardSelectedDraft() {
    setRecords((current) => {
      const next = { ...current };
      const saved = savedRecords[selectedDateKey];

      if (saved) {
        next[selectedDateKey] = { ...saved };
      } else {
        delete next[selectedDateKey];
      }

      return next;
    });
    setIsDirty(false);
    setSaveState("idle");
    setSaveError("");
  }

  function prepareDraftForDate(dateKey: string) {
    if (records[dateKey]) {
      return;
    }

    const draft = createDraftForDate(dateKey, records);

    if (!draft.project) {
      return;
    }

    setRecords((current) => {
      if (current[dateKey]) {
        return current;
      }

      return {
        ...current,
        [dateKey]: draft
      };
    });
    setIsDirty(true);
    setSaveState("idle");
    setSaveError("");
  }

  function runNavigation(navigation: PendingNavigation) {
    if (navigation.kind === "date") {
      prepareDraftForDate(navigation.dateKey);
      setSelectedDateKey(navigation.dateKey);
      setSaveState("idle");
      setSaveError("");
      return;
    }

    if (navigation.kind === "today") {
      const today = new Date();

      setSelectedDateKey(todayKey);
      prepareDraftForDate(todayKey);
      setMonthCursor({
        monthIndex: today.getMonth(),
        year: today.getFullYear()
      });
      setSaveState("idle");
      setSaveError("");
      return;
    }

    setMonthCursor((current) => {
      const next = new Date(current.year, current.monthIndex + navigation.delta, 1);

      return {
        monthIndex: next.getMonth(),
        year: next.getFullYear()
      };
    });
  }

  function requestNavigation(navigation: PendingNavigation) {
    if (isDirty) {
      setPendingNavigation(navigation);
      return;
    }

    runNavigation(navigation);
  }

  function confirmPendingNavigation() {
    if (!pendingNavigation) {
      return;
    }

    const navigation = pendingNavigation;

    discardSelectedDraft();
    setPendingNavigation(null);
    runNavigation(navigation);
  }

  function selectDate(dateKey: string) {
    requestNavigation({ dateKey, kind: "date" });
  }

  function moveMonth(delta: number) {
    requestNavigation({ delta, kind: "month" });
  }

  function goToday() {
    requestNavigation({ kind: "today" });
  }

  function updateSelectedDraft(patch: Partial<TimesheetDraft>) {
    setSaveState("idle");
    setSaveError("");
    setIsDirty(true);
    setRecords((current) => {
      const previous = current[selectedDateKey] ?? createDraftForDate(selectedDateKey, current);
      const next = {
        ...previous,
        ...patch
      };

      return {
        ...current,
        [selectedDateKey]: next
      };
    });
  }

  function updateKind(kind: WorkRecordKind) {
    updateSelectedDraft({
      hours: kind === "WORK" ? 8 : 0,
      kind
    });
  }

  function updateProject(event: ChangeEvent<HTMLSelectElement>) {
    if (event.target.value === newProjectOptionValue) {
      setNewProjectName("");
      setProjectAddState("idle");
      setProjectAddError("");
      setIsProjectModalOpen(true);
      return;
    }

    updateSelectedDraft({ project: event.target.value });
  }

  function closeProjectModal() {
    if (projectAddState === "saving") {
      return;
    }

    setIsProjectModalOpen(false);
    setNewProjectName("");
    setProjectAddState("idle");
    setProjectAddError("");
  }

  async function addProject() {
    const name = newProjectName.trim();

    if (!name) {
      setProjectAddState("error");
      setProjectAddError("프로젝트명을 입력해 주세요.");
      return;
    }

    setProjectAddState("saving");
    setProjectAddError("");

    try {
      const savedProject = await addProjectAction(name);

      setProjects((current) => mergeProjects(current, [savedProject]));
      setNewProjectName("");
      setProjectAddState("idle");
      setIsProjectModalOpen(false);
      updateSelectedDraft({ project: savedProject });
    } catch {
      setProjectAddState("error");
      setProjectAddError("프로젝트를 추가하지 못했습니다.");
    }
  }

  async function saveSelectedDraft() {
    const { status: _status, ...entry } = selectedRow;

    setSaveState("saving");
    setSaveError("");

    try {
      const savedEntry = await saveEntryAction(entry);

      setRecords((current) => ({
        ...current,
        [savedEntry.dateKey]: savedEntry
      }));
      setSavedRecords((current) => ({
        ...current,
        [savedEntry.dateKey]: savedEntry
      }));
      setIsDirty(false);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setSaveError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function openSettings() {
    setProfileUsername(currentUser.username);
    setProfilePassword("");
    setProfileState("idle");
    setProfileError("");
    setHolidayApiKeyState("idle");
    setHolidayApiKeyError("");
    setHolidayApiKeyTestState("idle");
    setHolidayApiKeyTestMessage("");
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
        password: profilePassword || undefined,
        username: profileUsername
      });

      setCurrentUser(updatedUser);
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
      const result = await testHolidayApiKeyAction(holidayApiKey, monthCursor.year, monthCursor.monthIndex);
      const label = getMonthLabel(monthCursor.year, monthCursor.monthIndex);
      setHolidayApiKeyTestState("saved");
      setHolidayApiKeyTestMessage(result.holidays.length > 0 ? label + " 공휴일 " + result.holidays.length + "건 확인됨" : label + " 응답은 정상이며 공휴일은 없습니다.");
    } catch (error) {
      setHolidayApiKeyTestState("error");
      setHolidayApiKeyTestMessage(error instanceof Error ? error.message : "API 키 테스트에 실패했습니다.");
    }
  }

  async function createUser() {
    setUserCreateState("saving");
    setUserCreateError("");

    try {
      const user = await createUserAction({
        password: newUserPassword,
        role: newUserRole,
        username: newUserUsername
      });

      setManagedUsers((current) => [...current, user].sort((left, right) => left.username.localeCompare(right.username, "ko-KR")));
      setNewUserUsername("");
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
      const monthData = await resetHolidayCacheAction(monthCursor.year, monthCursor.monthIndex);
      const monthKey = getMonthCacheKey(monthCursor.year, monthCursor.monthIndex);
      const monthDrafts = buildDraftsFromMonthData(monthData);
      const mergeResetMonth = (current: Record<string, TimesheetDraft>) => {
        const next = { ...current };

        for (const [dateKey, draft] of Object.entries(next)) {
          if (dateKey.startsWith(monthKey + "-") && draft.kind === "HOLIDAY") {
            delete next[dateKey];
          }
        }

        return {
          ...next,
          ...monthDrafts
        };
      };

      setRecords(mergeResetMonth);
      setSavedRecords(mergeResetMonth);
      setProjects((current) => mergeProjects(current, monthData.projects));
      setLoadedMonthKeys((current) => new Set(current).add(monthKey));
      setHolidayResetState("saved");
    } catch {
      setHolidayResetState("error");
      setHolidayResetError("공휴일 정보를 다시 불러오지 못했습니다.");
    }
  }

  return (
    <main className="bg-slate-100">
      <header className="border-b border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
              <CalendarDays aria-hidden="true" className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">aJam</p>
              <h1 className="text-xl font-bold text-slate-950">월간 업무 기록</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:block">
              <span className="font-semibold text-slate-950">{currentUser.username}</span> 계정
            </div>
            <Button className="h-9 px-3" onClick={openSettings} variant="secondary">
              <Settings aria-hidden="true" className="size-4" />
              설정
            </Button>
            <form action={logoutAction}>
              <Button className="h-9 px-3" type="submit" variant="secondary">
                <LogOut aria-hidden="true" className="size-4" />
                로그아웃
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-0 pt-4 lg:grid-cols-[minmax(680px,1fr)_420px] xl:grid-cols-[minmax(760px,1fr)_460px]">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button className="h-11 w-11 shrink-0 p-0" onClick={() => moveMonth(-1)} variant="ghost">
                <ChevronLeft aria-hidden="true" className="h-10 w-10 stroke-3" />
                <span className="sr-only">이전 달</span>
              </Button>
              <div className="min-w-44 text-center">
                <h2 className="text-lg font-bold text-slate-950">{getMonthLabel(monthCursor.year, monthCursor.monthIndex)}</h2>
                {isMonthPending ? <p className="text-xs font-semibold text-slate-400">불러오는 중</p> : null}
              </div>
              <Button className="h-11 w-11 shrink-0 p-0" onClick={() => moveMonth(1)} variant="ghost">
                <ChevronRight aria-hidden="true" className="h-10 w-10 stroke-3" />
                <span className="sr-only">다음 달</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-9 px-3" onClick={goToday} variant="secondary">
                <TimerReset aria-hidden="true" className="size-4" />
                오늘
              </Button>
              <SegmentedControl
                items={[
                  { icon: <CalendarDays aria-hidden="true" className="size-4" />, label: "캘린더", value: "calendar" },
                  { icon: <ListChecks aria-hidden="true" className="size-4" />, label: "리스트", value: "list" }
                ]}
                onChange={setViewMode}
                value={viewMode}
              />
            </div>
          </div>

          <div className="grid border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-4">
            <Metric icon={CalendarDays} label="업무일" value={`${listDateKeys.length + calendarWeeks.flat().filter((cell) => cell && cell.dateKey > todayKey).length}일`} />
            <Metric icon={Sparkles} label="입력완료" value={`${completedCount}일`} />
            <Metric icon={Search} label="입력안됨" tone="red" value={`${missingCount}일`} />
            <Metric icon={Clock3} label="휴가/공휴일" value={`${dayOffCount}일`} />
          </div>

          {viewMode === "calendar" ? (
            <CalendarView
              rows={rows}
              selectedDateKey={selectedDateKey}
              setSelectedDateKey={selectDate}
              todayKey={todayKey}
              weeks={calendarWeeks}
            />
          ) : (
            <ListView dateKeys={listDateKeys} rows={rows} selectedDateKey={selectedDateKey} setSelectedDateKey={selectDate} />
          )}
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{formatKoreanDate(selectedDateKey)}</h2>
              </div>
              {!isViewingToday ? (
                <Button className="h-9 px-3" onClick={goToday} variant="secondary">
                  <RotateCcw aria-hidden="true" className="size-4" />
                  오늘로 돌아가기
                </Button>
              ) : null}
            </div>
          </div>

          <div className={cn("space-y-5 p-5", isFuture && "pointer-events-none opacity-55")}>
            <div className="space-y-2">
              <SegmentedControl items={kindOptions} onChange={updateKind} value={selectedRow.kind} />
            </div>

            {selectedRow.kind === "HOLIDAY" ? (
              <Field label="공휴일명">
                <Input
                  onChange={(event) => updateSelectedDraft({ content: event.target.value, holidayName: event.target.value })}
                  placeholder="예: 어린이날"
                  value={selectedRow.holidayName}
                />
              </Field>
            ) : null}

            {selectedRow.kind === "VACATION" ? (
              <Field label="휴가 유형">
                <Input
                  onChange={(event) => updateSelectedDraft({ content: event.target.value, vacationName: event.target.value })}
                  placeholder="예: 연차, 오전 반차"
                  value={selectedRow.vacationName}
                />
              </Field>
            ) : null}

            <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
              <Field label="진행한 프로젝트">
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  onChange={updateProject}
                  value={selectedRow.project}
                >
                  <option value="">프로젝트 선택</option>
                  {projects.map((project) => (
                    <option key={project} value={project}>
                      {project}
                    </option>
                  ))}
                  <option value={newProjectOptionValue}>새 프로젝트 등록...</option>
                </select>
              </Field>

              <Field label="일한 시간">
                <Input
                  max={24}
                  min={0}
                  onChange={(event) => updateSelectedDraft({ hours: Number(event.target.value) })}
                  step={0.5}
                  type="number"
                  value={selectedRow.hours}
                />
              </Field>
            </div>

            <Field label="내용">
              <Textarea
                onChange={(event) => updateSelectedDraft({ content: event.target.value })}
                placeholder="오늘 진행한 일을 간단히 적어주세요."
                rows={5}
                value={selectedRow.content}
              />
            </Field>

            <Field label="영문 번역본">
              <Textarea
                onChange={(event) => updateSelectedDraft({ aiTranslation: event.target.value })}
                placeholder="오늘 진행한 일을 영어로 간단히 적어주세요."
                rows={4}
                value={selectedRow.aiTranslation}
              />
            </Field>

            <Field label="짧은 버전">
              <Input onChange={(event) => updateSelectedDraft({ shortVersion: event.target.value })} placeholder="월간 캘린더에 표시할 한 줄 요약" value={selectedRow.shortVersion} />
            </Field>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className={cn("text-sm font-medium", saveState === "error" ? "text-red-600" : "text-slate-500")}>
                {saveState === "saved" ? "저장됨" : saveState === "saving" ? "저장 중" : saveError}
              </p>
              <Button className="h-10 px-4" disabled={isFuture || saveState === "saving"} onClick={saveSelectedDraft}>
                {saveState === "saving" ? "저장 중" : "저장"}
              </Button>
            </div>
          </div>

          {isFuture ? (
            <div className="mx-5 mb-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
              미래 날짜는 아직 작성하지 않습니다.
            </div>
          ) : null}
        </aside>
      </div>

      {isSettingsOpen ? (
        <ModalShell onClose={() => setIsSettingsOpen(false)} title="설정">
          <div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1">
            <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">유저 설정</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">아이디와 비밀번호를 변경합니다.</p>
                </div>
                <Badge tone={isAdmin ? "green" : "gray"}>{isAdmin ? "관리자" : "일반"}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="아이디">
                  <Input onChange={(event) => setProfileUsername(event.target.value)} value={profileUsername} />
                </Field>
                <Field label="새 비밀번호">
                  <Input autoComplete="new-password" onChange={(event) => setProfilePassword(event.target.value)} placeholder="변경 시에만 입력" type="password" value={profilePassword} />
                </Field>
              </div>
              {profileState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">계정 정보를 저장했습니다.</p> : null}
              {profileState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{profileError}</p> : null}
              <div className="mt-4 flex justify-end">
                <Button disabled={profileState === "saving"} onClick={() => void saveProfile()} type="button">
                  {profileState === "saving" ? "저장 중" : "계정 저장"}
                </Button>
              </div>
            </section>

            {isAdmin ? (
              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-950">공휴일 API</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">data.go.kr 서비스 키를 저장하고 현재 월 기준으로 테스트합니다.</p>
                <div className="mt-4">
                  <Field label="공공데이터포털 서비스 키">
                    <Input onChange={(event) => setHolidayApiKey(event.target.value)} placeholder="서비스 키" type="password" value={holidayApiKey} />
                  </Field>
                </div>
                {(holidayApiKeyState === "saved" || holidayApiKeyState === "error" || holidayApiKeyTestMessage) ? (
                  <div className="mt-3 space-y-1">
                    {holidayApiKeyState === "saved" ? <p className="text-sm font-semibold text-emerald-700">API 키를 저장했습니다.</p> : null}
                    {holidayApiKeyState === "error" ? <p className="text-sm font-semibold text-red-600">{holidayApiKeyError}</p> : null}
                    {holidayApiKeyTestMessage ? (
                      <p className={cn("text-sm font-semibold", holidayApiKeyTestState === "error" ? "text-red-600" : "text-emerald-700")}>{holidayApiKeyTestMessage}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button disabled={holidayApiKeyTestState === "saving"} onClick={() => void testHolidayApiKey()} type="button" variant="secondary">
                    {holidayApiKeyTestState === "saving" ? "테스트 중" : "키 테스트"}
                  </Button>
                  <Button disabled={holidayApiKeyState === "saving"} onClick={() => void saveHolidayApiKey()} type="button">
                    {holidayApiKeyState === "saving" ? "저장 중" : "키 저장"}
                  </Button>
                </div>
              </section>
            ) : null}

            {isAdmin ? (
              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-950">공휴일 캐시</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">현재 표시 중인 월의 공휴일 캐시를 삭제하고 다시 조회합니다.</p>
                {holidayResetState === "saved" ? <p className="mt-3 text-sm font-semibold text-emerald-700">공휴일 정보를 다시 불러왔습니다.</p> : null}
                {holidayResetState === "error" ? <p className="mt-3 text-sm font-semibold text-red-600">{holidayResetError}</p> : null}
                <div className="mt-4 flex justify-end">
                  <Button disabled={holidayResetState === "saving"} onClick={() => void resetCurrentMonthHolidays()} type="button" variant="secondary">
                    <RotateCcw aria-hidden="true" className="size-4" />
                    {holidayResetState === "saving" ? "다시 불러오는 중" : "현재 월 공휴일 리셋"}
                  </Button>
                </div>
              </section>
            ) : null}

            {isAdmin ? (
              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-950">사용자 관리</h3>
                <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 bg-slate-50">
                  {managedUsers.map((user) => (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm" key={user.id}>
                      <span className="font-semibold text-slate-950">{user.username}</span>
                      <Badge tone={user.role === "ADMIN" ? "green" : "gray"}>{user.role === "ADMIN" ? "관리자" : "일반"}</Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                  <Field label="아이디">
                    <Input onChange={(event) => setNewUserUsername(event.target.value)} value={newUserUsername} />
                  </Field>
                  <Field label="비밀번호">
                    <Input autoComplete="new-password" onChange={(event) => setNewUserPassword(event.target.value)} type="password" value={newUserPassword} />
                  </Field>
                  <Field label="권한">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      onChange={(event) => setNewUserRole(event.target.value === "ADMIN" ? "ADMIN" : "USER")}
                      value={newUserRole}
                    >
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
              </section>
            ) : null}

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <Button onClick={() => setIsSettingsOpen(false)} variant="secondary">
                닫기
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {isProjectModalOpen ? (
        <ModalShell onClose={closeProjectModal} title="새 프로젝트 등록">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void addProject(); }}>
            <Field label="프로젝트명">
              <Input autoFocus onChange={(event) => setNewProjectName(event.target.value)} placeholder="예: 고객 포털 개선" value={newProjectName} />
            </Field>
            {projectAddState === "error" ? <p className="text-sm font-semibold text-red-600">{projectAddError}</p> : null}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={closeProjectModal} type="button" variant="secondary">
                취소
              </Button>
              <Button disabled={projectAddState === "saving"} type="submit">
                <Plus aria-hidden="true" className="size-4" />
                {projectAddState === "saving" ? "등록 중" : "등록"}
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {pendingNavigation ? (
        <ModalShell onClose={() => setPendingNavigation(null)} title="저장되지 않은 변경">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">현재 날짜의 변경사항이 아직 저장되지 않았습니다. 저장하지 않고 이동하면 마지막 저장 상태로 되돌아갑니다.</p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button onClick={() => setPendingNavigation(null)} variant="secondary">
                계속 작성
              </Button>
              <Button onClick={confirmPendingNavigation} variant="danger">
                저장하지 않고 이동
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  tone,
  value
}: {
  icon: LucideIcon;
  label: string;
  tone?: "red";
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-slate-200 py-2 sm:border-r sm:px-4 sm:last:border-r-0">
      <div className={cn("flex size-9 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm", tone === "red" && "text-red-600")}>
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className={cn("text-lg font-bold text-slate-950", tone === "red" && "text-red-600")}>{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TimesheetStatus }) {
  if (status === "FUTURE") {
    return null;
  }

  return (
    <Badge tone={badgeToneByStatus[status]}>
      <span className="mr-1 size-1.5 rounded-full bg-current" />
      {statusLabel[status]}
    </Badge>
  );
}

function CalendarView({
  rows,
  selectedDateKey,
  setSelectedDateKey,
  todayKey,
  weeks
}: {
  rows: Record<string, TimesheetRow>;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
  todayKey: string;
  weeks: ReturnType<typeof getBusinessCalendarWeeks>;
}) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-5 border-b border-slate-200 pb-2">
        {weekdays.map((weekday) => (
          <div className="px-2 text-xs font-bold text-slate-400" key={weekday}>
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid gap-2 pt-3">
        {weeks.map((week, index) => (
          <div className="grid grid-cols-5 gap-2" key={`${index}-${week.map((cell) => cell?.dateKey ?? "blank").join("-")}`}>
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return <div className="min-h-32 rounded-md border border-dashed border-slate-100 bg-slate-50/60" key={`blank-${cellIndex}`} />;
              }

              const row = rows[cell.dateKey];

              return (
                <button
                  className={cn(
                    "flex min-h-32 flex-col justify-between rounded-md border p-3 text-left transition",
                    row && cellToneByStatus[row.status],
                    selectedDateKey === cell.dateKey && "ring-2 ring-slate-950 ring-offset-2"
                  )}
                  key={cell.dateKey}
                  onClick={() => setSelectedDateKey(cell.dateKey)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-sm font-bold",
                        cell.dateKey === todayKey ? "bg-slate-950 text-white" : "text-slate-950"
                      )}
                    >
                      {cell.day}
                    </span>
                    {row ? <StatusBadge status={row.status} /> : null}
                  </div>
                  <div className="mt-3 space-y-1">
                    {row?.project ? <p className="truncate text-xs font-bold text-slate-950">{row.project}</p> : null}
                    <p className={cn("line-clamp-2 text-sm leading-5 text-slate-600", row?.status === "MISSING" && "font-bold text-red-600")}>
                      {row ? statusText(row) : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({
  dateKeys,
  rows,
  selectedDateKey,
  setSelectedDateKey
}: {
  dateKeys: string[];
  rows: Record<string, TimesheetRow>;
  selectedDateKey: string;
  setSelectedDateKey: (dateKey: string) => void;
}) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="grid min-w-[980px] grid-cols-[120px_112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-bold text-slate-400">
        <span>날짜</span>
        <span>상태</span>
        <span>시간</span>
        <span>프로젝트</span>
        <span>내용</span>
        <span>AI 번역본</span>
      </div>
      <div className="divide-y divide-slate-100">
        {dateKeys.map((dateKey) => {
          const row = rows[dateKey]!;

          return (
            <button
              className={cn(
                "grid min-w-[980px] grid-cols-[120px_112px_88px_minmax(120px,0.8fr)_minmax(200px,1.2fr)_minmax(200px,1.1fr)] gap-3 px-3 py-3 text-left text-sm transition hover:bg-slate-50",
                selectedDateKey === dateKey && "bg-slate-100"
              )}
              key={dateKey}
              onClick={() => setSelectedDateKey(dateKey)}
              type="button"
            >
              <span className="font-semibold text-slate-950">{formatKoreanDate(dateKey)}</span>
              <span>
                <StatusBadge status={row.status} />
              </span>
              <span className="text-slate-600">{row.hours}h</span>
              <span className="truncate font-medium text-slate-700">{row.project || "-"}</span>
              <span className={cn("truncate text-slate-600", row.status === "MISSING" && "font-bold text-red-600")}>{statusText(row)}</span>
              <span className="truncate text-slate-500">{row.aiTranslation || "-"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ModalShell({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div aria-labelledby="modal-title" aria-modal="true" className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20" role="dialog">
        <h2 className="text-lg font-bold text-slate-950" id="modal-title">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
