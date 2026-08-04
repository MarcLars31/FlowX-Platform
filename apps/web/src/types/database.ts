/**
 * Hand-maintained public database contracts for the completed FlowX pipeline.
 *
 * The source of truth is Supabase. Regenerate full types with:
 * `supabase gen types typescript --project-id myzegtifgbvjhdlcpebi > apps/web/src/types/database.generated.ts`
 * and keep these focused domain aliases for API boundaries.
 */

export type ComplianceStatus = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
export type DatabaseComplianceResult = "pass" | "fail" | "unknown" | "not_applicable";

export type RequirementCandidateStatus =
  | "extracted"
  | "accepted"
  | "rejected"
  | "modified"
  | "duplicate"
  | "requires_review";

export type RequirementVerificationStatus =
  | "unknown"
  | "verified"
  | "rejected"
  | "manual_review";

export type ExtractionRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "requires_review";

export type ProjectDocument = {
  id: string;
  organization_id: string;
  project_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  original_filename: string | null;
  document_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  version: number;
  upload_status: "pending" | "uploading" | "uploaded" | "failed";
  processing_status:
    | "pending"
    | "extracting"
    | "extracted"
    | "analyzing"
    | "completed"
    | "failed"
    | "requires_review";
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExtractionRun = {
  id: string;
  organization_id: string;
  project_id: string | null;
  document_id: string;
  status: ExtractionRunStatus;
  extraction_provider: string;
  model_name: string | null;
  model_version: string | null;
  prompt_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  raw_result: Record<string, unknown> | null;
  token_usage: Record<string, unknown> | null;
  cost_metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementCandidate = {
  id: string;
  organization_id: string;
  project_id: string;
  extraction_run_id: string | null;
  document_id: string | null;
  technical_description_document_id: string | null;
  page_number: number | null;
  raw_text: string;
  requirement_category: string;
  attribute_key: string | null;
  operator: string | null;
  raw_value: string | null;
  normalized_value: unknown;
  unit: string | null;
  is_mandatory: boolean;
  confidence: number | null;
  source_coordinates: unknown[];
  status: RequirementCandidateStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementSet = {
  id: string;
  organization_id: string;
  project_id: string;
  version: number;
  status: "draft" | "under_review" | "confirmed" | "superseded" | "archived";
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementEvaluation = {
  id: string;
  match_candidate_id: string;
  requirement_id: string;
  result: DatabaseComplianceResult;
  explanation: string | null;
  evidence: unknown;
};

export type Database = {
  public: {
    Tables: {
      project_documents: { Row: ProjectDocument };
      extraction_runs: { Row: ExtractionRun };
      requirement_candidates: { Row: RequirementCandidate };
      requirement_sets: { Row: RequirementSet };
      requirement_evaluations: { Row: RequirementEvaluation };
    };
  };
};
