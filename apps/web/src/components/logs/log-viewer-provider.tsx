"use client";

import type { UnreadLogSummary } from "@timesheet/db/operational-logs";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { getUnreadOperationLogsAction } from "@/app/(app)/logs/actions";
import { getLogPollInterval, shouldApplyLogResponse } from "@/lib/log-viewer-state";

type LogViewerContextValue = {
  modalOpen: boolean;
  notifyReadChanged: () => void;
  refresh: () => Promise<void>;
  setModalOpen: (open: boolean) => void;
  stale: boolean;
  status: "loading" | "settled";
  summary: UnreadLogSummary | null;
  userId: string;
};

const LogViewerContext = createContext<LogViewerContextValue>({
  modalOpen: false,
  notifyReadChanged: () => {},
  refresh: async () => {},
  setModalOpen: () => {},
  stale: false,
  status: "loading",
  summary: null,
  userId: ""
});

export function useLogViewer(): LogViewerContextValue {
  return useContext(LogViewerContext);
}

export function LogViewerProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<UnreadLogSummary | null>(null);
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState<"loading" | "settled">("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === "undefined" ? true : document.visibilityState === "visible");
  const requestIdRef = useRef(0);
  const appliedRef = useRef({ userId, requestId: 0 });
  const settledRef = useRef(false);
  const inFlightRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const fetchSummary = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    try {
      const result = await getUnreadOperationLogsAction();
      if (!shouldApplyLogResponse(appliedRef.current, { userId, requestId })) return;
      appliedRef.current = { userId, requestId };
      if (!result.ok) {
        if (result.code === "unauthenticated" || result.code === "forbidden") {
          setSummary(null);
          setStale(false);
        } else {
          setStale(true);
        }
        return;
      }
      if (result.viewerUserId !== userId) {
        setSummary(null);
        setStale(false);
        router.refresh();
        return;
      }
      setSummary(result.data);
      setStale(false);
    } catch {
      if (shouldApplyLogResponse(appliedRef.current, { userId, requestId })) {
        appliedRef.current = { userId, requestId };
        setStale(true);
      }
    } finally {
      inFlightRef.current = false;
      if (!settledRef.current) {
        settledRef.current = true;
        setStatus("settled");
      }
    }
  }, [router, userId]);

  useEffect(() => {
    appliedRef.current = { userId, requestId: 0 };
    settledRef.current = false;
    setSummary(null);
    setStale(false);
    setStatus("loading");
    void fetchSummary();
  }, [fetchSummary, userId]);

  useEffect(() => {
    function handleVisibility() {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (isVisible) void fetchSummary();
    }
    function handleFocus() {
      void fetchSummary();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchSummary]);

  useEffect(() => {
    const interval = getLogPollInterval(visible, modalOpen);
    if (interval === null) return;
    const timer = window.setInterval(() => {
      void fetchSummary();
    }, interval);
    return () => window.clearInterval(timer);
  }, [fetchSummary, modalOpen, visible]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`ajam:log-read:${userId}`);
    channelRef.current = channel;
    channel.onmessage = () => {
      void fetchSummary();
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [fetchSummary, userId]);

  const notifyReadChanged = useCallback(() => {
    try {
      channelRef.current?.postMessage({ type: "log-read-changed", at: Date.now() });
    } catch {
      // Channel failures fall back to polling.
    }
    void fetchSummary();
  }, [fetchSummary]);

  const refresh = useCallback(async () => {
    await fetchSummary();
  }, [fetchSummary]);

  const handleSetModalOpen = useCallback((open: boolean) => {
    setModalOpen(open);
  }, []);

  return (
    <LogViewerContext.Provider value={{ summary, stale, status, modalOpen, refresh, notifyReadChanged, setModalOpen: handleSetModalOpen, userId }}>
      {children}
    </LogViewerContext.Provider>
  );
}
