import { createHash } from "node:crypto";
import { persistenceKey } from "./technical-description-persistence";
import { mergePdfSourceText } from "./pdf-source-text-merge";
import { compactRequirementText } from "./requirement-text-storage";

type Row = Record<string, unknown> & { id?: string };
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const flags = (value: unknown) => Array.isArray(value) ? value.filter((f): f is string => typeof f === "string") : [];
export const isSourcePostTable = (table: string) => ["project_requirements", "requirement_candidates", "technical_description_material_lines"].includes(table);
const fields = (table: string) => table === "project_requirements" ? { source: "source_excerpt", page: "source_page", value: "value_json" }
  : table === "requirement_candidates" ? { source: "raw_text", page: "page_number", value: "normalized_value" }
  : { source: "source_text", page: "source_page", value: "" };

/** Alias raw JSON so the ordinary read projection cannot rewrite its storage references. */
export function sourcePostSelect(table: string) {
  const f = fields(table);
  return `id,updated_at,created_at,${f.page},${f.source},${f.value ? `stored_value:${f.value}` : "post_number,ns_code,quantity,unit,attributes,review_flags"}`;
}
export function rawSourcePost(table: string, row: Row): Row {
  const { value } = fields(table);
  if (!value || !Object.hasOwn(row, "stored_value")) return row;
  return { ...row, [value]: row.stored_value };
}
function sourceIdentity(table: string, row: Row) {
  const f = fields(table), value = object(row[f.value]);
  const post = text(row.post_number ?? value.postNumber).replace(/\s/g, "").replace(/\.$/, "");
  return persistenceKey([row[f.page], post || null]);
}
function stableId(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

/** Identity is a physical page/post occurrence, never the current OCR wording.
 * Match unchanged occurrences first; then reconcile the remaining occurrences
 * in source order. Repeated numbers remain separate and ambiguous alignment is
 * flagged. The enclosing persistence namespace scopes every ID to its document. */
export function planSourcePostRows<T extends Row>(table: string, namespace: string, payloads: T[], saved: Row[]) {
  const f = fields(table), existing = saved.map(row => rawSourcePost(table, row));
  const used = new Set<string>(), matched = new Map<number, Row>();
  const exact = new Map<string, Row[]>(), groups = new Map<string, Row[]>();
  for (const row of existing) {
    const identity = sourceIdentity(table, row), key = persistenceKey([identity, row[f.source]]);
    exact.set(key, [...(exact.get(key) ?? []), row]); groups.set(identity, [...(groups.get(identity) ?? []), row]);
  }
  for (const group of groups.values()) group.sort((a,b) => Number(object(a[f.value]).sourceOrder ?? 0) - Number(object(b[f.value]).sourceOrder ?? 0));
  for (const [index, row] of payloads.entries()) {
    const prior = exact.get(persistenceKey([sourceIdentity(table,row), row[f.source]]))?.find(row => !used.has(row.id!));
    if (prior) { matched.set(index, prior); used.add(prior.id!); }
  }
  const occurrences = new Map<string, number>(), missing: Array<T & { id: string }> = [], ids = new Set(existing.map(row => row.id));
  const rows = payloads.map((payload, index) => {
    const identity = sourceIdentity(table,payload), occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const group = groups.get(identity) ?? [];
    const prior = matched.get(index) ?? group.find(row => !used.has(row.id!));
    if (prior) used.add(prior.id!);
    let id = prior?.id ?? stableId(`${namespace}|source-post-v1|${identity}|${occurrence}`);
    // A resumed insertion may already own this ID under another occurrence.
    // Never let conflict-ignore discard a genuinely different source row.
    if (!prior) for (let collision=0; ids.has(id); collision++) id=stableId(`${namespace}|source-post-v1|${identity}|${occurrence}|${collision}`);
    ids.add(id);
    let row = { ...payload, id } as T & { id: string };
    if (prior && !matched.has(index) && group.length > 1) {
      row = { ...row, ...(f.value ? { [f.value]: { ...object(row[f.value]), reviewFlags: [...flags(object(row[f.value]).reviewFlags), "ambiguous-source-identity"] } }
        : { review_flags: [...flags(row.review_flags), "ambiguous-source-identity"] }) };
    }
    if (!prior) missing.push(row);
    return row;
  });
  if (f.value) {
    // Old imports use fractional positions, newer imports use ordinal numbers.
    // Preserve a valid saved scale when the physical sequence is unchanged;
    // avoid thousands of writes solely to renumber an identical page.
    const pages = new Set(rows.map(row => row[f.page]));
    for (const page of pages) {
      const before = existing.filter(row => row[f.page] === page).sort((a,b) => Number(object(a[f.value]).sourceOrder) - Number(object(b[f.value]).sourceOrder));
      const after = rows.filter(row => row[f.page] === page);
      if (before.length !== after.length || !before.every((row,index) => row.id === after[index].id && Number(object(row[f.value]).sourceOrder) > 0)) continue;
      for (const [index,row] of after.entries()) Object.assign(row, { [f.value]: { ...object(row[f.value]), sourceOrder: object(before[index][f.value]).sourceOrder } });
    }
  }
  return { rows, missing };
}

function mergeText(saved: string, incoming: string) {
  const normalized = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized(saved) === normalized(incoming)) return saved;
  const merged = mergePdfSourceText(saved, incoming).text;
  return normalized(merged) === normalized(saved) ? saved : merged;
}

/** Re-import supplements the source, preserving every saved field, review
 * decision and product reference. It does not silently accept new quantities.
 * Conflicting readings remain separately reviewable in the same post. */
export function sourcePostRefreshChanges(table: string, savedRow: Row, incoming: Row): Row {
  const f = fields(table), saved = rawSourcePost(table, savedRow), old = text(saved[f.source]), next = text(incoming[f.source]);
  const merged = mergeText(old, next);
  // An additive reading may extend the source. A conflicting reading must not
  // concatenate OCR variants into duplicate requirements or undo corrections.
  // Keep that reading separately, visibly reviewable on the same physical post.
  const divergent = merged !== old && Boolean(old) && mergePdfSourceText(old, next).supplemented;
  const source = divergent ? old : merged, changed = source !== old;
  const current = object(saved[f.value]), fresh = object(incoming[f.value]);
  const previousFlags = flags(f.value ? current.reviewFlags : saved.review_flags);
  const incomingFlags = flags(f.value ? fresh.reviewFlags : incoming.review_flags).filter(flag => flag !== "project-information");
  const conflict = changed || divergent || ["quantity", "unit"].some(key => {
    const a = f.value ? current[key] : saved[key], b = f.value ? fresh[key] : incoming[key];
    return b !== null && b !== undefined && persistenceKey(a) !== persistenceKey(b);
  });
  const reviewFlags = [...new Set([...previousFlags, ...incomingFlags, ...(conflict ? ["reextracted-requirement-conflict"] : [])])];
  const changes: Row = {};
  if (changed) changes[f.source] = source;
  if (f.value) {
    const value: Row = { ...current, reviewFlags };
    if (divergent) value.sourceReimportReadings = [...new Set([...flags(current.sourceReimportReadings), next])];
    if (changed) {
      if (typeof value.sourceText === "string") value.sourceText = mergeText(value.sourceText, next);
      if (typeof value.technicalSpecification === "string") value.technicalSpecification = value.technicalSpecification.includes(old)
        ? value.technicalSpecification.replace(old, source) : mergeText(value.technicalSpecification, next);
      if (value.pdfDescriptionText) {
        // A newer OCR body has no verified description-column geometry. Keep
        // its added requirements visible through the merged source instead.
        value.pdfDescriptionText = fresh.pdfDescriptionText ? mergeText(text(value.pdfDescriptionText), text(fresh.pdfDescriptionText)) : null;
      }
    }
    if (typeof fresh.sourceOrder === "number") value.sourceOrder = fresh.sourceOrder;
    const pages = [...new Set([...(Array.isArray(current.sourcePages) ? current.sourcePages : []), ...(Array.isArray(fresh.sourcePages) ? fresh.sourcePages : [])])];
    if (pages.length) value.sourcePages = pages;
    if (persistenceKey(value) !== persistenceKey(current)) changes[f.value] = compactRequirementText({ [f.source]: source, [f.value]: value }, table === "requirement_candidates")[f.value];
  } else {
    if (persistenceKey(reviewFlags) !== persistenceKey(previousFlags)) changes.review_flags = reviewFlags;
    if (divergent) {
      const attributes = object(saved.attributes);
      const nextAttributes = { ...attributes, _pdfSourceReadings: [...new Set([...flags(attributes._pdfSourceReadings), next])] };
      if (persistenceKey(nextAttributes) !== persistenceKey(attributes)) changes.attributes = nextAttributes;
    }
  }
  return changes;
}

type Store = {
  selectUserRows<T>(table: string, filters: Record<string,string>): Promise<T[]>;
  updateUserRowsReturning<T>(table: string, filters: Record<string,string>, changes: Row): Promise<T>;
};
export async function refreshSourcePostRows(table: string, scope: Record<string,string>, incoming: Row[], existing: Row[], db: Store) {
  const heads = new Map(existing.map(row => [row.id, row]));
  for (const row of incoming) {
    const head = heads.get(row.id);
    if (!head || !Object.keys(sourcePostRefreshChanges(table,head,row)).length) continue;
    let done = false;
    for (let attempt=0;attempt<3&&!done;attempt++) {
      const [current] = await db.selectUserRows<Row>(table,{...scope,id:`eq.${row.id}`,select:sourcePostSelect(table)});
      if (!current) throw new Error("PDF post disappeared during source reconciliation.");
      const changes = sourcePostRefreshChanges(table,current,row);
      if (!Object.keys(changes).length) { done=true;break; }
      try {
        await db.updateUserRowsReturning(table,{...scope,id:`eq.${row.id}`,...(typeof current.updated_at === "string" ? {updated_at:`eq.${current.updated_at}`} : {})},changes);
        done=true;
      } catch (error) { if (!(error instanceof Error) || !/returned no row/.test(error.message)) throw error; }
    }
    if (!done) throw new Error("PDF post was edited concurrently. Retry source reconciliation.");
  }
}
