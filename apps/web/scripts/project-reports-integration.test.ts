import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stabilizationDatabase,testOrganization } from './stabilization-test-database';
import { buildProjectReport,defaultReportFilters,type ReportSource } from '../src/lib/project-reports';

test('report RPC isolates project and post scope, includes all history, and rechecks revoked access',async()=>{
  const db=await stabilizationDatabase();try{
    const {org,user,project}=await testOrganization(db),other=await testOrganization(db);
    const worker=randomUUID(),colleague=randomUUID(),first=randomUUID(),second=randomUUID();
    await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'full_user',20) on conflict(organization_id,seat_type) do update set seat_limit=20",[org]);
    for(const person of [worker,colleague]){
      await db.query('insert into auth.users(id,email) values($1,$2)',[person,`${person}@example.test`]);
      await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='engineer' and organization_id is null",[org,person]);
    }
    for(const [rid,title] of [[first,'Visible'],[second,'SECRET hidden post']])await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1::uuid,$2,$3,'pipe',$1::uuid::text,$4,$5,'extracted_unreviewed')",[rid,org,project,title,JSON.stringify({postNumber:rid===first?'1.1':'2.1',sourceChapter:{title},unit:'stk',quantity:1})]);
    const login=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const read=async(pid=project)=>(await db.query<{data:ReportSource}>('select read_project_reports($1) data',[pid])).rows[0].data;
    await login(user);
    for(const [rid,person] of [[first,worker],[second,colleague]]){
      const snapshot=(await read()).snapshot;
      await db.query("select assign_project_work_direct($1,$2,$3,'explicit',false,$4)",[project,JSON.stringify([{scope_type:'post',scope_value:rid}]),person,snapshot.assignmentVersion]);
    }
    await db.query('select write_project_message($1,$2,$3)',[project,first,JSON.stringify({kind:'help',body:'Visible question'})]);
    await db.query('select write_project_message($1,$2,$3)',[project,second,JSON.stringify({kind:'help',body:'SECRET question'})]);
    await db.exec('reset role');
    await db.query("insert into project_work_reviews(project_id,requirement_id,state,actor_id,note,created_at) select $1,$2,'ready',$3,'Visible history '||n,now()+n*interval '1 second' from generate_series(1,1005) n",[project,first,worker]);
    await db.query("insert into project_work_reviews(project_id,requirement_id,state,actor_id,note) values($1,$2,'returned',$3,'SECRET review')",[project,second,colleague]);
    await login(worker);const data=await read();assert.equal(data.snapshot.posts.length,1);assert.equal(data.reviews.length,1005);assert.equal(data.help.length,1);assert.ok(!JSON.stringify(data).includes('SECRET'));
    const report=buildProjectReport(data,{...defaultReportFilters,kind:'reviews'},'Org');assert.equal(report.events.length,1005);assert.equal(report.summary.total,1);
    await assert.rejects(read(other.project),/access denied/i);
    await login(user);assert.equal((await read()).reviews.length,1006);
    await db.exec('reset role');await db.query("update project_members set status='inactive' where project_id=$1 and user_id=$2",[project,worker]);
    await login(worker);try{const revoked=await read();assert.equal(revoked.snapshot.posts.length,0);assert.equal(revoked.reviews.length,0);assert.equal(revoked.help.length,0);}catch(error){assert.match((error as Error).message,/access denied/i);}
    await db.exec('reset role');
    const fn=(await db.query<{prosecdef:boolean}>("select prosecdef from pg_proc where oid='public.read_project_reports(uuid)'::regprocedure")).rows[0];assert.equal(fn.prosecdef,false);
    await db.exec('set role anon');await assert.rejects(read(),/permission denied/);
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role authenticated');await assert.rejects(db.query('select scipx_report_internal.read($1)',[project]),/Authentication required/);
  }finally{await db.close();}
});
