"use client";

import { useEffect, useRef, useState } from "react";

export type ViewRefreshScope = "ai-summary" | "notion-cards" | "projects" | "timesheet" | "vacations";
export type ViewRefreshReason = "manual" | "mutation";

type ViewRefreshRequestMessage = {
  kind: "request";
  reason: ViewRefreshReason;
  scope: ViewRefreshScope;
  senderId: string;
};

type ViewRefreshPayloadMessage = {
  kind: "payload";
  key: string;
  payload: unknown;
  scope: ViewRefreshScope;
  senderId: string;
};

type ViewRefreshMessage = ViewRefreshPayloadMessage | ViewRefreshRequestMessage;

const channelName = "ajam:view-refresh";
const eventName = "ajam:view-refresh";
const loadingEventName = "ajam:view-refresh-loading";

function createId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random()}`;
}

const tabId = createId("tab");

function getTabId(): string {
  return tabId;
}

function postToOtherTabs(message: ViewRefreshMessage) {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(channelName);
  channel.postMessage(message);
  channel.close();
}

function createRequestMessage(scope: ViewRefreshScope, reason: ViewRefreshReason): ViewRefreshRequestMessage {
  return {
    kind: "request",
    reason,
    scope,
    senderId: getTabId()
  };
}

function createPayloadMessage(scope: ViewRefreshScope, key: string, payload: unknown): ViewRefreshPayloadMessage {
  return {
    key,
    kind: "payload",
    payload,
    scope,
    senderId: getTabId()
  };
}

function setViewRefreshLoading(scope: ViewRefreshScope, loading: boolean) {
  window.dispatchEvent(new CustomEvent(loadingEventName, { detail: { loading, scope } }));
}

export function requestViewRefresh(scope: ViewRefreshScope) {
  if (typeof window === "undefined") {
    return;
  }

  const message = createRequestMessage(scope, "manual");
  window.dispatchEvent(new CustomEvent<ViewRefreshMessage>(eventName, { detail: message }));
}

export function broadcastViewRefresh(scopes: ViewRefreshScope | ViewRefreshScope[], reason: ViewRefreshReason = "mutation") {
  if (typeof window === "undefined") {
    return;
  }

  for (const scope of Array.isArray(scopes) ? scopes : [scopes]) {
    postToOtherTabs(createRequestMessage(scope, reason));
  }
}

function broadcastViewPayload(scope: ViewRefreshScope, key: string, payload: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  postToOtherTabs(createPayloadMessage(scope, key, payload));
}

export function useViewRefreshLoading(scope: ViewRefreshScope) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    function handleLoading(event: Event) {
      const detail = (event as CustomEvent<{ loading: boolean; scope: ViewRefreshScope }>).detail;

      if (detail.scope === scope) {
        setIsLoading(detail.loading);
      }
    }

    window.addEventListener(loadingEventName, handleLoading);
    return () => window.removeEventListener(loadingEventName, handleLoading);
  }, [scope]);

  return isLoading;
}

export function useSharedViewRefresh<T>(params: {
  apply: (payload: T) => void;
  getKey: () => string;
  load: () => Promise<T>;
  scope: ViewRefreshScope;
}) {
  const paramsRef = useRef(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tabId = getTabId();

    function handleMessage(message: ViewRefreshMessage, allowCurrentTab: boolean) {
      if (message.scope !== paramsRef.current.scope || (!allowCurrentTab && message.senderId === tabId)) {
        return;
      }

      if (message.kind === "payload") {
        if (message.key === paramsRef.current.getKey()) {
          paramsRef.current.apply(message.payload as T);
        }
        return;
      }

      if (!allowCurrentTab && message.reason === "manual") {
        return;
      }

      const { getKey, load, scope } = paramsRef.current;
      const requestKey = getKey();
      const showLoading = allowCurrentTab && message.reason === "manual";

      if (showLoading) {
        setViewRefreshLoading(scope, true);
      }

      void load().then((payload) => {
        if (paramsRef.current.getKey() === requestKey) {
          paramsRef.current.apply(payload);
        }

        if (message.reason === "manual") {
          broadcastViewPayload(scope, requestKey, payload);
        }
      }).catch(() => undefined).finally(() => {
        if (showLoading) {
          setViewRefreshLoading(scope, false);
        }
      });
    }

    function handleLocalEvent(event: Event) {
      handleMessage((event as CustomEvent<ViewRefreshMessage>).detail, true);
    }

    window.addEventListener(eventName, handleLocalEvent);

    if (typeof BroadcastChannel === "undefined") {
      return () => window.removeEventListener(eventName, handleLocalEvent);
    }

    const channel = new BroadcastChannel(channelName);
    channel.addEventListener("message", (event: MessageEvent<ViewRefreshMessage>) => handleMessage(event.data, false));

    return () => {
      window.removeEventListener(eventName, handleLocalEvent);
      channel.close();
    };
  }, []);
}
