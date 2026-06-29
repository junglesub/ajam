type ChromeExtensionMessage = {
  steps?: unknown;
  type?: string;
  [key: string]: unknown;
};

type ChromeExtensionMessageResponse = {
  completed?: number;
  error?: string;
  ok?: boolean;
  running?: boolean;
  total?: number;
  waiting?: boolean;
  [key: string]: unknown;
};

type ChromeExtensionMessageSender = {
  frameId?: number;
  tab?: { id?: number };
  [key: string]: unknown;
};

type ChromeDebuggerTarget = {
  tabId: number;
};

declare const chrome: {
  debugger: {
    attach(target: ChromeDebuggerTarget, requiredVersion: string): Promise<void>;
    detach(target: ChromeDebuggerTarget): Promise<void>;
    sendCommand(target: ChromeDebuggerTarget, method: string, commandParams?: Record<string, unknown>): Promise<unknown>;
  };
  runtime: {
    onMessage: {
      addListener(
        callback: (
          message: ChromeExtensionMessage,
          sender: ChromeExtensionMessageSender,
          sendResponse: (response?: ChromeExtensionMessageResponse) => void
        ) => boolean | void
      ): void;
    };
    sendMessage<TResponse = ChromeExtensionMessageResponse>(message: ChromeExtensionMessage): Promise<TResponse>;
  };
  permissions: {
    contains(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    request(permissions: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
  };
  scripting: {
    executeScript(options: { files: string[]; target: { allFrames?: boolean; tabId: number } }): Promise<unknown>;
  };
  storage: {
    local: {
      get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    create(options: { active?: boolean; url: string }): Promise<{ id?: number }>;
    getZoom(tabId: number): Promise<number>;
    query(options: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number }>>;
    remove(tabId: number): Promise<void>;
    sendMessage<TResponse = ChromeExtensionMessageResponse>(
      tabId: number,
      message: ChromeExtensionMessage,
      options?: { frameId?: number }
    ): Promise<TResponse>;
    setZoom(tabId: number, zoomFactor: number): Promise<void>;
  };
};
