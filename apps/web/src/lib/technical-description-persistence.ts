import { createHash } from "node:crypto";

type Row = Record<string, unknown> & { id?: string };

/** JSONB changes object-key order, so compare content independently of key order. */
export function persistenceKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(persistenceKey).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${persistenceKey(item)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Reuse saved IDs, including rows written before resumable imports existed. */
export function planTechnicalDescriptionRows<T extends Row>(
  namespace: string,
  payloads: T[],
  existing: Row[],
  key: (row: Row) => unknown
) {
  const saved = new Map<string, Row[]>();
  for (const row of existing) {
    const identity = persistenceKey(key(row));
    const rows = saved.get(identity) ?? [];
    rows.push(row);
    saved.set(identity, rows);
  }
  const occurrences = new Map<string, number>();
  const missing: Array<T & { id: string }> = [];
  const rows = payloads.map(payload => {
    const identity = persistenceKey(key(payload));
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const prior = saved.get(identity)?.[occurrence];
    const id = prior?.id ?? stableRowId(`${namespace}|${identity}|${occurrence}`);
    const row = { ...payload, id };
    if (!prior) missing.push(row);
    return row;
  });
  return { rows, missing };
}

function stableRowId(key: string) {
  const bytes = createHash("sha256").update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Bound both database work per transaction and the UTF-8 request body size. */
export async function persistTechnicalDescriptionBatches<T>(
  rows: T[],
  write: (batch: T[]) => Promise<unknown>
) {
  let batch: T[] = [];
  let bytes = 2;
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
    if (batch.length && (batch.length >= 100 || bytes + rowBytes > 512_000)) {
      await write(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += rowBytes;
  }
  if (batch.length) await write(batch);
}

export function isCompleteTechnicalDescription(
  processingStatus: string,
  lineCount: number,
  requirementCount: number,
  expectedCount: number,
  requiresRequirements: boolean
) {
  return ["completed", "requires_review"].includes(processingStatus)
    && lineCount >= expectedCount
    && (!requiresRequirements || requirementCount >= expectedCount);
}
