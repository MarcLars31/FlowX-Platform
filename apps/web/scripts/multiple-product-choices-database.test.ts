import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const pid=id(1),rid=id(2),org=id(3),actor=id(4);
const migration=(name:string)=>readFileSync(new URL("../../../supabase/migrations/"+name+".sql",import.meta.url),"utf8");
async function fixture(){
 const db=new PGlite();
 await db.exec(  `create role authenticated;create schema auth;
  create table auth.users(id uuid primary key);insert into auth.users values('${actor}');
  create function auth.uid() returns uuid language sql as $$ select '${actor}'::uuid $$;
  create function can_access_project(uuid) returns boolean language sql as $$ select $1='${pid}'::uuid $$;
  create function has_permission(uuid,text) returns boolean language sql as $$ select true $$;
  create function is_organization_member(uuid) returns boolean language sql as $$ select true $$;
  create function can_edit_project_requirement(uuid) returns boolean language sql as $$ select true $$;
  create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
  create table organizations(id uuid primary key);insert into organizations values('${org}');
  create table projects(id uuid primary key,organization_id uuid,deleted_at timestamptz);insert into projects values('${pid}','${org}',null);
  create table project_requirements(id uuid primary key,project_id uuid,organization_id uuid,status text,category text,requirement_key text,value_text text,value_json jsonb,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
  create table project_product_suggestions(id uuid primary key default gen_random_uuid(),organization_id uuid,project_id uuid,requirement_id uuid,product_id uuid,product_snapshot jsonb,status text,recommendation_reason text,match_score numeric,deviation_type text,deviation_text text,selected_by uuid,selected_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
  create table audit_events(action text);create function write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) returns void language sql as $$ insert into public.audit_events values($2) $$;
  insert into project_requirements(id,project_id,organization_id,status,category,requirement_key,value_text,value_json) values('${rid}','${pid}','${org}','extracted_unreviewed','pipe','post','Rør','{"quantity":45,"unit":"m"}');`
 );
 for(const name of ["20260818100000_create_distributor_product_memory","20260819130000_allow_direct_product_mapping","20260822130000_require_explicit_product_approval","20260831120000_add_manual_product_commercial_details","20260916120000_add_product_requirement_review","20260920120000_add_product_order_quantities","20260927151000_atomic_product_choice_revision","20261010130000_clear_product_choice","20261011120000_multiple_product_choices"])await db.exec(migration(name));
 return db;
}
const product=(number:string,amount=5)=>({userApproved:true,entryMethod:"catalog",productName:"Produkt "+number,productNumber:number,orderQuantity:{quantity:amount,unit:"m"},accessories:[{name:"Kupling",productNumber:"2222222",quantity:amount+1,quantityBasis:"total",unit:"st"}]});
const revision=async(db:PGlite)=>Number((await db.query<{edit_revision:number}>("select edit_revision from project_requirements where id=$1",[rid])).rows[0].edit_revision);
const snapshot=async(db:PGlite)=>(await db.query<{product_snapshot:{products:Record<string,unknown>[]}}>("select product_snapshot from project_product_suggestions where requirement_id=$1 and status='selected'",[rid])).rows[0]?.product_snapshot;
const save=(db:PGlite,rev:number,products:unknown,legacy=false,project=pid)=>db.query("select save_product_choices($1,$2,$3,$4,$5)",[project,rid,rev,JSON.stringify(products),legacy]);
test("saves multiple real product mappings atomically, reopens each accessory bundle, removes one or all",async()=>{
 const db=await fixture();try{
  await save(db,await revision(db),[product("1118751"),product("1118646",2)]);
  const saved=await snapshot(db);assert.equal(saved.products.length,2);
  assert.deepEqual(saved.products.map(p=>p.productNumber),["1118751","1118646"]);
  assert.deepEqual(saved.products.map(p=>(p.accessories as {quantity:number}[])[0].quantity),[6,3]);
  assert.equal((await db.query("select * from distributor_product_memories")).rows.length,2);
  assert.equal((await db.query("select * from project_product_suggestions")).rows.length,1);
  const rev=await revision(db);
  await assert.rejects(save(db,rev,[product("1118751")],true),/Multiple products/);
  await assert.rejects(save(db,rev-1,[product("1118751")]),/changed/);
  await save(db,rev,[product("1118646",2)]);assert.equal((await snapshot(db)).products.length,1);
  await db.query("select clear_product_choice($1,$2,$3)",[pid,rid,await revision(db)]);assert.equal(await snapshot(db),undefined);
 }finally{await db.close();}
});
test("bad later products roll back earlier writes and deny duplicates, stale revisions and unauthorized editors",async()=>{
 const db=await fixture();try{
  await save(db,0,[product("1118751")]);const before=await snapshot(db),rev=await revision(db);
  for(const products of [[product("1118646"),{...product("3333333"),orderQuantity:{quantity:-1,unit:"st"}}],
    [product("1118646"),{...product("3333333"),userApproved:false}],
    [product("1118646"),product("NRF 1118646")],[],null]) {
    await assert.rejects(save(db,rev,products));assert.deepEqual(await snapshot(db),before);assert.equal(await revision(db),rev);
  }
  await assert.rejects(save(db,rev,[product("1118646")],false,id(9)),/access denied/);
  for(const fn of ["can_edit_project_requirement(uuid)","has_permission(uuid,text)"]){
    await db.exec("create or replace function "+fn+" returns boolean language sql as $$ select false $$");
    await assert.rejects(save(db,rev,[product("1118646")]),/access denied/);
    await db.exec("create or replace function "+fn+" returns boolean language sql as $$ select true $$");
  }
  assert.deepEqual(await snapshot(db),before);assert.equal(await revision(db),rev);
 }finally{await db.close();}
});
