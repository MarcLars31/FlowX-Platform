'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { managementChapters, type HierarchyAssignment, type HierarchySnapshot } from '@/lib/project-management-hierarchy';
import type { AssignmentTarget } from '@/lib/direct-project-assignment';
import { assignmentOrigin, canAssignTargets, matchesAssignmentFilters, targetKey, type AssignmentFilters, type UnifiedAssignmentChange } from '@/lib/unified-project-assignment';
import { isLate, osloDate, workReviewLabels } from '@/lib/project-management';
import { UnifiedAssignmentDialog, type AssignmentSelection } from './UnifiedAssignmentDialog';

const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50';
const primary = 'rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50';
const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';

export function ProjectAssignmentWorkspace({ data, busy, error, notice, canUndo, onAssign, onUndo, onReload, onOpenPost, settings }: {
  data: HierarchySnapshot; busy: boolean; error: string; notice: string; canUndo: boolean;
  onAssign: (change: UnifiedAssignmentChange) => Promise<boolean>; onUndo: () => void; onReload: () => void;
  onOpenPost: (id: string) => void; settings?: ReactNode;
}) {
  const chapters = useMemo(() => managementChapters(data), [data]);
  const [chapterKey, setChapterKey] = useState('');
  const [filters, setFilters] = useState<AssignmentFilters>({ search: '', department: 'all', person: 'all', status: 'all', view: data.manager || data.reviewer ? 'all' : 'mine' });
  const [selected, setSelected] = useState<AssignmentTarget[]>([]);
  const [selection, setSelection] = useState<AssignmentSelection | null>(null);
  const today = osloDate();
  const assignments = new Map(data.assignments.map(work => [work.id, work]));
  const names = new Map([...data.members, ...(data.assignees ?? [])].map(person => [person.id, person.name]));
  const teamNames = new Map(data.departments.map(team => [team.id, team.name]));
  const visible = chapters.map(chapter => ({ ...chapter, shown: chapter.posts.filter(post => matchesAssignmentFilters(data, post, filters, today)) })).filter(chapter => chapter.shown.length);
  const active = visible.find(chapter => chapter.key === chapterKey) ?? visible[0];
  const selectedKeys = new Set(selected.map(targetKey));
  const selectedPosts = new Set<string>();
  for (const target of selected) {
    if (target.scope_type === 'post') selectedPosts.add(target.scope_value);
    else chapters.find(chapter => chapter.scope === target.scope_type && chapter.anchor === target.scope_value)?.posts.forEach(post => selectedPosts.add(post.id));
  }
  function filter<K extends keyof AssignmentFilters>(key: K, value: AssignmentFilters[K]) { setFilters(current => ({ ...current, [key]: value })); setSelected([]); }
  function toggle(target: AssignmentTarget) { setSelected(current => current.some(item => targetKey(item) === targetKey(target)) ? current.filter(item => targetKey(item) !== targetKey(target)) : [...current, target]); }
  function personName(work?: HierarchyAssignment) { return work?.assigned_to ? names.get(work.assigned_to) ?? 'Tidligere ansvarlig' : 'Uten person'; }
  function departmentName(work?: HierarchyAssignment) { return work?.department_id ? teamNames.get(work.department_id) ?? 'Tidligere avdeling' : 'Ingen avdeling'; }
  const ownDepartments = data.departments.some(team => team.supervisorId === data.userId) || data.members.some(person => person.id === data.userId && person.departmentId);
  const canManage = data.manager || data.departments.some(team => team.supervisorId === data.userId);
  const pending = data.posts.filter(post => !assignments.get(post.assignmentId ?? '')?.assigned_to).length;
  const queue = data.posts.filter(post => { const work = assignments.get(post.assignmentId ?? ''); return work?.department_id && !work.assigned_to; }).length;

  return <section className="space-y-5 p-4 text-slate-900 lg:p-6" aria-label="Fordel arbeidet">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Prosjektstyring · {data.name}</p><h1 className="mt-2 text-2xl font-semibold">Kapitler og ansvar</h1><p className="mt-2 text-sm text-slate-600">Fordel kapitler og poster til avdelinger og personer. Følg frister og fremdrift i samme oversikt.</p></div><button className={button} disabled={busy} onClick={onReload}>Oppdater</button></header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[['Poster', data.posts.length], ['Ferdige', data.posts.filter(post => post.done).length], ['Uten person', pending], ['I avdelingskø', queue]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-2xl font-semibold tabular-nums text-teal-950">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-teal-50 px-4 py-3 text-sm"><span>Din rolle i prosjektet: <strong>{data.manager ? 'Prosjektleder' : data.reviewer ? 'Gransker' : canManage ? 'Arbeidsleder' : data.posts.some(post => post.canEdit) ? 'Medarbeider' : 'Leser'}</strong></span>{data.settings?.review_required ? <span>Granskning på · {data.posts.filter(post => post.reviewState === 'ready').length} venter · {data.reviewerName ?? 'Velg aktiv gransker'}</span> : <span>Granskning er av</span>}</div>
    {settings && <details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Avdelinger, frister og granskning</summary><div className="border-t border-slate-200">{settings}</div></details>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" className="underline" disabled={busy} onClick={onReload}>Oppdater visningen</button></p>}
    {(notice || canUndo) && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-teal-50 p-3"><p role="status" className="text-sm text-teal-950">{notice}</p>{canUndo && <button className={button} disabled={busy} onClick={onUndo}>Angre siste tildeling</button>}</div>}
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Arbeidsvisning">{[['all', data.manager ? 'Hele prosjektet' : 'Tilgjengelige poster'], ['department', 'Min avdeling'], ['mine', 'Mine oppgaver']].filter(([value]) => value !== 'department' || ownDepartments).map(([value, label]) => <button key={value} className={filters.view === value ? primary : button} aria-pressed={filters.view === value} onClick={() => filter('view', value)}>{label}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr]">
        <label className="text-xs font-medium text-slate-600">Søk i kapitler og poster<input className={field} type="search" value={filters.search} onChange={event => filter('search', event.target.value)} placeholder="Nummer eller tekst …" /></label>
        <label className="text-xs font-medium text-slate-600">Avdeling<select className={field} value={filters.department} onChange={event => filter('department', event.target.value)}><option value="all">Alle avdelinger</option><option value="none">Ingen avdeling</option>{data.departments.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Person<select className={field} value={filters.person} onChange={event => filter('person', event.target.value)}><option value="all">Alle personer</option><option value="none">Uten person</option>{[...names].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Status<select className={field} value={filters.status} onChange={event => filter('status', event.target.value)}>{[['all', 'Alle statuser'], ['open', 'Ikke ferdige'], ['done', 'Ferdige'], ['ready', 'Klar til granskning'], ['approved', 'Godkjent'], ['returned', 'Sendt tilbake'], ['unassigned', 'Uten person'], ['queue', 'I avdelingskø'], ['help', 'Trenger hjelp'], ['late', 'Over fristen']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
    </div>
    {selected.length > 0 && <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-teal-900 p-3 text-white shadow-lg"><p className="text-sm"><strong>{selectedPosts.size} poster</strong> i utvalget · hele markerte kapitler inngår</p><div className="flex gap-2"><button className="px-3 py-2 text-sm underline" disabled={busy} onClick={() => setSelected([])}>Fjern markering</button><button className={button} disabled={busy || selected.length > 500 || !canAssignTargets(data, selected)} onClick={() => setSelection({ targets: selected, title: 'Valgte kapitler og poster', count: selectedPosts.size })}>Tildel valgte</button></div>{selected.length > 500 && <p className="w-full text-sm">Velg maks. 500 tildelinger om gangen.</p>}</div>}
    {active ? <div className="grid items-start gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
      <nav aria-label="Prosjektkapitler" className="max-h-[65vh] overflow-y-auto rounded-xl border border-slate-200 bg-white xl:sticky xl:top-4"><div className="border-b p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Kapitler · {visible.length}</div>{visible.map(chapter => {
        const target: AssignmentTarget = { scope_type: chapter.scope, scope_value: chapter.anchor };
        const done = chapter.posts.filter(post => post.done).length;
        return <div key={chapter.key} className={`flex items-start gap-2 border-b border-slate-100 p-3 last:border-0 ${active.key === chapter.key ? 'bg-teal-50' : ''}`}>
          {canManage && <input type="checkbox" className="mt-1.5 size-4 shrink-0 accent-teal-800" aria-label={`Velg hele ${chapter.title}, ${chapter.posts.length} poster`} disabled={busy || chapter.review && chapter.scope !== 'post' || !canAssignTargets(data, [target])} checked={selectedKeys.has(targetKey(target))} onChange={() => toggle(target)} />}
          <button data-variant="ghost" className="min-w-0 flex-1 text-left" aria-current={active.key === chapter.key ? 'true' : undefined} onClick={() => setChapterKey(chapter.key)}><span className="block break-words text-sm font-semibold">{chapter.title}</span><span className="mt-1 block text-xs text-slate-600">{done} av {chapter.posts.length} ferdige{chapter.shown.length !== chapter.posts.length && ` · ${chapter.shown.length} vist`}</span><progress className="mt-2 h-1.5 w-full accent-teal-700" value={done} max={chapter.posts.length} aria-label={`${chapter.title}: ${done} av ${chapter.posts.length} ferdige`} /></button>
        </div>;
      })}</nav>
      <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="space-y-3 border-b border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{active.title}</h2><p className="mt-1 text-xs text-slate-600">{active.shown.length} av {active.posts.length} poster vist · egne posttildelinger beholdes</p></div>{canManage && <button className={primary} disabled={busy || active.review && active.scope !== 'post' || !canAssignTargets(data, [{ scope_type: active.scope, scope_value: active.anchor }])} onClick={() => setSelection({ targets: [{ scope_type: active.scope, scope_value: active.anchor }], title: active.title, count: active.posts.length })}>Tildel {active.scope === 'pdf_chapter' ? 'kapittel' : active.scope === 'main_post' ? 'hovedpost' : 'post'}</button>}</div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Kapittelets avdeling</dt><dd className="mt-1 font-medium">{departmentName(active.assignment)}</dd></div><div><dt className="text-xs text-slate-500">Standard ansvarlig</dt><dd className="mt-1 font-medium">{personName(active.assignment)}</dd></div><div><dt className="text-xs text-slate-500">Kapittelfrist</dt><dd className="mt-1 font-medium">{active.assignment?.due_date ?? data.settings?.deadline ?? 'Ingen frist'}</dd></div></dl>
        </header>
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_100px] gap-3 border-b px-4 py-3 text-xs font-medium text-slate-500 xl:grid"><span>Post og tildeling</span><span>Avdeling</span><span>Person</span><span>Frist</span><span>Status</span></div>
        <div className="divide-y divide-slate-100">{active.shown.map(post => {
          const work = assignments.get(post.assignmentId ?? ''), target: AssignmentTarget = { scope_type: 'post', scope_value: post.id };
          const editable = canManage && canAssignTargets(data, [target]);
          return <div key={post.id} className="grid gap-3 p-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_100px]">
            <div className="flex min-w-0 items-start gap-2">{canManage && <input type="checkbox" className="mt-1 size-4 shrink-0 accent-teal-800" aria-label={`Velg post ${post.number ?? post.title}`} checked={selectedKeys.has(targetKey(target))} disabled={busy || !editable} onChange={() => toggle(target)} />}<div className="min-w-0"><button data-appearance="text" className="text-left text-sm font-medium hover:text-teal-800 hover:underline" onClick={() => onOpenPost(post.id)}><span className="mr-2 text-xs text-slate-500">{post.number}</span>{post.title || 'Post uten tittel'}</button><p className="mt-1 text-xs text-slate-600">{assignmentOrigin(work, post)}</p>{post.hierarchyReview && <p className="mt-1 text-xs text-amber-800">Kontroller hovedpostkoblingen</p>}</div></div>
            <div className="text-sm"><span className="mr-2 text-xs text-slate-500 xl:hidden">Avdeling:</span><span>{departmentName(work)}</span>{work?.department_id && !work.assigned_to && <span className="mt-1 block text-xs text-amber-800">Venter på personfordeling</span>}</div>
            <div className="text-sm"><span className="mr-2 text-xs text-slate-500 xl:hidden">Person:</span>{editable ? <button data-appearance="text" className="text-left font-medium text-teal-800 underline decoration-teal-300 underline-offset-4 disabled:opacity-50" disabled={busy} aria-label={`Endre ansvar for post ${post.number ?? post.title}`} onClick={() => setSelection({ targets: [target], title: `${post.number ?? 'Post'} · ${post.title}`, count: 1 })}>{personName(work)}</button> : personName(work)}</div>
            <div className={`text-xs ${isLate(post, today) ? 'font-semibold text-red-700' : 'text-slate-600'}`}><span className="mr-2 xl:hidden">Frist:</span>{post.dueDate ?? 'Ingen frist'}</div>
            <div><span className={`inline-block rounded-md px-2 py-1 text-xs ${post.openHelp ? 'bg-amber-50 text-amber-900' : post.done ? 'bg-teal-50 text-teal-900' : 'bg-slate-100 text-slate-700'}`}>{post.openHelp ? 'Trenger hjelp' : workReviewLabels[post.reviewState ?? (post.done ? 'completed' : 'in_progress')]}</span><button data-appearance="text" className="mt-2 block text-xs text-teal-800 underline" onClick={() => onOpenPost(post.id)}>Åpne oppgave</button></div>
          </div>;
        })}</div>
      </article>
    </div> : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">{data.posts.length ? 'Ingen poster passer filtrene. Velg en annen visning eller fjern filtrene.' : 'Ingen produktposter å fordele ennå. Last opp og behandle beskrivelsen først.'}</p>}
    {selection && <UnifiedAssignmentDialog key={selection.targets.map(targetKey).join()} data={data} selection={selection} busy={busy} error={error} close={() => setSelection(null)} save={async change => { const saved = await onAssign(change); if (saved) { setSelection(null); setSelected([]); } return saved; }} />}
  </section>;
}
