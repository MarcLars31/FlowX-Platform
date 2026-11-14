import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDeliveryResource, type ProjectDeliveryData } from "./project-delivery-resource";

function data(name: string): ProjectDeliveryData {
  return { manager: true, enforced: true, userId: "user", packages: [], members: [],
    documents: [{ id: "doc", file_name: name, state: "active", role: "specification", revision_label: "A", revision: 0 }],
    reviews: [], requirements: [] };
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

test("tab remounts immediately reuse data while a fresh request runs in the background", async () => {
  const next = deferred();
  let requests = 0;
  const resource = createProjectDeliveryResource("project", async () => ++requests === 1 ? Response.json(data("A")) : next.promise);
  await resource.refresh();
  const previous = resource.getSnapshot().data;
  const unsubscribe = resource.subscribe(() => {});
  unsubscribe(); // A tab unmount does not remove the workspace's data.
  const refresh = resource.refresh();
  assert.equal(resource.getSnapshot().data, previous);
  assert.equal(resource.getSnapshot().refreshing, true);
  next.resolve(Response.json(data("B")));
  await refresh;
  assert.equal(resource.getSnapshot().data?.documents[0].file_name, "B");
  assert.equal(resource.getSnapshot().refreshing, false);
});

test("rapid tab switches share an in-flight request instead of cancelling and starting over", async () => {
  const response = deferred();
  let requests = 0;
  const resource = createProjectDeliveryResource("project", async (url, init) => {
    requests++;
    assert.equal(url, "/api/projects/project/delivery");
    assert.equal(init?.cache, "no-store");
    return response.promise;
  });
  const first = resource.refresh();
  assert.equal(resource.refresh(), first);
  await Promise.resolve();
  assert.equal(requests, 1);
  response.resolve(Response.json(data("A")));
  await first;
});

test("a refresh after saving cannot be overwritten by an older response", async () => {
  const old = deferred(), saved = deferred();
  let requests = 0;
  let oldSignal: AbortSignal | null | undefined;
  const resource = createProjectDeliveryResource("project", async (_url, init) => {
    if (++requests === 1) { oldSignal = init?.signal; return old.promise; }
    return saved.promise;
  });
  const first = resource.refresh();
  await Promise.resolve();
  const afterSave = resource.refresh(true);
  assert.equal(oldSignal?.aborted, true);
  saved.resolve(Response.json(data("Saved revision")));
  await afterSave;
  old.resolve(Response.json(data("Old revision"))); // Even if the transport ignores abort.
  await first;
  assert.equal(resource.getSnapshot().data?.documents[0].file_name, "Saved revision");
});

test("a temporary refresh failure retains readable data and supports retry", async () => {
  let requests = 0;
  const resource = createProjectDeliveryResource("project", async () => {
    if (++requests === 2) throw new Error("Network unavailable");
    return Response.json(data(requests === 1 ? "A" : "B"));
  });
  await resource.refresh();
  await resource.refresh();
  assert.equal(resource.getSnapshot().data?.documents[0].file_name, "A");
  assert.equal(resource.getSnapshot().error, "Network unavailable");
  await resource.refresh();
  assert.equal(resource.getSnapshot().error, "");
  assert.equal(resource.getSnapshot().data?.documents[0].file_name, "B");
});

test("revoked access and deleted projects clear previously cached information", async () => {
  for (const status of [401, 403, 404]) {
    let requests = 0;
    const resource = createProjectDeliveryResource("project", async () => ++requests === 1
      ? Response.json(data("Private project")) : Response.json({ error: "No access" }, { status }));
    await resource.refresh();
    await resource.refresh();
    assert.equal(resource.getSnapshot().data, null);
    assert.equal(resource.getSnapshot().error, "No access");
  }
});

test("each workspace owns its cache even when another user opens the same project", async () => {
  const first = createProjectDeliveryResource("project", async () => Response.json(data("Private")));
  const second = createProjectDeliveryResource("project", async () => Response.json(data("Other session")));
  const otherProject = createProjectDeliveryResource("other-project", async () => Response.json(data("Other project")));
  await first.refresh();
  assert.equal(second.getSnapshot().data, null);
  assert.equal(otherProject.getSnapshot().data, null);
});

test("leaving the workspace cancels pending work and ignores late responses", async () => {
  const response = deferred();
  const resource = createProjectDeliveryResource("project", async () => response.promise);
  const request = resource.refresh();
  await Promise.resolve();
  resource.cancelPending();
  response.resolve(Response.json(data("Late response")));
  await request;
  assert.equal(resource.getSnapshot().data, null);
  assert.equal(resource.getSnapshot().refreshing, false);
});
