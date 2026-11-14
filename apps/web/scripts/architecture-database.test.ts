import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { distributorRequirementKind } from "../src/lib/distributor-requirement-lines";

const migration = (name: string) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

test("PostgreSQL summary preserves purchase classification and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create table project_requirements(id uuid primary key, project_id uuid, organization_id uuid, status text, display_name text, value_text text, value_json jsonb, source_excerpt text, deleted_at timestamptz);
      create table project_product_suggestions(id uuid primary key, project_id uuid, requirement_id uuid, status text, product_snapshot jsonb);
      alter table project_requirements enable row level security;
      alter table project_product_suggestions enable row level security;
      grant select on project_requirements,project_product_suggestions to authenticated;
      create policy scope on project_requirements to authenticated using (project_id::text=current_setting('test.project_id'));
      create policy scope on project_product_suggestions to authenticated using (project_id::text=current_setting('test.project_id'));`);
    await db.exec(migration("20260927150000_project_overview_counts"));
    const cases = [
      { value_text: "Rør", value_json: { unit: "m", quantity: 71.75 } },
      { value_text: "Prosjekt", value_json: { reviewFlags: ["project-information"] } },
      { value_text: "Ventil", value_json: { operation: "remove", unit: "st" } },
      { value_text: "Anslutning", value_json: { unit: "RS" } },
      { value_text: "Rund sum", value_json: {} },
      { value_text: "BYGGEMØTER", value_json: { unit: "st" } },
      { value_text: "Hulltaking", value_json: { unit: "st" } },
      { value_text: "Rør", value_json: { unit: "m", sourceText: "Inherited\nRund sum RS" } }
    ];
    for (const row of cases) {
      const result = await db.query<{ value: boolean }>("select requirement_is_purchase_item('extracted_unreviewed',null,$1,$2,null) as value", [row.value_text, JSON.stringify(row.value_json)]);
      assert.equal(result.rows[0].value, distributorRequirementKind({ id: "r", ...row }) === "product", row.value_text);
    }
    const first = '10000000-0000-4000-8000-000000000001';
    const second = '10000000-0000-4000-8000-000000000002';
    await db.exec(`insert into project_requirements(id,project_id,status,value_json) values
      ('20000000-0000-4000-8000-000000000001','${first}','extracted_unreviewed','{"unit":"m"}'),
      ('20000000-0000-4000-8000-000000000002','${second}','extracted_unreviewed','{"unit":"m"}');
      set role authenticated; select set_config('test.project_id','${first}',false);`);
    const summary = await db.query<{ project_id: string; total: number }>("select * from project_requirement_counts($1)", [[first,second]]);
    assert.equal(summary.rows.length, 1); assert.equal(summary.rows[0].project_id, first); assert.equal(Number(summary.rows[0].total), 1);
  } finally { await db.close(); }
});

test("shared supplier quota deduplicates instances, limits concurrency, and honors backoff", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role authenticated; create role anon; create role service_role;");
    await db.exec(migration("20260927152000_shared_ahlsell_budget"));
    const claim = async (key: string) => (await db.query<{ result: { state: string } }>("select claim_ahlsell_request($1,$2) as result", [key.padStart(64,"0"), "10000000-0000-4000-8000-000000000001"])).rows[0].result;
    assert.equal((await claim("1")).state, "acquired");
    assert.equal((await claim("1")).state, "pending");
    const concurrent = await Promise.all(Array.from({length: 20}, (_, i) => claim(String(i+2))));
    assert.equal(concurrent.filter(item => item.state === "acquired").length, 5);
    assert.equal(concurrent.filter(item => item.state === "limited").length, 15);
    await db.query("select finish_ahlsell_request($1,$2,$3,30)", ["1".padStart(64,"0"), "10000000-0000-4000-8000-000000000001", JSON.stringify({ body: "cached", status: 200, headers: {} })]);
    assert.equal((await claim("1")).state, "cached");
    assert.equal((await claim("999")).state, "limited");
    await db.exec("update ahlsell_outbound_budget set used=0,blocked_until=now()-interval '1 second'; update ahlsell_shared_responses set expires_at=now()-interval '1 second',lease_until=null;");
    assert.equal((await claim("1")).state,"acquired");
    await claim("2");
    assert.equal((await claim("1")).state,"pending","expired cache cleanup cannot remove a newly acquired lease");
    await db.exec("update ahlsell_shared_responses set lease_until=null");
    for(let i=100;i<180;i++) {
      assert.equal((await claim(String(i))).state,"acquired");
      await db.query("select finish_ahlsell_request($1,$2,$3,0)",[String(i).padStart(64,"0"),"10000000-0000-4000-8000-000000000001",JSON.stringify({body:"cached",status:200,headers:{}})]);
    }
    assert.ok(Number((await db.query<{count:number}>("select count(*) from ahlsell_shared_responses")).rows[0].count)<=64,"bounded cache storage");
    await db.exec("set role authenticated");
    await assert.rejects(claim("1"), /permission denied/);
  } finally { await db.close(); }
});

test("a stale card cannot replace a newer choice or clear it with a resolution", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '90000000-0000-4000-8000-000000000001'::uuid $$;
      create function can_access_project(uuid) returns boolean language sql as $$ select true $$;
      create function has_permission(uuid,text) returns boolean language sql as $$ select true $$;
      create table project_requirements(id uuid primary key, project_id uuid, organization_id uuid, value_json jsonb, updated_at timestamptz default now(), deleted_at timestamptz);
      create table project_product_suggestions(id uuid primary key, project_id uuid, requirement_id uuid, status text);
      create function write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) returns void language sql as $$ select $$;
      create function prepare_requirement_for_direct_product_mapping(uuid,uuid) returns void language sql as $$ select $$;
      create function approve_distributor_product_mapping_v4(uuid,uuid,boolean,text,text,text,text,jsonb,text,text,text,integer,numeric,text,jsonb,timestamptz,jsonb)
        returns jsonb language plpgsql as $$ begin
          if $5 = 'FAIL' then raise exception 'Test write failure'; end if;
          insert into public.project_product_suggestions values(gen_random_uuid(),$1,$2,'selected');
          return '{}'; end $$;
      insert into project_requirements(id,project_id,organization_id,value_json) values(
        '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{}');`);
    await db.exec(migration("20260927151000_atomic_product_choice_revision"));
    const save = (revision: number, action = "approve", number = "123") => db.query("select save_product_choice($1,$2,$3,$4,$5)", [
      '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001', revision, action,
      JSON.stringify({ userApproved: true, productNumber: number, accessories: [], entryMethod: "catalog" })
    ]);
    const race = await Promise.allSettled([save(0),save(0)]);
    assert.equal(race.filter(item => item.status === 'fulfilled').length,1, JSON.stringify(race.map(item => item.status === 'rejected' ? String(item.reason) : 'saved')));
    await assert.rejects(save(0,"not_in_assortment"), /post or its product selection has changed/);
    let current = (await db.query<{edit_revision:number}>("select edit_revision from project_requirements")).rows[0].edit_revision;
    await assert.rejects(save(Number(current), "approve", "FAIL"), /Test write failure/);
    assert.equal((await db.query<{edit_revision:number}>("select edit_revision from project_requirements")).rows[0].edit_revision,current);
    await db.exec("update project_product_suggestions set status='rejected'");
    await assert.rejects(save(Number(current)), /post or its product selection has changed/);
    current = (await db.query<{edit_revision:number}>("select edit_revision from project_requirements")).rows[0].edit_revision;
    await save(Number(current),"not_in_assortment");
    assert.equal((await db.query<{value:string}>("select value_json->'productResolution'->>'status' as value from project_requirements")).rows[0].value,'not_in_assortment');
  } finally { await db.close(); }
});
