import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { stabilizationDatabase, testOrganization } from './stabilization-test-database';

test('full schema: manager to supervisor to employee, immutable assigned dates, help and actual role policies', async () => {
  const db = await stabilizationDatabase();
  try {
    const { org, user, project } = await testOrganization(db);
    const department = randomUUID(), lead = randomUUID(), worker = randomUUID(), first = randomUUID(), second = randomUUID();
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',50) on conflict(organization_id,seat_type) do update set seat_limit=50",[org]);
    await db.query("insert into teams(id,organization_id,name) values($1,$2,'Rør')",[department,org]);
    for (const member of [lead,worker]) {
      await db.query('insert into auth.users(id,email) values($1,$2)',[member,`${member}@example.test`]);
      const membership = (await db.query<{ id: string }>("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='full_user' and organization_id is null returning id",[org,member])).rows[0].id;
      await db.query('insert into team_members(team_id,organization_member_id) values($1,$2)',[department,membership]);
    }
    for (const [rid,title] of [[first,'Rør'],[second,'Ventil']]) {
      await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,$4,$5,'extracted_unreviewed')",[rid,org,project,title,JSON.stringify({postNumber:title==='Rør'?'1.1':'1.2',sourceChapter:{title:'1 VVS'},unit:'stk',quantity:1})]);
    }
    await db.exec('set role authenticated');
    await db.query('select save_project_management($1,$2,-1)',[project,JSON.stringify({deadline:'2026-12-31',departments:[{department_id:department,supervisor_id:lead}]})]);
    await db.query('select assign_project_work($1,$2)',[project,JSON.stringify([{scope_type:'pdf_chapter',scope_value:first,department_id:department,revision:-1,due_date:'2026-12-15'}])]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[lead]);
    await db.query('select assign_project_work($1,$2)',[project,JSON.stringify([{scope_type:'post',scope_value:first,department_id:department,assigned_to:worker,revision:-1}])]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.query('select assign_project_work($1,$2)',[project,JSON.stringify([{scope_type:'pdf_chapter',scope_value:first,department_id:department,revision:0,operation:'deadline',due_date:'2026-11-15'}])]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[worker]);
    assert.equal((await db.query<{date:string}>('select pm_due_date($1)::text date',[first])).rows[0].date,'2026-12-15');
    const snapshot=(await db.query<{data:{posts:unknown[]}}>('select read_project_management($1) data',[project])).rows[0].data;
    assert.equal(snapshot.posts.length,2);
    await db.query('select write_project_message($1,$2,$3)',[project,first,JSON.stringify({kind:'help',body:'Hvilket materiale?'})]);
    await assert.rejects(db.query('select update_project_task($1,$2,-1,true)',[project,first]),/Resolve help/);
    await assert.rejects(db.query('select update_project_task($1,$2,-1,true)',[project,second]),/edit denied/);
    await db.exec('reset role');
    await db.exec("delete from role_permissions where role_id in (select id from roles where slug='full_user' and organization_id is null) and permission_id in (select id from permissions where key in ('project.requirement.view','project.product_suggestion.view'))");
    await db.exec('set role authenticated');
    assert.equal((await db.query<{allowed:boolean}>('select can_access_project($1) allowed',[project])).rows[0].allowed,true);
    await assert.rejects(db.query('select read_project_management($1)',[project]),/access denied/);
    await assert.rejects(db.query('select read_project_work_thread($1,$2)',[project,first]),/access denied/);
  } finally { await db.close(); }
});
