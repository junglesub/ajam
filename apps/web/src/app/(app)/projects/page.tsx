import type { Metadata } from "next";

import { ProjectManagement } from "@/components/projects/project-management";

import { loadProjectSummariesAction, renameProjectAction } from "./actions";

export const metadata: Metadata = {
  title: "프로젝트 관리"
};

export default async function ProjectsPage() {
  const initialProjects = await loadProjectSummariesAction();

  return <ProjectManagement initialProjects={initialProjects} renameProjectAction={renameProjectAction} />;
}
