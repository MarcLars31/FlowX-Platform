import assert from 'node:assert/strict';
import test from 'node:test';
import { eligiblePeople, matchesAssignmentFilters, validUnifiedAssignment } from './unified-project-assignment';
import type { HierarchySnapshot } from './project-management-hierarchy';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('unified payload allows department queues and rejects ambiguous responsibility or deadline changes', () => {
  const payload = { targets: [{ scope_type: 'pdf_chapter', scope_value: uuid(1) }], mode: 'explicit', department: uuid(2), assignee: null, replaceOverrides: false, version: 'a'.repeat(32), setDeadline: false, deadline: null };
  assert.equal(validUnifiedAssignment(payload), true);
  assert.equal(validUnifiedAssignment({ ...payload, department: null }), false);
  assert.equal(validUnifiedAssignment({ ...payload, department: null, assignee: uuid(3) }), true);
  assert.equal(validUnifiedAssignment({ ...payload, mode: 'inherit' }), false);
  assert.equal(validUnifiedAssignment({ ...payload, mode: 'inherit', department: null }), true);
  assert.equal(validUnifiedAssignment({ ...payload, setDeadline: true, deadline: '2027-01-01' }), true);
  assert.equal(validUnifiedAssignment({ ...payload, targets: [{ scope_type: 'post', scope_value: uuid(1) }], setDeadline: true }), false);
  assert.equal(validUnifiedAssignment({ ...payload, deadline: '2027-01-01' }), false);
});
test('person selection intersects eligible editors with department membership and queue filtering distinguishes direct work', () => {
  const data: HierarchySnapshot = { projectId: uuid(1), name: 'Test', userId: uuid(3), manager: true, settings: null,
    departments: [{ id: uuid(2), name: 'Sprinkler', supervisorId: uuid(3) }],
    members: [{ id: uuid(3), name: 'Anna', departmentId: uuid(2) }, { id: uuid(4), name: 'Erik', departmentId: uuid(2) }],
    assignees: [{ id: uuid(3), name: 'Anna' }, { id: uuid(5), name: 'VVS' }],
    assignments: [{ id: uuid(6), scope_type: 'pdf_chapter', scope_value: uuid(7), department_id: uuid(2), assigned_to: null, due_date: null, revision: 0 }], posts: [] };
  assert.deepEqual(eligiblePeople(data, uuid(2)).map(person => person.id), [uuid(3)]);
  assert.equal(eligiblePeople(data, null).length, 2);
  const post = { id: uuid(7), number: '33.01', title: 'Sprinkler', chapter: '33 Sprinkler', chapterKey: '33', assignmentId: uuid(6), dueDate: null, ownDeadline: null, deadlineRevision: -1, canEdit: false, done: false, revision: -1, openHelp: 0 };
  const filters = { search: '', department: 'all', person: 'all', status: 'queue', view: 'all' };
  assert.equal(matchesAssignmentFilters(data, post, filters, '2026-11-09'), true);
  assert.equal(matchesAssignmentFilters(data, post, { ...filters, view: 'mine' }, '2026-11-09'), false);
  assert.equal(matchesAssignmentFilters(data, post, { ...filters, view: 'department' }, '2026-11-09'), true);
  assert.equal(matchesAssignmentFilters(data, { ...post, assignmentId: null }, filters, '2026-11-09'), false);
});
