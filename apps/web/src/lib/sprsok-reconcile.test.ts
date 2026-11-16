import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileSprsok,
  reconciliationCsv,
  type SprsokReconciliationClient
} from "./sprsok-reconcile";
import type {
  NormalizedSprsokRecord,
  SprsokSource,
  SprsokSyncStore,
  SprsokUpsertOutcome
} from "./sprsok-sync-core";

test("reconciliation finds missing database, index and hidden products", async () => {
  const client = new FakeClient();
  client.database = [db("id:1"), db("id:2"), db("id:3")];
  client.index = [
    { source_record_key: "id:1", is_visible: true, hidden_reason: null },
    { source_record_key: "id:3", is_visible: false, hidden_reason: "inactive" }
  ];
  const report = await reconcileSprsok({
    source: source([raw("1"), raw("2"), raw("3"), raw("4")]),
    client,
    store: new FakeStore()
  });
  assert.equal(report.sourceTotal, 4);
  assert.equal(report.databaseTotal, 3);
  assert.equal(report.indexTotal, 2);
  assert.deepEqual(
    report.issues.map((entry) => entry.issueType).sort(),
    ["hidden_filter", "missing_database", "missing_index"]
  );
});

test("repair imports missing products and reindexes without duplicates", async () => {
  const client = new FakeClient();
  client.database = [db("id:1"), db("id:2")];
  client.index = [{ source_record_key: "id:1", is_visible: true, hidden_reason: null }];
  const store = new FakeStore();
  const report = await reconcileSprsok({
    source: source([raw("1"), raw("2"), raw("3")]),
    client,
    store,
    repair: true
  });
  assert.deepEqual(store.saved, ["id:3"]);
  assert.deepEqual(client.reindexed, ["id:2"]);
  assert.equal(report.repaired, 2);
});

test("CSV neutralizes spreadsheet formulas", () => {
  const csv = reconciliationCsv({
    sourceTotal: 1,
    databaseTotal: 0,
    indexTotal: 0,
    visibleTotal: 0,
    missing: 1,
    repaired: 0,
    duplicates: 0,
    errors: 0,
    issues: [{
      issueType: "missing_database",
      sourceRecordKey: "=HYPERLINK(example)",
      externalProductId: null,
      supplier: "Viking",
      articleNumber: "1",
      variant: "Standard",
      reason: "missing"
    }]
  });
  assert.match(csv, /"'=HYPERLINK/);
});

function raw(id: string) {
  return { id, supplier: "Viking", article_number: id, name: "Head", variant: "Standard" };
}

function source(records: Record<string, unknown>[]): SprsokSource {
  return { async fetchPage() { return { records, next: null, sourceTotal: records.length }; } };
}

function db(key: string) {
  return {
    id: Number(key.match(/\d+/)?.[0] ?? 1),
    source_record_key: key,
    external_product_id: key.split(":")[1] ?? null,
    sin: key.split(":")[1] ?? null,
    leverandor: "Viking",
    utforelse: "Standard"
  };
}

class FakeClient implements SprsokReconciliationClient {
  database: ReturnType<typeof db>[] = [];
  index: Array<{ source_record_key: string; is_visible: boolean; hidden_reason: string | null }> = [];
  reindexed: string[] = [];

  async selectAll<T>(table: string): Promise<T[]> {
    return (table === "sprsok_products" ? this.database : this.index) as T[];
  }

  async rpc<T>(_name: string, payload: Record<string, unknown> = {}): Promise<T> {
    this.reindexed = (payload.p_source_record_keys as string[] | null) ?? [];
    return { indexed: this.reindexed.length, candidates: this.reindexed.length } as T;
  }
}

class FakeStore implements SprsokSyncStore {
  saved: string[] = [];
  async beginRun() {
    return {
      runId: "00000000-0000-4000-8000-000000000001",
      checkpoint: { cursor: null, offset: 0, pageNumber: 1 }
    };
  }
  async saveSourceRecord(
    _runId: string,
    record: NormalizedSprsokRecord
  ): Promise<SprsokUpsertOutcome> {
    this.saved.push(record.sourceRecordKey ?? "");
    return "created";
  }
  async recordPage() {}
  async recordError() {}
  async finishRun() {}
}
