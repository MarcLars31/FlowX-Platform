import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { MaterialSearchRequestError, requestMaterialMatch, runMaterialSearchQueue, waitForMaterialRetry, type MaterialQueueProgress } from "./material-import-client";
import type { MaterialReview, MaterialSearchInput } from "./material-import";
import { consumeRateLimit } from "./request-rate-limit";

const input: MaterialSearchInput = { description: "Kobberrør", unit: "m", category: "Rør (m)", dimension: "15", fittingDimension: "", dimensionKind: "outside", details: "", query: "" };
const empty = { candidates: [], searchUrl: "https://www.ahlsell.no/search", warnings: [], partial: false };
const noWait = async () => {};

test("row requests respect Retry-After and announce resumption after the pause", async () => {
  let calls = 0;
  const waits: number[] = [], notices: number[] = [];
  const result = await requestMaterialMatch(input, new AbortController().signal, seconds => notices.push(seconds),
    async () => ++calls === 1 ? new Response("busy", { status: 429, headers: { "Retry-After": "17" } }) : Response.json(empty),
    async milliseconds => { waits.push(milliseconds); });
  assert.equal(calls, 2); assert.deepEqual(waits, [17000]); assert.deepEqual(notices, [17, 0]); assert.deepEqual(result, empty);
});

test("persistent throttling and pauses longer than five minutes resume automatically", async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    const waits: number[] = [];
    const result = await requestMaterialMatch(input, new AbortController().signal, () => {}, async () => ++calls <= 4
      ? new Response("busy", { status, headers: { "Retry-After": calls === 1 ? "900" : "1" } }) : Response.json(empty),
    async ms => { waits.push(ms); });
    assert.deepEqual(result, empty); assert.equal(calls, 5);
    assert.deepEqual(waits, [900000, 1000, 30000, 60000]);
  }
});

test("Retry-After also accepts a future HTTP date", async () => {
  const date = new Date(Date.now() + 30_000).toUTCString();
  let calls = 0, delay = 0;
  await requestMaterialMatch(input, new AbortController().signal, () => {}, async () => ++calls === 1
    ? new Response(null, { status: 429, headers: { "Retry-After": date } }) : Response.json(empty), async milliseconds => { delay = milliseconds; });
  assert.ok(delay >= 29_000 && delay <= 30_000);
});

test("stopping during supplier backoff cancels without another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestMaterialMatch(input, controller.signal, () => controller.abort(), async () => {
    calls++; return new Response("busy", { status: 429 });
  }), /abort/i);
  assert.equal(calls, 1);
});

test("cancelled waiting releases immediately", async () => {
  const controller = new AbortController();
  const pending = waitForMaterialRetry(60000, controller.signal);
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test("authentication and permission failures stop immediately even with a non-JSON body", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => {
      calls++; return new Response("<html>login</html>", { status });
    }), error => error instanceof MaterialSearchRequestError && error.stopQueue);
    assert.equal(calls, 1);
  }
});

test("a transient server failure retries and recovers; exhausted and malformed responses stay row errors", async () => {
  let calls = 0;
  const waits: number[] = [];
  assert.deepEqual(await requestMaterialMatch(input, new AbortController().signal, () => {}, async () => ++calls === 1
    ? new Response("<html>gateway timeout</html>", { status: 504 }) : Response.json(empty), async ms => { waits.push(ms); }), empty);
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]);
  for (const status of [200, 502]) {
    let attempts = 0;
    await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => {
      attempts++; return new Response("<html>error</html>", { status });
    }, noWait), error => error instanceof MaterialSearchRequestError && !error.stopQueue);
    assert.equal(attempts, 3);
  }
});

test("invalid individual input is not retried or treated as a service outage", async () => {
  let calls = 0;
  await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async () => {
    calls++; return Response.json({ error: "Invalid row" }, { status: 400 });
  }), error => error instanceof MaterialSearchRequestError && !error.stopQueue && !error.retryable);
  assert.equal(calls, 1);
});

test("a hanging fetch or response body cannot leave a row searching forever", async () => {
  for (const body of [false, true]) {
    let requestSignal: AbortSignal | null | undefined;
    await assert.rejects(requestMaterialMatch(input, new AbortController().signal, () => {}, async (_url, init) => {
      requestSignal = init?.signal;
      if (!body) return new Promise<Response>(() => {});
      return new Response(new ReadableStream<Uint8Array>());
    }, noWait, 5), error => error instanceof MaterialSearchRequestError && !error.stopQueue && /för lång tid/.test(error.message));
    assert.ok(requestSignal?.aborted);
  }
});

function batch(count: number) {
  const ids = Array.from({ length: count }, (_, index) => String(index));
  const reviews = Object.fromEntries(ids.map(id => [id, { input: { ...input, description: `Rör ${id}` }, status: "pending" as const }]));
  const state: Record<string, MaterialReview> = { ...reviews };
  const onReview = (id: string, review: MaterialReview) => { state[id] = review; };
  return { ids, reviews, state, onReview };
}

test("all 242 rows finish across the twenty-per-minute limit, including empty results beyond the first page", async () => {
  const data = batch(242);
  let clock = 1_000_000, calls = 0, inFlight = 0, peak = 0;
  const progress: MaterialQueueProgress[] = [];
  const key = `material-242-${crypto.randomUUID()}`;
  const result = await runMaterialSearchQueue({ ...data, signal: new AbortController().signal,
    now: () => clock, wait: async milliseconds => { clock += milliseconds; }, onProgress: value => progress.push(value),
    match: async (row, signal, onWait) => {
      inFlight++; peak = Math.max(peak, inFlight);
      try { return await requestMaterialMatch(row, signal, onWait, async () => {
        calls++;
        assert.equal(consumeRateLimit(key, 20, 60000, clock).allowed, true, `request ${calls} must respect the real limiter`);
        return Response.json(empty);
      }); } finally { inFlight--; }
    }
  });
  assert.equal(calls, 242); assert.equal(peak, 1);
  assert.equal(result.completed, 242); assert.equal(result.failed, 0); assert.equal(result.stopped, false);
  assert.equal(data.state["241"].status, "empty");
  assert.ok(Object.values(data.state).every(review => review.status === "empty"));
  assert.ok(progress.some(value => value.index === 21 && value.phase === "waiting" && value.reason === "pace"));
  assert.ok(progress.some(value => value.index === 242 && value.phase === "searching"));
});

test("a hung row does not block later rows and automatically recovers on the retry pass", async () => {
  const data = batch(4), visited: string[] = [];
  const result = await runMaterialSearchQueue({ ...data, signal: new AbortController().signal, onProgress: () => {}, wait: noWait,
    match: async (row, signal, onWait) => {
      visited.push(row.description);
      return requestMaterialMatch(row, signal, onWait, async () => row.description === "Rör 1" && visited.length === 2
        ? new Promise<Response>(() => {}) : Response.json(empty), noWait, 5);
    }
  });
  assert.deepEqual(visited, ["Rör 0", "Rör 1", "Rör 2", "Rör 3", "Rör 1"]);
  assert.equal(result.completed, 4); assert.equal(result.failed, 0); assert.equal(result.stopped, false);
  assert.deepEqual(result.remainingIds, []);
});

test("three consecutive failures wait and continue automatically, then retry only failed rows", async () => {
  const data = batch(6), visited: string[] = [], waits: number[] = [], progress: MaterialQueueProgress[] = [];
  let clock = 1000;
  const result = await runMaterialSearchQueue({ ...data, signal: new AbortController().signal, now: () => clock,
    onProgress: value => progress.push(value), wait: async ms => { clock += ms; waits.push(ms); },
    match: async row => { visited.push(row.description); if (visited.length <= 3) throw new MaterialSearchRequestError("Unavailable", false); return empty; }
  });
  assert.equal(result.completed, 6); assert.equal(result.failed, 0); assert.equal(result.stopped, false);
  assert.deepEqual(visited, ["Rör 0", "Rör 1", "Rör 2", "Rör 3", "Rör 4", "Rör 5", "Rör 0", "Rör 1", "Rör 2"]);
  assert.equal(waits.filter(ms => ms === 30000).length, 2);
  assert.ok(progress.some(value => value.id === "0" && value.index === 1 && value.total === 6 && value.attempt === 2));
  assert.ok(progress.some(value => value.reason === "recovery" && value.seconds === 30));
});

test("cancellation during pacing restores the row and keeps earlier results", async () => {
  const data = batch(4), controller = new AbortController();
  let calls = 0;
  const result = await runMaterialSearchQueue({ ...data, signal: controller.signal, onProgress: () => {},
    match: async () => { calls++; return empty; },
    wait: async (_ms, signal) => { controller.abort(); signal.throwIfAborted(); }
  });
  assert.equal(result.cancelled, true); assert.equal(calls, 1);
  assert.equal(data.state["0"].status, "empty"); assert.equal(data.state["1"], data.reviews["1"]);
  assert.equal(data.state["2"].status, "pending");
});


test("supplier pause updates the visible countdown and automatically starts the next attempt", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: 1000 });
  let calls = 0;
  const notices: number[] = [];
  const pending = requestMaterialMatch(input, new AbortController().signal, seconds => notices.push(seconds), async () => ++calls === 1
    ? new Response(null, { status: 429, headers: { "Retry-After": "2" } }) : Response.json(empty));
  await nextTurn();
  assert.deepEqual(notices, [2]); assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  assert.deepEqual(notices, [2, 1]); assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  assert.deepEqual(await pending, empty);
  assert.equal(calls, 2); assert.equal(notices.at(-1), 0);
});

test("stopping during a stalled response restores the current row instead of recording a timeout", async () => {
  const data = batch(3), controller = new AbortController();
  let calls = 0;
  const pending = runMaterialSearchQueue({ ...data, signal: controller.signal, onProgress: () => {},
    match: (row, signal, onWait) => requestMaterialMatch(row, signal, onWait, async () => { calls++; return new Promise<Response>(() => {}); })
  });
  await nextTurn(); controller.abort();
  const result = await pending;
  assert.equal(calls, 1); assert.equal(result.failed, 0); assert.equal(result.cancelled, true);
  assert.equal(data.state["0"], data.reviews["0"]); assert.equal(data.state["1"].status, "pending");
});

test("persistent failures use increasing capped pauses until explicitly stopped", async () => {
  const data = batch(1), controller = new AbortController(), pauses: number[] = [];
  let calls = 0, clock = 1000;
  const result = await runMaterialSearchQueue({ ...data, signal: controller.signal, now: () => clock, onProgress: () => {},
    match: async () => { calls++; throw new MaterialSearchRequestError("Unavailable", false); },
    wait: async (ms, signal) => { pauses.push(ms); clock += ms; if (pauses.length === 6) { controller.abort(); signal.throwIfAborted(); } }
  });
  assert.deepEqual(pauses, [30000, 60000, 120000, 240000, 300000, 300000]);
  assert.equal(calls, 6); assert.equal(result.failed, 1); assert.equal(result.cancelled, true);
  assert.equal(data.state["0"].status, "error"); assert.deepEqual(result.remainingIds, ["0"]);
});

test("invalid row responses are skipped while authentication alone stops automatic recovery", async () => {
  for (const status of [400, 401, 403]) {
    const data = batch(3), visited: string[] = [];
    const result = await runMaterialSearchQueue({ ...data, signal: new AbortController().signal, onProgress: () => {}, wait: noWait,
      match: async (row, signal, notice) => {
        visited.push(row.description);
        return requestMaterialMatch(row, signal, notice, async () => row.description === "Rör 1"
          ? Response.json({error:"Cannot search"}, {status}) : Response.json(empty), noWait);
      }
    });
    assert.equal(result.failed, 1); assert.equal(result.stopped, status !== 400);
    assert.equal(visited.length, status === 400 ? 3 : 2);
    assert.equal(data.state["0"].status, "empty");
    assert.equal(data.state["2"].status, status === 400 ? "empty" : "pending");
  }
});

test("long waits cannot overflow the browser timer and remain cancellable", async t => {
  t.mock.timers.enable({apis:["setTimeout"],now:1000});
  const controller = new AbortController();
  let finished = false;
  const pending = waitForMaterialRetry(2_147_483_647 + 5000, controller.signal).then(() => { finished = true; });
  t.mock.timers.tick(2_147_483_647);
  await nextTurn();
  assert.equal(finished, false);
  t.mock.timers.tick(4999);
  await nextTurn();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  await pending;
  assert.equal(finished, true);
  const cancelled = waitForMaterialRetry(2_147_483_647 + 5000, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, /abort/i);
});

test("a fifteen-minute supplier delay counts down and resumes without manual continuation", async t => {
  t.mock.timers.enable({apis:["Date","setTimeout","setInterval"],now:1000});
  let calls = 0;
  const notices: number[] = [];
  const pending = requestMaterialMatch(input, new AbortController().signal, seconds => notices.push(seconds), async () => ++calls === 1
    ? new Response(null, {status:429,headers:{"Retry-After":"900"}}) : Response.json(empty));
  await nextTurn();
  assert.equal(notices[0], 900); assert.equal(calls, 1);
  t.mock.timers.tick(899000);
  await nextTurn();
  assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  assert.deepEqual(await pending, empty);
  assert.equal(calls, 2); assert.equal(notices.at(-1), 0);
});
