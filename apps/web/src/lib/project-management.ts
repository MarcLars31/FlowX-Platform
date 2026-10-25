export type ManagementSettings = {
  project_id: string; deadline: string | null; revision: number;
  allow_later_post_deadline: boolean; multiple_help_requests: boolean; assignment_email: 'batch' | 'daily';
};
export type WorkAssignment = {
  id: string; scope_type: 'post' | 'pdf_chapter' | 'chapter' | 'group'; scope_value: string;
  chapter_key?: string; department_id: string | null; assigned_to: string; due_date: string | null; revision: number;
};
export type ManagedPost = {
  id: string; number: string | null; title: string; chapter: string; chapterKey: string;
  assignmentId: string | null; dueDate: string | null; ownDeadline: string | null; deadlineRevision: number; canEdit: boolean; done: boolean; revision: number; openHelp: number;
};
export type ManagementSnapshot = {
  projectId: string; name: string; userId: string; manager: boolean; settings: ManagementSettings | null; emailEnabled?: boolean;
  departments: { id: string; name: string; supervisorId: string | null }[];
  members: { id: string; departmentId: string; name: string }[];
  assignments: WorkAssignment[]; posts: ManagedPost[];
};
export type WorkMessage = { id: string; help_id: string | null; body: string; created_by: string; created_at: string };
export type HelpRequest = { id: string; description: string; created_by: string; created_at: string; resolved_at: string | null; resolved_by: string | null; revision: number };
export type WorkThread = { help: HelpRequest[]; messages: WorkMessage[] };
export type ManagementOverview = { id: string; name: string; manager: boolean; deadline: string | null; total: number; done: number; late: number; help: number; unassigned: number };
export type WorkNotification = { id: string; project_id: string; requirement_id: string | null; title: string; kind: string; created_at: string; read_at: string | null };

export function osloDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function isLate(post: Pick<ManagedPost, 'done' | 'dueDate'>, today: string) {
  return !post.done && Boolean(post.dueDate && post.dueDate < today);
}
export function managementChapters(data: ManagementSnapshot) {
  const grouped = new Map<string, { key: string; title: string; posts: ManagedPost[]; assignment?: WorkAssignment; anchor: string }>();
  for (const post of data.posts) {
    const chapter = grouped.get(post.chapterKey) ?? { key: post.chapterKey, title: post.chapter, posts: [], anchor: post.id };
    chapter.posts.push(post);
    if (post.id < chapter.anchor) chapter.anchor = post.id;
    grouped.set(post.chapterKey, chapter);
  }
  for (const chapter of grouped.values()) {
    const ids = new Set(chapter.posts.map(post => post.id));
    chapter.assignment = data.assignments.find(item => item.scope_type === 'pdf_chapter' && ids.has(item.scope_value));
    if (chapter.assignment) chapter.anchor = chapter.assignment.scope_value;
    chapter.posts.sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', 'nb', { numeric: true }) || a.id.localeCompare(b.id));
  }
  return [...grouped.values()].sort((a, b) => a.title.localeCompare(b.title, 'nb', { numeric: true }) || a.key.localeCompare(b.key));
}
export function managementError(code?: string) {
  if (code === '40001') return { status: 409, error: 'En annen bruker har endret dette. Oppdater visningen før du prøver igjen.' };
  if (code === '42501') return { status: 403, error: 'Du har ikke tilgang til å gjøre denne endringen.' };
  if (['22023', '22P02', '22007', '22008', '23502', '23505', '23514'].includes(code ?? '')) return { status: 400, error: 'Kontroller avdeling, ansvarlig og frister. Åpne hjelpebehov må løses før posten kan fullføres.' };
  return { status: 503, error: 'Prosjektstyringen er ikke tilgjengelig akkurat nå. Prøv igjen.' };
}
