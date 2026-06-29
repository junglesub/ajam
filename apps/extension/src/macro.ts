import type { MonthlyTimeMacroExport } from "./api.js";

export type MacroStep =
  | { categoryId: string; dateKey: string; type: "tab" }
  | { categoryId: string; dateKey: string; type: "type"; value: string };

type MacroRunResponse = {
  error?: string;
  ok?: boolean;
};

export type MacroRunOptions = {
  zoomOutBeforeMacro: boolean;
};

export function buildMacroSteps(data: MonthlyTimeMacroExport, categoryOrder: string[], activeCategoryIds?: string[]): MacroStep[] {
  const orderedIds = [...categoryOrder, ...data.categories.map((category) => category.id)].filter(
    (id, index, values) => values.indexOf(id) === index
  );
  const categoriesById = new Map(data.categories.map((category) => [category.id, category]));
  const activeCategoryIdSet = activeCategoryIds ? new Set(activeCategoryIds) : null;
  const categories = orderedIds
    .filter((categoryId) => !activeCategoryIdSet || activeCategoryIdSet.has(categoryId))
    .map((categoryId) => categoriesById.get(categoryId))
    .filter((category) => category !== undefined);
  const steps: MacroStep[] = [];

  for (const [categoryIndex, category] of categories.entries()) {
    const isLastCategory = categoryIndex === categories.length - 1;
    let lastDateKey: string | null = null;

    for (const [dayIndex, day] of category.days.entries()) {
      const isLastDay = dayIndex === category.days.length - 1;

      lastDateKey = day.dateKey;

      if (day.value) {
        steps.push({ categoryId: category.id, dateKey: day.dateKey, type: "type", value: day.value });
      }

      if (!isLastCategory || !isLastDay) {
        steps.push({ categoryId: category.id, dateKey: day.dateKey, type: "tab" });
      }
    }

    const boundaryDateKey = lastDateKey ?? `${data.month}-01`;

    if (!isLastCategory) {
      for (let index = 0; index < 4; index += 1) {
        steps.push({ categoryId: category.id, dateKey: boundaryDateKey, type: "tab" });
      }
    }
  }

  return steps;
}

export function buildContentMacroSteps(data: MonthlyTimeMacroExport, categoryId: string): MacroStep[] {
  const category = data.categories.find((candidate) => candidate.id === categoryId);
  const steps: MacroStep[] = [];

  if (!category) {
    return steps;
  }

  for (const day of category.days) {
    if (!day.value) {
      continue;
    }

    if (day.contentValue) {
      steps.push({ categoryId, dateKey: day.dateKey, type: "type", value: day.contentValue });
    }

    steps.push({ categoryId, dateKey: day.dateKey, type: "tab" }, { categoryId, dateKey: day.dateKey, type: "tab" });
  }

  return steps;
}

export async function runMacroInActiveTab(steps: MacroStep[], options: MacroRunOptions): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error("활성 탭을 찾을 수 없습니다.");
  }

  await chrome.scripting.executeScript({
    files: ["content-script.js"],
    target: { allFrames: true, tabId: tab.id }
  });

  const response = await chrome.tabs.sendMessage<MacroRunResponse>(tab.id, {
    options,
    steps,
    type: "WAIT_FOR_AJAM_TIME_MACRO_START"
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "시간 입력을 실행하지 못했습니다.");
  }
}
