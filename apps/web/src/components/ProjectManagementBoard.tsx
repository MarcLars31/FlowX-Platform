'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { isLate, osloDate, type WorkThread } from '@/lib/project-management';
import { managementMainPosts, managementChapters, type HierarchyPost as ManagedPost, type HierarchySnapshot as ManagementSnapshot, type HierarchySelection as AssignmentSelection } from '@/lib/project-management-hierarchy';
import { HierarchyAssignmentDialog as AssignmentDialog } from '@/components/HierarchyAssignmentDialog';

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
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [chapterView, setChapterView] = useState<'pdf' | 'main'>('pdf');
  const [settings, setSettings] = useState(false); const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const [department, setDepartment] = useState(''); const [selected, setSelected] = useState<string[]>([]);
  const [assign, setAssign] = useState<AssignmentSelection | null>(null); const [activePost, setActivePost] = useState<string | null>(null);
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
    setBusy(true); setError(''); setNotice('');
    try {
      await requestJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setData(await load()); setNotice('Endringen er lagret.'); return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Endringen kunne ikke lagres.'); return false; }
    finally { setBusy(false); }
  }
  const chapters = useMemo(() => data ? managementChapters(data, chapterView) : [], [data, chapterView]);
  const today = osloDate();
  const filtered = chapters.map(chapter => ({ ...chapter, posts: chapter.posts.filter(post => {
    const work = data?.assignments.find(w => w.id === post.assignmentId);
    return (!department || work?.department_id === department) && (!search || `${post.number} ${post.title} ${post.chapter}`.toLocaleLowerCase('nb').includes(search.toLocaleLowerCase('nb'))) &&
      (filter === 'all' || filter === 'mine' && work?.assigned_to === data?.userId || filter === 'help' && post.openHelp > 0 || filter === 'late' && isLate(post, today) || filter === 'done' && post.done || filter === 'open' && !post.done || filter === 'unassigned' && (!post.assignmentId || post.assignmentMode === 'unassigned'));
  }) })).filter(chapter => chapter.posts.length);
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]); }
  if (!data) return <section className="p-6"><h1 className="text-2xl font-semibold">Prosjektstyring</h1>{error ? <p role="alert" className="mt-4 text-red-700">{error} <button className={button} onClick={() => { setError(''); void load().then(setData).catch(e => setError(e.message)); }}>Prøv igjen</button></p> : <p role="status" className="mt-4">Laster prosjektet …</p>}</section>;
  const name = (id?: string | null) => data.members.find(m => m.id === id)?.name ?? 'Ikke tildelt';
  const editableAssignment = (post: ManagedPost) => data.manager || data.departments.some(d => d.supervisorId === data.userId && d.id === data.assignments.find(w => w.id === post.assignmentId)?.department_id);
  const focused = data.posts.find(post => post.id === activePost);
  return <section className="space-y-6 p-4 text-slate-900 lg:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="text-sm text-teal-800 underline" href="/projects/management">Alle prosjekter og varsler</Link><h1 className="mt-2 text-2xl font-semibold">{data.name}</h1><p className="mt-1 text-sm text-slate-600">Prosjektstyring · {data.manager ? 'Prosjektleder' : data.departments.some(d => d.supervisorId === data.userId) ? 'Arbeidsleder' : 'Medarbeider'}</p></div>
      <div className="flex gap-2"><Link href={`/projects/${projectId}`} className={button}>Åpne prosjekt</Link><button className={button} disabled={busy} onClick={() => { setError(''); void load().then(setData).catch(e => setError(e.message)); }}>Oppdater</button>{data.manager && <button className={button} onClick={() => setSettings(!settings)}>{settings ? 'Vis oppgaver' : 'Avdelinger og frister'}</button>}</div></div>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
    {data.manager && data.emailEnabled === false && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Varsler i Scipx er tilgjengelige. E-post er ikke aktivert i dette miljøet ennå.</p>}
    {(settings || !data.settings && data.departments.length > 0) && data.manager ? <SettingsForm key={data.settings?.revision ?? 'new'} data={data} busy={busy} save={async body => { const ok = await save(body); if (ok) setSettings(false); return ok; }} /> : !data.settings && !data.manager ? <p className="rounded-xl border bg-white p-6">Prosjektlederen må aktivere prosjektstyring og velge avdelinger først.</p> : <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[
        ['Poster', data.posts.length], ['Ferdige', data.posts.filter(p => p.done).length], ['Trenger hjelp', data.posts.filter(p => p.openHelp).length], ['Over fristen', data.posts.filter(p => isLate(p, today)).length], ['Ikke tildelt', data.posts.filter(p => !p.assignmentId || p.assignmentMode === 'unassigned').length]
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>
      <div className="grid gap-3 rounded-xl border bg-white p-4 lg:grid-cols-3"><label className="text-sm">Søk etter post eller kapittel<input className={`${field} mt-1`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Postnummer eller tekst" /></label>
        <label className="text-sm">Avdeling<select className={`${field} mt-1`} value={department} onChange={e => setDepartment(e.target.value)}><option value="">Alle tilgjengelige avdelinger</option>{data.departments.filter(d => d.supervisorId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="text-sm">Vis<select className={`${field} mt-1`} value={filter} onChange={e => setFilter(e.target.value)}>{[['all','Alle poster'],['mine','Mine oppgaver'],['open','Ikke ferdige'],['help','Trenger hjelp'],['late','Over fristen'],['done','Ferdige'],['unassigned','Ikke tildelt']].map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <label className="block max-w-sm text-sm">Kapittelinndeling<select className={`${field} mt-1`} value={chapterView} onChange={e => setChapterView(e.target.value as 'pdf' | 'main')}><option value="pdf">Kapitler fra PDF</option><option value="main">Hovedposter som kapitler</option></select></label>
      {!data.departments.length && <p className="rounded-lg bg-slate-50 p-4 text-sm">Ikke tildelt · Eksisterende avdelinger vises når de er tilgjengelige fra organisasjonen.</p>}
      {selected.length > 0 && <div className="sticky top-0 z-10 flex items-center gap-3 rounded-xl bg-slate-900 p-3 text-white"><span>{selected.length} poster valgt</span><button className={button} disabled={busy || !data.settings || selected.length > 500} onClick={() => setAssign({ type: 'post', ids: selected, label: `${selected.length} valgte poster` })}>Tildel valgte</button><button className="text-sm underline" onClick={() => setSelected([])}>Fjern valg</button>{selected.length > 500 && <span className="text-sm">Velg høyst 500 om gangen.</span>}</div>}
      {filtered.length === 0 && <p className="rounded-xl border bg-white p-8 text-center text-slate-600">Ingen poster passer til visningen. Ufordelt arbeid vises bare for prosjektlederen.</p>}
      {filtered.map(chapter => <details key={chapter.key} open className="overflow-hidden rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer bg-slate-50 px-4 py-3 font-semibold">{chapter.title} <span className="ml-2 text-sm font-normal text-slate-500">{chapter.posts.filter(p => p.done).length} / {chapter.posts.length} ferdige i visningen</span></summary>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm"><span>{chapter.scope !== 'pdf_chapter' && (!chapter.assignment || chapter.assignment.assignment_mode === 'inherit') ? 'Arvet ansvar · se produktpostene' : chapter.assignment && chapter.assignment.assignment_mode !== 'unassigned' && chapter.assignment.assignment_mode !== 'inherit' ? `${data.departments.find(d => d.id === chapter.assignment?.department_id)?.name ?? 'Avdeling må velges'} · ${name(chapter.assignment.assigned_to)}` : 'Ikke tildelt'} · Frist: {chapter.scope === 'pdf_chapter' ? chapter.assignment?.due_date ?? data.settings?.deadline ?? 'Ingen frist' : 'Se produktpostene'}</span>
          {(data.manager || data.departments.some(d => d.id === chapter.assignment?.department_id && d.supervisorId === data.userId)) && <button className={button} disabled={busy || !data.settings || chapter.review} onClick={() => setAssign({ type: chapter.scope, ids: [chapter.anchor], label: chapter.title })}>{chapter.scope === 'pdf_chapter' ? 'Tildel kapittel' : 'Tildel hovedpost'}{data.manager && chapter.scope === 'pdf_chapter' ? ' / endre frist' : ''}</button>}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-10 p-3"><span className="sr-only">Velg</span></th><th className="p-3">Post</th><th className="p-3">Ansvarlig</th><th className="p-3">Frist</th><th className="p-3">Status</th><th className="p-3">Oppfølging</th></tr></thead><tbody>
          {managementMainPosts(chapter.posts, data.assignments).map(group => <Fragment key={group.key}>
            {chapterView === 'pdf' && !group.standalone && <tr className="border-y bg-slate-100"><th colSpan={6} className="p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{group.number} {group.title}</span>{(data.manager || data.departments.some(d => d.supervisorId === data.userId && d.id === data.assignments.find(w => w.id === group.posts[0]?.assignmentId)?.department_id)) && <button className={button} disabled={busy || !data.settings || group.review} onClick={() => setAssign({ type: 'main_post', ids: [group.anchor], label: `${group.number} ${group.title}` })}>Tildel hovedpost</button>}</div></th></tr>}
            {group.review && <tr><td colSpan={6} className="px-3 py-2 text-amber-800">Kontroller hovedpostkoblingen. Originalposten er bevart.</td></tr>}
          {group.posts.map(post => { const work = data.assignments.find(w => w.id === post.assignmentId); return <tr key={post.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-3">{editableAssignment(post) && <input type="checkbox" aria-label={`Velg post ${post.number ?? post.title}`} checked={selected.includes(post.id)} onChange={() => toggle(post.id)} />}</td>
            <td className="max-w-md p-3"><button onClick={() => setActivePost(post.id)} className="text-left font-medium text-teal-900 hover:underline">{post.number ?? 'Uten nummer'} · {post.title || 'Post uten tittel'}</button>{work?.assignment_mode === 'unassigned' && <span className="mt-1 block text-xs text-slate-500">Ikke tildelt · {work.scope_type === 'post' ? 'eget unntak' : work.scope_type === 'main_post' ? 'arvet fra hovedpost' : 'arvet fra kapittel'}</span>}{work?.scope_type === 'main_post' && work.assignment_mode !== 'unassigned' && <span className="mt-1 block text-xs text-slate-500">Arvet fra hovedpost</span>}{work?.scope_type === 'post' && work.assignment_mode !== 'unassigned' && <span className="mt-1 block text-xs text-slate-500">Egen tildeling</span>}</td>
            <td className="p-3">{name(work?.assigned_to)}<span className="block text-xs text-slate-500">{data.departments.find(d => d.id === work?.department_id)?.name}</span></td>
            <td className={`whitespace-nowrap p-3 ${isLate(post, today) ? 'font-semibold text-red-700' : ''}`}>{post.dueDate ?? 'Ingen frist'}<span className="block text-xs font-normal text-slate-500">{post.ownDeadline ? 'Egen frist' : 'Tildelt frist'}</span></td>
            <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${post.done ? 'bg-teal-100 text-teal-900' : post.openHelp ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{post.done ? 'Ferdig' : post.openHelp ? 'Trenger hjelp' : 'Ikke ferdig'}</span></td>
            <td className="p-3"><button className={button} onClick={() => setActivePost(post.id)}>Åpne{post.openHelp ? ` · ${post.openHelp} hjelpebehov` : ''}</button></td></tr>; })}</Fragment>)}
        </tbody></table></div></details>)}
      <p className="text-xs text-slate-500">Klarmarkering gjelder arbeidsoppgaven. Produktvalg og tekniske kontroller følger fortsatt sine egne regler. Hele PDF-underlaget er tilgjengelig for prosjektlederen; avdelinger ser sine tildelte poster.</p>
    </>}
    {assign && <AssignmentDialog key={`${assign.type}:${assign.ids.join()}`} data={data} selection={assign} busy={busy} error={error} close={() => setAssign(null)} save={async body => { const ok = await save(body); if (ok) { setAssign(null); setSelected([]); } return ok; }} />}
    {focused && <PostDialog key={focused.id} post={focused} data={data} busy={busy} saveError={error} close={() => setActivePost(null)} save={save} url={url} />}
  </section>;
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
  return <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">{data.settings ? 'Avdelinger og prosjektfrist' : 'Aktiver prosjektstyring'}</h2><p className="max-w-3xl text-sm text-slate-600">Velg arbeidsleder for hver avdeling som deltar. Aktive avdelingsmedlemmer får prosjekttilgang. Eksisterende sperrede medlemskap beholdes. Avdelinger og medlemmer administreres under organisasjonens team.</p>
    {!data.departments.length && <p className="text-amber-800">Opprett avdelinger og medlemmer i organisasjonen først.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{data.departments.map(d => <label key={d.id} className="text-sm">{d.name}<select className={`${field} mt-1`} value={leaders[d.id] ?? ''} onChange={e => setLeaders({ ...leaders, [d.id]: e.target.value })}><option value="">Deltar ikke</option>{data.members.filter(m => m.departmentId === d.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>)}</div>
    <label className="block max-w-sm text-sm">Prosjektets frist<input className={`${field} mt-1`} type="date" name="deadline" defaultValue={data.settings?.deadline ?? ''} /></label>
    <p className="text-sm text-slate-600">Postene får kapittelets frist ved første tildeling, eller prosjektfristen hvis kapittelet mangler frist. Allerede tildelte datoer beholdes når fristene endres. Bare prosjektlederen kan endre postfrister.</p>
    <p className="text-sm text-slate-600">Flere hjelpebehov kan være åpne samtidig. Alle må løses før klarmarkering. Tildelinger samles i ett e-postvarsel per mottaker og lagring; hjelp og svar varsles med en gang.</p>
    <button type="submit" className={primary} disabled={busy || !Object.values(leaders).some(Boolean)}>{busy ? 'Lagrer …' : data.settings ? 'Lagre innstillinger' : 'Aktiver prosjektstyring'}</button>
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
    <div className="space-y-5"><div className="flex flex-wrap items-center gap-3"><span className="text-sm">Frist: {post.dueDate ?? 'Ingen frist'}</span>{post.canEdit && <button className={primary} disabled={busy || !post.done && post.openHelp > 0} onClick={() => void save({ action: 'task', rid: post.id, revision: post.revision, done: !post.done })}>{post.done ? 'Åpne oppgaven igjen' : 'Marker som ferdig'}</button>}{post.openHelp > 0 && <p className="text-sm text-amber-800">Løs alle åpne hjelpebehov før klarmarkering.</p>}</div>
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
        <button className={primary} disabled={busy || !body.trim() || kind === 'help' && (post.done || !data.settings?.multiple_help_requests && post.openHelp > 0)}>{busy ? 'Sender …' : kind === 'help' ? 'Flagg posten for hjelp' : 'Send melding'}</button>
      </form>}
    </div>
  </Modal>;
}
