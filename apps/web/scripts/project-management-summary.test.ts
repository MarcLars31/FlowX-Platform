import assert from 'node:assert/strict';
import test from 'node:test';
import { stabilizationDatabase, testOrganization } from './stabilization-test-database';

test('dashboard summary handles large legacy projects with authenticated RLS and excludes other organizations', async (t) => {
  const db = await stabilizationDatabase();
  try {
    const visible = await testOrganization(db);
    const hidden = await testOrganization(db);
    for (const fixture of [visible, hidden]) {
      await db.query(`insert into project_requirements(
        organization_id,project_id,category,requirement_key,value_text,value_json,status
      ) select $1,$2,'pipe','summary-'||n,'Pipe',
        jsonb_build_object('unit','m','quantity',1,'productResolution',
          jsonb_build_object('status',case when n % 2 = 0 then 'not_in_assortment' else 'unresolved' end)),
        'extracted_unreviewed'
      from generate_series(1,$3::int) n`, [fixture.org,fixture.project,fixture === visible ? 10000 : 10]);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [visible.user]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:visible.user,role:'authenticated'})]);
    await db.exec('set role authenticated');
    const started = performance.now();
    const summary = await db.query<{project_id:string;total:number;approved:number;not_in_assortment:number;handled:number}>(
      'select * from project_requirement_counts($1)', [[visible.project,hidden.project]],
    );
    const elapsed = performance.now()-started;
    assert.deepEqual(summary.rows.map(row=>({
      project_id:row.project_id,total:Number(row.total),approved:Number(row.approved),
      not_in_assortment:Number(row.not_in_assortment),handled:Number(row.handled),
    })), [{project_id:visible.project,total:10000,approved:0,not_in_assortment:5000,handled:5000}]);
    assert.ok(elapsed < 8000, `Dashboard summary exceeded the production 8s budget: ${elapsed.toFixed(0)}ms`);
    t.diagnostic(`10,000-row authenticated summary: ${elapsed.toFixed(0)}ms`);
    await db.exec('reset role');
    // Retain a second owner while deactivating the original member.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [hidden.user]);
    await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='organization_owner' and organization_id is null", [visible.org,hidden.user]);
    await db.query("update organization_members set status='disabled' where organization_id=$1 and user_id=$2", [visible.org,visible.user]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [visible.user]);
    await db.exec('set role authenticated');
    assert.deepEqual((await db.query('select * from project_requirement_counts($1)', [[visible.project,hidden.project]])).rows, []);
  } finally { await db.close(); }
});
