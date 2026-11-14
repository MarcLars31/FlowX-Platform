import assert from "node:assert/strict";

export async function verifyRuleFeedback(db) {
  const org = "d0000000-0000-4000-8000-000000000003";
  const otherOrg = "d0000000-0000-4000-8000-000000000004";
  const author = "d0000000-0000-4000-8000-000000000201";
  const colleague = "d0000000-0000-4000-8000-000000000202";
  const insert = `insert into public.matching_rule_feedback (organization_id,rule_id,rule_title,rule_version,kind,body,author_name) values ($1,'dimension','Dimension',repeat('a',40),'error','Test report','Test author') returning *`;
  const identity = async (id, admin = false) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, app_metadata: admin ? { role: "platform_admin" } : {} })]);
  };
  const denied = async (action, pattern = /permission denied|row-level security/) => {
    await db.exec("savepoint denied_operation");
    await assert.rejects(action, pattern);
    await db.exec("rollback to savepoint denied_operation");
  };
  await db.exec("begin");
  try {
    await identity(author);
    await db.exec("set local role authenticated");
    const row = (await db.query(insert, [org])).rows[0];
    assert.equal(row.author_id, author);
    assert.equal(row.status, "open");
    assert.equal((await db.query("select * from public.matching_rule_feedback where id=$1", [row.id])).rows[0].body, "Test report");
    await denied(() => db.query(insert, [otherOrg]));
    await denied(() => db.query(insert, [null]));
    await denied(() => db.query("update public.matching_rule_feedback set body='overwrite' where id=$1", [row.id]));
    await denied(() => db.query("update public.matching_rule_feedback set organization_id=$1 where id=$2", [otherOrg, row.id]));
    await denied(() => db.query("update public.matching_rule_feedback set author_id=$1 where id=$2", [colleague, row.id]));
    await denied(() => db.query("update public.matching_rule_feedback set resolved_by=$1 where id=$2", [colleague, row.id]));
    await denied(() => db.query("delete from public.matching_rule_feedback where id=$1", [row.id]));
    await identity(colleague);
    assert.equal((await db.query("select * from public.matching_rule_feedback")).rows.length, 0);
    assert.equal((await db.query("update public.matching_rule_feedback set status='resolved' where id=$1 returning id", [row.id])).rows.length, 0);
    await denied(() => db.query(insert, [org]));
    // Give the second user ordinary viewer access, without organization administration.
    await db.exec("reset role");
    await db.query(`insert into public.organization_members (organization_id,user_id,role_id,status,joined_at)
      select $1,$2,id,'active',now() from public.roles where slug='viewer' and organization_id is null`, [org, colleague]);
    await db.exec("set local role authenticated");
    assert.equal((await db.query("select * from public.matching_rule_feedback")).rows.length, 1);
    assert.equal((await db.query("update public.matching_rule_feedback set status='resolved' where id=$1 returning id", [row.id])).rows.length, 0);
    const own = (await db.query(insert, [org])).rows[0];
    const resolved = (await db.query("update public.matching_rule_feedback set status='resolved' where id=$1 returning *", [own.id])).rows[0];
    assert.equal(resolved.resolved_by, colleague);
    assert.ok(resolved.resolved_at);
    const reopened = (await db.query("update public.matching_rule_feedback set status='open' where id=$1 returning *", [own.id])).rows[0];
    assert.equal(reopened.resolved_by, null);
    assert.equal(reopened.resolved_at, null);
    await identity(author);
    assert.equal((await db.query("update public.matching_rule_feedback set status='resolved' where id=$1 returning *", [own.id])).rows[0].resolved_by, author);
    await db.exec("reset role");
    await db.query("update public.organization_members set status='suspended' where user_id=$1 and organization_id=$2", [colleague, org]);
    await db.exec("set local role authenticated");
    await identity(colleague);
    assert.equal((await db.query("select * from public.matching_rule_feedback")).rows.length, 0, "Authorship does not bypass revoked organization access");
    // Platform administrators can report and review without an organization membership.
    await identity(colleague, true);
    const global = (await db.query(insert, [null])).rows[0];
    assert.equal((await db.query("select * from public.matching_rule_feedback")).rows.length, 3);
    assert.equal((await db.query("update public.matching_rule_feedback set status='resolved' where id=$1 returning *", [row.id])).rows[0].resolved_by, colleague);
    await identity(author);
    assert.equal((await db.query("select * from public.matching_rule_feedback where id=$1", [global.id])).rows.length, 0);
    await db.exec("set local role anon");
    await denied(() => db.query("select * from public.matching_rule_feedback"));
  } finally { await db.exec("rollback"); }
  process.stdout.write("PASS rule feedback persistence, organization isolation, viewer reporting, author/admin handling, immutable reports, status stamps and anonymous denial\n");
}
