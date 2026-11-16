import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { stabilizationDatabase, testOrganization } from './stabilization-test-database';
import type { HierarchySnapshot } from '../src/lib/project-management-hierarchy';

test('unified assignment preserves department queues, scope, deadlines and guarded undo', async t => {
  const db = await stabilizationDatabase();
  try {
    const { org, user, project } = await testOrganization(db);
    const department = randomUUID(), secondDepartment = randomUUID();
    const [lead, anna, erik, outsider] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',20) on conflict(organization_id,seat_type) do update set seat_limit=20", [org]);
    await db.query("insert into teams(id,organization_id,name) values($1,$3,'Sprinkler'),($2,$3,'VVS')", [department, secondDepartment, org]);
    for (const [index, member] of [lead, anna, erik, outsider].entries()) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [member, `unified-${index}@example.test`]);
      const membership = (await db.query<{ id: string }>("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='full_user' and organization_id is null returning id", [org, member])).rows[0].id;
      await db.query('insert into team_members(team_id,organization_member_id) values($1,$2)', [member === outsider ? secondDepartment : department, membership]);
    }
    const [first, second, other] = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, rid] of [first, second, other].entries()) await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,'Post',$4,'extracted_unreviewed')", [rid, org, project, JSON.stringify({ postNumber: `33.${index + 1}`, sourceChapter: { title: index === 2 ? '31 VVS' : '33 Sprinkler' }, unit: 'stk', quantity: 4 })]);
    const login = async (id = user) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); };
    const snapshot = async () => (await db.query<{ data: HierarchySnapshot }>('select read_project_management($1) data', [project])).rows[0].data;
    const chapter = [{ scope_type: 'pdf_chapter', scope_value: first }];
    const post = [{ scope_type: 'post', scope_value: first }];
    const assign = async (targets = chapter, assignee: string | null = null, team: string | null = department, mode = 'explicit', replace = false, deadline: string | null = null, setDeadline = false, version?: string) =>
      (await db.query<{ data: { saved: boolean; undoToken: string; assignmentVersion: string } }>('select assign_project_work_unified($1,$2,$3,$4,$5,$6,$7,$8,$9) data', [project, JSON.stringify(targets), assignee, mode, replace, version ?? (await snapshot()).assignmentVersion, team, deadline, setDeadline])).rows[0].data;
    const work = async (rid: string) => { const data = await snapshot(); return data.assignments.find(item => item.id === data.posts.find(item => item.id === rid)?.assignmentId); };
    const undo = async (action: { undoToken: string; assignmentVersion: string }) => db.query('select undo_project_work_assignment($1,$2,$3)', [project, action.undoToken, action.assignmentVersion]);
    await login();
    await db.query('select save_project_management($1,$2,-1)', [project, JSON.stringify({ deadline: '2027-02-28', departments: [{ department_id: department, supervisor_id: lead }, { department_id: secondDepartment, supervisor_id: outsider }] })]);

    await t.test('department-only queue is inherited and visible only within its department', async () => {
      const saved = await assign(chapter, null, department, 'explicit', false, '2027-01-20', true);
      assert.equal((await work(first))?.department_id, department);
      assert.equal((await work(first))?.assigned_to, null);
      assert.equal((await work(second))?.department_id, department);
      assert.equal((await snapshot()).posts.find(item => item.id === second)?.dueDate, '2027-01-20');
      await login(anna);
      assert.deepEqual(new Set((await snapshot()).posts.map(item => item.id)), new Set([first, second]));
      assert.ok((await snapshot()).posts.every(item => !item.canEdit));
      await assert.rejects(assign(post, anna), /Manager access required/);
      await login(outsider);
      assert.equal((await snapshot()).posts.length, 0);
      await login(); await undo(saved);
      assert.equal((await work(first))?.assignment_mode, undefined);
    });
    await t.test('person belongs to the chosen department; own post overrides and deadlines survive chapter reassignment', async () => {
      await assign(chapter, anna, department, 'explicit', false, '2027-01-20', true);
      await assign(post, erik);
      await assign(chapter, null, department, 'explicit', false, '2027-03-01', true);
      assert.equal((await work(first))?.assigned_to, erik);
      assert.equal((await work(second))?.assigned_to, null);
      assert.equal((await snapshot()).posts.find(item => item.id === second)?.dueDate, '2027-01-20');
      await assert.rejects(assign(post, outsider), /Active member of the department/);
      const replaced = await assign(chapter, anna, department, 'explicit', true);
      assert.equal((await work(first))?.assigned_to, anna);
      await undo(replaced); assert.equal((await work(first))?.assigned_to, erik);
      await assign(post, null, null, 'inherit'); assert.equal((await work(first))?.department_id, department);
      await assign(post, null, null, 'unassigned'); assert.equal((await work(first))?.assignment_mode, 'unassigned');
    });
    await t.test('department supervisor uses existing guarded delegation on the shared view', async () => {
      await assign(chapter, null, department, 'explicit', true);
      await login(lead);
      const data = await snapshot();
      const current = data.assignments.find(item => item.scope_type === 'post' && item.scope_value === first);
      await db.query('select assign_project_work($1,$2)', [project, JSON.stringify([{ scope_type: 'post', scope_value: first, revision: current?.revision ?? -1, assignment_mode: 'explicit', department_id: department, assigned_to: anna }])]);
      assert.equal((await work(first))?.assigned_to, anna);
      await assert.rejects(db.query('select assign_project_work($1,$2)', [project, JSON.stringify([{ scope_type: 'post', scope_value: other, revision: -1, department_id: department, assigned_to: anna }])]), /Department scope denied/);
      await login();
    });
    await t.test('invalid mixed batches, inactive departments, stale writes and non-managers cannot alter assignments', async () => {
      const before = await snapshot();
      await assert.rejects(assign([...post, { scope_type: 'post', scope_value: randomUUID() }], anna), /does not belong/);
      assert.equal((await snapshot()).assignmentVersion, before.assignmentVersion);
      await assert.rejects(assign(post, null, randomUUID()), /Active project department/);
      await assert.rejects(assign(post, null, null), /Invalid assignment/);
      await assert.rejects(assign(post, anna, department, 'explicit', false, '2027-01-01', true), /Only chapter deadlines/);
      const saved = await assign(post, erik);
      await assert.rejects(assign(post, anna, department, 'explicit', false, null, false, before.assignmentVersion!), /changed/);
      await assign(post, anna); await assert.rejects(undo(saved), /changed/);
      await db.exec('reset role');
      await db.query("update teams set status='inactive' where id=$1", [department]);
      await login(); await assert.rejects(assign(post, anna), /Active project department/);
      await db.exec('reset role'); await db.query("update teams set status='active' where id=$1", [department]); await login();
    });
    await t.test('direct assignment remains supported and anonymous access is denied', async () => {
      await assign(post, anna, null);
      assert.equal((await work(first))?.department_id, null);
      assert.equal((await work(first))?.assigned_to, anna);
      await login(anna); assert.equal((await snapshot()).posts.find(item => item.id === first)?.canEdit, true);
      await db.exec('reset role; set role anon');
      await assert.rejects(db.query('select assign_project_work_unified($1,$2,$3,$4,$5,$6,$7,$8,$9)', [project, JSON.stringify(post), anna, 'explicit', false, '0'.repeat(32), null, null, false]), /permission denied/);
      await db.exec('reset role');
      const definitions = (await db.query<{ name: string; definer: boolean }>("select proname name,prosecdef definer from pg_proc where proname='assign_project_work_unified' and pronamespace='public'::regnamespace")).rows;
      assert.equal(definitions[0].definer, false);
    });
  } finally { await db.close(); }
});
