import { after, NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectUserRows } from "@/lib/supabase-user-rest";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { isUuid } from "@/lib/distributor-product-mapping";
import { parseClientOcrPages, ClientOcrPayloadError } from "@/lib/technical-description-ocr-payload";
import { OCR_BATCH_BYTES, OCR_BATCH_PAGES } from "@/lib/ocr-batches";
import { saveOcrCheckpoint } from "@/lib/import-checkpoint.server";
import { runImportWorker, type ImportJob } from "@/lib/import-worker.server";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request: Request, context:{params:Promise<{jobId:string}>}) {
  const auth=await requireOrganizationApi(["technical_description.create","project.requirement.create"]);
  if(auth.error)return auth.error;
  const {jobId}=await context.params;
  if(!isUuid(jobId))return NextResponse.json({error:"Ogiltigt import-id."},{status:400});
  try {
    const [job]=await selectUserRows<ImportJob>("technical_description_jobs",{id:`eq.${jobId}`,organization_id:`eq.${auth.context.organization.id}`,
      created_by:`eq.${auth.user.id}`,select:"id,organization_id,project_id,status,result",limit:"1"});
    if(!job)return NextResponse.json({error:"Importen hittades inte."},{status:404});
    const input=await readJsonBody(request,OCR_BATCH_BYTES);
    const pages=parseClientOcrPages(JSON.stringify(input),Number(job.result?.pageCount),{maxPages:OCR_BATCH_PAGES,maxBytes:OCR_BATCH_BYTES});
    if(!pages?.length)return NextResponse.json({error:"OCR-resultatet saknar sidor."},{status:400});
    const result=await saveOcrCheckpoint(job,auth.user.id,pages);
    if(result.status==="queued")after(()=>runImportWorker(job.id));
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof RequestBodyTooLargeError)return NextResponse.json({error:"OCR-gruppen är för stor."},{status:413});
    if(error instanceof ClientOcrPayloadError || error instanceof SyntaxError)return NextResponse.json({error:"Ogiltigt OCR-resultat."},{status:400});
    console.error("ocr_checkpoint_failed",{name:error instanceof Error?error.name:"Error"});
    return NextResponse.json({error:"OCR kunde inte sparas. Fortsätt under Importstatus."},{status:503});
  }
}
