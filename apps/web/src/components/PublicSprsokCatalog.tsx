"use client";

import { useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import { searchPublicSprsok, sprsokFilterOptions, sprsokPage, SPRSOK_FILTERS, SPRSOK_PAGE_SIZE, type PublicSprsokProduct, type SprsokSortKey } from "@/lib/public-sprsok";
import styles from "@/app/sprsok/sprsok.module.css";

const columns = [{ key: "sin", label: "SIN / artikkelnummer" }, ...SPRSOK_FILTERS] as const;

export function PublicSprsokCatalog({ products }: { products: PublicSprsokProduct[] }) {
  const resultHeading = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(serialized), [serialized]);
  const results = useMemo(() => searchPublicSprsok(products, params), [products, params]);
  const options = useMemo(() => Object.fromEntries(SPRSOK_FILTERS.map(({ key }) => [key, sprsokFilterOptions(products, key)])), [products]);
  const page = sprsokPage(params, results.length);
  const offset = (page - 1) * SPRSOK_PAGE_SIZE;
  const visible = results.slice(offset, offset + SPRSOK_PAGE_SIZE);
  const activeFilters = SPRSOK_FILTERS.filter(({ key }) => params.get(key));
  const filtered = Boolean(params.get("q") || activeFilters.length);
  const sort = params.get("sort") ?? "sin";
  const descending = params.get("dir") === "desc";

  function update(values: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (!("page" in values)) next.delete("page");
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  function changeSort(key: SprsokSortKey) {
    update({ sort: key, dir: sort === key && !descending ? "desc" : "asc" });
  }

  function changePage(nextPage: number) {
    update({ page: String(nextPage) });
    requestAnimationFrame(() => {
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.scrollIntoView({ block: "start" });
    });
  }

  function reset() {
    update({ q: "", ...Object.fromEntries(SPRSOK_FILTERS.map(({ key }) => [key, ""])) });
  }

  return (
    <section id="sprsok-search" aria-label="Sprinklersøk" className={styles.catalog}>
      <div className={styles.searchPanel}>
        <label htmlFor="sprsok-query" className={styles.searchLabel}>Søk i sprinklerkatalogen</label>
        <div className={styles.searchInput}><Search size={19} aria-hidden="true" /><input id="sprsok-query" type="search" placeholder="Søk på SIN, artikkelnummer eller leverandør…" value={params.get("q") ?? ""} maxLength={200} onChange={event => update({ q: event.target.value }, true)} autoComplete="off" aria-controls="sprsok-results" /></div>
        <div className={styles.filterTitle}><SlidersHorizontal size={14} aria-hidden="true" />Filtrer produkter</div>
        <div className={styles.filters}>
          {SPRSOK_FILTERS.map(({ key, label }) => (
            <label key={key} htmlFor={`sprsok-${key}`}><span>{label}</span><select id={`sprsok-${key}`} value={params.get(key) ?? ""} onChange={event => update({ [key]: event.target.value })}><option value="">Alle</option>{params.get(key) && !options[key].includes(params.get(key)!) && <option value={params.get(key)!}>{params.get(key)}</option>}{options[key].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          ))}
        </div>
      </div>
      {filtered && <div className={styles.activeFilters}>{activeFilters.map(({ key, label }) => <button key={key} onClick={() => update({ [key]: "" })} aria-label={`Fjern filter: ${label} ${params.get(key)}`}>{label}: {params.get(key)} <X size={12} aria-hidden="true" /></button>)}<button onClick={reset} data-appearance="text">Nullstill søk og filtre</button></div>}
      <div ref={resultHeading} tabIndex={-1} className={styles.resultHeading}><h2>Produkter <span>{results.length.toLocaleString("nb-NO")}</span></h2><p role="status" aria-live="polite">{results.length ? `Viser ${offset + 1}–${Math.min(offset + SPRSOK_PAGE_SIZE, results.length)} av ${results.length} produktvarianter` : "Ingen produkter funnet"}</p></div>
      {visible.length ? (
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Produktresultater. Tabellen kan rulles vannrett.">
          <table id="sprsok-results" className={styles.table}><caption className="sr-only">Sprinklere fra Sprsok. Velg en kolonneoverskrift for å sortere.</caption><thead><tr>{columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={sort === key ? (descending ? "descending" : "ascending") : "none"}><button onClick={() => changeSort(key)}>{label}{sort === key && (descending ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}</button></th>)}<th scope="col">Datablad</th></tr></thead><tbody>{visible.map(product => <tr key={product.id}>{columns.map(({ key }) => <td key={key}>{key === "sin" ? <strong>{product[key] || "—"}</strong> : product[key] || "—"}</td>)}<td>{product.datablad ? <a href={product.datablad} target="_blank" rel="noopener noreferrer" aria-label={`Åpne datablad for ${product.sin ?? "produkt"} i ny fane`}>Datablad <ExternalLink size={13} aria-hidden="true" /></a> : <span className={styles.muted}>Ikke tilgjengelig</span>}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className={styles.empty} id="sprsok-results"><Search size={26} aria-hidden="true" /><h3>{products.length ? "Ingen sprinklere passer søket" : "Ingen produkter i katalogen ennå"}</h3><p>{products.length ? "Prøv et annet SIN-nummer eller fjern et filter." : "Kom tilbake litt senere."}</p>{filtered && <button onClick={reset}>Vis alle produkter</button>}</div>
      )}
      {results.length > SPRSOK_PAGE_SIZE && <nav className={styles.pagination} aria-label="Sider med produkter"><button disabled={page === 1} onClick={() => changePage(page - 1)}><ChevronLeft size={15} aria-hidden="true" />Forrige</button><span>Side {page} av {Math.ceil(results.length / SPRSOK_PAGE_SIZE)}</span><button disabled={offset + SPRSOK_PAGE_SIZE >= results.length} onClick={() => changePage(page + 1)}>Neste<ChevronRight size={15} aria-hidden="true" /></button></nav>}
    </section>
  );
}
