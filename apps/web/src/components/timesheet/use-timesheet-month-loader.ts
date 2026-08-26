"use client";

import { useEffect, useState } from "react";

import type { VacationColor } from "@timesheet/domain";
import type { TimesheetMonthData } from "./timesheet-draft-utils";

export type MonthLoadState = "idle" | "loading" | "error";

export function getMonthCacheKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export type VisibleMonthLoadResult = {
  monthData: TimesheetMonthData;
  monthKey: string;
  monthIndex: number;
  year: number;
};

export type UseTimesheetMonthLoaderInput = {
  initialLoadedMonthKey: string;
  loadMonthAction: (year: number, monthIndex: number) => Promise<TimesheetMonthData>;
  monthIndex: number;
  onMonthDataLoaded: (result: VisibleMonthLoadResult) => void;
  vacationColorsByYear: Record<number, Record<string, VacationColor>>;
  year: number;
};

export function useTimesheetMonthLoader({
  initialLoadedMonthKey,
  loadMonthAction,
  monthIndex,
  onMonthDataLoaded,
  vacationColorsByYear,
  year
}: UseTimesheetMonthLoaderInput) {
  const [loadedMonthKeys, setLoadedMonthKeys] = useState(() => new Set([initialLoadedMonthKey]));
  const [monthLoadState, setMonthLoadState] = useState<MonthLoadState>("idle");
  const [monthLoadError, setMonthLoadError] = useState("");
  const [isInitialMonthSyncing, setIsInitialMonthSyncing] = useState(true);

  useEffect(() => {
    const monthKey = getMonthCacheKey(year, monthIndex);

    if (loadedMonthKeys.has(monthKey) && Boolean(vacationColorsByYear[year])) {
      setMonthLoadState("idle");
      setMonthLoadError("");
      setIsInitialMonthSyncing(false);
      return;
    }

    let isActive = true;

    async function loadMonth() {
      setMonthLoadState("loading");
      setMonthLoadError("");

      try {
        const monthData = await loadMonthAction(year, monthIndex);

        if (!isActive) {
          return;
        }

        onMonthDataLoaded({ monthData, monthKey, monthIndex, year });
        setLoadedMonthKeys((current) => new Set(current).add(monthKey));
        setMonthLoadState("idle");
        setIsInitialMonthSyncing(false);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMonthLoadState("error");
        setMonthLoadError(error instanceof Error ? error.message : "월 데이터를 불러오지 못했습니다.");
        setIsInitialMonthSyncing(false);
      }
    }

    void loadMonth();

    return () => {
      isActive = false;
    };
  }, [loadMonthAction, loadedMonthKeys, monthIndex, vacationColorsByYear, year]);

  function getVisibleMonthKey() {
    return getMonthCacheKey(year, monthIndex);
  }

  async function loadVisibleMonthData() {
    setMonthLoadState("loading");
    setMonthLoadError("");

    try {
      return await loadMonthAction(year, monthIndex);
    } catch (error) {
      setMonthLoadState("error");
      setMonthLoadError(error instanceof Error ? error.message : "월 데이터를 불러오지 못했습니다.");
      setIsInitialMonthSyncing(false);
      throw error;
    }
  }

  function isMonthLoaded(monthKey: string) {
    return loadedMonthKeys.has(monthKey);
  }

  function markMonthLoaded(monthKey: string) {
    setLoadedMonthKeys((current) => new Set(current).add(monthKey));
  }

  function replaceLoadedMonths(monthKey: string) {
    setLoadedMonthKeys(new Set([monthKey]));
  }

  function markMonthLoading(monthKey: string) {
    if (!loadedMonthKeys.has(monthKey)) {
      setMonthLoadState("loading");
      setMonthLoadError("");
    }
  }

  function markMonthIdle() {
    setMonthLoadState("idle");
  }

  function finishInitialSync() {
    setIsInitialMonthSyncing(false);
  }

  return {
    finishInitialSync,
    getVisibleMonthKey,
    isInitialMonthSyncing,
    isMonthLoaded,
    loadVisibleMonthData,
    markMonthIdle,
    markMonthLoaded,
    markMonthLoading,
    monthLoadError,
    monthLoadState,
    replaceLoadedMonths
  };
}
