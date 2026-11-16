import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
const directory = new URL("../../../supabase/", import.meta.url);
export async function stabilizationDatabase() {
  const db = new PGlite({extensions:{pgcrypto}});
  try {
    await db.exec(readFileSync(new URL("scripts/test-bootstrap.sql",directory),"utf8"));
    for (const file of readdirSync(new URL("migrations/",directory)).filter(file=>file.endsWith(".sql")).sort()) {
      // Network scheduling is verified against Supabase, not emulated by the local SQL engine.
      if (file === "20260927154000_import_scheduler.sql") continue;
      try { await db.exec(readFileSync(new URL(`migrations/${file}`,directory),"utf8")); }
      catch (error) { throw new Error(`Migration ${file}: ${error instanceof Error ? error.message : error}`); }
    }
    return db;
  } catch(error) {await db.close();throw error;}
}
export async function testOrganization(db: PGlite) {
  const user=randomUUID(), org=randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)",[user,`${user}@example.test`]);
  await db.query("insert into organizations(id,name,created_by) values($1,'Regression organization',$2)",[org,user]);
  await db.query("insert into organization_subscriptions(organization_id,plan_key,status) values($1,'test','active') on conflict(organization_id) do nothing",[org]);
  await db.query("insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,'admin',10) on conflict(organization_id,seat_type) do update set seat_limit=10",[org]);
  await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='organization_owner' and organization_id is null limit 1",[org,user]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:'authenticated'})]);
  const project=(await db.query<{id:string}>("select create_project_with_defaults($1,null,'Regression project',requested_customer_name=>'Customer',requested_country_code=>'NO',requested_standard=>'NS',requested_owner_user_id=>$2) id",[org,user])).rows[0].id;
  return {org,user,project};
}
