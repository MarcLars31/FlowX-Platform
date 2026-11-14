import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireOrganizationApi } from '@/lib/organization-api-authorization';
import { callUserRpc,selectUserRows,UserSupabaseError } from '@/lib/supabase-user-rest';
import { isUuid } from '@/lib/distributor-product-mapping';
import { buildProjectReport,parseReportFilters,type ReportSource } from '@/lib/project-reports';
import { createProjectReportPdf,createProjectReportWorkbook,reportFilename } from '@/lib/project-report-export';

export const runtime='nodejs';
export const maxDuration=60;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    const auth=await requireOrganizationApi(['project.requirement.view','project.product_suggestion.view']);if(auth.error)return auth.error;
    const {id}=await context.params;if(!isUuid(id))return json({error:'Ugyldig prosjekt.'},400);
    const params=new URL(request.url).searchParams,format=params.get('format') ?? 'json';
    if(!['json','pdf','xlsx'].includes(format)||params.getAll('format').length>1)return json({error:'Velg PDF eller Excel.'},400);
    let filters;try {filters=parseReportFilters(params);}catch(error){return json({error:(error as Error).message},400);}
    const [project]=await selectUserRows<{id:string}>('projects',{id:`eq.${id}`,organization_id:`eq.${auth.context.organization.id}`,deleted_at:'is.null',select:'id',limit:'1'});
    if(!project)return json({error:'Prosjektet finnes ikke.'},404);
    const source=await callUserRpc<ReportSource>('read_project_reports',{pid:id});
    const report=buildProjectReport(source,filters,auth.context.organization.name);
    const version=createHash('sha256').update(JSON.stringify({...report,generatedAt:''})).digest('hex');
    if(format==='json')return json({report,version});
    if(params.get('version')!==version)return json({error:'Rapportgrunnlaget er endret. Oppdater rapporten før du laster ned.'},409);
    const bytes=format==='pdf'?await createProjectReportPdf(report):await createProjectReportWorkbook(report);
    return new Response(Buffer.from(bytes),{headers:{'Cache-Control':'private, no-store','Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${reportFilename(report,format==='pdf'?'pdf':'xlsx')}"`,'X-Content-Type-Options':'nosniff'}});
  }catch(error){
    if(error instanceof UserSupabaseError && (error.code==='42501'||[401,403].includes(error.status)))return json({error:'Du har ikke tilgang til denne rapporten.'},403);
    console.error('project_report_failed',{code:error instanceof UserSupabaseError?error.code:undefined});
    return json({error:'Rapporten kunne ikke hentes. Prøv igjen.'},503);
  }
}
