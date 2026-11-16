import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { stabilizationDatabase, testOrganization } from './stabilization-test-database';

test('managed raw reads and product counts preserve direct, department and revoked access', async t => {
  const db = await stabilizationDatabase();
  try {
    const visible = await testOrganization(db), foreign = await testOrganization(db);
    const {org, user, project} = visible;
    const worker=randomUUID(), other=randomUUID(), department=randomUUID();
    const login = async (id: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...id ? {sub:id} : {},role:'authenticated'})]);
      await db.exec('set role authenticated');
    };
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',5) on conflict(organization_id,seat_type) do update set seat_limit=5",[org]);
    await db.query("insert into teams(id,organization_id,name) values($1,$2,'Sprinkler')",[department,org]);
    for (const member of [worker,other]) {
      await db.query('insert into auth.users(id,email) values($1,$2)',[member,`${member}@example.test`]);
      const membership=(await db.query<{id:string}>("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='full_user' and organization_id is null returning id",[org,member])).rows[0].id;
      await db.query("insert into project_members(project_id,organization_member_id,project_role,organization_id,user_id,role,status) values($1,$2,'editor',$3,$4,'editor','active')",[project,membership,org,member]);
      if(member===worker) await db.query('insert into team_members(team_id,organization_member_id) values($1,$2)',[department,membership]);
    }
    await db.query(`insert into project_requirements(organization_id,project_id,category,requirement_key,value_text,value_json,status)
      select $1,$2,'pipe',n::text,'Sprinkler',jsonb_build_object('postNumber','03.'||n,
        'sourcePostId','source-'||n,'parentSourcePostId',case when n between 7 and 11 then 'source-6' end,
        'sourceChapter',jsonb_build_object('title',case when n<=1000 then 'Direct' else 'Department' end),
        'unit','stk','quantity',74),'extracted_unreviewed' from generate_series(1,1124) n`,[org,project]);
    const rows=(await db.query<{id:string}>('select id from project_requirements where project_id=$1 order by requirement_key::int',[project])).rows;
    await db.query(`insert into project_product_suggestions(organization_id,project_id,requirement_id,status,product_snapshot)
      select organization_id,project_id,id,'selected','{"source":"distributor_manual","approvedByUser":true,"approvalStatus":"user_approved"}'
      from project_requirements where project_id=$1`,[project]);
    const foreignPost=randomUUID();
    await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,'Foreign','{}','extracted_unreviewed')",[foreignPost,foreign.org,foreign.project]);
    // Even a suggestion referencing a foreign post must not inherit permission
    // from the suggestion's otherwise visible project.
    await db.query("insert into project_product_suggestions(organization_id,project_id,requirement_id,status) values($1,$2,$3,'suggested'),($1,$2,null,'suggested')",[org,project,foreignPost]);
    await db.query('insert into project_management_settings(project_id) values($1),($2)',[project,foreign.project]);
    await db.query('insert into project_work_departments(project_id,department_id,supervisor_id) values($1,$2,$3)',[project,department,worker]);
    for(const [type,index,assignee,mode,did] of [
      ['pdf_chapter',0,worker,'explicit',null],
      ['post',0,other,'explicit',null],
      ['post',1,null,'unassigned',null],
      ['post',2,null,'inherit',null],
      ['main_post',5,other,'explicit',null],
      ['pdf_chapter',1000,other,'explicit',department],
    ] as const) await db.query(`insert into project_work_packages(project_id,organization_id,scope_type,scope_value,assigned_to,assignment_mode,department_id,direct_assignee)
      values($1,$2,$3,$4,$5,$6,$7,$8)`,[project,org,type,rows[index].id,assignee,mode,did,did===null && assignee!==null]);
    await db.query("update project_requirements set status='rejected' where id=$1",[rows[1121].id]);
    await db.query("update project_requirements set status='superseded' where id=$1",[rows[1122].id]);
    await db.query('update project_requirements set deleted_at=now() where id=$1',[rows[1123].id]);

    const raw = async () => (await db.query<{id:string}>('select id from project_requirements where project_id=$1 order by id',[project])).rows.map(r=>r.id);
    const suggestions = async () => (await db.query<{requirement_id:string}>('select requirement_id from project_product_suggestions where project_id=$1 order by requirement_id',[project])).rows.map(r=>r.requirement_id);
    await login(user);
    assert.equal((await raw()).length,1124, 'Manager retains access to archived/rejected rows when explicitly requested');
    assert.equal((await suggestions()).length,1124, 'Foreign and null references stay hidden');
    await login(worker);
    await db.exec('reset role');
    const expected=(await db.query<{id:string}>('select id from project_requirements where project_id=$1 and pm_can_read(id) order by id',[project])).rows.map(r=>r.id);
    assert.equal(expected.length,1113);
    assert.ok(expected.includes(rows[2].id),'inherit must fall back to the chapter');
    assert.ok(expected.includes(rows[1000].id),'department member sees posts assigned to a colleague');
    await db.exec('set role authenticated');
    const started=performance.now();
    assert.deepEqual(await raw(),expected);
    assert.deepEqual(await suggestions(),expected);
    const counts=(await db.query<{total:number;approved:number}>('select * from project_requirement_counts($1)',[[project,foreign.project]])).rows;
    assert.equal(counts.length,1);
    assert.equal(Number(counts[0].total),expected.length);
    assert.equal(Number(counts[0].approved),expected.length);
    const elapsed=performance.now()-started;
    t.diagnostic(`1,124-row worker: raw rows, suggestions and dashboard counts ${elapsed.toFixed(0)}ms combined`);
    assert.ok(elapsed<8000,'All three worker reads must fit within one production timeout budget');
    assert.deepEqual((await db.query('select id from project_requirements where project_id=$1',[foreign.project])).rows,[]);
    for(const state of ['viewer','inactive'] as const) {
      await db.exec('reset role');
      await db.query("update project_members set role=$3,project_role=$3,status=$4 where project_id=$1 and user_id=$2",[project,worker,state==='viewer'?'viewer':'editor',state==='inactive'?'inactive':'active']);
      await db.exec('set role authenticated');
      assert.deepEqual(await raw(),[]);
      assert.deepEqual(await suggestions(),[]);
    }
    await db.exec('reset role');
    await db.query("update project_members set role='editor',project_role='editor',status='active' where project_id=$1 and user_id=$2",[project,worker]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.query("update organization_members set status='disabled' where organization_id=$1 and user_id=$2",[org,worker]);
    await login(worker);
    assert.deepEqual(await raw(),[]);
    assert.deepEqual(await suggestions(),[]);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.query("update organization_members set status='active' where organization_id=$1 and user_id=$2",[org,worker]);
    await db.exec("delete from role_permissions where role_id in(select id from roles where slug='full_user' and organization_id is null) and permission_id in(select id from permissions where key='project.requirement.view')");
    await login(worker);
    assert.deepEqual(await raw(),[]);
    assert.deepEqual(await suggestions(),expected,'Suggestion-only roles retain their own independent view permission');
    await db.exec('reset role');
    await db.exec("delete from role_permissions where role_id in(select id from roles where slug='full_user' and organization_id is null) and permission_id in(select id from permissions where key='project.product_suggestion.view')");
    await db.exec('set role authenticated');
    assert.deepEqual(await suggestions(),[]);
    assert.deepEqual((await db.query('select * from scipx_assignment_internal.read_requirements()')).rows,[]);
    await login('');
    assert.deepEqual((await db.query('select * from scipx_assignment_internal.read_requirements()')).rows,[]);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from scipx_assignment_internal.read_requirements()'),/permission denied/);
  } finally { await db.close(); }
});
