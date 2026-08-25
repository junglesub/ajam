"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChangeEvent, MouseEvent, RefObject } from "react";

import { formatKoreanDate, type NotionCardWorkDateRange, type TimesheetDayDraft, type TimesheetEntryDraft, type VacationStatus, type WorkRecordKind } from "@timesheet/domain";
import { Badge, Button, Input, SegmentedControl, Textarea, cn } from "@timesheet/ui";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, GripVertical, LoaderCircle, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { NotionCardLinkSection } from "./notion-card-link-section";
import { effectiveEntryHours, entryHasNotionCardWarning, entryKindLabel, entryKindTone, entryTitle } from "./timesheet-entry-display";
import { NotionCardWarningIcon, truncateContent } from "./timesheet-row-display";
import { addBusinessDays } from "./timesheet-date-utils";
import { Field, ShortcutHint } from "./timesheet-ui-primitives";
import { WeekendRelaxView } from "./weekend-relax-view";
import type { NotionCardCandidate } from "./use-notion-card-candidates";

type DailyEditorSaveAction = {
  label: string;
  status: VacationStatus;
  variant: "primary" | "secondary" | "ghost";
};

type DailyEditorProps = {
  ai: {
    cleanupMessage: string;
    cleanupState: "done" | "error" | "idle" | "running" | "skipped";
    isCleanupStatusVisible: boolean;
    isScheduledCleanupPending: boolean;
  };
  day: {
    dateKey: string;
    draft: TimesheetDayDraft;
    editorKind: WorkRecordKind;
    hasWork: boolean;
    isFutureWork: boolean;
    isHoliday: boolean;
    isSingleVacation: boolean;
    isViewingToday: boolean;
    isWeekend: boolean;
    kindOptions: Array<{ label: string; value: WorkRecordKind }>;
    selectedEntry: TimesheetEntryDraft | undefined;
    totalHours: number;
  };
  editing: {
    isProjectRecommendationLoading: boolean;
    newProjectOptionValue: string;
    onAiTranslationChange: (value: string) => void;
    onContentChange: (value: string) => void;
    onHolidayNameChange: (holidayName: string) => void;
    onHoursChange: (hours: number) => void;
    onKindChange: (kind: WorkRecordKind) => void;
    onProjectChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onSelectedEntryChange: (patch: Partial<TimesheetEntryDraft>) => void;
    onShortVersionChange: (value: string) => void;
    projects: string[];
  };
  entryList: {
    onAddEntry: (kind: WorkRecordKind) => void;
    onDragEnd: (event: DragEndEvent) => void;
    onMoveEntry: (clientId: string, direction: -1 | 1) => void;
    onRemoveEntry: (clientId: string) => void;
    onSelectEntry: (clientId: string) => void;
  };
  navigation: {
    closeButtonRef: RefObject<HTMLButtonElement | null>;
    editorRef: RefObject<HTMLElement | null>;
    isActive: boolean;
    isMonthLoading: boolean;
    isRequested: boolean;
    onClose: () => void;
    onFocusCapture: () => void;
    onGoToday: () => void;
    onSelectDate: (dateKey: string) => void;
    showCloseButton: boolean;
  };
  notion: {
    allocationError: string;
    candidates: NotionCardCandidate[];
    cardDateRanges: Map<string, NotionCardWorkDateRange>;
    isRecommendationLoading: boolean;
    onAllocatedHoursChange: (notionPageId: string, allocatedHours: number) => void;
    onOpenPicker: () => void;
    onRemoveCard: (notionPageId: string) => void;
    onResetAutoAllocation: () => void;
  };
  persistence: {
    canDelete: boolean;
    deleteError: string;
    deleteState: "deleting" | "error" | "idle";
    isSaveDisabled: boolean;
    onSave: (event: MouseEvent<HTMLButtonElement>) => void;
    onSaveWithVacationAction: (action: DailyEditorSaveAction) => void;
    onRequestDelete: () => void;
    primaryVacationSaveAction: DailyEditorSaveAction | undefined;
    saveError: string;
    saveState: "error" | "idle" | "saved" | "saving";
    secondaryVacationSaveActions: DailyEditorSaveAction[];
    shortcutModifierKey: string;
  };
  vacation: {
    isRangeSaving: boolean;
    onOpenRangeModal: () => void;
  };
};

export function DailyEditor({
  ai,
  day,
  editing,
  entryList,
  navigation,
  notion,
  persistence,
  vacation
}: DailyEditorProps) {
  const entryDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );
  const primaryVacationSaveAction = persistence.primaryVacationSaveAction;

  return (
    <>
      <div
        className={cn(
          navigation.isRequested
            ? "fixed inset-0 z-40 flex items-end justify-center bg-slate-950/35 sm:px-4 sm:py-6 lg:sticky lg:top-4 lg:block lg:self-start lg:bg-transparent lg:p-0"
            : "hidden lg:sticky lg:top-4 lg:block lg:self-start"
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && navigation.isActive) {
            navigation.onClose();
          }
        }}
        role="presentation"
      >
        <aside
          aria-labelledby={navigation.isActive ? "daily-editor-title" : undefined}
          aria-modal={navigation.isActive ? "true" : undefined}
          className="max-h-[92dvh] w-full overflow-y-auto rounded-t-xl border border-slate-200 bg-white shadow-2xl outline-none sm:max-w-2xl sm:rounded-xl lg:max-h-[calc(100vh-2rem)] lg:max-w-none lg:overflow-y-auto lg:rounded-lg lg:shadow-sm"
          data-calendar-shortcuts-ignore
          onFocusCapture={navigation.onFocusCapture}
          ref={navigation.editorRef}
          role={navigation.isActive ? "dialog" : undefined}
          tabIndex={navigation.isActive ? -1 : undefined}
        >
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white px-5 py-4 lg:static">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  aria-label="이전 날짜"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 lg:hidden"
                  disabled={navigation.isMonthLoading}
                  onClick={() => navigation.onSelectDate(addBusinessDays(day.dateKey, -1))}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
                <h2 className="truncate text-lg font-bold text-slate-950 sm:text-xl lg:mt-1 lg:text-2xl" id="daily-editor-title">{formatKoreanDate(day.dateKey)}</h2>
                <button
                  aria-label="다음 날짜"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 lg:hidden"
                  disabled={navigation.isMonthLoading}
                  onClick={() => navigation.onSelectDate(addBusinessDays(day.dateKey, 1))}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {!day.isViewingToday && !navigation.isActive ? (
                  <Button disabled={navigation.isMonthLoading} onClick={navigation.onGoToday} variant="secondary">
                    <RotateCcw aria-hidden="true" className="size-4" />
                    오늘로 돌아가기
                  </Button>
                ) : null}
                {navigation.showCloseButton ? (
                  <button
                    aria-label="날짜 상세 닫기"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
                    onClick={navigation.onClose}
                    ref={navigation.closeButtonRef}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {day.isWeekend ? (
            <WeekendRelaxView
              dateKey={day.dateKey}
              onNavigateNextBusinessDay={() => navigation.onSelectDate(addBusinessDays(day.dateKey, 1))}
              onNavigatePreviousBusinessDay={() => navigation.onSelectDate(addBusinessDays(day.dateKey, -1))}
            />
          ) : (
            <div className={cn("space-y-5 p-5", day.isFutureWork && "opacity-70")}>
              {day.hasWork ? (
                <Field label="짧은 버전">
                  <Input disabled={day.isFutureWork} onChange={(event) => editing.onShortVersionChange(event.target.value)} placeholder="월간 캘린더에 표시할 한 줄 요약" value={day.draft.shortVersion} />
                </Field>
              ) : null}

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-base font-bold", day.totalHours > 8 ? "text-red-600" : "text-slate-950")}>{day.totalHours}h</span>
                    <span className="text-xs font-medium text-slate-400">업무시간</span>
                  </div>
                  <div className="flex gap-2">
                    <Button className="h-9 px-3" disabled={day.isFutureWork} onClick={() => entryList.onAddEntry(day.editorKind)} type="button" variant="secondary">
                      <Plus aria-hidden="true" className="size-4" />
                      추가
                    </Button>
                  </div>
                </div>
                {day.totalHours > 8 ? <p className="mt-2 text-sm font-semibold text-red-600">하루 합계가 8시간을 초과했습니다.</p> : null}
              </div>

              <div className="space-y-2">
                <SegmentedControl items={day.kindOptions} onChange={editing.onKindChange} value={day.editorKind} />
              </div>

              {day.draft.entries.length > 1 ? (
                <DndContext collisionDetection={closestCenter} onDragEnd={entryList.onDragEnd} sensors={entryDragSensors}>
                  <SortableContext items={day.draft.entries.map((entry) => entry.clientId)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {day.draft.entries.map((entry, index) => (
                        <SortableEntryItem
                          entry={entry}
                          index={index}
                          isSelected={entry.clientId === day.selectedEntry?.clientId}
                          key={entry.clientId}
                          notionCardWarning={entryHasNotionCardWarning(entry, true)}
                          onMoveDown={() => entryList.onMoveEntry(entry.clientId, 1)}
                          onMoveUp={() => entryList.onMoveEntry(entry.clientId, -1)}
                          onRemove={() => entryList.onRemoveEntry(entry.clientId)}
                          onSelect={() => entryList.onSelectEntry(entry.clientId)}
                          totalCount={day.draft.entries.length}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : null}
              {day.draft.entries.length === 0 && !day.isHoliday ? <p className="rounded-md border border-dashed border-slate-200 px-3 py-5 text-center text-sm font-medium text-slate-500">등록된 업무나 휴가가 없습니다.</p> : null}

              {day.isHoliday ? (
                <Field label="공휴일명">
                  <Input disabled={day.isFutureWork} onChange={(event) => editing.onHolidayNameChange(event.target.value)} placeholder="예: 어린이날" value={day.selectedEntry?.kind === "HOLIDAY" ? day.selectedEntry.holidayName : day.draft.holidayName} />
                </Field>
              ) : day.selectedEntry ? (
                day.selectedEntry.kind === "WORK" ? (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
                      <Field label="진행한 프로젝트">
                        <div className="relative">
                          <select
                            aria-busy={editing.isProjectRecommendationLoading}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                            disabled={day.isFutureWork}
                            onChange={editing.onProjectChange}
                            value={day.selectedEntry.project}
                          >
                            <option value="">프로젝트 선택</option>
                            {editing.projects.map((project) => (
                              <option key={project} value={project}>
                                {project}
                              </option>
                            ))}
                            <option value={editing.newProjectOptionValue}>새 프로젝트 등록...</option>
                          </select>
                          {editing.isProjectRecommendationLoading ? (
                            <span className="pointer-events-none absolute right-8 top-1/2 inline-flex -translate-y-1/2 text-slate-400" role="status">
                              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                              <span className="sr-only">이전 프로젝트 불러오는 중</span>
                            </span>
                          ) : null}
                        </div>
                      </Field>

                      <Field label="일한 시간">
                        <Input disabled={day.isFutureWork} max={24} min={0} onChange={(event) => editing.onHoursChange(Number(event.target.value))} step={0.5} type="number" value={day.selectedEntry.hours} />
                      </Field>
                    </div>

                    <Field label="내용">
                      <Textarea disabled={day.isFutureWork} onChange={(event) => editing.onContentChange(event.target.value)} placeholder="오늘 진행한 일을 간단히 적어주세요." rows={5} value={day.selectedEntry.content} />
                    </Field>

                    <Field label="영문 번역본">
                      <Textarea disabled={day.isFutureWork} onChange={(event) => editing.onAiTranslationChange(event.target.value)} placeholder="오늘 진행한 일을 영어로 간단히 적어주세요." rows={4} value={day.selectedEntry.aiTranslation} />
                    </Field>

                    <NotionCardLinkSection
                      allocationError={notion.allocationError}
                      candidates={notion.candidates}
                      cardDateRanges={notion.cardDateRanges}
                      disabled={day.isFutureWork}
                      entry={day.selectedEntry}
                      isAutoLoading={notion.isRecommendationLoading}
                      selectedDateKey={day.dateKey}
                      onAllocatedHoursChange={notion.onAllocatedHoursChange}
                      onOpenPicker={notion.onOpenPicker}
                      onRemoveCard={notion.onRemoveCard}
                      onResetAutoAllocation={notion.onResetAutoAllocation}
                    />
                  </>
                ) : day.selectedEntry.kind === "VACATION" ? (
                  <>
                    <Field label="휴가 유형">
                      <Input disabled={day.isFutureWork} onChange={(event) => editing.onSelectedEntryChange({ vacationName: event.target.value })} placeholder="예: 연차, 오전 반차" value={day.selectedEntry.vacationName} />
                    </Field>
                    <Field label="휴가 시간">
                      <Input disabled={day.isFutureWork} max={24} min={0} onChange={(event) => editing.onSelectedEntryChange({ hours: Number(event.target.value) })} step={0.5} type="number" value={day.selectedEntry.hours} />
                    </Field>
                  </>
                ) : null
              ) : null}

              <div className="sticky bottom-0 z-20 -mx-5 -mb-5 border-t border-slate-100 bg-white px-5 pb-5 pt-4 shadow-[0_-8px_20px_-16px_rgba(15,23,42,0.45)] lg:static lg:mx-0 lg:mb-0 lg:px-0 lg:pb-0 lg:pt-5 lg:shadow-none">
                {ai.isScheduledCleanupPending ? (
                  <p className="mb-3 inline-flex w-full items-center justify-end gap-1 text-right text-xs font-semibold leading-5 text-amber-700">
                    <span>AI 예약 정리 대기 ·</span>
                    <ShortcutHint keys={[persistence.shortcutModifierKey]} />
                    <span>저장 클릭으로 즉시 정리</span>
                  </p>
                ) : null}
                {day.isSingleVacation ? (
                  <div className="mb-3 flex justify-end">
                    <button
                      className="text-sm font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-950 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
                      disabled={persistence.saveState === "saving" || persistence.deleteState === "deleting" || vacation.isRangeSaving}
                      onClick={vacation.onOpenRangeModal}
                      type="button"
                    >
                      기간 설정
                    </button>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    {persistence.canDelete ? (
                      <button
                        className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 underline-offset-4 transition hover:text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-red-300"
                        disabled={persistence.deleteState === "deleting"}
                        onClick={persistence.onRequestDelete}
                        type="button"
                      >
                        {persistence.deleteState === "deleting" ? "삭제 중" : "삭제"}
                        <ShortcutHint keys={["Del"]} />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("text-sm font-medium", persistence.saveState === "error" || persistence.deleteState === "error" ? "text-red-600" : "text-slate-500")}>
                        {persistence.deleteState === "error" ? persistence.deleteError : persistence.saveState === "saved" ? "저장됨" : persistence.saveState === "saving" ? "저장 중" : persistence.saveError}
                      </p>
                    </div>
                    {day.selectedEntry?.kind === "VACATION" ? (
                      <>
                        {persistence.secondaryVacationSaveActions.map((action) => (
                          <Button
                            className={cn("h-10", action.variant === "ghost" ? "px-2" : "px-4")}
                            disabled={persistence.isSaveDisabled}
                            key={action.status}
                            onClick={() => persistence.onSaveWithVacationAction(action)}
                            type="button"
                            variant={action.variant}
                          >
                            {action.label}
                          </Button>
                        ))}
                        {primaryVacationSaveAction ? (
                          <Button className="h-10 px-4" disabled={persistence.isSaveDisabled} onClick={() => persistence.onSaveWithVacationAction(primaryVacationSaveAction)} type="button">
                            {persistence.saveState === "saving" ? "저장 중" : primaryVacationSaveAction.label}
                            <ShortcutHint keys={[persistence.shortcutModifierKey, "↵"]} />
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <Button className="h-10 px-4" disabled={persistence.isSaveDisabled} onClick={persistence.onSave}>
                        {persistence.saveState === "saving" ? "저장 중" : "저장"}
                        <ShortcutHint keys={[persistence.shortcutModifierKey, "↵"]} />
                      </Button>
                    )}
                  </div>
                </div>
                {ai.isCleanupStatusVisible ? (
                  <p className={cn("mt-2 text-right text-xs font-semibold leading-5", ai.cleanupState === "error" ? "text-red-600" : ai.cleanupState === "running" ? "text-slate-700" : "text-emerald-700")}>
                    {ai.cleanupState === "running" ? "AI 정리 중" : ai.cleanupMessage}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {!day.isWeekend && day.isFutureWork ? (
            <div className="mx-5 mb-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-500">
              미래 날짜는 아직 작성하지 않습니다.
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function entryContentPreview(entry: TimesheetEntryDraft): string {
  return truncateContent(entry.content);
}

function SortableEntryItem({
  entry,
  index,
  isSelected,
  notionCardWarning,
  onMoveDown,
  onMoveUp,
  onRemove,
  onSelect,
  totalCount
}: {
  entry: TimesheetEntryDraft;
  index: number;
  isSelected: boolean;
  notionCardWarning: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
  onSelect: () => void;
  totalCount: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: entry.clientId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      className={cn("rounded-md border bg-white p-3 shadow-sm transition", isSelected ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200")}
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-start gap-2">
        <button className="mt-0.5 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" type="button" {...attributes} {...listeners}>
          <GripVertical aria-hidden="true" className="size-4" />
          <span className="sr-only">순서 변경</span>
        </button>
        <button className="block min-w-0 flex-1 rounded-sm text-left" onClick={onSelect} type="button">
          <div className="flex items-center gap-2">
            <Badge tone={entryKindTone(entry)}>{entryKindLabel(entry)}</Badge>
            <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{entryTitle(entry)}</span>
            <span className="text-sm font-bold text-slate-950">{effectiveEntryHours(entry)}h</span>
            {notionCardWarning ? <NotionCardWarningIcon /> : null}
          </div>
          {entry.kind === "WORK" && entryContentPreview(entry) ? <p className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-slate-500">{entryContentPreview(entry)}</p> : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={index === 0} onClick={onMoveUp} type="button">
            <ArrowUp aria-hidden="true" className="size-4" />
            <span className="sr-only">위로 이동</span>
          </button>
          <button className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={index === totalCount - 1} onClick={onMoveDown} type="button">
            <ArrowDown aria-hidden="true" className="size-4" />
            <span className="sr-only">아래로 이동</span>
          </button>
          <button className="rounded-md p-1 text-red-500 transition hover:bg-red-50 hover:text-red-700" onClick={onRemove} type="button">
            <Trash2 aria-hidden="true" className="size-4" />
            <span className="sr-only">삭제</span>
          </button>
        </div>
      </div>
    </div>
  );
}








