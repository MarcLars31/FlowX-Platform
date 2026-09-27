"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, ExternalLink, FileText, Filter, GitBranch, ListFilter, LockKeyhole, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import {
  filterMatchingRules, MATCHING_RULE_GROUPS, MATCHING_RULES, RULE_CATALOG_DATE,
  RULE_CATALOG_VERSION, RULE_KIND_LABELS, ruleSourceUrl, type CatalogRule, type RuleKind
} from "@/lib/matching-rule-catalog";
import styles from "./MatchingRuleBrowser.module.css";
import { RuleFeedbackList, RuleFlagForm, useRuleFeedback } from "./RuleFeedback";

type Tab = "rule" | "details" | "source";
const tabLabels = { rule: "Regel", details: "Detaljer", source: "Underlag" };

export function MatchingRuleBrowser({ preview = false }: { preview?: boolean }) {
  const feedback = useRuleFeedback(preview);
  const [view, setView] = useState<"rules" | "feedback">("rules");
  const searchParams = useSearchParams();
  const requested = searchParams.get("regel") ?? "dimension";
  const initial = MATCHING_RULES.find(item => item.id === requested) ?? MATCHING_RULES[0];
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([initial.groupId]));
  const [tab, setTab] = useState<Tab>("rule");
  const detailRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => filterMatchingRules(query, kind), [query, kind]);
  const selected = filtered.find(item => item.id === requested) ?? filtered[0];
  const groups = MATCHING_RULE_GROUPS.map(group => ({ ...group, matches: filtered.filter(item => item.groupId === group.id) }))
    .filter(group => group.matches.length > 0);
  const filtering = Boolean(query.trim()) || kind !== "all";
  const allExpanded = groups.length > 0 && groups.every(group => expanded.has(group.id));
  const tabs: Tab[] = selected?.notes?.length || selected?.table ? ["rule", "details", "source"] : ["rule", "source"];
  const activeTab = tabs.includes(tab) ? tab : "rule";

  function choose(item: CatalogRule) {
    const next = new URL(window.location.href);
    next.searchParams.set("regel", item.id);
    window.history.replaceState(null, "", next);
    setTab("rule");
    setExpanded(current => new Set([...current, item.groupId]));
    if (window.matchMedia("(max-width: 760px)").matches) detailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  function changeQuery(value: string) {
    setQuery(value); setTab("rule");
    setExpanded(new Set(value.trim() || kind !== "all" ? MATCHING_RULE_GROUPS.map(group => group.id) : [selected?.groupId ?? "teknik"]));
  }
  function resetFilters() {
    setQuery(""); setKind("all");
    setExpanded(new Set([selected?.groupId ?? "teknik"]));
    searchRef.current?.focus();
  }
  function toggleGroup(id: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    const index = tabs.indexOf(current);
    const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length]
        : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : null;
    if (!next) return;
    event.preventDefault(); setTab(next);
    document.getElementById(`rule-tab-${next}`)?.focus();
  }

  return (
    <div className={styles.browser}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Produktmatchning</p>
          <h1>Regler</h1>
          <p>Se vad Scipx kontrollerar, när en regel gäller och hur den påverkar produktförslagen.</p>
        </div>
        <div className={styles.headerMeta}>
          {preview && <span className={styles.previewBadge}>Testmiljö</span>}
          <span className={styles.readOnly}><LockKeyhole size={13} aria-hidden="true" /> Läsvy</span>
        </div>
      </header>

      <div className={styles.catalogBar}>
        <span><BookOpen size={15} aria-hidden="true" /> <strong>{MATCHING_RULES.length}</strong> regelbeskrivningar <span className={styles.separator}>/</span> {MATCHING_RULE_GROUPS.length} grupper</span>
        <span>Granskade {RULE_CATALOG_DATE}</span>
      </div>
      <div className={styles.viewSwitch} aria-label="Regelvyer">
        <button type="button" aria-pressed={view === "rules"} onClick={() => setView("rules")}>Regler ({MATCHING_RULES.length})</button>
        <button type="button" aria-pressed={view === "feedback"} onClick={() => setView("feedback")}>Flaggade regler{!feedback.loading && !feedback.error && ` (${feedback.rows.filter(row => row.status === "open").length} öppna)`}</button>
      </div>
      {preview && <p className={styles.feedbackHint}>Testflaggningar sparas endast i denna webbläsare. I liveversionen sparas de för din organisation.</p>}
      {feedback.error && <div role="alert" className={styles.notice}>{feedback.error}<button type="button" onClick={() => void feedback.reload()}>Försök igen</button></div>}
      {view === "feedback" ? <RuleFeedbackList feedback={feedback} onRule={id => { const rule = MATCHING_RULES.find(item => item.id === id); if (rule) { setQuery(""); setKind("all"); choose(rule); setView("rules"); } }} /> : <>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input ref={searchRef} aria-label="Sök regler" placeholder="Sök regel, DN, K-faktor, NRF…" value={query} onChange={event => changeQuery(event.target.value)} />
          {query && <button type="button" aria-label="Rensa sökning" onClick={() => changeQuery("")}><X size={15} /></button>}
        </div>
        <label className={styles.filter}><Filter size={14} aria-hidden="true" /><span className={styles.srOnly}>Regeltyp</span>
          <select aria-label="Regeltyp" value={kind} onChange={event => { setKind(event.target.value); setTab("rule"); setExpanded(new Set(MATCHING_RULE_GROUPS.map(group => group.id))); }}>
            <option value="all">Alla regeltyper</option>
            {Object.entries(RULE_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span className={styles.matchCount} role="status" aria-live="polite">{filtering ? `${filtered.length} av ${MATCHING_RULES.length} visas` : "Välj en regel i listan"}</span>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Regelgrupper">
          <div className={styles.sidebarHeader}><span><ListFilter size={15} aria-hidden="true" /> Regelgrupper</span>
            <button type="button" onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map(group => group.id)))} disabled={!groups.length}>{allExpanded ? "Fäll ihop" : "Öppna alla"}</button>
          </div>
          <nav className={styles.tree} aria-label="Välj regel">
            {groups.map(group => (
              <div key={group.id} className={styles.group}>
                <button className={styles.groupButton} type="button" aria-expanded={expanded.has(group.id)} aria-controls={`group-${group.id}`} onClick={() => toggleGroup(group.id)}>
                  {expanded.has(group.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{group.title}</span><span className={styles.count}>{group.matches.length}</span>
                </button>
                <ul id={`group-${group.id}`} hidden={!expanded.has(group.id)} className={styles.ruleList}>
                  {group.matches.map(item => <li key={item.id}>
                    <button type="button" className={styles.ruleButton} aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => choose(item)}>
                      {item.kind === "gap" ? <TriangleAlert size={13} aria-label="Kontroll saknas" /> : item.kind === "assumption" ? <CircleHelp size={13} aria-label="Fast antagande" /> : <span className={styles.ruleDot} aria-hidden="true" />}
                      <span>{item.title}</span>
                    </button>
                  </li>)}
                </ul>
              </div>
            ))}
            {!groups.length && <p className={styles.treeEmpty}>Inga regler matchar sökningen.</p>}
          </nav>
          <div className={styles.sidebarFooter}><LockKeyhole size={13} aria-hidden="true" /><span>Dagens regler visas här. De redigeras inte i denna vy.</span></div>
        </aside>

        <section className={styles.detail} aria-label="Regeldetaljer" ref={detailRef}>
          {selected ? <>
            <div className={styles.detailHeader}>
              <div className={styles.breadcrumb}><GitBranch size={14} aria-hidden="true" />{selected.groupTitle}</div>
              <h2>{selected.title}</h2>
              <div className={styles.ruleMeta}>
                <KindLabel kind={selected.kind} />
                <span className={styles.ruleId}>{selected.id}</span>
              </div>
              <RuleFlagForm key={selected.id} rule={selected} feedback={feedback} preview={preview} />
            </div>
            <div className={styles.tabs} role="tablist" aria-label="Regelinformation">
              {tabs.map(item => <button type="button" role="tab" id={`rule-tab-${item}`} key={item} aria-selected={activeTab === item} aria-controls={`rule-panel-${item}`} tabIndex={activeTab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => tabKey(event, item)}>{tabLabels[item]}{item === "details" && selected.table && <span className={styles.tabCount}>{selected.table.rows.length}</span>}</button>)}
            </div>
            <div key={`${selected.id}-${activeTab}`} className={styles.tabPanel} id={`rule-panel-${activeTab}`} role="tabpanel" aria-labelledby={`rule-tab-${activeTab}`} tabIndex={0}>
              {activeTab === "rule" && <>
                <div className={styles.applies}><span>Gäller för</span><strong>{selected.appliesTo}</strong></div>
                {selected.kind === "gap" && <div className={styles.notice}><TriangleAlert size={17} aria-hidden="true" /><p><strong>Det här är en begränsning.</strong> Den beskrivna kontrollen är inte fullständigt implementerad i dagens matchning.</p></div>}
                {selected.kind === "assumption" && <div className={styles.notice}><CircleHelp size={17} aria-hidden="true" /><p><strong>Fast antagande i koden.</strong> Detta är en inbyggd prioritering eller katalogregel, inte alltid ett uttryckligt krav i PDF-filen.</p></div>}
                <div className={styles.flow}>
                  <div className={styles.flowStep}><span className={styles.stepNumber}>1</span><div><h3>När gäller regeln?</h3><p>{selected.when}</p></div></div>
                  <ArrowDown className={styles.flowArrow} size={18} aria-hidden="true" />
                  <div className={`${styles.flowStep} ${styles.resultStep}`}><span className={styles.stepNumber}>2</span><div><h3>{selected.kind === "gap" ? "Vad innebär det?" : "Vad händer då?"}</h3><p>{selected.result}</p></div></div>
                </div>
                {selected.example && <div className={styles.example}><div className={styles.sectionLabel}>Exempel</div><p>{selected.example.input}</p><div><ArrowRight size={15} aria-hidden="true" /><p>{selected.example.result}</p></div><small>Illustration av regeln · ingen produktsökning körs</small></div>}
                {(selected.table || selected.notes?.length) && <button type="button" className={styles.detailsLink} onClick={() => setTab("details")}><FileText size={14} aria-hidden="true" />Visa {selected.table ? "poäng, gränsvärden och undantag" : "undantag och förtydliganden"}<ChevronRight size={14} aria-hidden="true" /></button>}
              </>}
              {activeTab === "details" && <>
                <div className={styles.sectionLabel}>Detaljer och undantag</div>
                {selected.table && <div className={styles.tableScroll}><table><caption className={styles.srOnly}>{selected.title} – detaljer</caption><thead><tr>{selected.table.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{selected.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th scope="row" key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
                {selected.notes && <ul className={styles.notes}>{selected.notes.map(note => <li key={note}>{note}</li>)}</ul>}
                <p className={styles.detailFootnote}>Poäng räknas tillsammans med övriga tillämpliga regler. En teknisk konflikt kan begränsa slutpoängen även efter bonusar.</p>
              </>}
              {activeTab === "source" && <>
                <div className={styles.sectionLabel}>Underlag för beskrivningen</div>
                <p className={styles.sourceIntro}>Beskrivningarna sammanfattar granskad kod. De är inte en automatisk förteckning över varje kodvillkor. En flaggning sparar ditt ändringsförslag; själva matchningen ändras först när förslaget har granskats och genomförts.</p>
                <dl className={styles.sourceMeta}><div><dt>Granskad</dt><dd>{RULE_CATALOG_DATE}</dd></div><div><dt>Kodversion</dt><dd><code>{RULE_CATALOG_VERSION.slice(0, 7)}</code></dd></div><div><dt>Omfattning</dt><dd>{MATCHING_RULE_GROUPS.find(group => group.id === selected.groupId)?.description}</dd></div></dl>
                <h3 className={styles.sectionLabel}>Källor för regelgruppen</h3>
                <ul className={styles.sourceFiles}>{selected.sources.map(file => <li key={file}><FileText size={15} aria-hidden="true" /><a href={ruleSourceUrl(file)} target="_blank" rel="noopener noreferrer">{file}<ExternalLink size={12} aria-label="Öppnas i ny flik" /></a></li>)}</ul>
                <p className={styles.detailFootnote}>Källänkarna kräver tillgång till projektets GitHub-arkiv.</p>
              </>}
            </div>
          </> : <div className={styles.empty}><Search size={30} aria-hidden="true" /><h2>Inga regler hittades</h2><p>Prova ett annat sökord eller välj en annan regeltyp.</p><button type="button" onClick={resetFilters}>Rensa filter</button></div>}
        </section>
      </div>
      </>}
      <footer className={styles.footer}><span><SlidersHorizontal size={14} aria-hidden="true" />Nuvarande matchningsregler · läsvy</span><span>{preview ? "Lokal testversion – inte publicerad" : `Granskad kodversion ${RULE_CATALOG_VERSION.slice(0, 7)}`}</span></footer>
    </div>
  );
}

function KindLabel({ kind }: { kind: RuleKind }) {
  const Icon = kind === "gap" ? TriangleAlert : kind === "assumption" ? CircleHelp : kind === "review" ? Search : Check;
  return <span className={styles.kindLabel}><Icon size={13} aria-hidden="true" />{RULE_KIND_LABELS[kind]}</span>;
}
