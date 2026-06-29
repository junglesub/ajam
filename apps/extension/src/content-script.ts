(() => {
  type MacroStep =
    | { categoryId: string; dateKey: string; type: "tab" }
    | { categoryId: string; dateKey: string; type: "type"; value: string };

  type AjamTimeMacroState = {
    cancelWaiting?: () => void;
    progressOverlay?: OverlayController;
    listenerInstalled: boolean;
    running: boolean;
    silentCancelWaiting: boolean;
    stopped: boolean;
    waiting: boolean;
  };

  type AjamTimeMacroWindow = Window & {
    __ajamTimeMacro?: AjamTimeMacroState;
  };

  type MacroRunOptions = {
    zoomOutBeforeMacro: boolean;
  };

  type AjamWindowMessage = {
    completed?: number;
    error?: string;
    options?: unknown;
    source?: string;
    steps?: unknown;
    total?: number;
    type?: string;
  };
  type DebuggerMacroResponse = {
    completed?: number;
    error?: string;
    ok?: boolean;
  };
  type OverlayController = {
    remove: () => void;
    setError: (message: string) => void;
    setMessage: (message: string) => void;
    setProgress: (completed: number, total: number) => void;
  };

  const macroWindow = window as AjamTimeMacroWindow;
  const START_INPUT_DELAY_MS = 1_000;
  const state = macroWindow.__ajamTimeMacro ?? {
    listenerInstalled: false,
    running: false,
    silentCancelWaiting: false,
    stopped: false,
    waiting: false
  };

  macroWindow.__ajamTimeMacro = state;

  if (state.listenerInstalled) {
    return;
  }

  state.listenerInstalled = true;

  function isElementInside(element: EventTarget | null, root: HTMLElement): boolean {
    return element instanceof Node && root.contains(element);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isMacroStartTarget(target: EventTarget | null): boolean {
    return target instanceof Node;
  }

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
      throw new Error("매크로 단계가 올바르지 않습니다.");
    }

    return value;
  }

  function parseOptions(value: unknown): MacroRunOptions {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { zoomOutBeforeMacro: false };
    }

    return { zoomOutBeforeMacro: (value as Partial<MacroRunOptions>).zoomOutBeforeMacro === true };
  }

  function showWaitingOverlay(params: { cancel: () => void }): OverlayController {
    const overlay = document.createElement("div");
    const panel = document.createElement("div");
    const title = document.createElement("strong");
    const message = document.createElement("span");
    const progress = document.createElement("span");
    const cancelButton = document.createElement("button");

    overlay.id = "ajam-time-macro-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.pointerEvents = "none";

    panel.style.position = "fixed";
    panel.style.top = "16px";
    panel.style.left = "50%";
    panel.style.transform = "translateX(-50%)";
    panel.style.display = "grid";
    panel.style.gridTemplateColumns = "auto auto";
    panel.style.alignItems = "center";
    panel.style.gap = "8px 12px";
    panel.style.maxWidth = "min(520px, calc(100vw - 32px))";
    panel.style.boxSizing = "border-box";
    panel.style.border = "1px solid #0f766e";
    panel.style.borderRadius = "8px";
    panel.style.background = "#ffffff";
    panel.style.boxShadow = "0 16px 40px rgba(15, 23, 42, 0.22)";
    panel.style.color = "#0f172a";
    panel.style.font = "13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    panel.style.padding = "12px 14px";
    panel.style.pointerEvents = "auto";

    title.textContent = "aJam 시간 입력 대기중";
    title.style.gridColumn = "1";

    message.textContent = "시작할 시간 입력칸을 클릭하면 그 위치부터 입력합니다.";
    message.style.gridColumn = "1";

    progress.textContent = "";
    progress.style.gridColumn = "1";
    progress.style.color = "#475569";

    cancelButton.type = "button";
    cancelButton.textContent = "취소";
    cancelButton.style.gridColumn = "2";
    cancelButton.style.gridRow = "1 / span 2";
    cancelButton.style.border = "1px solid #be123c";
    cancelButton.style.borderRadius = "6px";
    cancelButton.style.background = "#be123c";
    cancelButton.style.color = "#ffffff";
    cancelButton.style.cursor = "pointer";
    cancelButton.style.font = "inherit";
    cancelButton.style.padding = "7px 10px";
    cancelButton.addEventListener("click", params.cancel);

    panel.append(title, message, progress, cancelButton);
    overlay.append(panel);
    document.documentElement.append(overlay);

    return {
      remove: () => overlay.remove(),
      setError: (nextMessage: string) => {
        title.textContent = "aJam 시간 입력 오류";
        message.textContent = nextMessage;
        progress.textContent = "";
        panel.style.borderColor = "#be123c";
      },
      setMessage: (nextMessage: string) => {
        message.textContent = nextMessage;
      },
      setProgress: (completed: number, total: number) => {
        const remaining = Math.max(0, total - completed);

        title.textContent = "aJam 시간 입력 진행중";
        message.textContent = `남은 작업 ${remaining}개`;
        progress.textContent = `완료 ${completed}/${total}`;
      }
    };
  }

  function isTopFrame(): boolean {
    return window.top === window;
  }

  function postToTop(message: AjamWindowMessage): void {
    if (isTopFrame()) {
      window.postMessage(message, "*");
      return;
    }

    window.top?.postMessage(message, "*");
  }

  function broadcastToFrames(message: AjamWindowMessage): void {
    window.postMessage(message, "*");

    for (const frame of Array.from(document.querySelectorAll("iframe"))) {
      try {
        frame.contentWindow?.postMessage(message, "*");
      } catch {
        // Cross-origin frames still expose postMessage through WindowProxy in normal cases.
      }
    }
  }

  function broadcastCancelWaiting(): void {
    broadcastToFrames({ source: "ajam-time-macro", type: "AJAM_TIME_MACRO_CANCEL_WAITING" });
  }

  function broadcastStopMacro(): void {
    broadcastToFrames({ source: "ajam-time-macro", type: "AJAM_TIME_MACRO_STOP" });
  }

  function notifyMacroStarted(): void {
    postToTop({ source: "ajam-time-macro", type: "AJAM_TIME_MACRO_FRAME_STARTED" });
  }

  function requestDebuggerStop(): void {
    void chrome.runtime.sendMessage({ type: "STOP_AJAM_DEBUGGER_INPUT_MACRO" }).catch(() => undefined);
  }

  async function runDebuggerInputMacro(steps: MacroStep[], options: MacroRunOptions): Promise<void> {
    let response: DebuggerMacroResponse | undefined;

    try {
      response = await chrome.runtime.sendMessage<DebuggerMacroResponse>({
        options,
        steps,
        type: "RUN_AJAM_DEBUGGER_INPUT_MACRO"
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Debugger 입력 매크로를 실행하지 못했습니다.");
    }

    if (response?.ok) {
      return;
    }

    throw new Error(response?.error ?? "Debugger 입력 매크로를 실행하지 못했습니다.");
  }

  async function runDebuggerOnlyMacro(steps: MacroStep[], options: MacroRunOptions): Promise<void> {
    if (state.stopped) {
      throw new Error("사용자가 중지했습니다.");
    }

    state.running = true;

    try {
      await runDebuggerInputMacro(steps, options);
    } finally {
      state.running = false;
    }
  }

  async function waitForUserStart(steps: MacroStep[], options: MacroRunOptions): Promise<void> {
    if (state.running || state.waiting) {
      throw new Error("이미 시간 입력을 실행 중입니다.");
    }

    state.waiting = true;
    state.stopped = false;
    state.silentCancelWaiting = false;
    let cancelWaiting: (error?: Error) => void = () => undefined;
    const overlay = showWaitingOverlay({
      cancel: () => {
        cancelWaiting(new Error("사용자가 취소했습니다."));
      }
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      function cleanup(params: { removeOverlay: boolean }): void {
        document.removeEventListener("click", handleClick, true);
        state.cancelWaiting = undefined;
        state.waiting = false;

        if (params.removeOverlay) {
          overlay.remove();
        }
      }

      function cancel(error: Error): void {
        if (settled) {
          return;
        }

        settled = true;
        cleanup({ removeOverlay: true });
        reject(error);
      }

      function start(): void {
        if (settled) {
          return;
        }

        settled = true;
        notifyMacroStarted();
        cleanup({ removeOverlay: false });
        resolve();
      }

      function handleClick(event: MouseEvent): void {
        const overlayElement = document.querySelector("#ajam-time-macro-overlay");

        if (overlayElement instanceof HTMLElement && isElementInside(event.target, overlayElement)) {
          return;
        }

        if (!isMacroStartTarget(event.target)) {
          overlay.setMessage("시작할 시간 입력칸이나 시트 셀을 클릭해 주세요.");
          return;
        }

        void sleep(0).then(() => start());
      }

      cancelWaiting = (error?: Error) => cancel(error ?? new Error("사용자가 취소했습니다."));
      state.cancelWaiting = () => cancel(new Error("사용자가 취소했습니다."));
      document.addEventListener("click", handleClick, true);
    });

    const progressOverlay = overlay;
    state.progressOverlay = progressOverlay;
    cancelWaiting = () => {
      state.stopped = true;
      requestDebuggerStop();
    };
    state.cancelWaiting = () => {
      state.stopped = true;
      requestDebuggerStop();
    };
    progressOverlay.setMessage("클릭 위치에서 1초 후 시간 입력을 시작합니다.");
    await sleep(START_INPUT_DELAY_MS);
    progressOverlay.setProgress(0, steps.length);

    try {
      await runDebuggerOnlyMacro(steps, options);
      progressOverlay.setMessage("시간 입력이 완료되었습니다.");
      await sleep(1_000);
    } catch (error) {
      progressOverlay.setError(error instanceof Error ? error.message : "실행 실패");
      await sleep(3_000);
      throw error;
    } finally {
      state.progressOverlay = undefined;
      state.cancelWaiting = undefined;
      progressOverlay.remove();
    }
  }

  function runWaitingMacroFromFrame(steps: MacroStep[], options: MacroRunOptions): void {
    void waitForUserStart(steps, options)
      .then(() => {
        state.silentCancelWaiting = false;
        postToTop({ source: "ajam-time-macro", type: "AJAM_TIME_MACRO_FRAME_DONE" });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "실행 실패";

        if (state.silentCancelWaiting && message === "사용자가 취소했습니다.") {
          state.silentCancelWaiting = false;
          return;
        }

        state.silentCancelWaiting = false;
        postToTop({
          error: message,
          source: "ajam-time-macro",
          type: "AJAM_TIME_MACRO_FRAME_ERROR"
        });
      });
  }

  function coordinateWaitingMacro(steps: MacroStep[], options: MacroRunOptions): Promise<void> {
    if (!isTopFrame()) {
      return waitForUserStart(steps, options);
    }

    if (state.running || state.waiting) {
      throw new Error("이미 시간 입력을 실행 중입니다.");
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      function finish(error?: string): void {
        if (settled) {
          return;
        }

        settled = true;
        window.removeEventListener("message", handleFrameMessage);
        state.running = false;
        state.waiting = false;
        state.cancelWaiting = undefined;

        if (error) {
          reject(new Error(error));
          return;
        }

        resolve();
      }

      function handleFrameMessage(event: MessageEvent<AjamWindowMessage>): void {
        if (!event.data || event.data.source !== "ajam-time-macro") {
          return;
        }

        if (event.data.type === "AJAM_TIME_MACRO_FRAME_STARTED") {
          state.waiting = false;
          state.running = true;
          broadcastCancelWaiting();
          return;
        }

        if (event.data.type === "AJAM_TIME_MACRO_FRAME_DONE") {
          finish();
          return;
        }

        if (event.data.type === "AJAM_TIME_MACRO_FRAME_ERROR") {
          finish(event.data.error ?? "실행 실패");
        }
      }

      window.addEventListener("message", handleFrameMessage);
      broadcastToFrames({ options, source: "ajam-time-macro", steps, type: "AJAM_TIME_MACRO_START_WAITING" });
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_AJAM_TIME_MACRO_STATUS") {
      sendResponse({ ok: true, running: state.running, waiting: state.waiting });
      return false;
    }

    if (message?.type === "STOP_AJAM_TIME_MACRO") {
      state.stopped = true;
      state.cancelWaiting?.();
      requestDebuggerStop();
      broadcastStopMacro();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "AJAM_TIME_MACRO_PROGRESS") {
      if (typeof message.completed === "number" && typeof message.total === "number") {
        state.progressOverlay?.setProgress(message.completed, message.total);
      }

      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "WAIT_FOR_AJAM_TIME_MACRO_START") {
      try {
        const steps = parseSteps(message.steps);
        const options = parseOptions(message.options);

        void coordinateWaitingMacro(steps, options).catch(() => undefined);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ error: error instanceof Error ? error.message : "실행 실패", ok: false });
      }

      return false;
    }

    return false;
  });

  window.addEventListener("message", (event) => {
    if (!event.data || typeof event.data !== "object" || event.data.source !== "ajam-time-macro") {
      return;
    }

    if (event.data.type === "AJAM_TIME_MACRO_START_WAITING") {
      try {
        runWaitingMacroFromFrame(parseSteps(event.data.steps), parseOptions(event.data.options));
      } catch (error) {
        postToTop({
          error: error instanceof Error ? error.message : "실행 실패",
          source: "ajam-time-macro",
          type: "AJAM_TIME_MACRO_FRAME_ERROR"
        });
      }
    }

    if (event.data.type === "AJAM_TIME_MACRO_CANCEL_WAITING") {
      if (!state.waiting) {
        return;
      }

      state.silentCancelWaiting = true;
      state.cancelWaiting?.();
    }

    if (event.data.type === "AJAM_TIME_MACRO_STOP") {
      state.stopped = true;
      state.cancelWaiting?.();
      requestDebuggerStop();
    }

    if (event.data.type === "AJAM_TIME_MACRO_FRAME_STARTED") {
      broadcastCancelWaiting();
    }
  });
})();
