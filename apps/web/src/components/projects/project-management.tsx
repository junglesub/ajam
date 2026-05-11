"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { CalendarClock, Check, Clock3, FolderKanban, Pencil, X } from "lucide-react";

import type { ProjectSummary } from "@timesheet/db";
import { Badge, Button, Input, cn } from "@timesheet/ui";

type ProjectManagementProps = {
  initialProjects: ProjectSummary[];
  renameProjectAction: (params: { fromName: string; toName: string }) => Promise<ProjectSummary[]>;
};

function formatHours(hours: number): string {
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }

  return `${Number(hours.toFixed(2))}h`;
}

function formatLatestDate(dateKey: string | null): string {
  if (!dateKey) {
    return "업무 없음";
  }

  const [year, month, day] = dateKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];

  return `${year}.${month}.${day} (${weekday})`;
}

export function ProjectManagement({ initialProjects, renameProjectAction }: ProjectManagementProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(
    () => ({
      entryCount: projects.reduce((sum, project) => sum + project.entryCount, 0),
      projectCount: projects.length,
      totalHours: projects.reduce((sum, project) => sum + project.totalHours, 0)
    }),
    [projects]
  );

  function startEditing(project: ProjectSummary) {
    setEditingName(project.name);
    setDraftName(project.name);
    setError("");
  }

  function cancelEditing() {
    setEditingName(null);
    setDraftName("");
    setError("");
  }

  function saveProjectName(event: FormEvent<HTMLFormElement>, fromName: string) {
    event.preventDefault();
    const toName = draftName.trim();

    if (!toName) {
      setError("프로젝트명을 입력해 주세요.");
      return;
    }

    if (fromName === toName) {
      cancelEditing();
      return;
    }

    setError("");
    setSavingName(fromName);

    startTransition(async () => {
      try {
        const nextProjects = await renameProjectAction({ fromName, toName });
        setProjects(nextProjects);
        setEditingName(null);
        setDraftName("");
      } catch (renameError) {
        setError(renameError instanceof Error ? renameError.message : "프로젝트 이름을 변경하지 못했습니다.");
      } finally {
        setSavingName(null);
      }
    });
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-0 pt-4">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
              <FolderKanban aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-950">프로젝트 관리</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">최근 업무일 기준으로 프로젝트를 정리합니다.</p>
            </div>
          </div>
        </div>

        <div className="grid border-b border-slate-200 bg-slate-50 px-5 py-3 sm:grid-cols-3">
          <ProjectMetric icon={FolderKanban} label="전체 프로젝트" value={`${totals.projectCount}개`} />
          <ProjectMetric icon={CalendarClock} label="등록 업무" value={`${totals.entryCount}건`} />
          <ProjectMetric icon={Clock3} label="누적 시간" value={formatHours(totals.totalHours)} />
        </div>

        {error ? <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="overflow-x-auto p-4">
          <div className="grid min-w-[860px] grid-cols-[minmax(240px,1.4fr)_120px_120px_160px_120px] gap-3 border-b border-slate-200 px-3 pb-2 text-xs font-bold text-slate-400">
            <span>프로젝트</span>
            <span>업무 수</span>
            <span>누적 시간</span>
            <span>최근 업무일</span>
            <span className="text-right">관리</span>
          </div>

          {projects.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <p className="text-sm font-semibold text-slate-500">아직 등록된 프로젝트가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {projects.map((project) => {
                const isEditing = editingName === project.name;
                const isSaving = isPending && savingName === project.name;

                return (
                  <div
                    className={cn(
                      "grid min-w-[860px] grid-cols-[minmax(240px,1.4fr)_120px_120px_160px_120px] items-center gap-3 px-3 py-3 text-sm",
                      isEditing && "bg-slate-50"
                    )}
                    key={project.name}
                  >
                    <div className="min-w-0">
                      {isEditing ? (
                        <form className="flex min-w-0 items-center gap-2" onSubmit={(event) => saveProjectName(event, project.name)}>
                          <Input autoFocus className="h-9" onChange={(event) => setDraftName(event.target.value)} value={draftName} />
                          <button
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:opacity-50"
                            disabled={isSaving}
                            type="submit"
                          >
                            <Check aria-hidden="true" className="size-4" />
                            <span className="sr-only">저장</span>
                          </button>
                          <button
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:text-slate-950 disabled:opacity-50"
                            disabled={isSaving}
                            onClick={cancelEditing}
                            type="button"
                          >
                            <X aria-hidden="true" className="size-4" />
                            <span className="sr-only">취소</span>
                          </button>
                        </form>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate font-bold text-slate-950">{project.name}</span>
                          {project.entryCount === 0 ? <Badge tone="gray">미사용</Badge> : null}
                        </div>
                      )}
                    </div>
                    <span className="font-semibold text-slate-700">{project.entryCount}건</span>
                    <span className="font-semibold text-slate-700">{formatHours(project.totalHours)}</span>
                    <span className="font-medium text-slate-600">{formatLatestDate(project.latestDateKey)}</span>
                    <div className="flex justify-end">
                      {!isEditing ? (
                        <Button className="h-9 px-3" onClick={() => startEditing(project)} type="button" variant="secondary">
                          <Pencil aria-hidden="true" className="size-4" />
                          변경
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProjectMetric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-slate-200 py-2 sm:border-r sm:px-4 sm:last:border-r-0">
      <div className="flex size-9 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-950">{value}</p>
      </div>
    </div>
  );
}
