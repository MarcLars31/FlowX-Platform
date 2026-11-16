/** Fixed local personas. Never accepts an arbitrary email or redirect URL. */
export function localReviewPersona(view: unknown, project: string | undefined) {
  if (!project || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project)) return null;
  const emails: Record<string,string> = { manager: 'utveckling@scipx.local', employee: 'medarbetare@scipx.local', reviewer: 'granskare@scipx.local' };
  const email=typeof view==='string' && Object.hasOwn(emails,view) ? emails[view] : undefined;
  return email ? { email, path: `/projects/${project}/management` } : null;
}
