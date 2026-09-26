import "server-only";
import {
  deleteAdminStorageObjects,
  downloadAdminStorageObject
} from "@/lib/supabase-admin-storage";
import {
  MAX_TECHNICAL_DESCRIPTION_BYTES,
  technicalDescriptionUploadPath,
  validateTechnicalDescriptionFile,
  type TechnicalDescriptionUploadOwner
} from "@/lib/technical-description-file";

export const TECHNICAL_DESCRIPTION_UPLOAD_BUCKET = "project-files";

export class TechnicalDescriptionUploadError extends Error {}

export function ownedTechnicalDescriptionUploadPath(
  owner: TechnicalDescriptionUploadOwner,
  uploadId: unknown
) {
  try {
    return technicalDescriptionUploadPath(owner, uploadId);
  } catch {
    throw new TechnicalDescriptionUploadError("Ugyldig opplastings-id.");
  }
}

export async function readTechnicalDescriptionUpload(path: string, name: unknown) {
  // Validate before performing an admin download. The caller must derive path
  // with ownedTechnicalDescriptionUploadPath, never from a supplied URL/path.
  const error = validateTechnicalDescriptionFile({ name, size: 1, type: "application/pdf" });
  if (error) throw new TechnicalDescriptionUploadError(error);
  const bytes = await downloadAdminStorageObject(TECHNICAL_DESCRIPTION_UPLOAD_BUCKET, path, {
    maxBytes: MAX_TECHNICAL_DESCRIPTION_BYTES
  });
  return new File([Buffer.from(bytes)], name as string, { type: "application/pdf" });
}

export async function cleanupTechnicalDescriptionUpload(path: string) {
  try {
    await deleteAdminStorageObjects(TECHNICAL_DESCRIPTION_UPLOAD_BUCKET, [path]);
  } catch {
    // A cleanup failure must not turn a saved analysis into a failed upload.
    // Log only the scoped path; signed URLs and service keys stay out of logs.
    console.error("Temporary technical description cleanup failed", { path });
  }
}
