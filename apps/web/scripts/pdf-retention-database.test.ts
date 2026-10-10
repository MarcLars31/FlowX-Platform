import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("temporary originals preserve document constraints and batched RLS preserves every reader's scope", async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create table projects(id uuid primary key,organization_id uuid,deleted_at timestamptz,private boolean);
      create table organization_members(organization_id uuid,user_id uuid,status text,read_requirements boolean,private_access boolean);
      create function has_permission(uuid,text) returns boolean language sql stable security definer set search_path=pg_catalog as $$
        select exists(select 1 from public.organization_members where organization_id=$1 and user_id=auth.uid() and status='active' and read_requirements) $$;
      create function can_access_project(uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
        select exists(select 1 from public.projects p join public.organization_members m on m.organization_id=p.organization_id
          where p.id=$1 and p.deleted_at is null and m.user_id=auth.uid() and m.status='active' and (not p.private or m.private_access)) $$;
      create table project_requirements(id int primary key,project_id uuid,organization_id uuid);
      create table project_documents(id int primary key,document_type text,storage_bucket text not null,storage_path text not null);
      alter table projects enable row level security;
      alter table organization_members enable row level security;
      alter table project_requirements enable row level security;
      create policy projects_select_accessible on projects for select to authenticated using(can_access_project(id));
      create policy organization_members_select_authorized on organization_members for select to authenticated using(user_id=auth.uid());
      create policy project_requirements_select on project_requirements for select to authenticated using(can_access_project(project_id) and has_permission(organization_id,'project.requirement.view'));
      grant usage on schema auth to authenticated,anon;
      grant select on projects,organization_members,project_requirements to authenticated,anon;
      insert into projects values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false),
        ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',null,true),
        ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002',null,false),
        ('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001',now(),false);
      insert into organization_members values
        ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active',true,false),
        ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','active',true,true),
        ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','inactive',true,true),
        ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','active',false,true),
        ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000005','active',true,true);
      insert into project_requirements select row_number() over()::int,id,organization_id from projects;
      insert into project_documents values(1,'technical_description','project-files','old.pdf'),(2,'attachment','project-files','attachment.pdf');`);
    const read=async(user: number,role='authenticated')=>{
      await db.exec(`set role ${role}; select set_config('test.user','30000000-0000-4000-8000-00000000000${user}',false);`);
      const rows=(await db.query('select id from project_requirements order by id')).rows;
      await db.exec('reset role');return rows;
    };
    const before=[];for(let user=1;user<=6;user++)before.push(await read(user));
    assert.deepEqual(before.map(rows=>rows.length),[1,2,0,0,1,0]);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261010150000_temporary_pdf_imports.sql',import.meta.url),'utf8'));
    for(let user=1;user<=6;user++)assert.deepEqual(await read(user),before[user-1]);
    assert.deepEqual(await read(1,'anon'),[]);
    await db.exec("update organization_members set status='inactive' where user_id='30000000-0000-4000-8000-000000000001'");
    assert.deepEqual(await read(1),[],"revocation takes effect on the next statement");
    await db.exec("insert into project_documents values(3,'technical_description',null,null)");
    assert.equal((await db.query<{storage_path:string}>('select storage_path from project_documents where id=1')).rows[0].storage_path,'old.pdf');
    await assert.rejects(db.exec("insert into project_documents values(4,'attachment',null,null)"),/check constraint/);
    await assert.rejects(db.exec("insert into project_documents values(5,null,null,null)"),/check constraint/);
    await assert.rejects(db.exec("insert into project_documents values(6,'technical_description','project-files',null)"),/check constraint/);
  } finally {await db.close();}
});
