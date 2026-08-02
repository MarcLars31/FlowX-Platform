"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type ProductRow = Record<string, unknown>;

type ProductsResponse = {
  products: ProductRow[];
  detail?: string;
  error?: string;
};

const columns = [
  { label: "Manufacturer", value: manufacturerValue },
  { label: "Product no / SIN", value: productNoValue },
  { label: "Product name", value: productNameValue },
  { label: "Category", value: (row: ProductRow) => text(row.category) },
  { label: "Sub-category", value: (row: ProductRow) => text(row.sub_category) },
  { label: "K-factor", value: kFactorValue },
  { label: "Response type", value: responseTypeValue },
  { label: "Orientation", value: orientationValue },
  { label: "Temperature", value: temperatureRatingsValue },
  { label: "Color", value: colorValue },
  { label: "Approvals", value: approvalsValue },
  { label: "Status", value: (row: ProductRow) => text(row.status) }
];

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProducts() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pkms/products", {
        cache: "no-store"
      });
      const payload = (await response.json()) as ProductsResponse;

      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Could not load products.");
      }

      setProducts(payload.products);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load products."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Initial data loading intentionally updates this client view after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return products;

    return products.filter((product) =>
      columns
        .map((column) => column.value(product))
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }, [products, query]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
            Products
          </h1>
        </div>
        <Button variant="secondary" onClick={loadProducts} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </header>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="max-w-xl">
          <Input
            id="product-search"
            label="Search"
            placeholder="Search manufacturer, SIN, category or status"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>

      {error && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <p className="text-sm font-medium text-ink-600">
            {isLoading ? "Loading products" : `${filteredProducts.length} products`}
          </p>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-flow-700 ring-1 ring-ink-200">
            <Search className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filteredProducts.map((product, index) => (
                <tr
                  key={`${productNoValue(product)}-${index}`}
                  className="hover:bg-ink-50/70"
                >
                  {columns.map((column) => {
                    const value = column.value(product);

                    return (
                      <td
                        key={column.label}
                        className="max-w-72 truncate px-5 py-4 text-sm text-ink-700"
                        title={value}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!isLoading && filteredProducts.length === 0 && (
                <tr>
                  <td
                    className="px-5 py-8 text-center text-sm text-ink-500"
                    colSpan={columns.length}
                  >
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function manufacturerValue(row: ProductRow) {
  const manufacturer = row.manufacturer;

  if (typeof manufacturer === "string") return manufacturer;
  if (isRecord(manufacturer)) return text(manufacturer.name);

  return text(row.manufacturer_name);
}

function productNoValue(row: ProductRow) {
  return text(row.product_no ?? row.sin ?? row.SIN);
}

function productNameValue(row: ProductRow) {
  return text(row.product_name ?? row.productName ?? row.name);
}

function kFactorValue(row: ProductRow) {
  const raw = text(row.k_value_raw);
  if (raw !== "-") return raw;

  const rawPayloadValue = text(rawPayload(row).k_value_raw);
  if (rawPayloadValue !== "-") return rawPayloadValue;

  const values = [text(row.k_factor_imperial), text(row.k_factor_si)].filter(
    (value) => value !== "-"
  );

  return values.length > 0 ? values.join(" / ") : "-";
}

function responseTypeValue(row: ProductRow) {
  return text(row.response_type ?? rawPayload(row).response_type);
}

function orientationValue(row: ProductRow) {
  return text(row.orientation ?? rawPayload(row).orientation);
}

function temperatureRatingsValue(row: ProductRow) {
  const ratings =
    row.temperature_ratings ?? rawPayload(row).temperature_ratings;

  if (typeof ratings === "string") return ratings;
  if (!Array.isArray(ratings)) return "-";

  const values = ratings
    .map((rating) => {
      if (!isRecord(rating)) return text(rating);

      const sprinklerTemperature = text(
        rating.sprinklerTemp ?? rating.sprinkler_temperature ?? rating.temperature
      );
      const coverPlateTemperature = text(
        rating.coverPlateTemp ?? rating.cover_plate_temperature
      );

      if (coverPlateTemperature === "-") return sprinklerTemperature;
      if (sprinklerTemperature === "-") return coverPlateTemperature;

      return `${sprinklerTemperature} (cover ${coverPlateTemperature})`;
    })
    .filter((value) => value !== "-");

  return values.length > 0 ? values.join(", ") : "-";
}

function colorValue(row: ProductRow) {
  return text(row.color ?? rawPayload(row).color);
}

function approvalsValue(row: ProductRow) {
  const approvals = row.approval_names ?? row.approvals;

  if (typeof approvals === "string") return approvals;
  if (Array.isArray(approvals)) return approvals.map(String).join(", ") || "-";

  const rawApprovals = rawPayload(row).approvals;
  if (Array.isArray(rawApprovals)) {
    return rawApprovals.map(String).join(", ") || "-";
  }

  return "-";
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawPayload(row: ProductRow) {
  if (typeof row.raw_text !== "string") return {};

  try {
    const parsed = JSON.parse(row.raw_text) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
