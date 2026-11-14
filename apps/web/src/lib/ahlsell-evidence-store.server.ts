import "server-only";
import { getSupabaseConfig } from "./supabase-rest";
import { createAhlsellEvidenceStorage } from "./ahlsell-evidence-storage";

export function ahlsellEvidenceStore() {
  try { return createAhlsellEvidenceStorage(getSupabaseConfig()); }
  catch { return undefined; }
}
