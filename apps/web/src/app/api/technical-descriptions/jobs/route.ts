import { after, NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { ClientOcrPayloadError, parseClientOcrPages } from "@/lib/technical-description-ocr-payload";
import { runImportWorker, type ImportJob } from "@/lib/import-worker.server";

import { readFormBody, RequestBodyTooLargeError } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireOrganizationApi(["technical_description.create"]);
    if (auth.error) return auth.error;
    const form = await readFormBody(request, 4_100_000);
    if (isUuid(form.get("retryJobId"))) {
      const jobId = await callUserRpc<string>("retry_technical_description_job",{requested_job_id:form.get("retryJobId")});
      after(()=>runImportWorker(jobId));
      return NextResponse.json({jobId},{status:202});
    }
    const uploadId = form.get("uploadId"); const projectId = form.get("projectId"); const fileName = form.get("fileName");
    if (!isUuid(uploadId) || (projectId && !isUuid(projectId)) || typeof fileName !== "string" || !/\.pdf$/i.test(fileName) || fileName.length>255)
      return NextResponse.json({error:"Ogiltig uppladdning."},{status:400});
    const ocr = parseClientOcrPages(form.get("ocrPages"), 100_000);
    const job = await callUserRpc<ImportJob>("enqueue_technical_description_job", {
      requested_organization_id:auth.context.organization.id,requested_project_id:projectId || null,requested_upload_id:uploadId,
      requested_file_name:fileName,requested_create_project:form.get("createProject")==="true",requested_ocr_pages:ocr ?? null
    });
    after(() => runImportWorker(job.id));
    return NextResponse.json({jobId:job.id,projectId:job.project_id,status:job.status,requestId},{status:202,headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({error:"OCR-resultatet är för stort."},{status:413});
    if (error instanceof ClientOcrPayloadError) return NextResponse.json({error:error.message},{status:400});
    if (error instanceof UserSupabaseError && error.code === "42501") return NextResponse.json({error:"Du saknar behörighet för importen."},{status:403});
    if (error instanceof UserSupabaseError && error.code === "54000") return NextResponse.json({error:"Högst tre importer kan pågå samtidigt. Vänta tills en är klar."},{status:429,headers:{"Retry-After":"30"}});
    console.error("import_enqueue_failed",{requestId,name:error instanceof Error ? error.name : "Error"});
    return NextResponse.json({error:"Importen kunde inte startas. Försök igen.",requestId},{status:503});
  }
}
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
  const auth = await requireOrganizationApi(["technical_description.view"]);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (id && !isUuid(id)) return NextResponse.json({error:"Ogiltigt import-id."},{status:400});
  const jobs = await selectUserRows<ImportJob>("technical_description_jobs",{
    organization_id:`eq.${auth.context.organization.id}`,created_by:`eq.${auth.user.id}`, ...(id ? {id:`eq.${id}`} : {}),
    select:"id,project_id,upload_id,file_name,status,phase,attempts,result,error_code,created_at,updated_at", order:"created_at.desc",limit:id ? "1" : "20"
  });
  if (id && !jobs.length) return NextResponse.json({error:"Importen hittades inte."},{status:404});
  if (jobs.some(job=>job.status==="queued")) after(()=>runImportWorker(id));
  return NextResponse.json({jobs},{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    console.error("import_status_failed", {requestId});
    return NextResponse.json({error:"Importstatus kunde inte hämtas. Försök igen.",requestId},{status:503,headers:{"Retry-After":"5"}});
  }
}
