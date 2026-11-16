import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectUserRows } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { readTechnicalDescriptionUpload, ownedTechnicalDescriptionUploadPath } from "@/lib/technical-description-storage";
export async function GET(_request:Request, context:{params:Promise<{jobId:string}>}) {
  const auth=await requireOrganizationApi(["technical_description.view"]); if(auth.error)return auth.error;
  const {jobId}=await context.params; if(!isUuid(jobId))return new NextResponse(null,{status:400});
  const [job]=await selectUserRows<{upload_id:string;file_name:string}>("technical_description_jobs",{
    id:`eq.${jobId}`,organization_id:`eq.${auth.context.organization.id}`,created_by:`eq.${auth.user.id}`,status:"eq.awaiting_ocr",select:"upload_id,file_name",limit:"1"
  });
  if(!job)return new NextResponse(null,{status:404});
  const file=await readTechnicalDescriptionUpload(ownedTechnicalDescriptionUploadPath({organizationId:auth.context.organization.id,userId:auth.user.id},job.upload_id),job.file_name);
  return new NextResponse(await file.arrayBuffer(),{headers:{"Content-Type":"application/pdf","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
