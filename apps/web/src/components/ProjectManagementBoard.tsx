'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { type WorkThread } from '@/lib/project-management';
import { type HierarchyPost as ManagedPost, type HierarchySnapshot as ManagementSnapshot } from '@/lib/project-management-hierarchy';
import { ProjectAssignmentWorkspace } from '@/components/ProjectAssignmentWorkspace';
import type { AssignmentSaved } from '@/lib/direct-project-assignment';
import { supervisorChanges, type UnifiedAssignmentChange } from '@/lib/unified-project-assignment';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50';
async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Endringen kunne ikke lagres.');
  return value as T;
}
export function ProjectManagementBoard({ projectId, onBusyChange }: { projectId: string; onBusyChange?: (busy: boolean) => void }) {
  const [data, setData] = useState<ManagementSnapshot | null>(null);
  const [undo, setUndo] = useState<AssignmentSaved | null>(null);
  const mutationLock = useRef(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [activePost, setActivePost] = useState<string | null>(null);
  const url = `/api/projects/${projectId}/management`;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const load = useCallback((signal?: AbortSignal) => requestJson<ManagementSnapshot>(url, { signal }), [url]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(next => {
      setData(next);
      const post = new URLSearchParams(window.location.search).get('post');
      if (post && next.posts.some(item => item.id === post)) setActivePost(post);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [load]);
  async function save(body: unknown) {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true); setError(''); setNotice('');
    let saved = false;
    try {
      await requestJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      saved = true; setUndo(null);
      setData(await load()); setNotice('Endringen er lagret.'); return true;
    } catch (error) { setError(saved ? 'Endringen er lagret, men visningen kunne ikke oppdateres. Oppdater før neste endring.' : error instanceof Error ? error.message : 'Endringen kunne ikke lagres.'); if(saved)setData(current=>current?{...current,assignmentVersion:null}:current); return saved; }
    finally { mutationLock.current = false; setBusy(false); }
  }
  async function reload() {
    if(mutationLock.current) return;
    mutationLock.current=true; setBusy(true); setError('');
    try { const next=await load();setData(next);setUndo(current=>current?.assignmentVersion===next.assignmentVersion?current:null); }
    catch(error){setError(error instanceof Error?error.message:'Visningen kunne ikke oppdateres.');}
    finally{mutationLock.current=false;setBusy(false);}
  }
  async function saveDirect(change?: UnifiedAssignmentChange) {
    if (change && data && !data.manager) {
      try { return await save({ action: 'assign', changes: supervisorChanges(data, change) }); }
      catch (error) { setError(error instanceof Error ? error.message : 'Tildelingen kunne ikke lagres.'); return false; }
    }
    if(mutationLock.current) return false;
    if(!data?.assignmentVersion){setError('Oppdater visningen før du endrer tildelingen.');return false;}
    if(!change && !undo?.undoToken)return false;
    mutationLock.current=true;setBusy(true);setError('');setNotice('');
    let saved=false;
    try {
      const result=await requestJson<AssignmentSaved>(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(change?{action:'unifiedAssign',...change,version:data.assignmentVersion}:{action:'directUndo',undoToken:undo?.undoToken,version:undo?.assignmentVersion})});
      saved=true;setUndo(change?result:null);setNotice(change?'Tildelingen er lagret.':'Siste tildeling er angret.');
      const next=await load();setData(next);
      if(next.assignmentVersion!==result.assignmentVersion)setUndo(null);
      return true;
    } catch(error){setError(saved?'Tildelingen er lagret, men visningen kunne ikke oppdateres. Oppdater før neste endring.':error instanceof Error?error.message:'Tildelingen kunne ikke lagres.');if(saved)setData(current=>current?{...current,assignmentVersion:null}:current);return saved;}
    finally{mutationLock.current=false;setBusy(false);}
  }
  if (!data) return <section className="p-6"><h1 className="text-2xl font-semibold">Prosjektstyring</h1>{error ? <p role="alert" className="mt-4 text-red-700">{error} <button className={button} onClick={() => void reload()}>Prøv igjen</button></p> : <p role="status">Laster prosjektet …</p>}</section>;
  const focused = data.posts.find(post => post.id === activePost);
  return <>
    <ProjectAssignmentWorkspace data={data} busy={busy} error={error} notice={notice} canUndo={Boolean(undo?.undoToken)}
      onAssign={saveDirect} onUndo={() => void saveDirect()} onReload={() => void reload()} onOpenPost={setActivePost}
      settings={data.manager ? <SettingsForm key={data.settings?.revision ?? 'new'} data={data} busy={busy} save={save} /> : undefined} />
    {focused && <PostDialog key={focused.id} post={focused} data={data} busy={busy} saveError={error} close={() => setActivePost(null)} save={save} url={url} />}
  </>;
}

function SettingsForm({ data, busy, save }: { data: ManagementSnapshot; busy: boolean; save: (body: unknown) => Promise<boolean> }) {
  const [leaders, setLeaders] = useState<Record<string, string>>(Object.fromEntries(data.departments.map(d => [d.id, d.supervisorId ?? ''])));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await save({ action: 'configure', revision: data.settings?.revision ?? -1, payload: {
      deadline: form.get('deadline') || null,
      departments: Object.entries(leaders).filter(([, lead]) => lead).map(([department_id, supervisor_id]) => ({ department_id, supervisor_id }))
    } });
  }
  return <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">{data.settings ? 'Avdelinger og prosjektfrist' : 'Aktiver prosjektstyring'}</h2><p className="max-w-3xl text-sm text-slate-600">Avdelinger er valgfritt. Velg arbeidsleder for avdelinger som skal delta. Aktive avdelingsmedlemmer får prosjekttilgang. Eksisterende sperrede medlemskap beholdes. Avdelinger og medlemmer administreres under organisasjonens team.</p>
    {!data.departments.length && <p className="text-amber-800">Du kan tildele direkte til personer under Fordel arbeidet. Avdelinger er valgfritt.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{data.departments.map(d => <label key={d.id} className="text-sm">{d.name}<select className={`${field} mt-1`} value={leaders[d.id] ?? ''} onChange={e => setLeaders({ ...leaders, [d.id]: e.target.value })}><option value="">Deltar ikke</option>{data.members.filter(m => m.departmentId === d.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>)}</div>
    <label className="block max-w-sm text-sm">Prosjektets frist<input className={`${field} mt-1`} type="date" name="deadline" defaultValue={data.settings?.deadline ?? ''} /></label>
    <p className="text-sm text-slate-600">Postene får kapittelets frist ved første tildeling, eller prosjektfristen hvis kapittelet mangler frist. Allerede tildelte datoer beholdes når fristene endres. Bare prosjektlederen kan endre postfrister.</p>
    <p className="text-sm text-slate-600">Flere hjelpebehov kan være åpne samtidig. Alle må løses før klarmarkering. Tildelinger samles i ett e-postvarsel per mottaker og lagring; hjelp og svar varsles med en gang.</p>
    <button type="submit" data-variant="primary" className={primary} disabled={busy}>{busy ? 'Lagrer …' : data.settings ? 'Lagre innstillinger' : 'Aktiver prosjektstyring'}</button>
  </form>;
}


function Modal({ title, close, busy, children }: { title: string; close: () => void; busy: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close(); }} className="w-[min(760px,calc(100vw-3rem))] max-w-none rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/50"><div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-xl font-semibold">{title}</h2><button autoFocus disabled={busy} className={button} onClick={close}>Lukk</button></div>{children}</dialog>;
}

function PostDialog({ data, post, url, busy, saveError, close, save }: { data: ManagementSnapshot; post: ManagedPost; url: string; busy: boolean; saveError: string; close: () => void; save: (body: unknown) => Promise<boolean> }) {
  const [thread, setThread] = useState<WorkThread | null>(null); const [error, setError] = useState(''); const [kind, setKind] = useState('reply'); const [helpId, setHelpId] = useState(''); const [body, setBody] = useState('');
  const load = useCallback((signal?: AbortSignal) => requestJson<WorkThread>(`${url}?post=${post.id}`, { signal }), [url, post.id]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal).then(setThread).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [load]);
  const author = (id: string) => data.members.find(m => m.id === id)?.name ?? (id === data.userId ? 'Deg' : 'Prosjektdeltaker');
  const stamp = (time: string) => new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(time));
  async function send(payload: unknown) { const ok = await save({ action: 'message', rid: post.id, payload }); if (ok) await load().then(setThread).catch(e => setError(e.message)); return ok; }
  return <Modal title={`${post.number ?? 'Post'} · ${post.title}`} close={close} busy={busy}>
    {saveError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
    <div className="space-y-5"><div className="flex flex-wrap items-center gap-3"><span className="text-sm">Frist: {post.dueDate ?? 'Ingen frist'}</span>{post.canEdit && <button data-variant="primary" className={primary} disabled={busy || !post.done && post.openHelp > 0} onClick={() => void save({ action: 'task', rid: post.id, revision: post.revision, done: !post.done })}>{post.done ? 'Åpne oppgaven igjen' : 'Marker som ferdig'}</button>}{post.openHelp > 0 && <p className="text-sm text-amber-800">Løs alle åpne hjelpebehov før klarmarkering.</p>}</div>
      {data.manager && <form className="flex items-end gap-2 rounded-lg bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void save({ action: 'deadline', rid: post.id, revision: post.deadlineRevision, deadline: form.get('deadline') || null }); }}><label className="flex-1 text-sm">Egen postfrist<input className={`${field} mt-1`} type="date" name="deadline" defaultValue={post.ownDeadline ?? ''} key={`${post.id}:${post.deadlineRevision}`} /><span className="text-xs text-slate-500">Tomt felt gjenoppretter opprinnelig tildelt frist uten å endre ansvarlig.</span></label><button className={button} disabled={busy}>Lagre frist</button></form>}
      <h3 className="font-semibold">Hjelpebehov og spørsmål</h3>{error && <p role="alert" className="text-red-700">{error}</p>}{!thread && !error && <p role="status">Laster samtalen …</p>}
      {thread?.help.map(help => <article key={help.id} className={`rounded-xl border p-4 ${help.resolved_at ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}><div className="flex justify-between gap-3 text-sm"><strong>{help.resolved_at ? 'Løst' : 'Trenger hjelp'}</strong><span className="text-slate-500">{author(help.created_by)} · {stamp(help.created_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{help.description}</p>
        {thread.messages.filter(m => m.help_id === help.id).map(m => <div key={m.id} className="mt-3 border-l-2 border-slate-300 pl-3"><p className="text-xs text-slate-500">{author(m.created_by)} · {stamp(m.created_at)}</p><p className="whitespace-pre-wrap text-sm">{m.body}</p></div>)}
        {!help.resolved_at && post.canEdit && <div className="mt-3 flex gap-2"><button className={button} disabled={busy} onClick={() => { setKind('reply'); setHelpId(help.id); }}>Svar på hjelpebehovet</button><button className={button} disabled={busy} onClick={() => void send({ kind: 'resolve', help_id: help.id, revision: help.revision })}>Marker som løst</button></div>}
        {help.resolved_at && <p className="mt-2 text-xs text-slate-500">Løst av {author(help.resolved_by ?? '')} · {stamp(help.resolved_at)}</p>}</article>)}
      {thread?.messages.filter(m => !m.help_id).map(m => <article key={m.id} className="rounded-xl border p-4"><p className="text-xs text-slate-500">{author(m.created_by)} · {stamp(m.created_at)}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p></article>)}
      {thread && !thread.help.length && !thread.messages.length && <p className="text-sm text-slate-500">Ingen spørsmål eller hjelpebehov ennå.</p>}
      {post.canEdit && <form className="space-y-3 border-t pt-4" onSubmit={async event => { event.preventDefault(); if (await send({ kind, body, help_id: kind === 'reply' ? helpId || null : null })) { setBody(''); setHelpId(''); } }}>
        <label className="block text-sm">Meldingstype<select value={kind} className={`${field} mt-1`} onChange={e => { setKind(e.target.value); setHelpId(''); }}><option value="reply">Spørsmål eller kommentar</option><option value="help" disabled={post.done || !data.settings?.multiple_help_requests && post.openHelp > 0}>Be arbeidsleder om hjelp</option></select></label>
        {kind === 'reply' && <label className="block text-sm">Samtale<select value={helpId} className={`${field} mt-1`} onChange={e => setHelpId(e.target.value)}><option value="">Vanlig spørsmål / kommentar</option>{thread?.help.filter(h => !h.resolved_at).map(h => <option key={h.id} value={h.id}>{h.description.slice(0, 100)}</option>)}</select></label>}
        <label className="block text-sm">{kind === 'help' ? 'Beskriv hva du trenger hjelp med' : 'Skriv spørsmål eller svar'}<textarea className={`${field} mt-1 min-h-24`} required maxLength={4000} value={body} onChange={e => setBody(e.target.value)} /></label>
        <button data-variant="primary" className={primary} disabled={busy || !body.trim() || kind === 'help' && (post.done || !data.settings?.multiple_help_requests && post.openHelp > 0)}>{busy ? 'Sender …' : kind === 'help' ? 'Flagg posten for hjelp' : 'Send melding'}</button>
      </form>}
    </div>
  </Modal>;
}
