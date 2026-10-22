import test from "node:test";
import assert from "node:assert/strict";
import { createProductWorkspaceResource } from "./product-workspace-resource";
test("revisits and concurrent requests reuse the same response while post IDs and revisions stay isolated", async () => {
  let count = 0;
  const resource = createProductWorkspaceResource(async input => { count++; return Response.json({ url: String(input), count }); });
  const first = resource.load("/post/a", "1");
  assert.equal(first, resource.load("/post/a", "1"));
  assert.deepEqual(await first, await resource.load("/post/a", "1"));
  assert.equal(count, 1);
  await resource.load("/post/b", "1"); await resource.load("/post/a", "2");
  assert.equal(count, 3);
  resource.invalidate("/post/a"); await resource.load("/post/a", "2");
  assert.equal(count, 4);
});
test("failed loads are retryable", async () => {
  let count = 0;
  const resource = createProductWorkspaceResource(async () => ++count === 1 ? Response.json({ error: "Try again" }, { status: 503 }) : Response.json({ ok: true }));
  await assert.rejects(resource.load("/post"), /Try again/);
  assert.deepEqual(await resource.load("/post"), { ok: true });
  assert.equal(count, 2);
});
test("an obsolete request cannot delete a newer request after invalidation", async () => {
  const replies: Array<(response: Response) => void> = [];
  const resource = createProductWorkspaceResource(() => new Promise(resolve => replies.push(resolve)));
  const old = resource.load("/post"), rejected = assert.rejects(old, /old error/);
  resource.invalidate("/post");
  const current = resource.load("/post");
  replies[0](Response.json({ error: "old error" }, { status: 503 }));
  await rejected;
  assert.equal(resource.load("/post"), current);
  replies[1](Response.json({ value: "current" }));
  assert.deepEqual(await current, { value: "current" });
});
