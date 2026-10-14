"use client";

import type { StoredLogLevel, VisibleOperationLog } from "@timesheet/db/operational-logs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  getOperationLogDetailAction,
  listOperationLogsAction,
  markAllOperationLogsReadAction,
  markOperationLogReadAction
} from "@/app/(app)/logs/actions";
import { useLogViewer } from "@/components/logs/log-viewer-provider";
import { isStaleStamp, resolveTabForRole, type ViewerStamp } from "@/lib/log-viewer-guards";
import { formatLogSummary } from "@/lib/log-presentation";

type Tab = "mine" | "site";

const COMPONENT_OPTIONS = ["", "notion", "ai", "timesheet", "holiday", "auth", "http", "server", "db"];
const COMPONENT_LABELS: Record<string, string> = {
  "": "전체 기능",
  ai: "AI",
  auth: "인증",
  db: "DB",
  holiday: "공휴일",
  http: "HTTP",
  notion: "Notion",
  server: "서버",
  timesheet: "업무 기록"
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", { hour12: false });
  } catch {
    return iso;
  }
}

function formatMetadataValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "예" : "아니요";
  return String(value);
}

export function LogViewerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { notifyReadChanged, setModalOpen, stale, summary, userId: expectedUserId } = useLogViewer();
  const [tab, setTab] = useState<Tab>("mine");
  const [levels, setLevels] = useState<StoredLogLevel[]>([]);
  const [component, setComponent] = useState("");
  const [periodDays, setPeriodDays] = useState<1 | 7 | 30>(7);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<VisibleOperationLog[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<VisibleOperationLog | null>(null);
  const [related, setRelated] = useState<VisibleOperationLog[]>([]);
  const [relatedCursor, setRelatedCursor] = useState<number | null>(null);
  const [detailError, setDetailError] = useState("");
  const [readError, setReadError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [listReady, setListReady] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listSeqRef = useRef(0);
  const detailSeqRef = useRef(0);
  const selectedIdRef = useRef<number | null>(null);
  const userIdRef = useRef(expectedUserId);
  const canViewSite = summary?.canViewSite ?? false;

  function currentListStamp(): ViewerStamp {
    return { userId: expectedUserId, generation: listSeqRef.current };
  }

  function currentDetailStamp(): ViewerStamp {
    return { userId: expectedUserId, generation: detailSeqRef.current };
  }

  function invalidateDetailChannel(): void {
    detailSeqRef.current += 1;
    selectedIdRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setRelated([]);
    setRelatedCursor(null);
    setDetailError("");
  }

  useEffect(() => {
    setModalOpen(true);
    return () => {
      // Late responses after unmount must find a moved generation.
      listSeqRef.current += 1;
      detailSeqRef.current += 1;
      selectedIdRef.current = null;
      setModalOpen(false);
    };
  }, [setModalOpen]);

  // Restore focus to whatever opened the popup when it unmounts.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      try {
        previouslyFocused?.focus?.();
      } catch {
        // Focus restore is best-effort.
      }
    };
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current?.contains(document.activeElement)) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Every action result carries the server-resolved viewer. A mismatch means
  // the login changed under us: drop all cached logs and reload identity.
  const handleIdentityMismatch = useCallback(() => {
    selectedIdRef.current = null;
    setItems([]);
    setDetail(null);
    setRelated([]);
    setSelectedId(null);
    setCursor(null);
    setSnapshot(0);
    router.refresh();
  }, [router]);

  const checkViewer = useCallback((result: { ok: boolean; viewerUserId?: string }): boolean => {
    if (result.ok && result.viewerUserId !== expectedUserId) {
      handleIdentityMismatch();
      return false;
    }
    return true;
  }, [expectedUserId, handleIdentityMismatch]);

  // Role revocation while open: leave the site tab and drop its cache.
  useEffect(() => {
    const nextTab = resolveTabForRole(canViewSite, tab);
    if (nextTab !== tab) {
      invalidateDetailChannel();
      setTab(nextTab);
      setItems([]);
      setCursor(null);
      setSnapshot(0);
      setHasNewer(false);
      setListReady(false);
    }
  }, [canViewSite, tab]);

  const loadList = useCallback(async (options: { append?: boolean; cursor?: number } = {}) => {
    const stamp: ViewerStamp = { userId: expectedUserId, generation: ++listSeqRef.current };
    const activeLevels = levels.length > 0 ? levels : tab === "site" ? (["warn", "error"] as StoredLogLevel[]) : undefined;
    if (!options.append) {
      setLoading(true);
      setError("");
    } else {
      setLoadingMore(true);
    }
    try {
      const result = await listOperationLogsAction({
        scope: tab,
        periodDays,
        ...(activeLevels ? { levels: activeLevels } : {}),
        ...(component ? { component } : {}),
        ...(unreadOnly ? { unreadOnly } : {}),
        ...(options.cursor ? { beforeId: options.cursor } : {})
      });
      // A tab/filter/identity change since the request started makes this stale.
      if (isStaleStamp(currentListStamp(), stamp)) return;
      if (!checkViewer(result)) return;
      if (!result.ok) {
        if (result.code === "forbidden") {
          invalidateDetailChannel();
          setTab("mine");
          setItems([]);
          setDetail(null);
          setRelated([]);
          setSelectedId(null);
          setCursor(null);
          setSnapshot(0);
          setError("사이트 오류를 볼 권한이 없습니다.");
        } else if (result.code === "unauthenticated") {
          setItems([]);
          setError("세션이 만료됐습니다. 다시 로그인해 주세요.");
        } else {
          setError("로그를 불러오지 못했습니다. 다시 시도해 주세요.");
        }
        return;
      }
      if (options.append) {
        setItems((current) => [...current, ...result.data.items]);
      } else {
        setItems(result.data.items);
        // Snapshot stays pinned to the first page; "more" never moves it.
        setSnapshot(result.data.snapshotMaxId);
        setListReady(true);
      }
      setCursor(result.data.nextCursor);
    } catch {
      if (isStaleStamp(currentListStamp(), stamp)) return;
      setError("로그를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (!isStaleStamp(currentListStamp(), stamp)) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [checkViewer, component, expectedUserId, levels, periodDays, tab, unreadOnly]);

  // The current user changed: drop the previous identity's entire cache.
  // loadList is recreated through checkViewer, so the effect below reloads.
  useEffect(() => {
    if (userIdRef.current === expectedUserId) return;
    userIdRef.current = expectedUserId;
    listSeqRef.current += 1;
    invalidateDetailChannel();
    setItems([]);
    setCursor(null);
    setSnapshot(0);
    setHasNewer(false);
    setListReady(false);
    setError("");
  }, [expectedUserId]);

  useEffect(() => {
    invalidateDetailChannel();
    setListReady(false);
    void loadList();
  }, [loadList]);

  // Any log newer than the list snapshot (any level, including the first log
  // on an empty list) shows a notice instead of swapping the visible list.
  useEffect(() => {
    if (summary === null || !listReady) return;
    const newest = tab === "site" ? summary.siteMaxId : summary.mineMaxId;
    if (newest > snapshot) setHasNewer(true);
  }, [summary, snapshot, tab, listReady]);

  async function openDetail(id: number) {
    const stamp: ViewerStamp = { userId: expectedUserId, generation: ++detailSeqRef.current };
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setRelated([]);
    setRelatedCursor(null);
    setDetailError("");
    setReadError("");
    try {
      const result = await getOperationLogDetailAction(id);
      if (isStaleStamp(currentDetailStamp(), stamp) || id !== selectedIdRef.current) return;
      if (!checkViewer(result)) return;
      if (!result.ok) {
        setDetailError("상세를 불러오지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      setDetail(result.data.item);
      setRelated(result.data.related.items);
      setRelatedCursor(result.data.related.nextCursor);
      if (result.data.item.unread) {
        await persistDetailRead(id, stamp);
      }
    } catch {
      if (isStaleStamp(currentDetailStamp(), stamp)) return;
      setDetailError("상세를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function persistDetailRead(id: number, stamp?: ViewerStamp) {
    setReadError("");
    try {
      const mark = await markOperationLogReadAction(id);
      if (stamp && isStaleStamp(currentDetailStamp(), stamp)) return;
      if (id !== selectedIdRef.current) return;
      if (!checkViewer(mark)) return;
      if (!mark.ok) {
        setReadError("읽음 저장에 실패했습니다. 다시 시도해 주세요.");
      } else {
        setItems((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item));
        setDetail((current) => current && current.id === id ? { ...current, unread: false } : current);
        notifyReadChanged();
      }
    } catch {
      if (stamp && isStaleStamp(currentDetailStamp(), stamp)) return;
      setReadError("읽음 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  async function loadMoreRelated() {
    if (!selectedId || !relatedCursor) return;
    const stamp: ViewerStamp = { userId: expectedUserId, generation: detailSeqRef.current };
    try {
      const result = await getOperationLogDetailAction(selectedId, relatedCursor);
      if (isStaleStamp(currentDetailStamp(), stamp)) return;
      if (!checkViewer(result)) return;
      if (!result.ok) return;
      setRelated((current) => [...current, ...result.data.related.items]);
      setRelatedCursor(result.data.related.nextCursor);
    } catch {
      // Related pagination failures keep the loaded items.
    }
  }

  async function markAll() {
    setMarkingAll(true);
    setReadError("");
    const stamp: ViewerStamp = { userId: expectedUserId, generation: listSeqRef.current };
    try {
      const result = await markAllOperationLogsReadAction(tab, snapshot);
      if (isStaleStamp(currentListStamp(), stamp)) return;
      if (!checkViewer(result)) return;
      if (!result.ok) {
        setReadError("모두 읽음에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setItems((current) => current.map((item) => ({ ...item, unread: false })));
      notifyReadChanged();
    } catch {
      if (isStaleStamp(currentListStamp(), stamp)) return;
      setReadError("모두 읽음에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!isStaleStamp(currentListStamp(), stamp)) setMarkingAll(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6" onClick={onClose} role="presentation">
      <div
        aria-modal="true"
        aria-labelledby="log-viewer-title"
        className="flex max-h-[86vh] w-full max-w-2xl flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-950" id="log-viewer-title">로그 확인</h2>
          <button
            aria-label="로그 닫기"
            className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex gap-2" role="tablist">
          <button
            aria-selected={tab === "mine"}
            className={`rounded-md px-3 py-1.5 text-sm font-bold ${tab === "mine" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
            onClick={() => setTab("mine")}
            role="tab"
            type="button"
          >
            내 로그
          </button>
          {canViewSite ? (
            <button
              aria-selected={tab === "site"}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${tab === "site" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
              onClick={() => setTab("site")}
              role="tab"
              type="button"
            >
              사이트 오류
            </button>
          ) : null}
          <div className="ml-auto">
            <button
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
              disabled={markingAll || items.length === 0}
              onClick={() => void markAll()}
              type="button"
            >
              {markingAll ? "처리 중" : "모두 읽음"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <select aria-label="수준" className="h-9 rounded-md border border-slate-200 bg-white px-2 font-semibold" onChange={(event) => setLevels(event.target.value ? [event.target.value as StoredLogLevel] : [])} value={levels[0] ?? ""}>
            <option value="">{tab === "site" ? "경고·오류" : "모든 수준"}</option>
            <option value="info">정보</option>
            <option value="warn">경고</option>
            <option value="error">오류</option>
          </select>
          <select aria-label="기능" className="h-9 rounded-md border border-slate-200 bg-white px-2 font-semibold" onChange={(event) => setComponent(event.target.value)} value={component}>
            {COMPONENT_OPTIONS.map((option) => <option key={option} value={option}>{COMPONENT_LABELS[option]}</option>)}
          </select>
          <select aria-label="기간" className="h-9 rounded-md border border-slate-200 bg-white px-2 font-semibold" onChange={(event) => setPeriodDays(Number(event.target.value) as 1 | 7 | 30)} value={periodDays}>
            <option value={1}>최근 24시간</option>
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
          </select>
          <label className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
            <input checked={unreadOnly} className="size-4 accent-slate-950" onChange={(event) => setUnreadOnly(event.target.checked)} type="checkbox" />
            미읽음만
          </label>
        </div>

        {readError ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-sm font-semibold text-red-600">{readError}</p>
            {selectedId && detail ? (
              <button className="text-sm font-bold text-slate-950 underline" onClick={() => void persistDetailRead(selectedId)} type="button">다시 시도</button>
            ) : null}
          </div>
        ) : null}
        {stale ? (
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600" role="status">
            연결 상태를 확인하지 못했습니다. 마지막으로 확인된 목록입니다.
          </p>
        ) : null}
        {hasNewer ? (
          <button
            className="mt-2 w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 transition hover:border-amber-300"
            onClick={() => {
              setHasNewer(false);
              void loadList();
            }}
            type="button"
          >
            새 로그 있음 · 다시 불러오기
          </button>
        ) : null}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm font-semibold text-slate-500">불러오는 중입니다.</p>
          ) : error && items.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-semibold text-slate-500">{error}</p>
              <button className="mt-2 text-sm font-bold text-slate-950 underline" onClick={() => void loadList()} type="button">다시 시도</button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm font-semibold text-slate-500">표시할 로그가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id}>
                  <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50" onClick={() => void openDetail(item.id)} type="button">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${item.level === "error" ? "bg-red-100 text-red-700" : item.level === "warn" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                      {item.level === "error" ? "오류" : item.level === "warn" ? "경고" : "정보"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{formatLogSummary(item)}</span>
                      <span className="block text-xs font-medium text-slate-500">{formatTime(item.timestamp)}</span>
                    </span>
                    {item.unread ? <span aria-label="미읽음" className="size-2 shrink-0 rounded-full bg-slate-950" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cursor ? (
          <button className="mt-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 disabled:opacity-50" disabled={loadingMore} onClick={() => void loadList({ append: true, cursor })} type="button">
            {loadingMore ? "불러오는 중" : "더 보기"}
          </button>
        ) : null}
        {error && items.length > 0 ? <p className="mt-2 text-sm font-semibold text-red-600">{error}</p> : null}

        {selectedId ? (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
            {detailError ? (
              <div>
                <p className="text-sm font-semibold text-red-600">{detailError}</p>
                <button className="mt-1 text-sm font-bold text-slate-950 underline" onClick={() => void openDetail(selectedId)} type="button">다시 시도</button>
              </div>
            ) : !detail ? (
              <p className="text-sm font-semibold text-slate-500">상세를 불러오는 중입니다.</p>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-950">{formatLogSummary(detail)}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
                  <div><dt className="inline font-bold">시각 </dt><dd className="inline">{formatTime(detail.timestamp)}</dd></div>
                  <div><dt className="inline font-bold">작업 ID </dt><dd className="inline break-all">{detail.operationId}</dd></div>
                  {detail.dateKey ? <div><dt className="inline font-bold">업무 날짜 </dt><dd className="inline">{detail.dateKey}</dd></div> : null}
                  <div><dt className="inline font-bold">소요 시간 </dt><dd className="inline">{detail.durationMs}ms</dd></div>
                  {Object.entries(detail.metadata).map(([key, value]) => (
                    <div key={key}><dt className="inline font-bold">{key} </dt><dd className="inline break-all">{formatMetadataValue(value)}</dd></div>
                  ))}
                </dl>
                {related.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                    {related.map((entry) => (
                      <li className="text-xs font-medium text-slate-600" key={entry.id}>{formatTime(entry.timestamp)} · {formatLogSummary(entry)}</li>
                    ))}
                  </ul>
                ) : null}
                {relatedCursor ? (
                  <button className="mt-2 text-xs font-bold text-slate-950 underline" onClick={() => void loadMoreRelated()} type="button">관련 로그 더 보기</button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
