import { projectPostIdentity, projectRequirementScope } from "./project-requirement-identity";
import { projectRequirementOrderPostNumber } from "./project-requirement-order";

type Row = Record<string, unknown> & { id: string };

/** Resolve only explicit links within the same import/scope and source order.
 * An invalid ID must never fall back to a different row with the same number.
 * Requiring parents to precede children also makes cycles impossible. */
export function projectRequirementHierarchy(rows: Row[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const positions = new Map(rows.map((row, index) => [row.id, index]));
  const byAddress = new Map<string, Row[]>();
  for (const row of rows) {
    const address = projectPostIdentity(row, projectRequirementOrderPostNumber(row));
    const candidates = byAddress.get(address) ?? [];
    candidates.push(row);
    byAddress.set(address, candidates);
  }
  const parentById = new Map<string, string>();
  const children = new Map<string, Row[]>();
  const unlinked = new Set<string>();
  const ancestors: Record<string, string[]> = {};
  for (const row of rows) {
    const value = row.value_json as Record<string, unknown>;
    const explicitId = typeof value.parentRequirementId === "string" ? value.parentRequirementId.trim() : "";
    const parentNumber = typeof value.parentPostNumber === "string" ? value.parentPostNumber.trim() : "";
    if (explicitId || parentNumber) {
      const candidates = explicitId ? [byId.get(explicitId)] : byAddress.get(projectPostIdentity(row, parentNumber)) ?? [];
      const parent = candidates.length === 1 ? candidates[0] : undefined;
      if (!parent || JSON.stringify(projectRequirementScope(parent)) !== JSON.stringify(projectRequirementScope(row))
        || positions.get(parent.id)! >= positions.get(row.id)!) {
        unlinked.add(row.id);
      } else {
        parentById.set(row.id, parent.id);
        const siblings = children.get(parent.id) ?? [];
        siblings.push(row);
        children.set(parent.id, siblings);
      }
    }
    const parentId = parentById.get(row.id);
    ancestors[row.id] = parentId ? [...ancestors[parentId], parentId] : [];
  }
  return { parentById, children, unlinked, ancestors };
}
