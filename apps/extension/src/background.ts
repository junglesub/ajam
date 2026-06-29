type MacroStep =
  | { categoryId: string; dateKey: string; type: "tab" }
  | { categoryId: string; dateKey: string; type: "type"; value: string };

type DebuggerMacroResponse = {
  completed?: number;
  error?: string;
  ok: boolean;
};

type MacroRunOptions = {
  zoomOutBeforeMacro: boolean;
};

type ActiveDebuggerRun = {
  stopped: boolean;
};

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const MAX_ZOOM_OUT_FACTOR = 0.25;
const activeRuns = new Map<number, ActiveDebuggerRun>();

function isMacroStep(value: unknown): value is MacroStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<MacroStep>;

  if (candidate.type === "tab") {
    return typeof candidate.categoryId === "string" && typeof candidate.dateKey === "string";
  }

  return (
    candidate.type === "type" &&
    typeof candidate.categoryId === "string" &&
    typeof candidate.dateKey === "string" &&
    typeof candidate.value === "string"
  );
}

function parseSteps(value: unknown): MacroStep[] {
  if (!Array.isArray(value) || !value.every(isMacroStep)) {
    throw new Error("시간 입력 단계가 올바르지 않습니다.");
  }

  return value;
}

function parseOptions(value: unknown): MacroRunOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { zoomOutBeforeMacro: false };
  }

  return { zoomOutBeforeMacro: (value as Partial<MacroRunOptions>).zoomOutBeforeMacro === true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendProgress(tabId: number, frameId: number | undefined, completed: number, total: number): Promise<void> {
  await chrome.tabs
    .sendMessage(
      tabId,
      {
        completed,
        ok: true,
        total,
        type: "AJAM_TIME_MACRO_PROGRESS"
      },
      frameId === undefined ? undefined : { frameId }
    )
    .catch(() => undefined);
}

async function dispatchText(tabId: number, text: string): Promise<void> {
  await chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text });
}

async function dispatchTab(tabId: number): Promise<void> {
  const params = {
    code: "Tab",
    key: "Tab",
    nativeVirtualKeyCode: 9,
    windowsVirtualKeyCode: 9
  };

  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { ...params, type: "rawKeyDown" });
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

async function captureAndApplyZoom(tabId: number, options: MacroRunOptions): Promise<number | null> {
  if (!options.zoomOutBeforeMacro) {
    return null;
  }

  const originalZoom = await chrome.tabs.getZoom(tabId).catch(() => null);

  if (originalZoom === null) {
    return null;
  }

  await chrome.tabs.setZoom(tabId, MAX_ZOOM_OUT_FACTOR).catch(() => undefined);

  return originalZoom;
}

async function restoreZoom(tabId: number, originalZoom: number | null): Promise<void> {
  if (originalZoom === null) {
    return;
  }

  await chrome.tabs.setZoom(tabId, originalZoom).catch(() => undefined);
}

async function runDebuggerMacro(
  tabId: number,
  frameId: number | undefined,
  steps: MacroStep[],
  options: MacroRunOptions
): Promise<DebuggerMacroResponse> {
  if (activeRuns.has(tabId)) {
    return { completed: 0, error: "이미 시간 입력을 실행 중입니다.", ok: false };
  }

  const runState: ActiveDebuggerRun = { stopped: false };
  let attached = false;
  let completed = 0;
  let originalZoom: number | null = null;

  activeRuns.set(tabId, runState);

  try {
    originalZoom = await captureAndApplyZoom(tabId, options);
    await chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
    attached = true;
    await sendProgress(tabId, frameId, 0, steps.length);

    for (const step of steps) {
      if (runState.stopped) {
        throw new Error("사용자가 중지했습니다.");
      }

      if (step.type === "type") {
        await dispatchText(tabId, step.value);
      } else {
        await dispatchTab(tabId);
      }

      completed += 1;
      await sendProgress(tabId, frameId, completed, steps.length);
      await sleep(80);
    }

    return { completed, ok: true };
  } catch (error) {
    return {
      completed,
      error: error instanceof Error ? error.message : "Debugger 입력 매크로를 실행하지 못했습니다.",
      ok: false
    };
  } finally {
    activeRuns.delete(tabId);
    await restoreZoom(tabId, originalZoom);

    if (attached) {
      await chrome.debugger.detach({ tabId }).catch(() => undefined);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "STOP_AJAM_DEBUGGER_INPUT_MACRO") {
    const tabId = sender.tab?.id;

    if (tabId !== undefined) {
      const activeRun = activeRuns.get(tabId);

      if (activeRun) {
        activeRun.stopped = true;
      }
    }

    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== "RUN_AJAM_DEBUGGER_INPUT_MACRO") {
    return false;
  }

  try {
    const tabId = sender.tab?.id;

    if (tabId === undefined) {
      throw new Error("활성 탭을 찾을 수 없습니다.");
    }

    const steps = parseSteps(message.steps);
    const options = parseOptions(message.options);

    runDebuggerMacro(tabId, sender.frameId, steps, options).then(sendResponse);
    return true;
  } catch (error) {
    sendResponse({
      completed: 0,
      error: error instanceof Error ? error.message : "Debugger 입력 매크로를 실행하지 못했습니다.",
      ok: false
    });
    return false;
  }
});
