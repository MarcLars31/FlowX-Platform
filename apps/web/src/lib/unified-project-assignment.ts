import type { AssignmentTarget, DirectAssignmentChange } from './direct-project-assignment';
import { validDirectAssignment } from './direct-project-assignment';
import { isUuid } from './distributor-product-mapping';
import type { HierarchyAssignment, HierarchyPost, HierarchySnapshot } from './project-management-hierarchy';
import { isLate } from './project-management';

export type UnifiedAssignmentChange = DirectAssignmentChange & {
  department: string | null;
  setDeadline: boolean;
  deadline: string | null;
};
export type AssignmentFilters = { search: string; department: string; person: string; status: string; view: string };
export const targetKey = (target: AssignmentTarget) => `${target.scope_type}:${target.scope_value}`;

export function validUnifiedAssignment(value: Record<string, unknown>): boolean {
  if (value.department !== null && !isUuid(value.department)) return false;
  if (value.assignee !== null && !isUuid(value.assignee)) return false;
  if (value.mode !== 'explicit' && value.department !== null) return false;
  if (!validDirectAssignment({ ...value, assignee: value.assignee ?? (value.mode === 'explicit' ? value.department : null) })) return false;
  if (typeof value.setDeadline !== 'boolean') return false;
  if (!value.setDeadline) return value.deadline === null;
  return value.mode === 'explicit' && (value.targets as AssignmentTarget[]).every(target => target.scope_type === 'pdf_chapter')
    && (value.deadline === null || typeof value.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.deadline));
}

export function eligiblePeople(data: HierarchySnapshot, department: string | null) {
  const candidates = data.assignees ?? [];
  const members = new Set(data.members.filter(member => member.departmentId === department).map(member => member.id));
  return [...new Map(candidates.filter(person => !department || members.has(person.id)).map(person => [person.id, person])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

export function canAssignTargets(data: HierarchySnapshot, targets: AssignmentTarget[]): boolean {
  if (data.manager) return true;
  const supervised = new Set(data.departments.filter(department => department.supervisorId === data.userId).map(department => department.id));
  return targets.length > 0 && targets.every(target => {
    const work = target.scope_type === 'post'
      ? data.assignments.find(item => item.id === data.posts.find(post => post.id === target.scope_value)?.assignmentId)
      : data.assignments.find(item => item.scope_type === target.scope_type && item.scope_value === target.scope_value);
    return Boolean(work?.department_id && supervised.has(work.department_id));
  });
}

export function assignmentOrigin(work: HierarchyAssignment | undefined, post?: HierarchyPost) {
  if (!work || work.assignment_mode === 'inherit') return 'Ingen tildeling';
  if (work.assignment_mode === 'unassigned') return 'Uten ansvar · eget unntak';
  if (work.scope_type === 'post') return 'Egen tildeling';
  if (work.scope_type === 'main_post') return 'Arvet fra hovedpost';
  return post ? `Arvet fra ${post.chapter}` : 'Standard for kapittelet';
}

export function matchesAssignmentFilters(data: HierarchySnapshot, post: HierarchyPost, filters: AssignmentFilters, today: string) {
  const work = data.assignments.find(item => item.id === post.assignmentId);
  const department = work?.department_id ?? null, person = work?.assigned_to ?? null;
  const ownDepartments = new Set(data.members.filter(member => member.id === data.userId && member.departmentId).map(member => member.departmentId));
  for (const team of data.departments) if (team.supervisorId === data.userId) ownDepartments.add(team.id);
  if (filters.view === 'mine' && person !== data.userId) return false;
  if (filters.view === 'department' && !ownDepartments.has(department)) return false;
  if (filters.department !== 'all' && (filters.department === 'none' ? department !== null : department !== filters.department)) return false;
  if (filters.person !== 'all' && (filters.person === 'none' ? person !== null : person !== filters.person)) return false;
  if (!`${post.chapter} ${post.number ?? ''} ${post.title}`.toLocaleLowerCase('nb').includes(filters.search.trim().toLocaleLowerCase('nb'))) return false;
  return filters.status === 'all' || filters.status === 'open' && !post.done || filters.status === 'done' && post.done
    || ['ready','approved','returned'].includes(filters.status) && post.reviewState === filters.status
    || filters.status === 'help' && post.openHelp > 0 || filters.status === 'late' && isLate(post, today)
    || filters.status === 'unassigned' && !person || filters.status === 'queue' && Boolean(department) && !person;
}

export function supervisorChanges(data: HierarchySnapshot, change: UnifiedAssignmentChange) {
  if (!canAssignTargets(data, change.targets) || !change.department || !change.assignee || change.mode !== 'explicit' || change.replaceOverrides || change.setDeadline) {
    throw new Error('Arbeidsleder kan fordele avdelingens arbeid til en person.');
  }
  if (!data.departments.some(department => department.id === change.department && department.supervisorId === data.userId)) throw new Error('Velg din egen avdeling.');
  return change.targets.map(target => {
    const prior = data.assignments.find(item => item.scope_type === target.scope_type && item.scope_value === target.scope_value);
    return { ...target, revision: prior?.revision ?? -1, assignment_mode: 'explicit', department_id: change.department, assigned_to: change.assignee };
  });
}
