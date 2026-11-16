export type WorkEmail = { id: string; lease: string; project_id: string; email: string | null; kind: string; item_count: number };
export type WorkEmailConfig = { apiKey: string; from: string; appUrl: string };
export function workEmailPayload(job: WorkEmail, config: WorkEmailConfig) {
  const subject = job.kind === 'assignment' ? 'Scipx: nye tildelinger' : job.kind === 'help' ? 'Scipx: en post trenger hjelp' : job.kind === 'resolved' ? 'Scipx: hjelpebehov løst' : job.kind === 'deadline' ? 'Scipx: endret frist' : 'Scipx: nytt spørsmål eller svar';
  const link = new URL(`/projects/${job.project_id}/management`, config.appUrl).href;
  return { from: config.from, to: [job.email], subject, text: `${job.kind === 'assignment' ? `${job.item_count} tildelinger er oppdatert.` : 'Du har et nytt varsel i prosjektet.'}\n\nÅpne Scipx for detaljer:\n${link}\n\nDette er et automatisk varsel. Svar i Scipx.` };
}
export async function deliverWorkEmail(job: WorkEmail, config: WorkEmailConfig, send: typeof fetch = fetch) {
  if (!job.email) return { sent: false, error: 'recipient_missing' };
  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `scipx-work/${job.id}` },
      body: JSON.stringify(workEmailPayload(job, config))
    });
    if (!response.ok) return { sent: false, error: `provider_http_${response.status}` };
    const result = await response.json();
    return typeof result.id === 'string' && result.id ? { sent: true, error: null } : { sent: false, error: 'provider_invalid_response' };
  } catch { return { sent: false, error: 'provider_unavailable' }; }
}
