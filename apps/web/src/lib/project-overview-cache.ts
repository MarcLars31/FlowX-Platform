import { compactProjectRequirement, legacyParentDescription, legacyParentHeadingSources, projectPostIdentity, record, type OverviewRow } from "./project-overview";
import { PRODUCT_REQUIREMENT_CATEGORY_VERSION } from "./product-requirement-category";
import { sortProjectRequirementsBySource } from "./project-requirement-order";

// Bump when any derived overview classification, warning or heading logic changes.
export const REQUIREMENT_OVERVIEW_VERSION = 102 + PRODUCT_REQUIREMENT_CATEGORY_VERSION;

export function cachedRequirementOverview(row: OverviewRow): OverviewRow | null {
  const cache = record(Array.isArray(row.overview_cache) ? row.overview_cache[0] : row.overview_cache);
  const summary = record(cache.summary);
  if (cache.version !== REQUIREMENT_OVERVIEW_VERSION || cache.source_updated_at !== row.updated_at
    || String(cache.source_revision) !== String(row.edit_revision) || summary.id !== row.id
    || !summary.overview || !summary.value_json) return null;
  return summary as OverviewRow;
}

type CacheEntry = { requirement_id: string; source_updated_at: unknown; source_revision: unknown; version: number; summary: OverviewRow };

/** Only stale/missing summaries need source text. A cache failure cannot hide a post. */
export async function resolveRequirementOverviews(heads: OverviewRow[], dependencies: {
  loadDetails(ids: string[]): Promise<OverviewRow[]>;
  save(entries: CacheEntry[]): Promise<void>;
  defer?: (work: () => Promise<void>) => void;
  batchSize?: number;
}) {
  const batchSize = Math.min(500, Math.max(1, dependencies.batchSize ?? 100));
  const resolved = new Map<string, OverviewRow>();
  const missing: string[] = [];
  for (const head of heads) {
    const cached = cachedRequirementOverview(head);
    if (cached) resolved.set(head.id, cached); else missing.push(head.id);
  }
  const detailed: OverviewRow[] = [];
  for (let offset = 0; offset < missing.length; offset += batchSize) detailed.push(...await dependencies.loadDetails(missing.slice(offset, offset + batchSize)));
  const all = [...resolved.values(), ...detailed];
  const recovered = new Map<string, string>();
  for (const row of legacyParentHeadingSources(all).values()) {
    const title = legacyParentDescription(row);
    if (title) recovered.set(projectPostIdentity(row, record(row.value_json).parentPostNumber), title);
  }
  const entries = detailed.map(row => {
    const value = record(row.value_json);
    const parentDescription = value.parentDescription ?? recovered.get(projectPostIdentity(row, value.parentPostNumber));
    const summary = compactProjectRequirement(parentDescription ? { ...row, value_json: { ...value, parentDescription } } : row);
    resolved.set(row.id, summary);
    return { requirement_id: row.id, source_updated_at: row.updated_at, source_revision: row.edit_revision, version: REQUIREMENT_OVERVIEW_VERSION, summary };
  });
  const save = async () => {
    for (let offset = 0; offset < entries.length; offset += batchSize) {
      try { await dependencies.save(entries.slice(offset, offset + batchSize)); }
      catch {
        console.warn("requirement_overview_cache_write_failed", { rows: Math.min(batchSize, entries.length - offset) });
        break;
      }
    }
  };
  if (entries.length) { if (dependencies.defer) dependencies.defer(save); else await save(); }
  const rows = heads.flatMap(head => resolved.has(head.id) ? [resolved.get(head.id)!] : []);
  rows.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id));
  return sortProjectRequirementsBySource(rows);
}
