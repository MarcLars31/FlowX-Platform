import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { stabilizationDatabase, testOrganization } from './stabilization-test-database';
import type { HierarchySnapshot } from '../src/lib/project-management-hierarchy';

test('direct assignment: real RLS, hierarchy, atomic batches and guarded undo without departments', async t => {
  const db = await stabilizationDatabase();
  try {
    const {org,user,project} = await testOrganization(db);
    const workers = [randomUUID(),randomUUID(),randomUUID()];
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',50) on conflict(organization_id,seat_type) do update set seat_limit=50",[org]);
    for (const worker of workers) {
      await db.query('insert into auth.users(id,email) values($1,$2)',[worker,`${worker}@example.test`]);
      await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='full_user' and organization_id is null",[org,worker]);
    }
    const [first,second,other] = [randomUUID(),randomUUID(),randomUUID()];
    for (const [i,rid] of [first,second,other].entries()) await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,'Sprinkler',$4,'extracted_unreviewed')",[rid,org,project,JSON.stringify({postNumber:`${i+1}.1`,sourceChapter:{title:i===2?'02 VVS':'01 Sprinkler'},unit:'stk',quantity:74})]);
    const login = async (id=user) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
    const snapshot = async () => (await db.query<{data: HierarchySnapshot & {assignmentVersion:string;assignees:{id:string}[]}}>('select read_project_management($1) data',[project])).rows[0].data;
    const assign = async (targets:{scope_type:string;scope_value:string}[],assignee:string|null,mode='explicit',replace=false,version?:string) => (await db.query<{data:{saved:boolean;undoToken:string;assignmentVersion:string}}>('select assign_project_work_direct($1,$2,$3,$4,$5,$6) data',[project,JSON.stringify(targets),assignee,mode,replace,version??(await snapshot()).assignmentVersion])).rows[0].data;
    const chapter = [{scope_type:'pdf_chapter',scope_value:first}];
    const post = [{scope_type:'post',scope_value:first}];
    const responsible = async (rid:string) => { const data=await snapshot(); return data.assignments.find(w=>w.id===data.posts.find(p=>p.id===rid)?.assignmentId)?.assigned_to??null; };
    const undo = async (saved:{undoToken:string;assignmentVersion:string}) => db.query('select undo_project_work_assignment($1,$2,$3)',[project,saved.undoToken,saved.assignmentVersion]);
    await login();
    await t.test('eligible organization users available before setup; first assignment and undo restore access state',async()=>{
      assert.equal((await snapshot()).settings,null);
      for(const worker of workers) assert.ok((await snapshot()).assignees.some(a=>a.id===worker));
      const saved=await assign(chapter,workers[0]);
      assert.equal(await responsible(first),workers[0]); assert.equal(await responsible(second),workers[0]);
      assert.equal(await responsible(other),null);
      await undo(saved);
      assert.equal((await snapshot()).settings,null); assert.equal(await responsible(first),null);
      await db.exec('reset role');
      assert.equal((await db.query('select id from project_members where project_id=$1 and user_id=$2',[project,workers[0]])).rows.length,0);
      await login();
    });
    await t.test('chapter changes preserve overrides, explicit reset, inherit, clear and bulk undo',async()=>{
      await assign(chapter,workers[0]); await assign(post,workers[1]);
      await assign(chapter,workers[2]);
      assert.equal(await responsible(first),workers[1]); assert.equal(await responsible(second),workers[2]);
      const replaced=await assign(chapter,workers[0],'explicit',true);
      assert.equal(await responsible(first),workers[0]);
      await undo(replaced); assert.equal(await responsible(first),workers[1]);
      await assign(post,null,'inherit'); assert.equal(await responsible(first),workers[2]);
      await assign(post,null,'unassigned'); assert.equal(await responsible(first),null);
      const bulk=await assign([...post,{scope_type:'post',scope_value:other}],workers[1]);
      assert.equal(await responsible(first),workers[1]); assert.equal(await responsible(other),workers[1]);
      await undo(bulk); assert.equal(await responsible(first),null); assert.equal(await responsible(other),null);
      await assert.rejects(undo(bulk),/no longer available/);
      await assign(post,workers[1]);
    });
    await t.test('worker sees only own post through actual policies and cannot reassign',async()=>{
      await login(workers[1]);
      const data=await snapshot(); assert.deepEqual(data.posts.map(p=>p.id),[first]);
      assert.equal(data.assignees.length,0); assert.equal(data.assignmentVersion,null);
      assert.deepEqual((await db.query<{id:string}>('select id from project_requirements where project_id=$1',[project])).rows.map(p=>p.id),[first]);
      assert.equal((await db.query('select id from project_work_packages where project_id=$1',[project])).rows.length,1);
      assert.equal((await db.query<{allowed:boolean}>('select pm_full_project_read($1) allowed',[project])).rows[0].allowed,false);
      await db.query('select update_project_task($1,$2,-1,true)',[project,first]);
      await assert.rejects(db.query('select update_project_task($1,$2,-1,true)',[project,second]),/edit denied/);
      await assert.rejects(assign(chapter,workers[1]),/Manager access required/);
      await assert.rejects(db.query('select * from scipx_assignment_internal.actions'),/permission denied/);
      await login();
    });
    await t.test('invalid later batch target rolls back everything; stale requests and foreign assignees fail',async()=>{
      const before=await snapshot();
      await assert.rejects(assign([...post,{scope_type:'post',scope_value:randomUUID()}],workers[0]),/does not belong/);
      assert.equal((await snapshot()).assignmentVersion,before.assignmentVersion);
      await assert.rejects(assign(post,randomUUID()),/Active editable/);
      const saved=await assign(post,workers[0]);
      await assert.rejects(assign(post,workers[1],'explicit',false,before.assignmentVersion),/changed/);
      await assign(post,workers[1]); await assert.rejects(undo(saved),/changed/);
    });
    await t.test('undo rejects another actor and later deadline changes',async()=>{
      const saved=await assign(chapter,workers[0]);
      await login(workers[0]); await assert.rejects(undo(saved),/Manager access required/); await login();
      const row=(await snapshot()).posts.find(p=>p.id===second)!;
      await db.query('select set_project_work_deadline($1,$2,$3,$4)',[project,second,row.deadlineRevision,'2026-12-31']);
      await assert.rejects(undo(saved),/changed/);
      await assign(chapter,workers[2]);
      assert.equal((await snapshot()).posts.find(p=>p.id===second)?.dueDate,'2026-12-31');
    });
    await t.test('project deadlines work with zero departments; concurrent settings invalidate undo',async()=>{
      const saved=await assign(post,workers[0]);
      await db.query('select save_project_management($1,$2,$3)',[project,JSON.stringify({deadline:'2027-01-31',departments:[]}),(await snapshot()).settings!.revision]);
      assert.equal((await snapshot()).settings?.deadline,'2027-01-31');
      await assert.rejects(undo(saved),/changed/);
    });
    await t.test('foreign project scopes and readers are denied',async()=>{
      await db.exec('reset role');const foreign=await testOrganization(db), foreignPost=randomUUID();
      await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,'Foreign','{}','extracted_unreviewed')",[foreignPost,foreign.org,foreign.project]);
      await login();const before=(await snapshot()).assignmentVersion;
      await assert.rejects(assign([{scope_type:'post',scope_value:foreignPost}],workers[0]),/does not belong/);
      await assert.rejects(assign(post,foreign.user),/Active editable/);
      assert.equal((await snapshot()).assignmentVersion,before);
      await login(foreign.user);await assert.rejects(snapshot(),/access denied/);await login();
    });
    await t.test('disabled membership and project viewer are never reactivated',async()=>{
      await db.exec('reset role'); await db.query("update project_members set status='inactive' where project_id=$1 and user_id=$2",[project,workers[0]]); await login();
      assert.ok(!(await snapshot()).assignees.some(a=>a.id===workers[0]));
      await assert.rejects(assign(post,workers[0]),/Active editable/);
      await db.exec('reset role'); await db.query("update project_members set role='viewer',project_role='viewer' where project_id=$1 and user_id=$2",[project,workers[2]]); await login();
      await assert.rejects(assign(post,workers[2]),/Active editable/);
      await login(workers[2]); assert.equal((await db.query<{allowed:boolean}>('select pm_can_read($1) allowed',[second])).rows[0].allowed,false); await login();
    });
  } finally { await db.close(); }
});

test('large project: preserve legacy assignments and isolate repeated chapter occurrences',async()=>{
  const db=await stabilizationDatabase();
  try{
    const {org,user,project}=await testOrganization(db);
    const worker=randomUUID();
    await db.query('insert into auth.users(id,email) values($1,$2)',[worker,`${worker}@example.test`]);
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',5) on conflict(organization_id,seat_type) do update set seat_limit=5",[org]);
    const membership=(await db.query<{id:string}>("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='full_user' and organization_id is null returning id",[org,worker])).rows[0].id;
    await db.query("insert into project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status) values($1,$2,'editor',$3,$4,'editor','active')",[project,membership,org,worker]);
    await db.query("insert into project_requirements(organization_id,project_id,category,requirement_key,value_text,value_json,status) select $1,$2,'pipe',n::text,'Sprinkler',jsonb_build_object('postNumber','03.30.'||n,'sourceChapter',jsonb_build_object('title','03.30 Sprinkler','occurrenceId',case when n<=640 then 'first' else 'second' end),'unit','stk','quantity',74),'extracted_unreviewed' from generate_series(1,641) n",[org,project]);
    const rows=(await db.query<{id:string;requirement_key:string}>('select id,requirement_key from project_requirements where project_id=$1 order by requirement_key::int',[project])).rows;
    const legacy=(await db.query<{id:string}>("insert into project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,due_date) values($1,$2,'post',$3,$4,'2026-12-20') returning id",[project,org,rows[0].id,user])).rows[0].id;
    await db.exec('set role authenticated');
    const snapshot=async()=> (await db.query<{data:HierarchySnapshot}>('select read_project_management($1) data',[project])).rows[0].data;
    const before=await snapshot();const start=performance.now();
    const result=(await db.query<{data:{undoToken:string;assignmentVersion:string}}>("select assign_project_work_direct($1,$2,$3,'explicit',false,$4) data",[project,JSON.stringify([{scope_type:'pdf_chapter',scope_value:rows[1].id}]),worker,before.assignmentVersion])).rows[0].data;
    const assignedAt=performance.now();const after=await snapshot();
    console.log('Large assignment timings (ms)',{assign:Math.round(assignedAt-start),read:Math.round(performance.now()-assignedAt)});
    assert.equal(after.posts.length,641);assert.equal(after.posts.filter(p=>p.assignmentId).length,640);
    assert.equal(after.posts.find(p=>p.id===rows[0].id)?.assignmentId,legacy);
    assert.equal(after.posts.find(p=>p.id===rows[0].id)?.dueDate,'2026-12-20');
    assert.equal(after.posts.find(p=>p.id===rows[640].id)?.assignmentId,null);
    assert.ok(performance.now()-start<8000,'640-post assignment and read must fit the production statement budget');
    const overviewStart=performance.now();
    const overview=(await db.query<{data:{total:number;unassigned:number}[]}>('select project_management_overview($1) data',[org])).rows[0].data;
    assert.equal(overview[0].total,641);assert.equal(overview[0].unassigned,1);
    console.log('Large overview timing (ms)',Math.round(performance.now()-overviewStart));
    assert.ok(performance.now()-overviewStart<8000,'enabled large project overview must fit the production statement budget');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[worker]);
    const workerStart=performance.now();const scoped=await snapshot();assert.equal(scoped.posts.length,639);
    assert.ok(scoped.posts.every(p=>p.canEdit));
    console.log('Large worker read timing (ms)',Math.round(performance.now()-workerStart));
    assert.ok(performance.now()-workerStart<8000,'large worker read must fit the production statement budget');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.query('select undo_project_work_assignment($1,$2,$3)',[project,result.undoToken,result.assignmentVersion]);
    const restored=await snapshot();assert.equal(restored.settings,null);assert.equal(restored.posts.filter(p=>p.assignmentId).length,1);
    assert.equal(restored.assignments.find(w=>w.id===legacy)?.assigned_to,user);
  }finally{await db.close();}
});
