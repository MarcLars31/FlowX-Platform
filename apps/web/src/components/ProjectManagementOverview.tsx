'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ManagementOverview, WorkNotification } from '@/lib/project-management';

export function ProjectManagementOverview() {
  const [data, setData] = useState<{ projects: ManagementOverview[]; notifications: WorkNotification[] } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/project-management', { cache: 'no-store', signal }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Oversikten kunne ikke lastes.'); setData(result);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === 'visible') void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); };
    refresh(); const timer = setInterval(refresh, 30_000); return () => { clearInterval(timer); controller.abort(); };
  }, [load]);
  async function markRead(id: string) {
    try { const response = await fetch('/api/project-management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); if (!response.ok) throw new Error('Varselet kunne ikke oppdateres.'); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Varselet kunne ikke oppdateres.'); }
  }
  return <section className="space-y-6 p-4 text-slate-900 lg:p-6"><div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Prosjektstyring</h1><p className="mt-1 text-sm text-slate-600">Frister, hjelpebehov og fremdrift på tvers av prosjekter.</p></div><Link href="/projects" className="text-sm text-teal-800 underline">Alle prosjekter</Link></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}{!data && !error && <p role="status">Laster oversikten …</p>}
    {data && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-3">{!data.projects.length && <p className="rounded-xl border bg-white p-6">Ingen prosjekter har aktivert prosjektstyring ennå. Åpne et prosjekt og velg «Prosjektstyring» for å sette opp avdelinger.</p>}
      {data.projects.map(p => <Link href={`/projects/${p.id}/management`} key={p.id} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-teal-600"><div className="flex justify-between gap-3"><h2 className="font-semibold">{p.name}</h2><span className="text-sm text-slate-500">{p.deadline ?? 'Ingen prosjektfrist'}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4"><span><strong>{p.done}/{p.total}</strong> ferdige</span><span className={p.late ? 'text-red-700' : ''}><strong>{p.late}</strong> over fristen</span><span className={p.help ? 'text-amber-800' : ''}><strong>{p.help}</strong> trenger hjelp</span>{p.manager && <span><strong>{p.unassigned}</strong> ikke tildelt</span>}</div><progress aria-label={`Fremdrift for ${p.name}`} value={p.done} max={Math.max(p.total, 1)} className="mt-4 h-2 w-full accent-teal-700" /></Link>)}
      </div><aside className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Varsler <span className="text-slate-500">({data.notifications.filter(n => !n.read_at).length} uleste)</span></h2><p className="mt-1 text-xs text-slate-500">De siste 100 varslene. Oppdateres hvert 30. sekund.</p>{!data.notifications.length && <p className="mt-5 text-sm text-slate-500">Ingen varsler ennå.</p>}
        <ul className="mt-3 divide-y">{data.notifications.map(n => <li key={n.id} className={`py-3 text-sm ${n.read_at ? 'text-slate-500' : 'text-slate-900'}`}><Link href={`/projects/${n.project_id}/management${n.requirement_id ? `?post=${n.requirement_id}` : ''}`} className={!n.read_at ? 'font-semibold hover:underline' : 'hover:underline'}>{n.title}</Link><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(n.created_at))}</p>{!n.read_at && <button className="mt-2 text-xs text-teal-800 underline" onClick={() => void markRead(n.id)}>Marker som lest</button>}</li>)}</ul>
      </aside></div>}
  </section>;
}
