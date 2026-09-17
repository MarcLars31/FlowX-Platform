import assert from "node:assert/strict";

export async function verifyProductPostComments(database, projectId) {
  const rid = "d0000000-0000-4000-8000-000000000203";
  const org = "d0000000-0000-4000-8000-000000000003";
  const actor = "d0000000-0000-4000-8000-000000000201";
  const before = (await database.query("select row_to_json(r) as value from public.project_requirements r where id = $1", [rid])).rows[0].value;
  const sql = `insert into public.product_post_comments (id, organization_id, project_id, requirement_id, product_number, product_name, body, author_name)
    values (gen_random_uuid(), $1, $2, $3, $4, $5, 'Project comment', 'Test user') returning *`;
  const denied = async task => {
    await assert.rejects(task, /permission denied|row-level security/);
  };
  await database.exec("set role authenticated");
  try {
    const post = (await database.query(sql, [org, projectId, rid, null, null])).rows[0];
    const product = (await database.query(sql, [org, projectId, rid, "9256649", "Valve"])).rows[0];
    assert.equal(post.author_id, actor);
    assert.equal(post.product_number, null);
    assert.equal(product.product_number, "9256649");
    const read = await database.query("select * from public.product_post_comments where requirement_id = $1", [rid]);
    assert.equal(read.rows.length, 2);
    await denied(() => database.query(sql, ["d0000000-0000-4000-8000-000000000004", projectId, rid, null, null]));
    await denied(() => database.query(sql, [org, "d0000000-0000-4000-8000-000000000003", rid, null, null]));
    await denied(() => database.query("update public.product_post_comments set body = 'overwrite' where id = $1", [post.id]));
    await denied(() => database.query("insert into public.product_post_comments (organization_id, project_id, requirement_id, body, author_name, author_id) values ($1,$2,$3,'spoof','user',$4)", [org, projectId, rid, "d0000000-0000-4000-8000-000000000202"]));
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", ["d0000000-0000-4000-8000-000000000202"]);
    assert.equal((await database.query("select * from public.product_post_comments")).rows.length, 0);
    await denied(() => database.query(sql, [org, projectId, rid, null, null]));
  } finally {
    await database.exec("reset role");
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [actor]);
  }
  const after = (await database.query("select row_to_json(r) as value from public.project_requirements r where id = $1", [rid])).rows[0].value;
  assert.deepEqual(after, before, "comments must not change technical requirements or approval state");
  process.stdout.write("PASS product/post comments persist with isolated targets, authenticated author, project RLS and unchanged requirements\n");
}
