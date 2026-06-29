import { exchangeCode, fetchMonthlyTimeMacro, getConnectUrl, getValidConnection, type MonthlyTimeMacroExport } from "./api.js";
import { buildContentMacroSteps, buildMacroSteps, runMacroInActiveTab, type MacroStep } from "./macro.js";
import { getSettings, saveSettings, type StoredSettings } from "./storage.js";

type MonthlyTimeMacroCategory = MonthlyTimeMacroExport["categories"][number];
type InputMode = "content" | "time";
type MacroStatusResponse = {
  ok?: boolean;
  running?: boolean;
  waiting?: boolean;
};

const connectionState = requireElement<HTMLElement>("#connectionState");
const connectButton = requireElement<HTMLButtonElement>("#connectButton");
const timeModeButton = requireElement<HTMLButtonElement>("#timeModeButton");
const contentModeButton = requireElement<HTMLButtonElement>("#contentModeButton");
const baseUrlInput = requireElement<HTMLInputElement>("#baseUrlInput");
const monthInput = requireElement<HTMLInputElement>("#monthInput");
const refreshButton = requireElement<HTMLButtonElement>("#refreshButton");
const categoryList = requireElement<HTMLOListElement>("#categoryList");
const categoryCount = optionalElement<HTMLElement>("#categoryCount");
const filledCount = optionalElement<HTMLElement>("#filledCount");
const blankCount = optionalElement<HTMLElement>("#blankCount");
const previewSummary = optionalElement<HTMLElement>("#previewSummary");
const statusText = requireElement<HTMLElement>("#statusText, #statusMessage");
const zoomOutBeforeMacroInput = requireElement<HTMLInputElement>("#zoomOutBeforeMacroInput");
const runButton = requireElement<HTMLButtonElement>("#runButton");
const stopButton = requireElement<HTMLButtonElement>("#stopButton");

let settings: StoredSettings | null = null;
let exportData: MonthlyTimeMacroExport | null = null;
let activeMode: InputMode = "time";
let isConnecting = false;
let isLoadingExport = false;
let isRunningMacro = false;
let isStoppingMacro = false;
let selectedContentCategoryId: string | null = null;
let statusPollId: number | null = null;

function requireElement<TElement extends HTMLElement>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);

  if (!element) {
    throw new Error(`Popup element not found: ${selector}`);
  }

  return element;
}

function optionalElement<TElement extends HTMLElement>(selector: string): TElement | null {
  return document.querySelector<TElement>(selector);
}

function getActiveSettings(): StoredSettings {
  if (!settings) {
    throw new Error("Popup settings are not loaded.");
  }

  return settings;
}

function setStatus(message: string): void {
  statusText.textContent = message;
}

function setErrorStatus(error: unknown, fallback: string): void {
  setStatus(error instanceof Error ? error.message : fallback);
}

function isMissingReceiverError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Could not establish connection") ||
    error.message.includes("Receiving end does not exist") ||
    error.message.includes("message port closed")
  );
}

function getBaseUrl(): string {
  return baseUrlInput.value.trim().replace(/\/+$/, "");
}

function getOrderKey(): string {
  const currentSettings = getActiveSettings();
  const connection = currentSettings.connection;
  const baseUrl = (connection?.baseUrl ?? getBaseUrl()).trim().replace(/\/+$/, "");
  const username = connection?.connectedUsername ?? "anonymous";

  return `${baseUrl}::${username}`;
}

function getCategoryOrder(): string[] {
  const currentSettings = getActiveSettings();

  return currentSettings.categoryOrderByKey[getOrderKey()] ?? [];
}

function getDisabledCategories(): string[] {
  const currentSettings = getActiveSettings();

  return currentSettings.categoryDisabledByKey[getOrderKey()] ?? [];
}

async function saveCategoryOrder(order: string[]): Promise<void> {
  const currentSettings = getActiveSettings();

  currentSettings.categoryOrderByKey[getOrderKey()] = order;
  await saveSettings(currentSettings);
}

async function saveDisabledCategories(disabledCategoryIds: string[]): Promise<void> {
  const currentSettings = getActiveSettings();

  currentSettings.categoryDisabledByKey[getOrderKey()] = disabledCategoryIds;
  await saveSettings(currentSettings);
}

async function saveZoomOutBeforeMacro(enabled: boolean): Promise<void> {
  const currentSettings = getActiveSettings();

  currentSettings.zoomOutBeforeMacro = enabled;
  await saveSettings(currentSettings);
}

function getOrderedCategories(data: MonthlyTimeMacroExport): MonthlyTimeMacroCategory[] {
  const categoriesById = new Map(data.categories.map((category) => [category.id, category]));
  const orderedIds = [...getCategoryOrder(), ...data.categories.map((category) => category.id)].filter(
    (id, index, values) => values.indexOf(id) === index
  );
  const categories: MonthlyTimeMacroCategory[] = [];

  for (const id of orderedIds) {
    const category = categoriesById.get(id);

    if (category) {
      categories.push(category);
    }
  }

  return categories;
}

function getActiveCategories(categories: MonthlyTimeMacroCategory[]): MonthlyTimeMacroCategory[] {
  const disabledCategoryIds = new Set(getDisabledCategories());

  return categories.filter((category) => !disabledCategoryIds.has(category.id));
}

function getSelectedContentCategory(categories: MonthlyTimeMacroCategory[]): MonthlyTimeMacroCategory | null {
  if (selectedContentCategoryId && categories.some((category) => category.id === selectedContentCategoryId)) {
    return categories.find((category) => category.id === selectedContentCategoryId) ?? null;
  }

  selectedContentCategoryId = categories[0]?.id ?? null;

  return categories[0] ?? null;
}

function getMacroDays(categories: MonthlyTimeMacroCategory[]): MonthlyTimeMacroCategory["days"] {
  return categories.flatMap((category) => category.days);
}

function renderConnection(): void {
  const currentSettings = getActiveSettings();

  if (currentSettings.pendingConnection) {
    connectionState.textContent = `${currentSettings.pendingConnection.baseUrl} 승인 대기 중`;
    connectButton.textContent = "연결 code 입력";
    baseUrlInput.value = currentSettings.pendingConnection.baseUrl;
    return;
  }

  if (currentSettings.connection) {
    connectionState.textContent = `${currentSettings.connection.connectedUsername || "aJam"} 연결됨`;
    connectButton.textContent = "다시 연결";
    baseUrlInput.value = currentSettings.connection.baseUrl;
    return;
  }

  connectionState.textContent = "연결 필요";
  connectButton.textContent = "aJam 연결";
}

function renderControls(): void {
  const busy = isConnecting || isLoadingExport;

  connectButton.disabled = busy || isRunningMacro;
  timeModeButton.disabled = busy || isRunningMacro;
  contentModeButton.disabled = busy || isRunningMacro;
  timeModeButton.classList.toggle("active", activeMode === "time");
  contentModeButton.classList.toggle("active", activeMode === "content");
  refreshButton.disabled = busy || isRunningMacro;
  runButton.disabled = busy || isRunningMacro;
  runButton.textContent = activeMode === "time" ? "시간 입력 실행" : "내용 입력 실행";
  runButton.hidden = isRunningMacro;
  stopButton.hidden = !isRunningMacro;
  stopButton.disabled = isStoppingMacro;
  baseUrlInput.disabled = isConnecting || isRunningMacro;
  monthInput.disabled = isLoadingExport || isRunningMacro;
  zoomOutBeforeMacroInput.disabled = busy || isRunningMacro;
}

function renderPreview(): void {
  if (!exportData) {
    categoryList.replaceChildren();
    renderPreviewSummary({ blankDateCount: 0, categoryCount: 0, filledDateCount: 0 });
    return;
  }

  const categories = getOrderedCategories(exportData);
  const selectedContentCategory = activeMode === "content" ? getSelectedContentCategory(categories) : null;
  const activeCategories = activeMode === "time" ? getActiveCategories(categories) : selectedContentCategory ? [selectedContentCategory] : [];
  const currentOrder = categories.map((category) => category.id);
  const disabledCategoryIds = new Set(getDisabledCategories());
  const macroDays =
    activeMode === "content"
      ? activeCategories.flatMap((category) => category.days.filter((day) => day.value))
      : getMacroDays(activeCategories);
  const filledDateCount = macroDays.filter((day) => day.value).length;
  const blankDateCount = activeMode === "content" ? filledDateCount * 2 : macroDays.length - filledDateCount;

  categoryList.replaceChildren(
    ...categories.map((category, index) => {
      const item = document.createElement("li");
      const enabledInput = document.createElement("input");
      const label = document.createElement("span");
      const upButton = document.createElement("button");
      const downButton = document.createElement("button");

      enabledInput.type = activeMode === "time" ? "checkbox" : "radio";
      enabledInput.name = activeMode === "time" ? "" : "contentCategory";
      enabledInput.checked = activeMode === "time" ? !disabledCategoryIds.has(category.id) : selectedContentCategory?.id === category.id;
      enabledInput.disabled = isRunningMacro;
      enabledInput.setAttribute("aria-label", activeMode === "time" ? `${category.label} 활성화` : `${category.label} 선택`);
      label.textContent = category.label;
      item.classList.toggle("disabledCategory", activeMode === "time" && !enabledInput.checked);
      upButton.textContent = "↑";
      downButton.textContent = "↓";
      upButton.type = "button";
      downButton.type = "button";
      upButton.disabled = isRunningMacro || index === 0;
      downButton.disabled = isRunningMacro || index === categories.length - 1;
      upButton.setAttribute("aria-label", `${category.label} 위로 이동`);
      downButton.setAttribute("aria-label", `${category.label} 아래로 이동`);
      enabledInput.addEventListener("change", () => {
        if (activeMode === "content") {
          selectedContentCategoryId = category.id;
          renderPreview();
          return;
        }

        const nextDisabled = new Set(getDisabledCategories());

        if (enabledInput.checked) {
          nextDisabled.delete(category.id);
        } else {
          nextDisabled.add(category.id);
        }

        void saveDisabledCategories([...nextDisabled]).then(() => renderPreview());
      });
      bindClick(upButton, async () => {
        const nextOrder = [...currentOrder];
        const previous = nextOrder[index - 1];
        const current = nextOrder[index];

        if (!previous || !current) {
          return;
        }

        nextOrder[index - 1] = current;
        nextOrder[index] = previous;
        await saveCategoryOrder(nextOrder);
        renderPreview();
      });
      bindClick(downButton, async () => {
        const nextOrder = [...currentOrder];
        const next = nextOrder[index + 1];
        const current = nextOrder[index];

        if (!next || !current) {
          return;
        }

        nextOrder[index + 1] = current;
        nextOrder[index] = next;
        await saveCategoryOrder(nextOrder);
        renderPreview();
      });

      item.append(enabledInput, label, upButton, downButton);

      return item;
    })
  );
  renderPreviewSummary({ blankDateCount, categoryCount: activeCategories.length, filledDateCount });
}

function renderPreviewSummary(params: { blankDateCount: number; categoryCount: number; filledDateCount: number }): void {
  categoryCount?.replaceChildren(String(params.categoryCount));
  filledCount?.replaceChildren(String(params.filledDateCount));
  blankCount?.replaceChildren(String(params.blankDateCount));

  if (previewSummary) {
    previewSummary.textContent =
      activeMode === "time"
        ? `활성 카테고리 ${params.categoryCount}개 · 입력 ${params.filledDateCount}칸 · 빈칸 이동 ${params.blankDateCount}칸`
        : `선택 카테고리 ${params.categoryCount}개 · 내용 입력 ${params.filledDateCount}일 · 이동 ${params.blankDateCount}번`;
  }
}

async function loadExport(): Promise<boolean> {
  if (isLoadingExport || isRunningMacro) {
    setStatus("진행 중인 작업이 있습니다.");
    return false;
  }

  const currentSettings = getActiveSettings();

  if (!currentSettings.connection) {
    setStatus("먼저 aJam을 연결해 주세요.");
    return false;
  }

  isLoadingExport = true;
  renderControls();

  try {
    const month = monthInput.value;
    const connection = await getValidConnection(currentSettings.connection);

    currentSettings.connection = connection;
    currentSettings.lastMonth = month;
    await saveSettings(currentSettings);
    exportData = await fetchMonthlyTimeMacro(connection, month);
    renderConnection();
    renderPreview();
    setStatus("월간 데이터를 불러왔습니다.");

    return true;
  } finally {
    isLoadingExport = false;
    renderControls();
  }
}

async function startConnectionApproval(currentSettings: StoredSettings, baseUrl: string): Promise<void> {
  const nextPendingConnection = {
    baseUrl,
    startedAt: new Date().toISOString()
  };

  currentSettings.pendingConnection = nextPendingConnection;
  await saveSettings(currentSettings);
  renderConnection();
  setStatus("aJam 승인 탭을 열었습니다. 승인 후 popup을 다시 열고 code를 입력해 주세요.");

  const tab = await chrome.tabs.create({ active: true, url: getConnectUrl(baseUrl) });

  if (tab.id === undefined) {
    return;
  }

  const latestSettings = await getSettings().catch(() => null);
  const latestPendingConnection = latestSettings?.pendingConnection;

  if (
    latestSettings &&
    latestPendingConnection?.baseUrl === nextPendingConnection.baseUrl &&
    latestPendingConnection.startedAt === nextPendingConnection.startedAt
  ) {
    latestSettings.pendingConnection = {
      ...latestPendingConnection,
      approvalTabId: tab.id
    };
    await saveSettings(latestSettings).catch(() => undefined);
    settings = latestSettings;
  }
}

async function connect(): Promise<void> {
  if (isConnecting || isLoadingExport || isRunningMacro) {
    return;
  }

  const currentSettings = getActiveSettings();
  const pendingConnection = currentSettings.pendingConnection;

  isConnecting = true;
  renderControls();

  try {
    if (pendingConnection) {
      setStatus("aJam 승인 후 표시된 code 값을 붙여넣어 주세요.");

      const code = window.prompt("aJam 연결 승인 후 표시된 code 값을 붙여넣어 주세요.");

      if (!code?.trim()) {
        const shouldRestart = window.confirm("연결 code가 없나요? 기존 승인 대기를 취소하고 새 code를 받을까요?");

        if (!shouldRestart) {
          setStatus("연결 code 입력이 취소되었습니다. 다시 누르면 입력을 계속할 수 있습니다.");
          return;
        }

        delete currentSettings.pendingConnection;
        await saveSettings(currentSettings);

        if (pendingConnection.approvalTabId !== undefined) {
          await chrome.tabs.remove(pendingConnection.approvalTabId).catch(() => undefined);
        }

        await startConnectionApproval(currentSettings, getBaseUrl() || pendingConnection.baseUrl);
        return;
      }

      currentSettings.connection = await exchangeCode(pendingConnection.baseUrl, code.trim());
      delete currentSettings.pendingConnection;
      await saveSettings(currentSettings);

      if (pendingConnection.approvalTabId !== undefined) {
        await chrome.tabs.remove(pendingConnection.approvalTabId).catch(() => undefined);
      }

      exportData = null;
      renderConnection();
      renderPreview();
      setStatus("aJam 연결이 완료되었습니다.");
      return;
    }

    const baseUrl = getBaseUrl();
    await startConnectionApproval(currentSettings, baseUrl);
  } finally {
    isConnecting = false;
    renderControls();
  }
}

async function runMacro(): Promise<void> {
  if (isLoadingExport || isRunningMacro) {
    setStatus("진행 중인 작업이 있습니다.");
    return;
  }

  if (!exportData && !(await loadExport())) {
    return;
  }

  if (!exportData) {
    return;
  }

  isRunningMacro = true;
  renderControls();
  setStatus(activeMode === "time" ? "브라우저에서 시작할 시간 입력칸을 클릭해 주세요." : "브라우저에서 시작할 내용 입력칸을 클릭해 주세요.");

  try {
    const steps = buildRunSteps(exportData);

    if (steps.length === 0) {
      setStatus(activeMode === "time" ? "활성화된 카테고리가 없습니다." : "선택한 카테고리에 입력할 내용이 없습니다.");
      return;
    }

    await runMacroInActiveTab(steps, {
      zoomOutBeforeMacro: getActiveSettings().zoomOutBeforeMacro
    });
    window.close();
  } finally {
    isRunningMacro = false;
    isStoppingMacro = false;
    renderControls();
  }
}

function buildRunSteps(data: MonthlyTimeMacroExport): MacroStep[] {
  if (activeMode === "time") {
    const activeCategoryIds = getActiveCategories(getOrderedCategories(data)).map((category) => category.id);

    return activeCategoryIds.length > 0 ? buildMacroSteps(data, getCategoryOrder(), activeCategoryIds) : [];
  }

  const selectedCategory = getSelectedContentCategory(getOrderedCategories(data));

  return selectedCategory ? buildContentMacroSteps(data, selectedCategory.id) : [];
}

function selectMode(mode: InputMode): void {
  activeMode = mode;
  renderPreview();
  renderControls();
  setStatus(mode === "time" ? "시간 입력 모드입니다." : "내용 입력 모드입니다. 카테고리 하나를 선택해 주세요.");
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  return tab?.id ?? null;
}

async function queryActiveTabMacroState(): Promise<"idle" | "running" | "waiting"> {
  const tabId = await getActiveTabId();

  if (!tabId) {
    return "idle";
  }

  try {
    const response = await chrome.tabs.sendMessage<MacroStatusResponse>(tabId, { type: "GET_AJAM_TIME_MACRO_STATUS" });

    if (response?.ok === true && response.running === true) {
      return "running";
    }

    if (response?.ok === true && response.waiting === true) {
      return "waiting";
    }

    return "idle";
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      return "idle";
    }

    return "idle";
  }
}

function scheduleMacroStatusRefresh(): void {
  if (statusPollId !== null) {
    return;
  }

  statusPollId = window.setTimeout(() => {
    statusPollId = null;

    if (!isRunningMacro) {
      return;
    }

    void queryActiveTabMacroState()
      .then((macroState) => {
        if (macroState !== "idle") {
          scheduleMacroStatusRefresh();
          return;
        }

        isRunningMacro = false;
        isStoppingMacro = false;
        renderControls();
        setStatus("시간 입력이 완료되었거나 중지되었습니다.");
      })
      .catch(() => undefined);
  }, 1_000);
}

async function stopMacro(): Promise<void> {
  if (isStoppingMacro) {
    return;
  }

  const tabId = await getActiveTabId();

  if (!tabId) {
    setStatus("활성 탭을 찾을 수 없습니다.");
    return;
  }

  isStoppingMacro = true;
  renderControls();

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "STOP_AJAM_TIME_MACRO" });

    if (!response?.ok) {
      throw new Error(response?.error ?? "중지 요청을 보내지 못했습니다.");
    }

    setStatus("중지 요청을 보냈습니다.");
    scheduleMacroStatusRefresh();
  } catch (error) {
    if (isMissingReceiverError(error)) {
      isRunningMacro = false;
      setStatus("실행 중인 시간 입력을 찾을 수 없습니다.");
      return;
    }

    throw error;
  } finally {
    isStoppingMacro = false;
    renderControls();
  }
}

function bindClick(element: HTMLElement, handler: () => Promise<unknown>, fallback = "작업 실패"): void {
  element.addEventListener("click", () => {
    void handler().catch((error: unknown) => {
      setErrorStatus(error, fallback);
    });
  });
}

async function init(): Promise<void> {
  settings = await getSettings();
  monthInput.value = settings.lastMonth;
  zoomOutBeforeMacroInput.checked = settings.zoomOutBeforeMacro;

  if (settings.connection) {
    baseUrlInput.value = settings.connection.baseUrl;
  }

  renderConnection();
  renderPreview();
  const macroState = await queryActiveTabMacroState();
  isRunningMacro = macroState !== "idle";
  renderControls();

  if (isRunningMacro) {
    setStatus(macroState === "waiting" ? "브라우저에서 시작할 시간 입력칸 클릭을 기다리는 중입니다." : "시간 입력 중입니다.");
    scheduleMacroStatusRefresh();
    return;
  }

  if (settings.connection && !settings.pendingConnection) {
    await loadExport();
  }
}

bindClick(connectButton, connect, "연결 실패");
bindClick(refreshButton, loadExport, "불러오기 실패");
bindClick(runButton, runMacro, "시간 입력 실패");
bindClick(stopButton, stopMacro, "중지 실패");
timeModeButton.addEventListener("click", () => selectMode("time"));
contentModeButton.addEventListener("click", () => selectMode("content"));
zoomOutBeforeMacroInput.addEventListener("change", () => {
  void saveZoomOutBeforeMacro(zoomOutBeforeMacroInput.checked).catch((error: unknown) => {
    setErrorStatus(error, "옵션 저장 실패");
  });
});

void init().catch((error: unknown) => {
  setErrorStatus(error, "초기화 실패");
});
