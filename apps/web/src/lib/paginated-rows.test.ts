import assert from "node:assert/strict";
import test from "node:test";
import { collectAllRows, type OffsetPageRequest } from "./paginated-rows";

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
