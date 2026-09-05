import {
  normalizeSprsokRecord,
  retry,
  type NormalizedSprsokRecord,
  type SprsokCheckpoint,
  type SprsokSource,
  type SprsokSyncStore
} from "./sprsok-sync-core";
import type { SprsokDatabaseProduct } from "./sprsok-supabase";

export interface SprsokReconciliationClient {
  selectAll<T>(
    table: string,
    select: string,
    additional?: Record<string, string>
  ): Promise<T[]>;
  rpc<T>(name: string, payload?: Record<string, unknown>): Promise<T>;
}

export type SprsokReconciliationIssueType =
  | "missing_database"
  | "missing_index"
  | "hidden_filter"
  | "duplicate"
  | "rejected";

export type SprsokReconciliationIssue = {
  issueType: SprsokReconciliationIssueType;
  sourceRecordKey: string | null;
  externalProductId: string | null;
  supplier: string | null;
  articleNumber: string | null;
  variant: string | null;
  reason: string;
};

export type SprsokReconciliationReport = {
  sourceTotal: number;
  databaseTotal: number;
  indexTotal: number;
  visibleTotal: number;
  missing: number;
  repaired: number;
  duplicates: number;
  errors: number;
  issues: SprsokReconciliationIssue[];
};

type SearchIndexRow = {
  source_record_key: string;
  is_visible: boolean;
  hidden_reason: string | null;
};

export async function reconcileSprsok(input: {
  source: SprsokSource;
  client: SprsokReconciliationClient;
  store: SprsokSyncStore;
  repair?: boolean;
  repairKeys?: readonly string[];
  retryAttempts?: number;
}): Promise<SprsokReconciliationReport> {
  const sourceRecords = await readEntireSource(input.source, input.retryAttempts ?? 4);
  const [databaseRows, indexRows] = await Promise.all([
    input.client.selectAll<SprsokDatabaseProduct>(
      "sprsok_products",
      "id,source_record_key,external_product_id,sin,leverandor,utforelse",
      { source: "eq.sprsok" }
    ),
    input.client.selectAll<SearchIndexRow>(
      "sprsok_product_search_index",
      "source_record_key,is_visible,hidden_reason"
    )
  ]);

  const sourceGroups = groupByKey(sourceRecords);
  const databaseGroups = groupByString(databaseRows, (row) => row.source_record_key);
  const indexByKey = new Map(indexRows.map((row) => [row.source_record_key, row]));
  const issues: SprsokReconciliationIssue[] = [];
  let repaired = 0;
  let errors = 0;
  const repairRun = input.repair
    ? await input.store.beginRun({ resume: false, dryRun: false })
    : null;
  const repairKeySet = input.repairKeys?.length
    ? new Set(input.repairKeys)
    : null;

  for (const record of sourceRecords) {
    if (!record.sourceRecordKey) {
      issues.push(issue("rejected", record, record.validationErrors.join(", ")));
      continue;
    }
    if (!databaseGroups.has(record.sourceRecordKey)) {
      issues.push(issue("missing_database", record, "Source product is missing in database."));
      if (input.repair && (!repairKeySet || repairKeySet.has(record.sourceRecordKey))) {
        try {
          const outcome = await input.store.saveSourceRecord(
            repairRun!.runId,
            record,
            false
          );
          if (outcome === "created" || outcome === "updated") repaired += 1;
          try {
            await input.store.enqueueDatasheet?.(repairRun!.runId, record);
          } catch {
            // Datasheet discovery is explicitly non-blocking for product repair.
          }
        } catch {
          errors += 1;
        }
      }
    }
  }

  for (const row of databaseRows) {
    const index = indexByKey.get(row.source_record_key);
    const record = sourceGroups.get(row.source_record_key)?.[0] ?? fromDatabase(row);
    if (!index) {
      issues.push(issue("missing_index", record, "Database product is missing in search index."));
    } else if (!index.is_visible) {
      issues.push(
        issue("hidden_filter", record, index.hidden_reason || "Hidden by search visibility rule.")
      );
    }
  }

  for (const records of sourceGroups.values()) {
    if (records.length < 2) continue;
    for (const record of records) {
      issues.push(issue("duplicate", record, "Repeated stable source key in Sprsok response."));
    }
  }
  for (const rows of databaseGroups.values()) {
    if (rows.length < 2) continue;
    for (const row of rows) {
      issues.push(issue("duplicate", fromDatabase(row), "Repeated stable source key in database."));
    }
  }

  if (input.repair) {
    const missingIndexKeys = issues
      .filter((entry) => entry.issueType === "missing_index" && entry.sourceRecordKey)
      .map((entry) => entry.sourceRecordKey as string);
    const selectedMissingIndexKeys = repairKeySet
      ? missingIndexKeys.filter((key) => repairKeySet.has(key))
      : missingIndexKeys;
    if (selectedMissingIndexKeys.length > 0) {
      const result = await input.client.rpc<{ indexed: number }>("reindex_sprsok_products", {
        p_source_record_keys: selectedMissingIndexKeys,
        p_dry_run: false
      });
      repaired += result.indexed;
    }
    await input.store.finishRun({
      runId: repairRun!.runId,
      status: errors > 0 ? "failed" : "completed",
      checkpoint: repairRun!.checkpoint,
      counts: {
        sourceTotal: sourceRecords.length,
        pages: 0,
        received: sourceRecords.length,
        accepted: sourceRecords.filter((record) => record.sourceRecordKey).length,
        rejected: sourceRecords.filter((record) => !record.sourceRecordKey).length,
        created: repaired,
        updated: 0,
        unchanged: 0,
        review: issues.filter((entry) => entry.issueType === "rejected").length,
        errors,
        datasheetQueueErrors: 0
      }
    });
  }

  return {
    sourceTotal: sourceRecords.length,
    databaseTotal: databaseRows.length,
    indexTotal: indexRows.length,
    visibleTotal: indexRows.filter((row) => row.is_visible).length,
    missing: issues.filter((entry) =>
      ["missing_database", "missing_index", "hidden_filter"].includes(entry.issueType)
    ).length,
    repaired,
    duplicates: issues.filter((entry) => entry.issueType === "duplicate").length,
    errors,
    issues
  };
}

export function reconciliationCsv(report: SprsokReconciliationReport) {
  const rows: unknown[][] = [
    ["Avvikelse", "Källnyckel", "Externt id", "Leverantör", "Artikelnummer", "Variant", "Orsak"],
    ...report.issues.map((entry) => [
      entry.issueType,
      entry.sourceRecordKey,
      entry.externalProductId,
      entry.supplier,
      entry.articleNumber,
      entry.variant,
      entry.reason
    ])
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

async function readEntireSource(source: SprsokSource, attempts: number) {
  const records: NormalizedSprsokRecord[] = [];
  let checkpoint: SprsokCheckpoint = { cursor: null, offset: 0, pageNumber: 1 };
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 10_000; pageNumber += 1) {
    const key = JSON.stringify(checkpoint);
    if (seen.has(key)) throw new Error("Sprsok pagination loop detected during reconciliation.");
    seen.add(key);
    const page = await retry(() => source.fetchPage(checkpoint), attempts, 250);
    records.push(...page.records.map(normalizeSprsokRecord));
    if (!page.next) return records;
    checkpoint = page.next;
  }
  throw new Error("Sprsok reconciliation exceeded 10,000 pages.");
}

function groupByKey(records: NormalizedSprsokRecord[]) {
  return groupByString(records, (record) => record.sourceRecordKey ?? "");
}

function groupByString<T>(records: T[], key: (record: T) => string) {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const value = key(record);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), record]);
  }
  return groups;
}

function issue(
  issueType: SprsokReconciliationIssueType,
  record: NormalizedSprsokRecord,
  reason: string
): SprsokReconciliationIssue {
  return {
    issueType,
    sourceRecordKey: record.sourceRecordKey,
    externalProductId: record.externalProductId,
    supplier: record.supplier,
    articleNumber: record.manufacturerArticleNumber,
    variant: record.variant,
    reason
  };
}

function fromDatabase(row: SprsokDatabaseProduct): NormalizedSprsokRecord {
  return {
    source: "sprsok",
    sourceRecordKey: row.source_record_key,
    externalProductId: row.external_product_id,
    supplier: row.leverandor,
    manufacturerArticleNumber: row.sin,
    productName: null,
    variant: row.utforelse,
    category: null,
    sourceStatus: "active",
    sin: row.sin,
    leverandor: row.leverandor,
    type: null,
    utforelse: row.utforelse,
    kVerdi: null,
    rti: null,
    datablad: null,
    validationErrors: [],
    sourceData: {}
  };
}

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
