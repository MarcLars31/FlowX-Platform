import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { stabilizationDatabase, testOrganization } from './stabilization-test-database';
import type { HierarchySnapshot } from '../src/lib/project-management-hierarchy';

test('optional work review: real roles, transitions, locked content and tenant boundaries', async t => {
  const db = await stabilizationDatabase();
  try {
    const { org, user: manager, project } = await testOrganization(db);
    const employee = randomUUID(), reviewer = randomUUID(), viewer = randomUUID(), outsider = randomUUID();
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',30),($1,'read_only',30) on conflict(organization_id,seat_type) do update set seat_limit=30", [org]);
    for (const [id, role] of [[employee,'engineer'],[reviewer,'engineer'],[viewer,'viewer']]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`]);
      await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug=$3 and organization_id is null", [org,id,role]);
    }
    await db.query('insert into auth.users(id,email) values($1,$2)', [outsider,`${outsider}@example.test`]);
    const first = randomUUID(), second = randomUUID();
    for (const [index,id] of [first,second].entries()) await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,'Review post',$4,'extracted_unreviewed')", [id,org,project,JSON.stringify({postNumber:`33.${index+1}`,sourceChapter:{title:'33 Sprinkler'},unit:'stk',quantity:1})]);
    const login = async (id = manager) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
    const snapshot = async () => (await db.query<{data:HierarchySnapshot}>('select read_project_management($1) data',[project])).rows[0].data;
    const post = async (id=first) => (await snapshot()).posts.find(p=>p.id===id)!;
    const configure = async (required: boolean, who: string | null=reviewer) => db.query('select save_project_management($1,$2,$3)', [project,JSON.stringify({deadline:'2027-01-31',departments:[],review_required:required,reviewer_id:who}),(await snapshot()).settings?.revision ?? -1]);
    const task = async (done: boolean,id=first,revision?: number) => db.query('select update_project_task($1,$2,$3,$4)',[project,id,revision ?? (await post(id)).revision,done]);
    const review = async (operation: string,note='',id=first,revision?: number) => db.query('select review_project_work($1,$2,$3,$4,$5)',[project,id,revision ?? (await post(id)).revision,operation,note]);
    await login();
    await db.query("select assign_project_work_direct($1,$2,$3,'explicit',false,$4)",[project,JSON.stringify([{scope_type:'pdf_chapter',scope_value:first}]),employee,(await snapshot()).assignmentVersion]);

    await t.test('engineers work on their assignments but do not create or administer projects', async () => {
      await login(employee);
      for (const permission of ['project.create','project.update','project.delete','project.settings.update','document.upload','document.delete','project.version.create']) {
        assert.equal((await db.query<{allowed:boolean}>('select has_permission($1,$2) allowed',[org,permission])).rows[0].allowed,false,permission);
      }
      assert.equal((await post()).canEdit,true);
      await assert.rejects(configure(true), /Manager access required/);
      await task(true);
      assert.equal((await post()).reviewState,'completed');
      assert.equal((await post()).done,true);
    });

    await t.test('activation enrolls an explicit reviewer and sends old completions for review', async () => {
      await login();
      await assert.rejects(configure(true,employee), /conflicting project role/);
      await assert.rejects(configure(true,viewer), /active reviewer/);
      await assert.rejects(configure(true,outsider), /active reviewer/);
      await configure(true);
      const data = await snapshot();
      assert.equal(data.settings?.review_required,true);
      assert.equal((await post()).reviewState,'ready');
      assert.equal((await post()).done,false);
      assert.equal((await post()).submittedBy,employee);
      assert.ok(!data.assignees?.some(p=>p.id===reviewer));
      assert.equal((await db.query<{role:string;project_role:string}>("select role,project_role from project_members where project_id=$1 and user_id=$2",[project,reviewer])).rows[0].project_role,'reviewer');
      await assert.rejects(configure(false,null), /Resolve or reopen pending/);
    });

    await t.test('reviewer reads the project without becoming an editor or manager', async () => {
      await login(reviewer);
      const data=await snapshot();
      assert.equal(data.manager,false); assert.equal(data.reviewer,true); assert.equal(data.canReview,true);
      assert.equal(data.posts.length,2); assert.ok(data.posts.every(p=>!p.canEdit));
      assert.equal((await post()).canReview,true);
      assert.equal((await db.query('select id from project_requirements where project_id=$1',[project])).rows.length,2);
      await assert.rejects(task(true), /Post edit denied/);
      await assert.rejects(configure(false,null), /Manager access required/);
      await assert.rejects(db.query('update project_requirements set value_text=$2 where id=$1',[second,'Unauthorized edit']),/assigned to another person/);
      await assert.rejects(review('return','   '), /Describe what needs to change/);
      await review('return','Kontrollera dimensionen på röret.');
      assert.equal((await post()).reviewState,'returned');
      assert.equal((await post()).reviewNote,'Kontrollera dimensionen på röret.');
      await assert.rejects(review('approve'), /must be ready/);
    });

    await t.test('submission locks contents for everyone, including managers; stale and own approvals fail', async () => {
      await login(employee);
      await db.query('update project_requirements set value_text=$2 where id=$1',[first,'Corrected dimension']);
      await task(true);
      const submitted=await post();
      assert.equal(submitted.reviewState,'ready'); assert.equal(submitted.done,false); assert.equal(submitted.contentLocked,true);
      await assert.rejects(review('approve'), /Reviewer access required/);
      await assert.rejects(task(true), /Reopen the post/);
      await assert.rejects(db.query('update project_requirements set value_text=$2 where id=$1',[first,'Late edit']), /Reopen the post/);
      await login();
      await assert.rejects(db.query('update project_requirements set value_text=$2 where id=$1',[first,'Manager late edit']), /Reopen the post/);
      await login(reviewer);
      await assert.rejects(review('approve','',first,submitted.revision-1), /Task changed/);
      await review('approve','Kontrollerat.');
      assert.equal((await post()).done,true); assert.equal((await post()).reviewState,'approved');
      await login();
      await task(false,second); await task(true,second);
      await assert.rejects(review('approve','',second), /own submission/);
      await login(reviewer); await review('approve','',second);
    });

    await t.test('reopening clears approval; legacy completion cannot bypass review', async () => {
      await login(employee);
      await task(false);
      assert.equal((await post()).reviewState,'in_progress'); assert.equal((await post()).done,false);
      await task(true);
      assert.equal((await post()).reviewState,'ready'); assert.equal((await post()).done,false);
      await login(reviewer);
      const history=(await db.query<{data:{reviews:{state:string;note:string}[]}}>('select read_project_work_thread($1,$2) data',[project,first])).rows[0].data.reviews;
      assert.ok(history.some(e=>e.state==='returned' && e.note.includes('dimensionen')));
      assert.ok(history.some(e=>e.state==='approved'));
      await db.exec('reset role');
      await db.query("update project_members set status='inactive' where project_id=$1 and user_id=$2",[project,reviewer]);
      await login(reviewer);
      await assert.rejects(review('approve','',first,6), /Post access denied|Reviewer access required|Task changed/);
      assert.equal((await db.query('select * from project_work_reviews where project_id=$1',[project])).rows.length,0);
      await db.exec('reset role');
      await db.query("update project_members set status='active' where project_id=$1 and user_id=$2",[project,reviewer]);
      await login(reviewer); await review('approve');
      await login(); await configure(false,null);
      await login(employee); await task(false); await task(true);
      assert.equal((await post()).reviewState,'completed'); assert.equal((await post()).done,true);
    });

    await t.test('legacy project-role updates synchronize reviewer and viewer without lingering access', async () => {
      await login();
      await db.query("update project_members set project_role='viewer' where project_id=$1 and user_id=$2",[project,reviewer]);
      assert.equal((await db.query<{role:string}>('select role from project_members where project_id=$1 and user_id=$2',[project,reviewer])).rows[0].role,'viewer');
      await login(reviewer); assert.equal((await snapshot()).posts.length,0);
      await login(); await db.query("update project_members set project_role='reviewer' where project_id=$1 and user_id=$2",[project,reviewer]);
      await login(reviewer); assert.equal((await snapshot()).posts.length,2);
    });

    await t.test('department setup preserves a newly selected reviewer instead of making them an editor', async () => {
      await db.exec('reset role');
      const fresh=randomUUID(),team=randomUUID();
      await db.query('insert into auth.users(id,email) values($1,$2)',[fresh,`${fresh}@example.test`]);
      await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='engineer' and organization_id is null",[org,fresh]);
      await db.query("insert into teams(id,organization_id,name) values($1,$2,'Review department')",[team,org]);
      await db.query('insert into team_members(team_id,organization_member_id) select $1,id from organization_members where organization_id=$2 and user_id in ($3,$4)',[team,org,employee,fresh]);
      await login();
      const payload=JSON.stringify({deadline:null,departments:[{department_id:team,supervisor_id:employee}],review_required:true,reviewer_id:fresh});
      await assert.rejects(db.query('select save_project_management($1,$2,-1)',[project,payload]),/Settings changed/);
      assert.equal((await db.query('select id from project_members where project_id=$1 and user_id=$2',[project,fresh])).rows.length,0);
      await db.query('select save_project_management($1,$2,$3)',[project,payload,(await snapshot()).settings!.revision]);
      assert.equal((await db.query<{role:string}>('select role from project_members where project_id=$1 and user_id=$2',[project,fresh])).rows[0].role,'reviewer');
      await login(fresh); assert.equal((await snapshot()).canReview,true);assert.ok((await snapshot()).posts.every(p=>!p.canEdit));
      await login(reviewer);assert.equal((await snapshot()).canReview,false);
      await login();
      await db.query('update projects set project_manager_id=$2 where id=$1',[project,employee]);
      await login(employee);assert.equal((await snapshot()).manager,true);
      await login();await db.query('update projects set project_manager_id=null where id=$1',[project]);
    });

    await t.test('outsiders and anonymous callers cannot review or inspect private helpers', async () => {
      await login(outsider);
      await assert.rejects(snapshot(), /Project access denied/);
      await assert.rejects(db.query("select review_project_work($1,$2,-1,'approve','')",[project,first]), /Post access denied/);
      await assert.rejects(db.query('select scipx_review_internal.reviewers($1)',[project]), /permission denied/);
      await db.exec('reset role; set role anon');
      await assert.rejects(db.query("select review_project_work($1,$2,-1,'approve','')",[project,first]), /permission denied/);
      await db.exec('reset role');
      const functions=(await db.query<{proname:string;prosecdef:boolean}>("select proname,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('review_project_work','update_project_task','read_project_work_thread','save_project_management')")).rows;
      assert.equal(functions.length,4); assert.ok(functions.every(fn=>!fn.prosecdef));
      assert.equal((await db.query<{rls:boolean}>("select relrowsecurity rls from pg_class where oid='public.project_work_reviews'::regclass")).rows[0].rls,true);
    });
  } finally { await db.close(); }
});
