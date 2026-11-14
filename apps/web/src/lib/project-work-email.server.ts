import 'server-only';
import { callSupabaseRpc } from './supabase-rest';
import { deliverWorkEmail, type WorkEmail, type WorkEmailConfig } from './project-work-email';

export function projectWorkEmailConfig(): WorkEmailConfig | null {
  if (process.env.SCIPX_WORK_EMAIL_ENABLED !== 'true') return null;
  const apiKey = process.env.SCIPX_WORK_EMAIL_API_KEY;
  const from = process.env.SCIPX_WORK_EMAIL_FROM;
  const appUrl = process.env.SCIPX_WORK_EMAIL_APP_URL;
  if (!apiKey || !from || !appUrl) return null;
  try { if (new URL(appUrl).protocol !== 'https:') return null; } catch { return null; }
  return { apiKey, from, appUrl };
}
export async function flushProjectWorkEmails() {
  const config = projectWorkEmailConfig();
  if (!config) return { configured: false, processed: 0 };
  const jobs = await callSupabaseRpc<WorkEmail[]>('claim_project_work_emails', {});
  // Bounded concurrency keeps after() within the route's duration, even during provider failures.
  let next = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]; const result = await deliverWorkEmail(job, config);
      await callSupabaseRpc('finish_project_work_email', { eid: job.id, token: job.lease, succeeded: result.sent, failure: result.error });
    }
  }));
  if (results.some(result => result.status === 'rejected')) throw new Error('Email queue acknowledgement failed');
  return { configured: true, processed: jobs.length };
}
