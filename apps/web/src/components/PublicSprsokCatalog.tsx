"use client";

import { useMemo, useRef, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Search, SlidersHorizontal } from "lucide-react";
import { searchPublicSprsok, sprsokFilterOptions, sprsokPage, SPRSOK_FILTERS, SPRSOK_PAGE_SIZE, type PublicSprsokProduct, type SprsokSortKey } from "@/lib/public-sprsok";
import styles from "@/app/sprsok/sprsok.module.css";

const columns = [{ key: "sin", label: "SIN / artikkelnummer" }, ...SPRSOK_FILTERS] as const;

export function PublicSprsokCatalog({ products }: { products: PublicSprsokProduct[] }) {
  const resultHeading = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const params = useMemo(() => new URLSearchParams(serialized), [serialized]);
  const hasSearched = params.get("search") === "1";
  const results = useMemo(() => hasSearched ? searchPublicSprsok(products, params) : [], [products, params, hasSearched]);
  const options = useMemo(() => Object.fromEntries(SPRSOK_FILTERS.map(({ key }) => [key, sprsokFilterOptions(products, key)])), [products]);
  const page = sprsokPage(params, results.length);
  const offset = (page - 1) * SPRSOK_PAGE_SIZE;
  const visible = results.slice(offset, offset + SPRSOK_PAGE_SIZE);
  const activeFilters = SPRSOK_FILTERS.filter(({ key }) => params.get(key));
  const filtered = Boolean(params.get("q") || activeFilters.length);
  const sort = params.get("sort") ?? "sin";
  const descending = params.get("dir") === "desc";

  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (!("page" in values)) next.delete("page");
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.pushState(null, "", url);
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
    update({ search: "", q: "", ...Object.fromEntries(SPRSOK_FILTERS.map(({ key }) => [key, ""])) });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update({ search: "1", q: String(form.get("q") ?? "").trim(), ...Object.fromEntries(SPRSOK_FILTERS.map(({ key }) => [key, String(form.get(key) ?? "")])) });
  }

  return (
    <section id="sprsok-search" aria-label="Sprinklersøk" className={styles.catalog}>
      <form key={serialized} action="/sprsok" method="get" className={styles.searchPanel} onSubmit={submitSearch}>
        <input type="hidden" name="search" value="1" />
        <label htmlFor="sprsok-query" className={styles.searchLabel}>Søk i sprinklerkatalogen</label>
        <div className={styles.searchInput}><Search size={19} aria-hidden="true" /><input id="sprsok-query" name="q" type="search" placeholder="Søk på SIN, artikkelnummer eller leverandør…" defaultValue={params.get("q") ?? ""} maxLength={200} autoComplete="off" aria-controls="sprsok-results" /></div>
        <div className={styles.filterTitle}><SlidersHorizontal size={14} aria-hidden="true" />Filtrer produkter</div>
        <div className={styles.filters}>
          {SPRSOK_FILTERS.map(({ key, label }) => (
            <label key={key} htmlFor={`sprsok-${key}`}><span>{label}</span><select id={`sprsok-${key}`} name={key} defaultValue={params.get(key) ?? ""}><option value="">Alle</option>{params.get(key) && !options[key].includes(params.get(key)!) && <option value={params.get(key)!}>{params.get(key)}</option>}{options[key].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          ))}
        </div>
        <div className={styles.searchActions}><button type="submit" className={styles.searchButton}><Search size={16} aria-hidden="true" />Søk</button><button type="button" onClick={reset}>Nullstill</button></div>
      </form>
      {!hasSearched ? <div className={styles.empty} id="sprsok-results"><Search size={26} aria-hidden="true" /><h2>Søk i sprinklerkatalogen</h2><p>Skriv et søkeord eller velg filtre, og trykk Søk for å vise produkter.</p></div> : <>
      <div ref={resultHeading} tabIndex={-1} className={styles.resultHeading}><h2>Produkter <span>{results.length.toLocaleString("nb-NO")}</span></h2><p role="status" aria-live="polite">{results.length ? `Viser ${offset + 1}–${Math.min(offset + SPRSOK_PAGE_SIZE, results.length)} av ${results.length} produktvarianter` : "Ingen produkter funnet"}</p></div>
      {visible.length ? (
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Produktresultater. Tabellen kan rulles vannrett.">
          <table id="sprsok-results" className={styles.table}><caption className="sr-only">Sprinklere fra Sprsok. Velg en kolonneoverskrift for å sortere.</caption><thead><tr>{columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={sort === key ? (descending ? "descending" : "ascending") : "none"}><button onClick={() => changeSort(key)}>{label}{sort === key && (descending ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}</button></th>)}<th scope="col">Datablad</th></tr></thead><tbody>{visible.map(product => <tr key={product.id}>{columns.map(({ key }) => <td key={key}>{key === "sin" ? <strong>{product[key] || "—"}</strong> : product[key] || "—"}</td>)}<td>{product.datablad ? <a href={product.datablad} target="_blank" rel="noopener noreferrer" aria-label={`Åpne datablad for ${product.sin ?? "produkt"} i ny fane`}>Datablad <ExternalLink size={13} aria-hidden="true" /></a> : <span className={styles.muted}>Ikke tilgjengelig</span>}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className={styles.empty} id="sprsok-results"><Search size={26} aria-hidden="true" /><h3>{products.length ? "Ingen sprinklere passer søket" : "Ingen produkter i katalogen ennå"}</h3><p>{products.length ? "Prøv et annet SIN-nummer eller fjern et filter." : "Kom tilbake litt senere."}</p>{filtered && <button onClick={reset}>Nullstill søk og filtre</button>}</div>
      )}
      {results.length > SPRSOK_PAGE_SIZE && <nav className={styles.pagination} aria-label="Sider med produkter"><button disabled={page === 1} onClick={() => changePage(page - 1)}><ChevronLeft size={15} aria-hidden="true" />Forrige</button><span>Side {page} av {Math.ceil(results.length / SPRSOK_PAGE_SIZE)}</span><button disabled={offset + SPRSOK_PAGE_SIZE >= results.length} onClick={() => changePage(page + 1)}>Neste<ChevronRight size={15} aria-hidden="true" /></button></nav>}
      </>}
    </section>
  );
}
