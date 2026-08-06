import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSprsokSourceRecordKey,
  normalizeArticleNumber,
  normalizeSprsokRecord,
  parseSprsokSourcePage,
  runSprsokSynchronization,
  SprsokHttpError,
  type NormalizedSprsokRecord,
  type SprsokCheckpoint,
  type SprsokSource,
  type SprsokSyncStore,
  type SprsokUpsertOutcome
} from "./sprsok-sync-core";

test("normalizes formatted article numbers without removing leading zeroes", () => {
  assert.equal(normalizeArticleNumber(" 00-12 3.4 "), "001234");
  assert.equal(normalizeArticleNumber("åb-01"), "ÅB01");
});

test("uses supplier, article and variant as fallback identity", () => {
  const first = buildSprsokSourceRecordKey({
    externalProductId: null,
    supplier: "Viking",
    articleNumber: "VK-001",
    variant: "QR"
  });
  const second = buildSprsokSourceRecordKey({
    externalProductId: null,
    supplier: "Viking",
    articleNumber: "VK 001",
    variant: "Standard"
  });
  assert.notEqual(first, second);
  assert.match(first ?? "", /^article:viking:VK001:qr$/);
});

test("stable external id does not change when a variant label is corrected", () => {
  const first = buildSprsokSourceRecordKey({
    externalProductId: "123",
    supplier: "Viking",
    articleNumber: "VK1",
    variant: "QR"
  });
  const second = buildSprsokSourceRecordKey({
    externalProductId: "123",
    supplier: "Viking",
    articleNumber: "VK1",
    variant: "Standard"
  });
  assert.equal(first, second);
});

test("normalizes Norwegian source aliases and preserves the raw record", () => {
  const raw = {
    sprsok_id: 42,
    leverandør: "Reliable",
    artikkelnummer: "R-001",
    produktnavn: "Sprinkler",
    utførelse: "Concealed",
    kategori: "Sprinklerhode"
  };
  const record = normalizeSprsokRecord(raw);
  assert.equal(record.externalProductId, "42");
  assert.equal(record.manufacturerArticleNumber, "R-001");
  assert.equal(record.variant, "Concealed");
  assert.deepEqual(record.validationErrors, []);
  assert.equal(record.sourceData, raw);
});

test("marks incomplete rows for review instead of discarding them", () => {
  const record = normalizeSprsokRecord({ id: "incomplete", name: "Valve" });
  assert.deepEqual(record.validationErrors.sort(), [
    "missing_article_number",
    "missing_supplier"
  ]);
  assert.equal(record.sourceRecordKey, "id:incomplete");
});

test("parses cursor pagination including a final incomplete page", () => {
  const first = parseSprsokSourcePage(
    { products: [{ id: 1 }, { id: 2 }], next_cursor: "abc", total: 3 },
    checkpoint(1, 0),
    2,
    "cursor"
  );
  assert.equal(first.records.length, 2);
  assert.deepEqual(first.next, { cursor: "abc", offset: 2, pageNumber: 2 });

  const finalPage = parseSprsokSourcePage(
    { products: [{ id: 3 }], next_cursor: null, total: 3 },
    { cursor: "abc", offset: 2, pageNumber: 2 },
    2,
    "cursor"
  );
  assert.equal(finalPage.records.length, 1);
  assert.equal(finalPage.next, null);
});

test("offset pagination continues through full pages and stops at total", () => {
  const first = parseSprsokSourcePage(
    { items: [{ id: 1 }, { id: 2 }], total_count: 3 },
    checkpoint(1, 0),
    2,
    "offset"
  );
  assert.deepEqual(first.next, { cursor: null, offset: 2, pageNumber: 2 });
  const last = parseSprsokSourcePage(
    { items: [{ id: 3 }], total_count: 3 },
    checkpoint(2, 2),
    2,
    "offset"
  );
  assert.equal(last.next, null);
});

test("sync retries a timeout and imports all API pages", async () => {
  let calls = 0;
  const source: SprsokSource = {
    async fetchPage(position) {
      calls += 1;
      if (calls === 2) throw new SprsokHttpError(504, "timeout");
      if (position.pageNumber === 1) {
        return {
          records: [raw("1"), raw("2")],
          next: checkpoint(2, 2),
          sourceTotal: 3
        };
      }
      return { records: [raw("3")], next: null, sourceTotal: 3 };
    }
  };
  const store = new FakeStore();
  const result = await runSprsokSynchronization(source, store, {
    retryBaseDelayMs: 0,
    sleep: async () => undefined
  });
  assert.equal(result.status, "completed");
  assert.equal(result.received, 3);
  assert.equal(result.pages, 2);
  assert.equal(result.created, 3);
  assert.equal(calls, 3);
});

test("one invalid product does not stop the rest of the page", async () => {
  const store = new FakeStore();
  store.failKeys.add("id:bad");
  const result = await runSprsokSynchronization(
    sourceWith([raw("good"), raw("bad"), raw("later")]),
    store
  );
  assert.equal(result.received, 3);
  assert.equal(result.created, 2);
  assert.equal(result.errors, 1);
  assert.equal(store.errors[0]?.scope, "product");
});

test("resume starts at the persisted cursor", async () => {
  const store = new FakeStore();
  store.startCheckpoint = { cursor: "saved", offset: 100, pageNumber: 5 };
  let observed: SprsokCheckpoint | null = null;
  await runSprsokSynchronization(
    {
      async fetchPage(position) {
        observed = position;
        return { records: [], next: null, sourceTotal: 100 };
      }
    },
    store,
    { resume: true }
  );
  assert.deepEqual(observed, store.startCheckpoint);
});

test("resume preserves counters from pages completed before a timeout", async () => {
  const store = new FakeStore();
  store.startCheckpoint = { cursor: "saved", offset: 2, pageNumber: 2 };
  store.initialCounts = {
    sourceTotal: 3,
    pages: 1,
    received: 2,
    accepted: 2,
    rejected: 0,
    created: 2,
    updated: 0,
    unchanged: 0,
    review: 0,
    errors: 1,
    datasheetQueueErrors: 0
  };
  const result = await runSprsokSynchronization(sourceWith([raw("3")]), store, {
    resume: true
  });
  assert.equal(result.received, 3);
  assert.equal(result.created, 3);
  assert.equal(result.pages, 2);
});

test("idempotent store reports unchanged on a second run", async () => {
  const store = new FakeStore();
  const first = await runSprsokSynchronization(sourceWith([raw("1")]), store);
  const second = await runSprsokSynchronization(sourceWith([raw("1")]), store);
  assert.equal(first.created, 1);
  assert.equal(second.unchanged, 1);
  assert.equal(store.records.size, 1);
});

test("datasheet discovery failure never rolls back product import", async () => {
  const store = new FakeStore();
  store.failDatasheet = true;
  const result = await runSprsokSynchronization(sourceWith([raw("1")]), store);
  assert.equal(result.created, 1);
  assert.equal(result.errors, 0);
  assert.equal(result.datasheetQueueErrors, 1);
  assert.equal(store.records.size, 1);
});

function raw(id: string) {
  return {
    id,
    supplier: "Viking",
    article_number: `VK-${id}`,
    name: "Sprinkler",
    variant: "Standard"
  };
}

function checkpoint(pageNumber: number, offset: number): SprsokCheckpoint {
  return { cursor: null, offset, pageNumber };
}

function sourceWith(records: Record<string, unknown>[]): SprsokSource {
  return {
    async fetchPage() {
      return { records, next: null, sourceTotal: records.length };
    }
  };
}

class FakeStore implements SprsokSyncStore {
  startCheckpoint = checkpoint(1, 0);
  records = new Map<string, NormalizedSprsokRecord>();
  errors: Array<{ scope: string }> = [];
  failKeys = new Set<string>();
  failDatasheet = false;
  initialCounts?: import("./sprsok-sync-core").SprsokSyncCounts;

  async beginRun() {
    return {
      runId: "00000000-0000-4000-8000-000000000001",
      checkpoint: this.startCheckpoint,
      counts: this.initialCounts
    };
  }

  async saveSourceRecord(
    _runId: string,
    record: NormalizedSprsokRecord
  ): Promise<SprsokUpsertOutcome> {
    if (!record.sourceRecordKey) return "review";
    if (this.failKeys.has(record.sourceRecordKey)) throw new Error("row failed");
    const existing = this.records.get(record.sourceRecordKey);
    if (existing && JSON.stringify(existing.sourceData) === JSON.stringify(record.sourceData)) {
      return "unchanged";
    }
    this.records.set(record.sourceRecordKey, record);
    return existing ? "updated" : "created";
  }

  async enqueueDatasheet() {
    if (this.failDatasheet) throw new Error("crawler unavailable");
  }

  async recordPage() {}

  async recordError(input: { scope: "page" | "product" | "datasheet" }) {
    this.errors.push({ scope: input.scope });
  }

  async finishRun() {}
}
