import { isUuid } from './distributor-product-mapping';

export type AssignmentTarget = { scope_type: 'post' | 'main_post' | 'pdf_chapter'; scope_value: string };
export type DirectAssignmentChange = { targets: AssignmentTarget[]; assignee: string | null; mode: 'explicit' | 'inherit' | 'unassigned'; replaceOverrides: boolean };
export type AssignmentSaved = { saved: true; undoToken?: string; assignmentVersion: string };
export function isAssignmentVersion(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value); }
export function validDirectAssignment(value: Record<string, unknown>): boolean {
  return Array.isArray(value.targets) && value.targets.length > 0 && value.targets.length <= 500
    && value.targets.every(target => target && typeof target === 'object' && ['post','main_post','pdf_chapter'].includes(target.scope_type) && isUuid(target.scope_value))
    && ['explicit','inherit','unassigned'].includes(String(value.mode)) && typeof value.replaceOverrides === 'boolean'
    && (value.mode === 'explicit' ? isUuid(value.assignee) : value.assignee === null)
    && isAssignmentVersion(value.version);
}
