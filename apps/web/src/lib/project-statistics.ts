export type ProjectStatisticsRow = {
  status: string;
  current_stage: string | null;
  created_at: string;
};

export type ProjectStatistics = {
  total: number;
  ongoing: number;
  completed: number;
  archived: number;
  createdThisMonth: number;
  completionRate: number;
  byStage: Record<string, number>;
};

export function buildProjectStatistics(
  projects: readonly ProjectStatisticsRow[],
  now = new Date()
): ProjectStatistics {
  const byStage: Record<string, number> = {};
  let ongoing = 0;
  let completed = 0;
  let archived = 0;
  let createdThisMonth = 0;

  for (const project of projects) {
    const stage = project.current_stage ?? "setup";
    byStage[stage] = (byStage[stage] ?? 0) + 1;

    const isArchived = project.status === "archived";
    const isCompleted =
      !isArchived &&
      (project.status === "completed" || project.current_stage === "completed");

    if (isArchived) archived += 1;
    if (isCompleted) completed += 1;
    if (!isArchived && !isCompleted) ongoing += 1;

    const createdAt = new Date(project.created_at);
    if (
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getUTCFullYear() === now.getUTCFullYear() &&
      createdAt.getUTCMonth() === now.getUTCMonth()
    ) {
      createdThisMonth += 1;
    }
  }

  return {
    total: projects.length,
    ongoing,
    completed,
    archived,
    createdThisMonth,
    completionRate:
      projects.length > 0 ? Math.round((completed / projects.length) * 100) : 0,
    byStage
  };
}
