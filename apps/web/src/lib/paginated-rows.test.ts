import assert from "node:assert/strict";
import test from "node:test";
import { collectAllRows, collectAllRowsById, type OffsetPageRequest } from "./paginated-rows";

test("collects every page in stable offset order", async () => {
  const source = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));
  const requests: OffsetPageRequest[] = [];

  const rows = await collectAllRows(
    async (request) => {
      requests.push(request);
      return source.slice(request.offset, request.offset + request.limit);
    },
    { pageSize: 3, maxRows: 20 }
  );

  assert.deepEqual(rows, source);
  assert.deepEqual(requests, [
    { limit: 3, offset: 0 },
    { limit: 3, offset: 3 },
    { limit: 3, offset: 6 },
    { limit: 3, offset: 7 }
  ]);
});

test("continues when the backend caps a page below the requested size", async () => {
  const source = [1, 2, 3, 4, 5];

  const rows = await collectAllRows(
    async ({ limit, offset }) =>
      source.slice(offset, offset + Math.min(limit, 2)),
    { pageSize: 4, maxRows: 10 }
  );

  assert.deepEqual(rows, source);
});

test("permits exactly maxRows after probing for one more row", async () => {
  const source = [1, 2, 3, 4];
  const requests: OffsetPageRequest[] = [];

  const rows = await collectAllRows(
    async (request) => {
      requests.push(request);
      return source.slice(request.offset, request.offset + request.limit);
    },
    { pageSize: 2, maxRows: 4 }
  );

  assert.deepEqual(rows, source);
  assert.deepEqual(requests, [
    { limit: 2, offset: 0 },
    { limit: 2, offset: 2 },
    { limit: 1, offset: 4 }
  ]);
});

test("fails instead of returning a result truncated at maxRows", async () => {
  const source = [1, 2, 3, 4, 5];

  await assert.rejects(
    collectAllRows(
      async ({ limit, offset }) => source.slice(offset, offset + limit),
      { pageSize: 2, maxRows: 4, resourceLabel: "Project statistics" }
    ),
    /Project statistics exceeds the safety limit of 4 rows/
  );
});

test("rejects invalid page sizes and backend pages larger than requested", async () => {
  await assert.rejects(
    collectAllRows(async () => [], { pageSize: 1001 }),
    /pageSize cannot exceed 1000/
  );
  await assert.rejects(
    collectAllRows(async () => [1, 2], { pageSize: 1 }),
    /returned 2 rows for a page limited to 1/
  );
});

test("ID pagination keeps every row when the server caps pages, without repeating earlier rows", async () => {
  const source = ["a", "c", "e", "g", "i"].map(id => ({ id }));
  const cursors: Array<string | null> = [];
  const rows = await collectAllRowsById(async ({ limit, afterId }) => {
    cursors.push(afterId);
    return source.filter(row => afterId === null || row.id > afterId).slice(0, Math.min(limit, 2));
  }, { pageSize: 4 });
  assert.deepEqual(rows, source);
  assert.deepEqual(cursors, [null, "c", "g", "i"]);
});

test("deleting an earlier row between ID pages does not skip a later row", async () => {
  const source = ["a", "b", "c", "d"].map(id => ({ id }));
  const rows = await collectAllRowsById(async ({ afterId, limit }) => {
    if (afterId === "b") source.shift();
    return source.filter(row => afterId === null || row.id > afterId).slice(0, limit);
  }, { pageSize: 2 });
  assert.deepEqual(rows.map(row => row.id), ["a", "b", "c", "d"]);
});

test("ID pagination rejects repeated or unordered pages and preserves safety limits", async () => {
  await assert.rejects(collectAllRowsById(async () => [{ id: "b" }, { id: "a" }]), /ascending order/);
  await assert.rejects(collectAllRowsById(async () => [{ id: "a" }]), /ascending order/);
  await assert.rejects(collectAllRowsById(async () => [{ value: "no id" }]), /unique string IDs/);
  await assert.rejects(collectAllRowsById(async ({ afterId }) => [{ id: afterId ? "b" : "a" }], { maxRows: 1 }), /safety limit/);
  assert.deepEqual(await collectAllRowsById(async ({ afterId }) => afterId ? [] : [{ id: "a" }], { maxRows: 1 }), [{ id: "a" }]);
});
