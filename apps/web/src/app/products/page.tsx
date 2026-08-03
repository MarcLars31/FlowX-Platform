"use client";

import { type FormEvent, useState } from "react";
import { AlertCircle, ExternalLink, Search, X } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type SprsokProduct = {
  id: number | null;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  datablad: string | null;
};

type ProductSearchResponse = {
  products: SprsokProduct[];
  count: number;
  error?: string;
};

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
  const [products, setProducts] = useState<SprsokProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const searchTerm = query.trim();
    if (!searchTerm) {
      setProducts(null);
      setError("Skriv ett SIN, leverantör, typ, utförande, K-värde eller RTI.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const parameters = new URLSearchParams({ q: searchTerm, limit: "50" });
      const response = await fetch(`/api/products/search?${parameters}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as ProductSearchResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Produktsökningen kunde inte genomföras.");
      }

      setProducts(payload.products);
      setSearchedFor(searchTerm);
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
    setProducts(null);
    setError(null);
    setSearchedFor("");
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
          Sök i Sprsöks produktdata efter SIN, leverantör, typ, utförande,
          K-värde eller RTI. Öppna databladet direkt från träfflistan.
        </p>
      </header>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={searchProducts}>
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
            {(query || products || error) && (
              <Button type="button" variant="secondary" onClick={clearSearch}>
                <X className="h-4 w-4" aria-hidden="true" />
                Rensa
              </Button>
            )}
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
        <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-ink-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-ink-700">
              {products.length === 0
                ? `Inga produkter hittades för “${searchedFor}”.`
                : `${products.length} träffar för “${searchedFor}”`}
            </p>
            <p className="text-xs text-ink-500">Datakälla: Sprsök</p>
          </div>

          {products.length > 0 && (
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
                        {isExternalUrl(product.datablad) ? (
                          <a
                            href={product.datablad}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-flow-700 hover:text-flow-900"
                          >
                            Öppna
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
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
