"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  Save
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type ReviewProduct = {
  id: string;
  source_file: string;
  source_row?: string;
  manufacturer: string;
  product_no?: string;
  product_name?: string;
  category?: string;
  sub_category?: string;
  k_value_raw?: string;
  rti?: string;
  datasheet_url?: string;
  response_type?: string;
  orientation?: string;
  approvals?: string;
  temperature_ratings?: Record<string, unknown>[];
  color?: string;
  review_notes?: string;
  status: "needs_review";
  created_at?: string;
  updated_at?: string;
};

type EditableField =
  | "manufacturer"
  | "product_no"
  | "product_name"
  | "category"
  | "sub_category"
  | "k_value_raw"
  | "rti"
  | "datasheet_url"
  | "response_type"
  | "orientation"
  | "approvals"
  | "color";

const editableFields: Array<{
  key: EditableField;
  label: string;
  placeholder?: string;
}> = [
  { key: "manufacturer", label: "Manufacturer" },
  { key: "product_no", label: "Product no / SIN" },
  { key: "product_name", label: "Product name" },
  { key: "category", label: "Category" },
  { key: "sub_category", label: "Sub-category" },
  { key: "k_value_raw", label: "K-factor" },
  { key: "rti", label: "RTI" },
  { key: "response_type", label: "Response type" },
  { key: "orientation", label: "Orientation" },
  { key: "color", label: "Color" },
  { key: "approvals", label: "Approvals", placeholder: "UL, FM, CE" },
  { key: "datasheet_url", label: "Datasheet URL" }
];

export default function ProductReviewQueuePage() {
  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [draft, setDraft] = useState<ReviewProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadProducts() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pkms/review-queue", {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        products: ReviewProduct[];
        error?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Could not load queue.");
      }

      setProducts(payload.products);
      setDraft((current) => {
        const currentProduct = payload.products.find(
          (product) => product.id === current?.id
        );
        return currentProduct ?? payload.products[0] ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load products awaiting approval."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  function updateField(field: EditableField, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setMessage(null);
  }

  function updateTemperatures(value: string) {
    const temperatureRatings = value
      .split(/[\n,;]+/)
      .map((temperature) => temperature.trim())
      .filter(Boolean)
      .map((sprinklerTemp) => ({ sprinklerTemp, coverPlateTemp: null }));

    setDraft((current) =>
      current ? { ...current, temperature_ratings: temperatureRatings } : current
    );
    setMessage(null);
  }

  async function persistDraft() {
    if (!draft) throw new Error("Select a product first.");

    const response = await fetch("/api/pkms/review-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, product: draft })
    });
    const payload = (await response.json()) as {
      product?: ReviewProduct;
      error?: string;
      detail?: string;
    };

    if (!response.ok || !payload.product) {
      throw new Error(payload.detail ?? payload.error ?? "Could not save changes.");
    }

    setProducts((current) =>
      current.map((product) =>
        product.id === payload.product?.id ? payload.product : product
      )
    );
    setDraft(payload.product);
    return payload.product;
  }

  async function saveChanges() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await persistDraft();
      setMessage("Changes saved in the review database.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save changes."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function approveProduct() {
    if (!draft?.manufacturer.trim() || !draft.product_no?.trim()) {
      setError("Manufacturer and SIN are required before approval.");
      return;
    }

    setIsApproving(true);
    setError(null);
    setMessage(null);

    try {
      const savedProduct = await persistDraft();
      const response = await fetch("/api/pkms/review-queue/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: savedProduct.id })
      });
      const payload = (await response.json()) as {
        approved?: boolean;
        error?: string;
        detail?: string;
      };

      if (!response.ok || !payload.approved) {
        throw new Error(payload.detail ?? payload.error ?? "Approval failed.");
      }

      const remainingProducts = products.filter(
        (product) => product.id !== savedProduct.id
      );
      setProducts(remainingProducts);
      setDraft(remainingProducts[0] ?? null);
      setMessage(`${savedProduct.product_no} approved and published to Products.`);
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Could not approve product."
      );
    } finally {
      setIsApproving(false);
    }
  }

  const busy = isSaving || isApproving;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Product review
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
            Till godkännande
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Edit products stored in the review database. Approved products are
            published to the final Products database.
          </p>
        </div>
        <Button variant="secondary" onClick={loadProducts} disabled={isLoading || busy}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </header>

      {error && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </section>
      )}

      {message && (
        <section className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{message}</p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        <div className="grid min-h-[38rem] lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="border-b border-ink-200 bg-ink-50/60 lg:border-b-0 lg:border-r">
            <div className="border-b border-ink-200 px-4 py-3">
              <p className="text-sm font-semibold text-ink-800">
                {isLoading ? "Loading queue" : `${products.length} awaiting approval`}
              </p>
            </div>
            <div className="max-h-[44rem] divide-y divide-ink-200 overflow-y-auto">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={`block w-full px-4 py-3 text-left transition ${
                    draft?.id === product.id ? "bg-flow-50" : "hover:bg-white"
                  }`}
                  onClick={() => {
                    setDraft(product);
                    setError(null);
                    setMessage(null);
                  }}
                  disabled={busy}
                >
                  <span className="block truncate text-sm font-semibold text-ink-900">
                    {product.product_no || "Missing SIN"}
                  </span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {product.product_name || product.manufacturer}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-ink-400">
                    {product.source_file}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="p-5">
            {draft ? (
              <div className="space-y-6">
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Awaiting approval
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Imported from {draft.source_file}
                      {draft.created_at ? ` on ${formatDate(draft.created_at)}` : ""}.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {editableFields.map((field) => (
                    <Input
                      key={field.key}
                      id={`queue-${draft.id}-${field.key}`}
                      label={field.label}
                      placeholder={field.placeholder}
                      value={String(draft[field.key] ?? "")}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      disabled={busy}
                    />
                  ))}
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-ink-700">
                      Temperature ratings
                    </span>
                    <textarea
                      rows={3}
                      value={temperatureText(draft)}
                      onChange={(event) => updateTemperatures(event.target.value)}
                      disabled={busy}
                      placeholder="135°F/57°C, 155°F/68°C"
                      className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm transition placeholder:text-ink-400 focus:border-flow-500 focus:ring-flow-500"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-ink-700">
                      Review notes
                    </span>
                    <textarea
                      rows={3}
                      value={draft.review_notes ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, review_notes: event.target.value }
                            : current
                        )
                      }
                      disabled={busy}
                      className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm transition focus:border-flow-500 focus:ring-flow-500"
                    />
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-ink-200 pt-5 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={saveChanges} disabled={busy}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {isSaving ? "Saving" : "Save changes"}
                  </Button>
                  <Button onClick={approveProduct} disabled={busy}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {isApproving ? "Approving" : "Approve and publish"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[30rem] flex-col items-center justify-center text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
                <p className="mt-4 text-base font-semibold text-ink-900">
                  No products awaiting approval
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  Products saved from JSON Import will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function temperatureText(product: ReviewProduct) {
  return (product.temperature_ratings ?? [])
    .map((rating) =>
      String(
        rating.sprinklerTemp ??
          rating.sprinkler_temperature ??
          rating.temperature ??
          ""
      ).trim()
    )
    .filter(Boolean)
    .join(", ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
