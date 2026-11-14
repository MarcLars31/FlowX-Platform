import "server-only";
import { callSupabaseRpc } from "./supabase-rest";
import { deleteAdminStorageObjects } from "./supabase-admin-storage";

type TemporaryUpload = {
  storage_path: string;
  lease_id: string;
  organization_id: string;
  user_id: string;
  upload_id: string;
};

export async function cleanupTemporaryPdfUploads() {
  const uploads = await callSupabaseRpc<TemporaryUpload[]>("claim_temporary_pdf_cleanup", {});
  const valid = uploads.filter(upload => {
    const expected = `${upload.organization_id}/technical-description-uploads/${upload.user_id}/${upload.upload_id}.pdf`;
    return upload.storage_path === expected && !expected.includes("..");
  });
  if (valid.length !== uploads.length) console.error("invalid_temporary_pdf_cleanup_path");
  if (!valid.length) return;
  try {
    await deleteAdminStorageObjects("project-files", valid.map(upload => upload.storage_path));
    await callSupabaseRpc("finish_temporary_pdf_cleanup_batch", {
      entries: valid.map(({storage_path, lease_id}) => ({storage_path, lease_id}))
    });
  } catch {
    // Keep the leases/metadata for a retry; Storage deletion is idempotent.
    console.warn("temporary_pdf_cleanup_pending", { count: valid.length });
  }
}
