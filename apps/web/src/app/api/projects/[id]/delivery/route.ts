import { NextResponse } from 'next/server';
import { requireOrganizationApi } from '@/lib/organization-api-authorization';
import { callUserRpc, selectAllUserRows, selectUserRows, UserSupabaseError } from '@/lib/supabase-user-rest';
import { isUuid } from '@/lib/distributor-product-mapping';
import { compareDocumentRequirements, initialDeliveryReview, parseDeliveryReview, requirementReferences } from '@/lib/project-delivery';
import { readJsonBody, RequestBodyTooLargeError } from '@/lib/request-body';
import { groupProjectRequirementViews } from '@/lib/project-requirement-views';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
type Row = Record<string, unknown> & { id: string };
const response = (value: unknown) => NextResponse.json(value, {headers:{'Cache-Control':'private, no-store'}});
export async function GET(request: Request, context: Context) {
  try {
    const auth = await requireOrganizationApi(['project.requirement.view','project.product_suggestion.view']); if (auth.error) return auth.error;
    const {id}=await context.params; if (!isUuid(id)) return responseError('Ogiltigt projekt.',400);
    const filters={project_id:`eq.${id}`,organization_id:`eq.${auth.context.organization.id}`};
    const [project]=await selectUserRows<Row>('projects',{id:`eq.${id}`,organization_id:filters.organization_id,deleted_at:'is.null',select:'id,assignments_enforced',limit:'1'});
    if (!project) return responseError('Projektet hittades inte.',404);
    const url=new URL(request.url), rid=url.searchParams.get('requirementId');
    if (rid) {
      if (!isUuid(rid)) return responseError('Ogiltig post.',400);
      const [requirement]=await selectUserRows<Row>('project_requirements',{...filters,id:`eq.${rid}`,deleted_at:'is.null',limit:'1'});
      if (!requirement) return responseError('Posten hittades inte.',404);
      const targets=requirementReferences(requirement,[]).map(x=>x.post).filter(x=>/^\d+(\.\d+)*$/.test(x));
      const [reviews,canEdit,referenced]=await Promise.all([
        selectUserRows<Row>('project_post_workflows',{...filters,requirement_id:`eq.${rid}`,limit:'1'}),
        callUserRpc<boolean>('can_edit_project_requirement',{rid}),
        targets.length ? selectAllUserRows<Row>('project_requirements',{...filters,'value_json->>postNumber':`in.(${targets.join(',')})`,status:'neq.superseded',deleted_at:'is.null',select:'id,value_text,value_json,source_page,source_document_id,source_technical_description_document_id,status',order:'id.asc'}) : []
      ]);
      return response({review:reviews[0]?.review ?? initialDeliveryReview(requirement), revision:reviews[0]?.revision ?? -1, productRevision:requirement.edit_revision, stale:Boolean(reviews[0] && reviews[0].product_revision!==requirement.edit_revision), canEdit, references:requirementReferences(requirement,referenced)});
    }
    const before=url.searchParams.get('before'), after=url.searchParams.get('after');
    const historyDocument=url.searchParams.get('history');
    if (historyDocument) {
      if (!isUuid(historyDocument)) return responseError('Ogiltigt dokument.',400);
      const rows=await selectAllUserRows<Row>('project_requirements',{...filters,source_technical_description_document_id:`eq.${historyDocument}`,select:'id,value_json',order:'id.asc'});
      const choices=await selectAllUserRows<Row>('project_product_suggestions',{...filters,select:'id,requirement_id,status,product_snapshot,updated_at',order:'updated_at.desc,id.asc'});
      return response({history:choices.filter(c=>rows.some(r=>r.id===c.requirement_id)).map(c=>({...c,postNumber:(rows.find(r=>r.id===c.requirement_id)?.value_json as Record<string,unknown>)?.postNumber}))});
    }
    if (before || after) {
      if (!isUuid(before) || !isUuid(after) || before===after) return responseError('Välj två olika dokument.',400);
      const load=(doc:string)=>selectAllUserRows<Row>('project_requirements',{...filters,source_technical_description_document_id:`eq.${doc}`,deleted_at:'is.null',order:'id.asc'});
      const [a,b]=await Promise.all([load(before),load(after)]);
      return response({differences:compareDocumentRequirements(a,b)});
    }
    const [manager,packages,reviews,documents,controls,requirements,members,files]=await Promise.all([
      callUserRpc<boolean>('is_delivery_manager',{pid:id}),
      selectAllUserRows<Row>('project_work_packages',{...filters,order:'scope_value.asc,id.asc'}),
      selectAllUserRows<Row>('project_post_workflows',{...filters,order:'requirement_id.asc'}),
      selectUserRows<Row>('technical_description_documents',{...filters,select:'id,file_name,file_sha256,status,page_count',limit:'1000'}),
      selectUserRows<Row>('project_document_controls',{...filters,limit:'1000'}),
      selectAllUserRows<Row>('project_requirements',{...filters,status:'neq.superseded',deleted_at:'is.null',select:'id,category,edit_revision,source_document_id,source_technical_description_document_id,post_number:value_json->>postNumber,source_chapter:value_json->sourceChapter,unit:value_json->unit,quantity:value_json->quantity',order:'id.asc'}),
      selectUserRows<Row>('organization_members',{organization_id:filters.organization_id,status:'eq.active',select:'id,user_id',limit:'1000'}),
      selectUserRows<Row>('project_documents',{...filters,select:'id,file_sha256',deleted_at:'is.null',limit:'1000'})
    ]);
    const profiles=members.length ? await selectUserRows<Row>('profiles',{select:'id,display_name,email',id:`in.(${members.map(m=>m.user_id).join(',')})`}) : [];
    const memberLabels=members.map(m=>({...m,label:String(profiles.find(p=>p.id===m.user_id)?.display_name ?? profiles.find(p=>p.id===m.user_id)?.email ?? m.user_id)}));
    return response({manager,packages,reviews,documents:documents.map(d=>({...d,...controls.find(c=>c.document_id===d.id),fileId:files.find(f=>f.file_sha256===d.file_sha256)?.id})),requirements:requirements.map(r=>({...r,value_json:{postNumber:r.post_number,sourceChapter:r.source_chapter},actionable:groupProjectRequirementViews([{id:r.id,value_json:{unit:r.unit,quantity:r.quantity}}]).products.length>0})),members:memberLabels,userId:auth.user.id,enforced:project.assignments_enforced});
  } catch(error) { return failed(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const auth=await requireOrganizationApi(['project.requirement.view']); if(auth.error) return auth.error;
    const {id}=await context.params; if(!isUuid(id)) return responseError('Ogiltigt projekt.',400);
    const body=await readJsonBody<Record<string,unknown>>(request,110000);
    if (!body || typeof body!=='object') return responseError('Ogiltig ändring.',400);
    if(body.action==='review') {
      const review=parseDeliveryReview(body.review);
      if(!isUuid(body.requirementId)||!review||!Number.isSafeInteger(body.revision)||!Number.isSafeInteger(body.productRevision)) return responseError('Leveranskontrollen har ogiltigt format.',400);
      return response(await callUserRpc('save_post_delivery',{pid:id,rid:body.requirementId,expected_revision:body.revision,expected_product_revision:body.productRevision,payload:review}));
    }
    if(body.action==='assignment') {
      const payload=body.payload as Record<string,unknown> | undefined;
      if(!payload||!isUuid(payload.assigned_to)||!['chapter','group','pdf_chapter','post'].includes(String(payload.scope_type))||typeof payload.scope_value!=='string'||!payload.scope_value.trim()||payload.scope_value.length>160
        || (['post','pdf_chapter'].includes(String(payload.scope_type))&&!isUuid(payload.scope_value))
        || (payload.id!=null&&(!isUuid(payload.id)||!Number.isSafeInteger(body.revision)))
        || (payload.note!=null&&(typeof payload.note!=='string'||payload.note.length>2000))) return responseError('Välj ansvarig och ett giltigt kapitel, postnummer eller produktgrupp.',400);
      return response(await callUserRpc('save_work_package',{pid:id,payload,expected_revision:body.revision ?? null}));
    }
    if(body.action==='document') {
      const payload=body.payload as Record<string,unknown>|undefined;
      if(!isUuid(body.documentId)||!Number.isSafeInteger(body.revision)||!payload||!['specification','offer','quantity','reference'].includes(String(payload.role))||typeof payload.revision_label!=='string'||payload.revision_label.length>120||(payload.replaces_document_id&&!isUuid(payload.replaces_document_id))) return responseError('Dokumentrollen eller revisionen är ogiltig.',400);
      return response(await callUserRpc('activate_delivery_document',{pid:id,did:body.documentId,expected_revision:body.revision,payload}));
    }
    return responseError('Ogiltig åtgärd.',400);
  } catch(error) { return failed(error); }
}
function responseError(error: string,status: number) { return NextResponse.json({error},{status}); }
function failed(error: unknown) {
  if(error instanceof RequestBodyTooLargeError) return responseError('För mycket information i ändringen.',413);
  if(error instanceof SyntaxError) return responseError('Ogiltig ändring.',400);
  if(error instanceof UserSupabaseError) {
    if(error.code==='42501'||[401,403].includes(error.status)) return responseError('Du kan bara ändra dina tilldelade poster. Projektansvarig hanterar tilldelning och dokument.',403);
    if(error.code==='40001') return responseError('Underlaget har ändrats. Ladda om posten innan du sparar.',409);
    if(['22023','23505','23514'].includes(error.code ?? '')) return responseError('Kontrollera uppgifterna. Leveransen behöver ett sparat produktval, kompletta delar och granskade beslut.',400);
  }
  console.error('project_delivery_failed',{code:error instanceof UserSupabaseError ? error.code : undefined});
  return responseError('Projektstyrningen kunde inte läsas eller sparas. Försök igen.',503);
}
