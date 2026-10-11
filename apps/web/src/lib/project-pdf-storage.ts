import { createHash } from "node:crypto";
import type * as persistence from "./supabase-user-rest";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function projectPdfStoragePath(organizationId: string, projectId: string, hash: string) {
  if (!uuid.test(organizationId) || !uuid.test(projectId) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid project PDF scope");
  return `${organizationId}/${projectId}/source-pdfs/${hash}.pdf`;
}

/** A single private object per project/source hash; never store PDF bytes in SQL. */
export async function retainProjectPdf(db: typeof persistence, scope: {organizationId:string;projectId:string;documentId:string}, bytes: Uint8Array) {
  const path = projectPdfStoragePath(scope.organizationId, scope.projectId, createHash("sha256").update(bytes).digest("hex"));
  try { await db.uploadUserStorageObject("project-files", path, bytes, "application/pdf"); }
  catch (error) {
    // An interrupted import may already have uploaded this content-addressed object.
    if (!(error instanceof Error) || !("status" in error) || ![400,409].includes(Number(error.status))
      || !("code" in error) || !["Duplicate","ResourceAlreadyExists","409"].includes(String(error.code))) throw error;
  }
  await db.updateUserRowsReturning("project_documents", {
    id:`eq.${scope.documentId}`,organization_id:`eq.${scope.organizationId}`,project_id:`eq.${scope.projectId}`
  }, {storage_bucket:"project-files",storage_path:path});
}
