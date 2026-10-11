import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = (name: string) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

test("quality summary preserves existing PDF warnings and bounds the page list", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table technical_description_documents(id integer, warnings jsonb, project_id integer default 1, project_module_id integer default 1);
      insert into technical_description_documents values (2,'[]',null,null);
      create function require_project() returns trigger language plpgsql as $$ begin if new.project_id is null or new.project_module_id is null then raise exception 'Missing project'; end if; return new; end $$;
      create trigger project_scope before update on technical_description_documents for each row execute function require_project();`);
    const warnings = Array.from({ length: 120 }, (_, i) => ({ code: "PAGE_EXTRACTION_INCOMPLETE", sourcePage: i + 1, severity: "warning", sourceText: "Keep original evidence" }));
    await db.query("insert into technical_description_documents(id,warnings) values (1,$1)", [JSON.stringify(warnings)]);
    await db.exec(migration("20261011150000_pdf_import_quality_summary"));
    const row = (await db.query<{ warnings: unknown; warning_summary: {incompletePageCount: number; incompletePages: number[]} }>("select * from technical_description_documents where id=1")).rows[0];
    assert.equal((await db.query<{warning_summary: unknown}>("select warning_summary from technical_description_documents where id=2")).rows[0].warning_summary, null);
    assert.deepEqual(row.warnings, warnings);
    assert.equal(row.warning_summary.incompletePageCount, 120);
    assert.equal(row.warning_summary.incompletePages.length, 100);
  } finally { await db.close(); }
});

test("overview cache is scoped, rejects stale revisions and never changes approvals or source rows", async () => {
  const db = new PGlite();
  const project = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
  const org = "20000000-0000-4000-8000-000000000001", requirement = "30000000-0000-4000-8000-000000000001";
  const user = "40000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select '${user}'::uuid $$;
      create function can_access_project(uuid) returns boolean language sql stable as $$ select $1::text = current_setting('test.project') $$;
      create function has_permission(uuid,text) returns boolean language sql stable as $$ select current_setting('test.allowed') = 'true' $$;
      create table organizations(id uuid primary key);
      create table projects(id uuid primary key);
      create table organization_members(organization_id uuid,user_id uuid,status text);
      create table project_requirements(id uuid primary key,project_id uuid,organization_id uuid,updated_at timestamptz,edit_revision bigint,deleted_at timestamptz,status text,value_json jsonb);
      grant usage on schema auth to authenticated;
      grant select on projects,organizations,organization_members to authenticated;
      grant all on project_requirements to service_role;
      insert into organizations values('${org}'); insert into projects values('${project}'),('${other}');
      insert into organization_members values('${org}','${user}','active');
      insert into project_requirements values('${requirement}','${project}','${org}','2026-10-11T12:00:00Z',7,null,'confirmed','{"quantity":60,"productResolution":{"status":"selected"}}');
      select set_config('test.project','${project}',false),set_config('test.allowed','true',false);`);
    await db.exec(migration("20261011151000_requirement_overview_cache"));
    const source = (await db.query("select * from project_requirements")).rows[0];
    const cache = (revision: number, pid = project) => db.query("select cache_project_requirement_overviews($1,$2,$3)", [pid, org, JSON.stringify([{ requirement_id: requirement, source_updated_at: "2026-10-11T12:00:00Z", source_revision: revision, version: 103, summary: { id: requirement, overview: { category: "sprinkler_head" } } }])]);
    await db.exec("set role service_role");
    await cache(7, other);
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 0);
    await cache(6);
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 0);
    await cache(7);
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 1);
    assert.deepEqual((await db.query("select * from project_requirements")).rows[0], source);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 1);
    await assert.rejects(cache(7), /permission denied/);
    await assert.rejects(db.exec("delete from project_requirement_overviews"), /permission denied/);
    await db.query("select set_config('test.project',$1,false)", [other]);
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 0);
    await db.query("select set_config('test.project',$1,false),set_config('test.allowed','false',false)", [project]);
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 0);
    await db.exec("set role service_role; update project_requirements set edit_revision=8;");
    await cache(7);
    assert.equal(Number((await db.query<{source_revision: number}>("select source_revision from project_requirement_overviews")).rows[0].source_revision), 7);
    await cache(8);
    assert.equal(Number((await db.query<{source_revision: number}>("select source_revision from project_requirement_overviews")).rows[0].source_revision), 8);
    await db.exec("delete from project_requirements");
    assert.equal((await db.query("select * from project_requirement_overviews")).rows.length, 0);
  } finally { await db.close(); }
});
