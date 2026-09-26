"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Search, X } from "lucide-react";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { Input } from "@/components/Input";

type SprsokProduct = {
  id: string | number | null;
  source?: "sprsok" | "flowx" | null;
  source_id?: string | null;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  datablad: string | null;
  is_demo?: boolean;
  demo_disclaimer?: string | null;
  documents?: PublishedProductDocument[];
};

type PublishedProductDocument = {
  document_id: string;
  title: string | null;
  document_type: string | null;
  language_code: string | null;
  page_numbers: number[] | null;
  source_page: number | null;
  original_pdf_url: string | null;
};

type ProductSearchResponse = {
  products: SprsokProduct[];
  count: number;
  limit: number;
  offset: number;
  error?: string;
};

type ProductFilters = {
  leverandor: string;
  type: string;
  utforelse: string;
  k_verdi: string;
  rti: string;
};

const emptyFilters: ProductFilters = {
  leverandor: "",
  type: "",
  utforelse: "",
  k_verdi: "",
  rti: ""
};

const filterFields: Array<{
  key: keyof ProductFilters;
  label: string;
  placeholder: string;
}> = [
  { key: "leverandor", label: "Leverant\u00f6r", placeholder: "t.ex. Reliable" },
  { key: "type", label: "Typ", placeholder: "t.ex. Bolig" },
  {
    key: "utforelse",
    label: "Utf\u00f6rande",
    placeholder: "t.ex. Concealed"
  },
  { key: "k_verdi", label: "K-v\u00e4rde", placeholder: "t.ex. 109 eller 7.6" },
  { key: "rti", label: "RTI", placeholder: "t.ex. QR" }
];

const columns: Array<{
  label: string;
  value: (product: SprsokProduct) => string;
}> = [
  { label: "SIN / artikelnummer", value: (product) => text(product.sin) },
  { label: "Leverantör", value: (product) => text(product.leverandor) },
  { label: "Typ", value: (product) => text(product.type) },
  { label: "Utförande", value: (product) => text(product.utforelse) },
  { label: "K-värde", value: (product) => text(product.k_verdi) },
  { label: "RTI", value: (product) => text(product.rti) }
];

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ProductFilters>(emptyFilters);
  const [products, setProducts] = useState<SprsokProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [offset, setOffset] = useState(0);
  const [similarTo, setSimilarTo] = useState<SprsokProduct | null>(null);
  const [similarProducts, setSimilarProducts] = useState<SprsokProduct[] | null>(
    null
  );
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [isSimilarLoading, setIsSimilarLoading] = useState(false);
  const similarRequestId = useRef(0);

  const hasActiveFilters = Object.values(filters).some((value) => value.trim());
  const hasVisibleDemoData = products?.some((product) => product.is_demo) ?? false;

  useEffect(() => {
    let active = true;
    fetch("/api/products/search?limit=50&offset=0", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ProductSearchResponse;
        if (!response.ok) throw new Error(payload.error ?? "Produktsökningen misslyckades.");
        if (!active) return;
        setProducts(payload.products);
        setTotalProducts(payload.count);
        setOffset(payload.offset);
        setSearchedFor("alla produkter");
      })
      .catch((initialError: unknown) => {
        if (active) {
          setError(initialError instanceof Error ? initialError.message : "Produktsökningen misslyckades.");
        }
      });
    return () => { active = false; };
  }, []);

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadProducts(0);
  }

  async function loadProducts(requestedOffset: number) {
    const searchTerm = query.trim();
    if (!searchTerm && !hasActiveFilters) {
      setProducts(null);
      setError(null);
    }

    setIsLoading(true);
    setError(null);

    try {
      const parameters = new URLSearchParams({
        limit: "50",
        offset: String(requestedOffset)
      });
      if (searchTerm) parameters.set("q", searchTerm);

      for (const [key, value] of Object.entries(filters)) {
        if (value.trim()) parameters.set(key, value.trim());
      }
      const response = await fetch(`/api/products/search?${parameters}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as ProductSearchResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Produktsökningen kunde inte genomföras.");
      }

      setProducts(payload.products);
      setTotalProducts(payload.count);
      setOffset(payload.offset);
      setSearchedFor(searchTerm || (hasActiveFilters ? "valda filter" : "alla produkter"));
      setSimilarTo(null);
      setSimilarProducts(null);
      setSimilarError(null);
      similarRequestId.current += 1;

      const [firstProduct] = payload.products;
      if (firstProduct?.id !== null && firstProduct?.id !== undefined) {
        void loadSimilarProducts(firstProduct);
      }
    } catch (searchError) {
      setProducts(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Produktsökningen kunde inte genomföras."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setFilters(emptyFilters);
    setProducts(null);
    setTotalProducts(0);
    setOffset(0);
    setError(null);
    setSearchedFor("");
    setSimilarTo(null);
    setSimilarProducts(null);
    setSimilarError(null);
    similarRequestId.current += 1;
  }

  function setFilter(key: keyof ProductFilters, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value
    }));
  }

  async function loadSimilarProducts(product: SprsokProduct) {
    if (product.id === null || product.id === undefined) return;

    const requestId = similarRequestId.current + 1;
    similarRequestId.current = requestId;
    setSimilarTo(product);
    setSimilarProducts(null);
    setSimilarError(null);
    setIsSimilarLoading(true);

    try {
      const parameters = new URLSearchParams({
        similar_to: String(product.id),
        limit: "5"
      });
      const response = await fetch(`/api/products/search?${parameters}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as ProductSearchResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Liknande produkter kunde inte h\u00e4mtas."
        );
      }

      if (requestId !== similarRequestId.current) return;
      setSimilarProducts(payload.products);
    } catch (similarSearchError) {
      if (requestId !== similarRequestId.current) return;
      setSimilarError(
        similarSearchError instanceof Error
          ? similarSearchError.message
          : "Liknande produkter kunde inte h\u00e4mtas."
      );
    } finally {
      if (requestId === similarRequestId.current) {
        setIsSimilarLoading(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Produktdatabas
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
          Sök sprinklerprodukter
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-600">
          Sök i Sprsöks produktdata och FlowX produktkatalog efter SIN,
          leverantör, typ, utförande, K-värde eller RTI. Öppna tillgängliga
          datablad direkt från träfflistan.
        </p>
      </header>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <form className="flex flex-col gap-5" onSubmit={searchProducts}>
          <div className="w-full sm:max-w-2xl">
            <Input
              id="product-search"
              label="Sök produkt"
              placeholder="Exempel: R7618, Reliable, QR eller 109"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isLoading}>
              <Search className="h-4 w-4" aria-hidden="true" />
              {isLoading ? "Söker" : "Sök"}
            </Button>
            {(query || hasActiveFilters || products || error) && (
              <Button type="button" variant="secondary" onClick={clearSearch}>
                <X className="h-4 w-4" aria-hidden="true" />
                Rensa
              </Button>
            )}
          </div>
          <div className="border-t border-ink-100 pt-5">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">
                  {"Filtrera s\u00f6kningen"}
                </h2>
                <p className="text-xs text-ink-500">
                  {"Kombinera fritext med filter. Delar av ett v\u00e4rde fungerar, till exempel 109 f\u00f6r K-v\u00e4rde 109 (7.6)."}
                </p>
              </div>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-0 self-start px-0 py-1 text-xs"
                  onClick={() => setFilters(emptyFilters)}
                >
                  {"Rensa filter"}
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {filterFields.map((field) => (
                <Input
                  key={field.key}
                  id={"product-filter-" + field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={filters[field.key]}
                  onChange={(event) => setFilter(field.key, event.target.value)}
                  autoComplete="off"
                />
              ))}
            </div>
          </div>
        </form>
      </section>

      {error && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </section>
      )}

      {products && (
        <>
        <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-ink-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-ink-700">
              {products.length === 0
                ? `Inga produkter hittades för “${searchedFor}”.`
                : `Visar ${offset + 1}–${offset + products.length} av ${totalProducts} träffar för “${searchedFor}”`}
            </p>
            <p className="text-xs text-ink-500">Datakällor: Sprsök och FlowX</p>
          </div>

          {hasVisibleDemoData && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
              <DemoBadge />
            </div>
          )}

          {products.length > 0 && (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="bg-ink-50">
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.label}
                        scope="col"
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
                      >
                        {column.label}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
                    >
                      Datablad
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
                    >
                      {"Liknande"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {products.map((product, index) => (
                    <tr key={product.id ?? `${product.sin ?? "produkt"}-${index}`} className="hover:bg-ink-50/70">
                      {columns.map((column) => (
                        <td
                          key={column.label}
                          className="max-w-72 truncate px-5 py-4 text-sm text-ink-700"
                          title={column.value(product)}
                        >
                          {column.value(product)}
                        </td>
                      ))}
                      <td className="px-5 py-4 text-sm">
                        <ProductDocumentLinks product={product} />
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {product.id === null ? (
                          <span className="text-ink-400">-</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void loadSimilarProducts(product)}
                            disabled={isSimilarLoading && similarTo?.id === product.id}
                            className="font-medium text-flow-700 hover:text-flow-900 disabled:cursor-wait disabled:opacity-60"
                          >
                            {similarTo?.id === product.id
                              ? isSimilarLoading
                                ? "S\u00f6ker..."
                                : "Visas nedan"
                              : "Visa"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3">
              <p className="text-xs text-ink-500">
                Sida {Math.floor(offset / 50) + 1} av {Math.max(1, Math.ceil(totalProducts / 50))}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void loadProducts(Math.max(0, offset - 50))}
                  disabled={isLoading || offset === 0}
                >
                  Föregående
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void loadProducts(offset + 50)}
                  disabled={isLoading || offset + products.length >= totalProducts}
                >
                  Nästa
                </Button>
              </div>
            </div>
            </>
          )}
        </section>
        {similarTo && (
          <section
            aria-live="polite"
            className="rounded-lg border border-flow-200 bg-flow-50/50 p-5 shadow-sm"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
                  {"Produktj\u00e4mf\u00f6relse"}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-ink-950">
                  {"Liknande produkter till "} {text(similarTo.sin)}
                </h2>
                <p className="mt-1 text-sm text-ink-600">
                  {"Rangordnas efter samma leverant\u00f6r, typ, utf\u00f6rande, RTI och K-v\u00e4rde."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSimilarTo(null);
                  setSimilarProducts(null);
                  setSimilarError(null);
                  similarRequestId.current += 1;
                }}
                className="self-start text-sm font-medium text-ink-500 hover:text-ink-900"
              >
                {"D\u00f6lj"}
              </button>
            </div>

            {isSimilarLoading && (
              <p className="mt-5 text-sm text-ink-600">
                {"H\u00e4mtar liknande produkter..."}
              </p>
            )}

            {similarError && (
              <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {similarError}
              </p>
            )}

            {similarProducts && !isSimilarLoading && (
              <>
                {similarProducts.length === 0 ? (
                  <p className="mt-5 rounded-md border border-dashed border-ink-300 bg-white p-4 text-sm text-ink-600">
                    {"Inga tillr\u00e4ckligt lika produkter hittades i databasen."}
                  </p>
                ) : (
                  <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
                    {similarProducts.map((product, index) => (
                      <article
                        key={product.id ?? product.sin ?? String(index)}
                        className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm"
                      >
                        <p className="text-base font-semibold text-ink-950">
                          {text(product.sin)}
                        </p>
                        <dl className="mt-3 space-y-2 text-sm">
                          {columns.slice(1).map((column) => (
                            <div key={column.label}>
                              <dt className="text-xs font-medium text-ink-500">
                                {column.label}
                              </dt>
                              <dd className="mt-0.5 text-ink-700">
                                {column.value(product)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <ProductDocumentLinks product={product} compact />
                          {product.id !== null && (
                            <button
                              type="button"
                              onClick={() => void loadSimilarProducts(product)}
                              className="text-sm font-medium text-flow-700 hover:text-flow-900"
                            >
                              {"J\u00e4mf\u00f6r"}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
        </>
      )}
    </div>
  );
}

function ProductDocumentLinks({
  product,
  compact = false
}: {
  product: SprsokProduct;
  compact?: boolean;
}) {
  const documents = product.documents ?? [];
  if (documents.length > 0) {
    return (
      <span className="flex flex-col items-start gap-1.5">
        {documents.map((document, index) => {
          const page = document.page_numbers?.[0] ?? document.source_page;
          const href = `/api/products/documents/${encodeURIComponent(document.document_id)}/file${page ? `#page=${page}` : ""}`;
          return (
            <a
              key={document.document_id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={document.title || "Verifierat datablad"}
              className="inline-flex items-center gap-1.5 font-medium text-flow-700 hover:text-flow-900"
            >
              {compact || documents.length === 1
                ? "Visa datablad"
                : document.title || `Datablad ${index + 1}`}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          );
        })}
      </span>
    );
  }

  return isExternalUrl(product.datablad) ? (
    <a
      href={product.datablad}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 font-medium text-flow-700 hover:text-flow-900"
    >
      {compact ? "Datablad" : "Öppna"}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  ) : (
    <span className="text-ink-400">—</span>
  );
}

function text(value: string | null) {
  return value?.trim() || "—";
}

function isExternalUrl(value: string | null): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
