export type SprsokRawRecord = Record<string, unknown>;

export type SprsokCheckpoint = {
  cursor: string | null;
  offset: number;
  pageNumber: number;
};

export type SprsokSourcePage = {
  records: SprsokRawRecord[];
  next: SprsokCheckpoint | null;
  sourceTotal: number | null;
};

export type NormalizedSprsokRecord = {
  source: "sprsok";
  sourceRecordKey: string | null;
  externalProductId: string | null;
  supplier: string | null;
  manufacturerArticleNumber: string | null;
  productName: string | null;
  variant: string | null;
  category: string | null;
  sourceStatus: string;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  kVerdi: string | null;
  rti: string | null;
  datablad: string | null;
  validationErrors: string[];
  sourceData: SprsokRawRecord;
};

export type SprsokUpsertOutcome = "created" | "updated" | "unchanged" | "review";

export type SprsokSyncCounts = {
  sourceTotal: number | null;
  pages: number;
  received: number;
  accepted: number;
  rejected: number;
  created: number;
  updated: number;
  unchanged: number;
  review: number;
  errors: number;
  datasheetQueueErrors: number;
};

export type SprsokSyncResult = SprsokSyncCounts & {
  runId: string;
  status: "completed" | "paused" | "failed";
  checkpoint: SprsokCheckpoint;
};

export interface SprsokSource {
  fetchPage(checkpoint: SprsokCheckpoint): Promise<SprsokSourcePage>;
}

export interface SprsokSyncStore {
  beginRun(options: { resume: boolean; dryRun: boolean }): Promise<{
    runId: string;
    checkpoint: SprsokCheckpoint;
    counts?: SprsokSyncCounts;
  }>;
  saveSourceRecord(
    runId: string,
    record: NormalizedSprsokRecord,
    dryRun: boolean
  ): Promise<SprsokUpsertOutcome>;
  enqueueDatasheet?(runId: string, record: NormalizedSprsokRecord): Promise<void>;
  recordPage(input: {
    runId: string;
    checkpoint: SprsokCheckpoint;
    received: number;
    next: SprsokCheckpoint | null;
    sourceTotal: number | null;
  }): Promise<void>;
  recordError(input: {
    runId: string;
    scope: "page" | "product" | "datasheet";
    recordKey?: string | null;
    checkpoint: SprsokCheckpoint;
    error: unknown;
  }): Promise<void>;
  finishRun(input: {
    runId: string;
    status: SprsokSyncResult["status"];
    checkpoint: SprsokCheckpoint;
    counts: SprsokSyncCounts;
  }): Promise<void>;
}

export type RunSprsokSyncOptions = {
  resume?: boolean;
  dryRun?: boolean;
  maxPages?: number;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const INITIAL_CHECKPOINT: SprsokCheckpoint = {
  cursor: null,
  offset: 0,
  pageNumber: 1
};

export async function runSprsokSynchronization(
  source: SprsokSource,
  store: SprsokSyncStore,
  options: RunSprsokSyncOptions = {}
): Promise<SprsokSyncResult> {
  const dryRun = options.dryRun ?? false;
  const run = await store.beginRun({ resume: options.resume ?? false, dryRun });
  let checkpoint = run.checkpoint ?? INITIAL_CHECKPOINT;
  const counts: SprsokSyncCounts = run.counts ?? {
    sourceTotal: null,
    pages: 0,
    received: 0,
    accepted: 0,
    rejected: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    review: 0,
    errors: 0,
    datasheetQueueErrors: 0
  };
  const seenCheckpoints = new Set<string>();

  while (true) {
    if (options.maxPages && counts.pages >= options.maxPages) {
      return finish("paused");
    }

    const checkpointKey = serializeCheckpoint(checkpoint);
    if (seenCheckpoints.has(checkpointKey)) {
      counts.errors += 1;
      await store.recordError({
        runId: run.runId,
        scope: "page",
        checkpoint,
        error: new Error("Sprsok pagination repeated the same cursor/offset.")
      });
      return finish("failed");
    }
    seenCheckpoints.add(checkpointKey);

    let page: SprsokSourcePage;
    try {
      page = await retry(
        () => source.fetchPage(checkpoint),
        options.retryAttempts ?? 4,
        options.retryBaseDelayMs ?? 250,
        options.sleep
      );
    } catch (error) {
      counts.errors += 1;
      await store.recordError({ runId: run.runId, scope: "page", checkpoint, error });
      return finish("failed");
    }

    counts.pages += 1;
    counts.received += page.records.length;
    counts.sourceTotal = page.sourceTotal ?? counts.sourceTotal;

    for (const rawRecord of page.records) {
      const record = normalizeSprsokRecord(rawRecord);
      if (!record.sourceRecordKey || record.validationErrors.length > 0) {
        counts.rejected += 1;
      } else {
        counts.accepted += 1;
      }

      try {
        const outcome = await store.saveSourceRecord(run.runId, record, dryRun);
        counts[outcome] += 1;

        if (
          !dryRun &&
          store.enqueueDatasheet &&
          (outcome === "created" || outcome === "updated")
        ) {
          try {
            await store.enqueueDatasheet(run.runId, record);
          } catch (error) {
            counts.datasheetQueueErrors += 1;
            await store.recordError({
              runId: run.runId,
              scope: "datasheet",
              recordKey: record.sourceRecordKey,
              checkpoint,
              error
            });
          }
        }
      } catch (error) {
        counts.errors += 1;
        await store.recordError({
          runId: run.runId,
          scope: "product",
          recordKey: record.sourceRecordKey,
          checkpoint,
          error
        });
      }
    }

    await store.recordPage({
      runId: run.runId,
      checkpoint,
      received: page.records.length,
      next: page.next,
      sourceTotal: page.sourceTotal
    });

    if (!page.next) return finish("completed");
    checkpoint = page.next;
  }

  async function finish(status: SprsokSyncResult["status"]) {
    await store.finishRun({ runId: run.runId, status, checkpoint, counts });
    return { runId: run.runId, status, checkpoint, ...counts };
  }
}

export function normalizeSprsokRecord(
  sourceData: SprsokRawRecord
): NormalizedSprsokRecord {
  const externalProductId = firstText(sourceData, [
    "external_product_id",
    "externalProductId",
    "sprsok_id",
    "sprsokId",
    "product_id",
    "productId",
    "id"
  ]);
  const supplier = firstText(sourceData, [
    "supplier",
    "manufacturer",
    "leverandor",
    "leverand\u00f8r",
    "leverantør",
    "leverantör",
    "produsent"
  ]);
  const articleNumber = firstText(sourceData, [
    "manufacturer_article_number",
    "manufacturerArticleNumber",
    "article_number",
    "articleNumber",
    "artikelnummer",
    "artikkelnummer",
    "sin",
    "sku"
  ]);
  const productName = firstText(sourceData, [
    "product_name",
    "productName",
    "name",
    "produktnavn",
    "produktnamn",
    "type"
  ]);
  const variant = firstText(sourceData, [
    "variant",
    "variant_name",
    "variantName",
    "utforelse",
    "utførelse",
    "utförande"
  ]);
  const validationErrors = [
    !supplier ? "missing_supplier" : null,
    !articleNumber ? "missing_article_number" : null,
    !productName ? "missing_product_name" : null
  ].filter((value): value is string => Boolean(value));
  const sourceRecordKey = buildSprsokSourceRecordKey({
    externalProductId,
    supplier,
    articleNumber,
    variant
  });

  return {
    source: "sprsok",
    sourceRecordKey,
    externalProductId,
    supplier,
    manufacturerArticleNumber: articleNumber,
    productName,
    variant,
    category: firstText(sourceData, ["category", "kategori", "product_category"]),
    sourceStatus:
      firstText(sourceData, ["source_status", "status", "product_status"]) ??
      "active",
    sin: articleNumber,
    leverandor: supplier,
    type: productName,
    utforelse: variant,
    kVerdi: firstText(sourceData, ["k_verdi", "kVerdi", "k_factor", "kFactor"]),
    rti: firstText(sourceData, ["rti", "response_time_index"]),
    datablad: firstText(sourceData, ["datablad", "datasheet", "datasheet_url"]),
    validationErrors,
    sourceData
  };
}

export function buildSprsokSourceRecordKey(input: {
  externalProductId: string | null;
  supplier: string | null;
  articleNumber: string | null;
  variant: string | null;
}) {
  const externalId = normalizeIdentityPart(input.externalProductId);
  // Sprsok's external id is unique per variant and remains stable if a variant
  // label is corrected. Variant is only needed in the fallback key below.
  if (externalId) return `id:${externalId}`;

  const supplier = normalizeIdentityPart(input.supplier);
  const article = normalizeArticleNumber(input.articleNumber);
  if (!supplier || !article) return null;
  return `article:${supplier}:${article}:${normalizeIdentityPart(input.variant)}`;
}

export function normalizeArticleNumber(value: string | null | undefined) {
  return value
    ?.normalize("NFKC")
    .trim()
    .toLocaleUpperCase("sv")
    .replace(/[\s\-_.\/]+/g, "") ?? "";
}

export function parseSprsokSourcePage(
  payload: unknown,
  checkpoint: SprsokCheckpoint,
  pageSize: number,
  paginationMode: "cursor" | "offset"
): SprsokSourcePage {
  const root = isObject(payload) ? payload : null;
  const records = Array.isArray(payload)
    ? payload
    : firstArray(root, ["products", "items", "records", "results", "data"]);
  const safeRecords = records.filter(isObject);
  const total = firstNumber(root, ["total", "total_count", "totalCount", "count"]);
  const hasMore = firstBoolean(root, ["has_more", "hasMore"]);
  const explicitCursor = firstNestedText(root, [
    ["next_cursor"],
    ["nextCursor"],
    ["pagination", "next_cursor"],
    ["pagination", "nextCursor"],
    ["meta", "next_cursor"],
    ["links", "next_cursor"]
  ]);

  let next: SprsokCheckpoint | null = null;
  if (paginationMode === "cursor") {
    if (explicitCursor) {
      next = {
        cursor: explicitCursor,
        offset: checkpoint.offset + safeRecords.length,
        pageNumber: checkpoint.pageNumber + 1
      };
    } else if (hasMore === true) {
      throw new Error("Sprsok reported has_more without a next cursor.");
    } else if (total !== null && checkpoint.offset + safeRecords.length < total) {
      throw new Error("Sprsok response ended before the reported total was received.");
    }
  } else {
    const nextOffset = checkpoint.offset + safeRecords.length;
    const moreByTotal = total !== null && nextOffset < total;
    const moreByPageSize = total === null && safeRecords.length === pageSize;
    if (hasMore === true || moreByTotal || moreByPageSize) {
      next = {
        cursor: null,
        offset: nextOffset,
        pageNumber: checkpoint.pageNumber + 1
      };
    }
  }

  return { records: safeRecords, next, sourceTotal: total };
}

export async function retry<T>(
  operation: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= attempts || !isRetryableError(error)) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export function isRetryableError(error: unknown) {
  if (error instanceof SprsokHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
}

export class SprsokHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "SprsokHttpError";
  }
}

function normalizeIdentityPart(value: string | null | undefined) {
  return value
    ?.normalize("NFKC")
    .trim()
    .toLocaleLowerCase("sv")
    .replace(/\s+/g, " ") ?? "";
}

function serializeCheckpoint(checkpoint: SprsokCheckpoint) {
  return `${checkpoint.cursor ?? ""}|${checkpoint.offset}|${checkpoint.pageNumber}`;
}

function firstText(record: SprsokRawRecord | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstArray(record: SprsokRawRecord | null, keys: string[]): unknown[] {
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
    const nested = record[key];
    if (isObject(nested)) {
      const candidate = firstArray(nested, ["items", "products", "records", "results"]);
      if (candidate.length > 0) return candidate;
    }
  }
  return [];
}

function firstNumber(record: SprsokRawRecord | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  for (const nestedKey of ["pagination", "meta"]) {
    const nested = record[nestedKey];
    if (isObject(nested)) {
      const value = firstNumber(nested, keys);
      if (value !== null) return value;
    }
  }
  return null;
}

function firstBoolean(record: SprsokRawRecord | null, keys: string[]): boolean | null {
  if (!record) return null;
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  for (const nestedKey of ["pagination", "meta"]) {
    const nested = record[nestedKey];
    if (isObject(nested)) {
      const value = firstBoolean(nested, keys);
      if (value !== null) return value;
    }
  }
  return null;
}

function firstNestedText(record: SprsokRawRecord | null, paths: string[][]) {
  if (!record) return null;
  for (const path of paths) {
    let value: unknown = record;
    for (const key of path) {
      value = isObject(value) ? value[key] : undefined;
    }
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function isObject(value: unknown): value is SprsokRawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
