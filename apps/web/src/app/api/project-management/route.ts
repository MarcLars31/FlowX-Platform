import { NextResponse } from 'next/server';
import { requireOrganizationApi } from '@/lib/organization-api-authorization';
import { callUserRpc, selectUserRows, UserSupabaseError } from '@/lib/supabase-user-rest';
import { readJsonBody } from '@/lib/request-body';
import { isUuid } from '@/lib/distributor-product-mapping';
import { managementError, type WorkNotification } from '@/lib/project-management';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  try {
    const auth = await requireOrganizationApi(['project.requirement.view', 'project.product_suggestion.view']); if (auth.error) return auth.error;
    const [projects, notifications] = await Promise.all([
      callUserRpc('project_management_overview', { oid: auth.context.organization.id }),
      selectUserRows<WorkNotification>('project_work_notifications', { select: 'id,project_id,requirement_id,title,kind,created_at,read_at,projects!inner(organization_id)', 'projects.organization_id': `eq.${auth.context.organization.id}`, recipient_id: `eq.${auth.user.id}`, order: 'created_at.desc,id.desc', limit: '100' })
    ]);
    return json({ projects, notifications });
  } catch (error) {
    const result = managementError(error instanceof UserSupabaseError ? error.code : undefined); return json({ error: result.error }, result.status);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await requireOrganizationApi(['project.requirement.view', 'project.product_suggestion.view']); if (auth.error) return auth.error;
    const body = await readJsonBody<{ id?: unknown }>(request, 1000);
    if (!body || !isUuid(body.id)) return json({ error: 'Ugyldig varsel.' }, 400);
    await callUserRpc('read_project_notification', { nid: body.id }); return json({ saved: true });
  } catch { return json({ error: 'Varselet kunne ikke oppdateres.' }, 400); }
}
