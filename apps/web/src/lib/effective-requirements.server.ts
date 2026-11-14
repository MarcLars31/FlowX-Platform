import "server-only";
import { selectUserRows } from "./supabase-user-rest";
import { requirementSnapshot } from "./requirement-snapshot";
import { withEffectiveRequirements } from "./effective-requirements";

type Row = Record<string, unknown> & { id: string };

/** Card, search and saving use the same saved extraction for the current post.
 * Reads preserve reviewed corrections and never download or re-extract PDFs. */
export async function loadEffectiveRequirement(projectId: string, requirementId: string, organizationId: string, readRows: typeof selectUserRows = selectUserRows) {
  const [rows, projects] = await Promise.all([
    readRows<Row>("project_requirements", { id: `eq.${requirementId}`, project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`, deleted_at: "is.null", limit: "1" }),
    readRows<Row>("projects", { id: `eq.${projectId}`, organization_id: `eq.${organizationId}`, deleted_at: "is.null", select: "id", limit: "1" })
  ]);
  if (!rows[0] || !projects[0]) return null;
  return withEffectiveRequirements(requirementSnapshot(rows[0]));
}
