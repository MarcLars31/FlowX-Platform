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
    await db.query(`insert into project_product_suggestions(organization_id,project_id,requirement_id,status,product_snapshot)
      select organization_id,project_id,id,'selected',
        '{"source":"distributor_manual","approvedByUser":true,"approvalStatus":"user_approved"}'
      from project_requirements where project_id=$1 and substring(requirement_key from 9)::int % 10 = 1`, [visible.project]);
    await db.query('insert into project_management_settings(project_id) values($1)', [hidden.project]);
    // PGlite has no autovacuum worker to collect production-like statistics.
    await db.exec('analyze project_requirements; analyze project_product_suggestions');
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
    })), [{project_id:visible.project,total:10000,approved:1000,not_in_assortment:5000,handled:6000}]);
    assert.ok(elapsed < 8000, `Dashboard summary exceeded the production 8s budget: ${elapsed.toFixed(0)}ms`);
    t.diagnostic(`10,000-row authenticated summary: ${elapsed.toFixed(0)}ms`);
    const overviewStarted = performance.now();
    const overview = await db.query<{data: unknown[]}>(
      'select project_management_overview($1) data', [visible.org],
    );
    const overviewElapsed = performance.now()-overviewStarted;
    assert.deepEqual(overview.rows[0].data, []);
    assert.ok(overviewElapsed < 8000, `Empty management overview exceeded the production 8s budget: ${overviewElapsed.toFixed(0)}ms`);
    t.diagnostic(`Empty management overview alongside 10,000 legacy posts: ${overviewElapsed.toFixed(0)}ms`);
    assert.deepEqual((await db.query<{data: unknown[]}>(
      'select project_management_overview($1) data', [hidden.org],
    )).rows[0].data, []);
    await db.exec('reset role');
    await db.query('insert into project_management_settings(project_id) values($1)', [visible.project]);
    await db.exec('set role authenticated');
    await t.test('enabling assignment preserves fast dashboard and raw project reads', async () => {
      const started = performance.now();
      const counts = await db.query('select * from project_requirement_counts($1)', [[visible.project,hidden.project]]);
      assert.deepEqual(counts.rows, summary.rows);
      const summaryMs = performance.now()-started;
      const rowsStarted = performance.now();
      const rows = await db.query('select id,value_text,value_json from project_requirements where project_id=$1 and deleted_at is null order by id', [visible.project]);
      assert.equal(rows.rows.length,10000);
      const rowsMs = performance.now()-rowsStarted;
      t.diagnostic(`10,000-row managed project: summary ${summaryMs.toFixed(0)}ms, raw rows ${rowsMs.toFixed(0)}ms`);
      // Leave margin for hosted database/network load below its 8s limit. The
      // previous per-row policies took ~4s and ~3.7s even in isolation locally.
      assert.ok(summaryMs < 2000, `Managed dashboard with 1,000 approvals lost its timeout margin: ${summaryMs.toFixed(0)}ms`);
      assert.ok(rowsMs < 2000, `Managed project rows lost their timeout margin: ${rowsMs.toFixed(0)}ms`);
    });
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
