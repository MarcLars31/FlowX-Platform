export type ProjectStatisticsRow = {
  status: string;
  current_stage: string | null;
  created_at: string;
};

export type ProjectStatistics = {
  total: number;
  ongoing: number;
  completed: number;
  onHold: number;
  archived: number;
  createdThisMonth: number;
  completionRate: number;
  byStatus: Record<string, number>;
};

export function buildProjectStatistics(
  projects: readonly ProjectStatisticsRow[],
  now = new Date()
): ProjectStatistics {
  const byStatus: Record<string, number> = {};
  let ongoing = 0;
  let completed = 0;
  let onHold = 0;
  let archived = 0;
  let createdThisMonth = 0;

  for (const project of projects) {
    byStatus[project.status] = (byStatus[project.status] ?? 0) + 1;

    const isArchived = project.status === "archived";
    const isCompleted =
      !isArchived &&
      (project.status === "completed" || project.current_stage === "completed");

    if (isArchived) archived += 1;
    if (isCompleted) completed += 1;
    if (!isArchived && !isCompleted) ongoing += 1;
    if (project.status === "on_hold") onHold += 1;

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
    onHold,
    archived,
    createdThisMonth,
    completionRate:
      projects.length > 0 ? Math.round((completed / projects.length) * 100) : 0,
    byStatus
  };
}
