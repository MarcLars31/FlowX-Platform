import "server-only";
import { callSupabaseRpc, updateSupabaseRowsReturning } from "./supabase-rest";
import { importJobPersistence } from "./import-job-persistence.server";
import { processTechnicalDescription } from "./technical-description-processor";
import { cleanupTechnicalDescriptionUpload, ownedTechnicalDescriptionUploadPath } from "./technical-description-storage";

export type ImportJob = { id:string; organization_id:string; project_id:string; created_by:string; upload_id:string; file_name:string;
  status:string; phase:string; attempts:number; lease_id:string; created_project:boolean; ocr_pages:unknown; result:Record<string,unknown>|null; error_code:string|null };

export async function runImportWorker(jobId: string | null = null) {
  const job = await callSupabaseRpc<ImportJob | null>("claim_technical_description_job", { requested_job_id: jobId });
  if (!job?.id) return;
  const started = Date.now();
  const scope = {id:`eq.${job.id}`,lease_id:`eq.${job.lease_id}`,status:"eq.running",select:"id"};
  const update = async (body: Record<string,unknown>) => {
    const rows = await updateSupabaseRowsReturning("technical_description_jobs",scope,{...body,updated_at:new Date().toISOString()});
    if (!rows.length) throw new Error("IMPORT_LEASE_LOST");
  };
  const authorize = async () => {
    const allowed = await callSupabaseRpc<boolean>("authorize_technical_description_job",{requested_job_id:job.id,requested_lease:job.lease_id});
    if (!allowed) throw new Error("IMPORT_ACCESS_REVOKED");
  };
  try {
    await authorize();
    const form = new FormData();
    form.set("uploadId",job.upload_id); form.set("fileName",job.file_name); form.set("projectId",job.project_id); form.set("responseMode","summary");
    if (job.ocr_pages) form.set("ocrPages",JSON.stringify(job.ocr_pages));
    const response = await processTechnicalDescription(new Request("http://import.internal/process",{method:"POST",body:form}), {
      user:{id:job.created_by}, context:{organization:{id:job.organization_id,name:""},permissions:["technical_description.create","project.requirement.create"]}
    }, importJobPersistence(job,started+275_000), {preserveStaged:true,createdProject:job.created_project,
      onPhase:async phase => {await authorize(); await update({phase}); console.info("import_phase",{jobId:job.id,phase,elapsedMs:Date.now()-started});}});
    const result = await response.json();
    if (response.status === 422 && result.code === "OCR_REQUIRED") {
      await update({status:"awaiting_ocr",phase:"awaiting_ocr",result,lease_until:null}); return;
    }
    if (!response.ok) throw new Error(response.status < 500 && response.status !== 429 ? "IMPORT_INPUT_INVALID" : "IMPORT_RETRY");
    await update({status:"completed",phase:"completed",result,error_code:null,lease_until:null,ocr_pages:null});
    await cleanupTechnicalDescriptionUpload(ownedTechnicalDescriptionUploadPath({organizationId:job.organization_id,userId:job.created_by},job.upload_id));
    console.info("import_completed",{jobId:job.id,elapsedMs:Date.now()-started,attempt:job.attempts});
  } catch (error) {
    if (error instanceof Error && error.message === "IMPORT_LEASE_LOST") return;
    if (error instanceof Error && error.message === "IMPORT_ACCESS_REVOKED") {
      await update({status:"failed",error_code:"ACCESS_REVOKED",lease_until:null}); return;
    }
    const permanent = error instanceof Error && error.message === "IMPORT_INPUT_INVALID";
    await update({status:permanent || job.attempts>=5 ? "failed" : "queued",phase:"retry",error_code:permanent ? "INPUT_INVALID" : "RETRY_REQUIRED",
      lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(300_000,15_000*2**job.attempts)).toISOString()});
    console.error("import_attempt_failed",{jobId:job.id,attempt:job.attempts,elapsedMs:Date.now()-started});
  }
}
