import { after, NextResponse } from 'next/server';
import { requireOrganizationApi } from '@/lib/organization-api-authorization';
import { callUserRpc, selectUserRows, UserSupabaseError } from '@/lib/supabase-user-rest';
import { isUuid } from '@/lib/distributor-product-mapping';
import { readJsonBody, RequestBodyTooLargeError } from '@/lib/request-body';
import { managementError } from '@/lib/project-management';
import { actionableManagementSnapshot, type HierarchySnapshot as ManagementSnapshot } from '@/lib/project-management-hierarchy';
import { flushProjectWorkEmails, projectWorkEmailConfig } from '@/lib/project-work-email.server';

export const runtime = 'nodejs';
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function authorize(context: Context) {
  const auth = await requireOrganizationApi(['project.requirement.view', 'project.product_suggestion.view']);
  if (auth.error) return { error: auth.error };
  const { id } = await context.params;
  if (!isUuid(id)) return { error: json({ error: 'Ugyldig prosjekt.' }, 400) };
  const rows = await selectUserRows<{ id: string }>('projects', { id: `eq.${id}`, organization_id: `eq.${auth.context.organization.id}`, deleted_at: 'is.null', select: 'id', limit: '1' });
  if (!rows.length) return { error: json({ error: 'Prosjektet finnes ikke.' }, 404) };
  return { id, error: null };
}
export async function GET(request: Request, context: Context) {
  try {
    const auth = await authorize(context); if (auth.error) return auth.error;
    const rid = new URL(request.url).searchParams.get('post');
    if (rid !== null && !isUuid(rid)) return json({ error: 'Ugyldig post.' }, 400);
    if (rid) return json(await callUserRpc('read_project_work_thread', { pid: auth.id, rid }));
    const snapshot = await callUserRpc<ManagementSnapshot>('read_project_management', { pid: auth.id });
    return json({ ...actionableManagementSnapshot(snapshot), emailEnabled: Boolean(projectWorkEmailConfig()) });
  } catch (error) { return failed(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const auth = await authorize(context); if (auth.error) return auth.error;
    const body = await readJsonBody<Record<string, unknown>>(request, 150_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Ugyldig endring.' }, 400);
    const pid = auth.id;
    switch (body.action) {
      case 'configure':
        if (!Number.isSafeInteger(body.revision) || !body.payload || typeof body.payload !== 'object') return json({ error: 'Velg prosjektregler.' }, 400);
        await callUserRpc('save_project_management', { pid, payload: body.payload, expected_revision: body.revision }); break;
      case 'assign':
        if (!Array.isArray(body.changes) || body.changes.length < 1 || body.changes.length > 500) return json({ error: 'Velg 1–500 tildelinger.' }, 400);
        await callUserRpc('assign_project_work', { pid, changes: body.changes }); break;
      case 'deadline':
        if (!isUuid(body.rid) || !Number.isSafeInteger(body.revision) || (body.deadline !== null && (typeof body.deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)))) return json({ error: 'Ugyldig frist.' }, 400);
        await callUserRpc('set_project_work_deadline', { pid, rid: body.rid, expected_revision: body.revision, deadline: body.deadline }); break;
      case 'task':
        if (!isUuid(body.rid) || !Number.isSafeInteger(body.revision) || typeof body.done !== 'boolean') return json({ error: 'Ugyldig status.' }, 400);
        await callUserRpc('update_project_task', { pid, rid: body.rid, expected_revision: body.revision, mark_done: body.done }); break;
      case 'message':
        if (!isUuid(body.rid) || !body.payload || typeof body.payload !== 'object') return json({ error: 'Ugyldig melding.' }, 400);
        await callUserRpc('write_project_message', { pid, rid: body.rid, payload: body.payload }); break;
      default: return json({ error: 'Ukjent handling.' }, 400);
    }
    after(async () => { try { await flushProjectWorkEmails(); } catch { console.error('project_work_email_flush_failed'); } });
    return json({ saved: true });
  } catch (error) { return failed(error); }
}
function failed(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) return json({ error: 'Endringen er for stor.' }, 413);
  if (error instanceof SyntaxError) return json({ error: 'Ugyldig endring.' }, 400);
  const failure = managementError(error instanceof UserSupabaseError ? error.code : undefined);
  if (failure.status === 503) console.error('project_management_failed', { code: error instanceof UserSupabaseError ? error.code : undefined });
  return json({ error: failure.error }, failure.status);
}
