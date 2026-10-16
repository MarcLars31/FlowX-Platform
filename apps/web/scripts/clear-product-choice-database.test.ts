import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { isUserApprovedProductAssignment } from "../src/lib/approved-product-assignment";

const projectId = "20000000-0000-4000-8000-000000000001";
const requirementId = "10000000-0000-4000-8000-000000000001";
const otherRequirementId = "10000000-0000-4000-8000-000000000002";
const migration = (name: string) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '90000000-0000-4000-8000-000000000001'::uuid $$;
    create function can_access_project(uuid) returns boolean language sql as $$ select true $$;
    create function has_permission(uuid,text) returns boolean language sql as $$ select true $$;
    create function can_edit_project_requirement(uuid) returns boolean language sql as $$ select true $$;
    create table project_requirements(id uuid primary key, project_id uuid, organization_id uuid, value_json jsonb, updated_at timestamptz default now(), deleted_at timestamptz);
    create table project_product_suggestions(id uuid primary key default gen_random_uuid(), project_id uuid, requirement_id uuid, status text, product_snapshot jsonb);
    create table audit_events(action text);
    create function write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) returns void language sql as $$ insert into public.audit_events values ($2) $$;
    insert into project_requirements(id,project_id,organization_id,value_json) values
      ('${requirementId}','${projectId}','30000000-0000-4000-8000-000000000001','{"quantity":5,"productResolution":{"status":"not_in_assortment"}}'),
      ('${otherRequirementId}','${projectId}','30000000-0000-4000-8000-000000000001','{}');`);
  await db.exec(migration("20260927151000_atomic_product_choice_revision"));
  await db.exec(migration("20261010130000_clear_product_choice"));
  for (const id of [requirementId, otherRequirementId]) {
    await db.query("insert into project_product_suggestions(project_id,requirement_id,status,product_snapshot) values ($1,$2,'selected',$3)", [projectId,id,JSON.stringify({
      source: "distributor_manual", approvedByUser: true, approvalStatus: "user_approved", productNumber: "1118751",
      accessories: [{ productNumber: "2222222", name: "Kupling", quantity: 5, unit: "st" }]
    })]);
  }
  return db;
}
const revision = async (db: PGlite) => Number((await db.query<{edit_revision:number}>("select edit_revision from project_requirements where id=$1",[requirementId])).rows[0].edit_revision);
const clear = (db: PGlite, rev: number, pid = projectId) => db.query<{result:{editRevision:number}}>("select clear_product_choice($1,$2,$3) as result",[pid,requirementId,rev]);

test("clearing an approved choice reopens only its post and excludes its accessories after reload", async () => {
  const db = await database();
  try {
    const before = await revision(db);
    const result = await clear(db,before);
    assert.ok(result.rows[0].result.editRevision > before);
    const choices = (await db.query<{id:string;requirement_id:string;status:string;product_snapshot:Record<string,unknown>}>("select * from project_product_suggestions")).rows;
    assert.deepEqual(choices.filter(isUserApprovedProductAssignment).map(row=>row.requirement_id),[otherRequirementId]);
    const removed = choices.find(row=>row.requirement_id===requirementId)!;
    assert.equal(removed.status,"rejected");
    assert.equal((removed.product_snapshot.accessories as unknown[]).length,1,"historical snapshot remains available");
    assert.deepEqual((await db.query<{value_json:unknown}>("select value_json from project_requirements where id=$1",[requirementId])).rows[0].value_json,{quantity:5});
    assert.equal((await db.query<{action:string}>("select action from audit_events")).rows[0].action,"product_choice.cleared");
    await assert.rejects(clear(db,before),/post or its product selection has changed/);
    await clear(db,await revision(db));
    assert.equal((await db.query("select * from project_product_suggestions where requirement_id=$1 and status='selected'",[requirementId])).rows.length,0);
  } finally { await db.close(); }
});

test("clear rejects stale cards, other projects and unauthorized editors without losing the choice", async () => {
  const db = await database();
  try {
    const rev = await revision(db);
    await assert.rejects(clear(db,rev-1),/post or its product selection has changed/);
    await assert.rejects(clear(db,rev,"20000000-0000-4000-8000-000000000002"),/access denied/);
    for (const fn of ["can_edit_project_requirement(uuid)", "has_permission(uuid,text)", "can_access_project(uuid)"]) {
      await db.exec(`create or replace function ${fn} returns boolean language sql as $$ select false $$`);
      await assert.rejects(clear(db,rev),/access denied/);
      await db.exec(`create or replace function ${fn} returns boolean language sql as $$ select true $$`);
    }
    assert.equal(await revision(db),rev);
    assert.equal((await db.query("select * from project_product_suggestions where requirement_id=$1 and status='selected'",[requirementId])).rows.length,1);
  } finally { await db.close(); }
});

test("clear rolls back the choice, accessories and revision if any transaction step fails", async () => {
  const db = await database();
  try {
    const rev=await revision(db);
    await db.exec(`create or replace function write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) returns void language plpgsql as $$ begin raise exception 'Test audit failure'; end $$`);
    await assert.rejects(clear(db,rev),/Test audit failure/);
    assert.equal(await revision(db),rev);
    assert.equal((await db.query("select * from project_product_suggestions where requirement_id=$1 and status='selected'",[requirementId])).rows.length,1);
  } finally { await db.close(); }
});
