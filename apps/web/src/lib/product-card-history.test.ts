import assert from "node:assert/strict";
import test from "node:test";
import { createProductCardHistory } from "./product-card-history";

function browserHistory() {
  const entries: Array<{ url: string; state: Record<string, unknown> }> = [
    { url: "/projects", state: { __NA: true } },
    { url: "/projects/project?step=products", state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["project"], existing: "keep" } }
  ];
  let index = 1;
  const listeners = new Set<() => void>();
  const pending: number[] = [];
  const flushOne = () => {
    if (!pending.length) return;
    const next = index + pending.shift()!;
    if (next < 0 || next >= entries.length) return;
    index = next;
    listeners.forEach(callback => callback());
  };
  const host = {
    history: {
      get state() { return entries[index].state; },
      pushState(state: Record<string, unknown>) { entries.splice(index + 1); entries.push({ url: entries[index].url, state }); index++; },
      replaceState(state: Record<string, unknown>) { entries[index].state = state; },
      back() { pending.push(-1); },
      forward() { pending.push(1); }
    },
    addEventListener(_type: "popstate", callback: () => void) { listeners.add(callback); },
    removeEventListener(_type: "popstate", callback: () => void) { listeners.delete(callback); }
  };
  return {
    host, entries,
    get url() { return entries[index].url; },
    get index() { return index; },
    flushOne,
    flush() {
      while (pending.length) flushOne();
    }
  };
}

test("Back closes the card on the product table; a second Back leaves the project normally", () => {
  const browser = browserHistory();
  const navigations: Array<string | null> = [];
  const card = createProductCardHistory(browser.host, "project:products", { canLeave: () => true, onNavigate: id => navigations.push(id) });
  const routerState = { ...browser.host.history.state };
  assert.equal(card.open("post-10"), true);
  for (const [key, value] of Object.entries(routerState)) assert.deepEqual(browser.host.history.state[key], value);
  browser.host.history.back(); browser.flush();
  assert.deepEqual(navigations, [null]);
  assert.equal(browser.url, "/projects/project?step=products");
  browser.host.history.back(); browser.flush();
  assert.equal(browser.url, "/projects");
  card.dispose();
});

test("manual close and approval consume the card entry without leaving an extra Back step", () => {
  const browser = browserHistory();
  const card = createProductCardHistory(browser.host, "project:rs", { canLeave: () => false, onNavigate: () => assert.fail("Explicit close must not prompt again") });
  card.open("rs-post");
  card.close();
  assert.equal(card.open("too-soon"), false);
  browser.flush();
  assert.equal(browser.index, 1);
  assert.equal(card.open("another-post"), true);
  assert.equal(browser.entries.length, 3);
  card.close(); browser.flush();
  browser.host.history.back(); browser.flush();
  assert.equal(browser.url, "/projects");
});

test("cancelled unsaved edits or a pending save restore the card without growing history", () => {
  const browser = browserHistory();
  let allowed = false;
  const navigations: Array<string | null> = [];
  const card = createProductCardHistory(browser.host, "project:products", { canLeave: () => allowed, onNavigate: id => navigations.push(id) });
  card.open("post-10");
  for (let attempt = 0; attempt < 2; attempt++) {
    browser.host.history.back(); browser.flush();
    assert.equal(browser.index, 2);
    assert.equal(browser.entries.length, 3);
    assert.equal(card.current(), "post-10");
    assert.deepEqual(navigations, []);
  }
  allowed = true;
  browser.host.history.back(); browser.flush();
  assert.equal(browser.index, 1);
  assert.deepEqual(navigations, [null]);
});

test("Forward reopens the card and switching cards does not add another Back step", () => {
  const browser = browserHistory();
  const navigations: Array<string | null> = [];
  const card = createProductCardHistory(browser.host, "project:removal", { canLeave: () => true, onNavigate: id => navigations.push(id) });
  card.open("information-a"); card.open("information-b");
  assert.equal(browser.entries.length, 3);
  browser.host.history.back(); browser.flush();
  browser.host.history.forward(); browser.flush();
  assert.deepEqual(navigations, [null, "information-b"]);
  card.dispose();
  const restored = createProductCardHistory(browser.host, "project:removal", { canLeave: () => true, onNavigate: () => {} });
  assert.equal(restored.current(), "information-b");
  restored.dispose();
  const otherProject = createProductCardHistory(browser.host, "other:removal", { canLeave: () => true, onNavigate: () => assert.fail("Other project's card cannot open here") });
  assert.equal(otherProject.current(), null);
  otherProject.dispose();
});

test("a save completing during a blocked Back returns to the table after history restoration", () => {
  const browser = browserHistory();
  const card = createProductCardHistory(browser.host, "project:products", { canLeave: () => false, onNavigate: () => assert.fail("The save closes the card itself") });
  card.open("saving-post");
  browser.host.history.back(); browser.flushOne();
  // The browser is on the base entry and Forward is queued when save finishes.
  assert.equal(browser.index, 1);
  card.close(); browser.flush();
  assert.equal(browser.index, 1);
  assert.equal(card.current(), null);
  browser.host.history.back(); browser.flush();
  assert.equal(browser.url, "/projects");
});
