"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  CheckCircle2,
  History,
  Loader2,
  PackageCheck,
  Plus,
  Trash2
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type Row = Record<string, unknown> & { id: string };
type AccessoryDraft = {
  name: string;
  productNumber: string;
  quantity: number;
  unit: string;
  notes: string;
};

export function DistributorMappingPanel({
  projectId,
  requirements,
  assignments,
  memories,
  memoryAccessories,
  onReload
}: {
  projectId: string;
  requirements: Row[];
  assignments: Row[];
  memories: Row[];
  memoryAccessories: Row[];
  onReload: () => Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmedRequirements = requirements.filter(
    (requirement) =>
      ["user_confirmed", "user_modified"].includes(String(requirement.status)) &&
      requirementOperation(requirement) !== "remove"
  );
  const manualAssignments = assignments.filter((assignment) => {
    const snapshot = record(assignment.product_snapshot);
    return snapshot.source === "distributor_manual" && assignment.status === "selected";
  });

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-[#0073b6]/20 bg-white shadow-sm">
        <div className="grid gap-5 bg-[#0073b6]/5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0073b6]">
              Ahlsells produktval
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink-950">
              Koppla bekräftade krav till rätt artikel och tillbehör
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
              Produkten registreras av en distributörsspecialist. Varje godkänt val blir
              organisationsägd historik som återanvänds när samma tekniska krav förekommer igen.
            </p>
          </div>
          <div className="rounded-xl border border-white bg-white px-4 py-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ahlsell-logo.svg" alt="Ahlsell" className="h-8 w-auto" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Konceptdemonstration · Scipx
            </p>
          </div>
        </div>
        <div className="grid gap-px bg-ink-200 sm:grid-cols-3">
          <WorkflowStep number="1" label="Extrahera och godkänn krav" />
          <WorkflowStep number="2" label="Ahlsell väljer produkt och tillbehör" />
          <WorkflowStep number="3" label="Valet föreslås nästa gång" />
        </div>
      </div>

      {(message || error) && (
        <div
          role="status"
          className={
            error
              ? "rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800"
              : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
          }
        >
          {error ?? message}
        </div>
      )}

      {confirmedRequirements.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          Godkänn minst ett extraherat installationskrav under Kravgranskning. Därefter kan
          Ahlsell registrera produkt och tillbehör här.
        </div>
      ) : (
        <div className="space-y-5">
          {confirmedRequirements.map((requirement) => {
            const assignment = manualAssignments.find(
              (item) => item.requirement_id === requirement.id
            );
            const matchingMemories = memories
              .filter(
                (memory) =>
                  memory.requirement_fingerprint === requirement.mapping_fingerprint
              )
              .slice(0, 3);
            return (
              <RequirementProductMappingCard
                key={`${requirement.id}:${String(assignment?.updated_at ?? "new")}`}
                projectId={projectId}
                requirement={requirement}
                assignment={assignment}
                memories={matchingMemories}
                memoryAccessories={memoryAccessories}
                onSaved={async (successMessage) => {
                  setError(null);
                  setMessage(successMessage);
                  await onReload();
                }}
                onError={(errorMessage) => {
                  setMessage(null);
                  setError(errorMessage);
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function RequirementProductMappingCard({
  projectId,
  requirement,
  assignment,
  memories,
  memoryAccessories,
  onSaved,
  onError
}: {
  projectId: string;
  requirement: Row;
  assignment?: Row;
  memories: Row[];
  memoryAccessories: Row[];
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const currentSnapshot = record(assignment?.product_snapshot);
  const [productName, setProductName] = useState(String(currentSnapshot.name ?? ""));
  const [productNumber, setProductNumber] = useState(
    String(currentSnapshot.productNumber ?? "")
  );
  const [manufacturerName, setManufacturerName] = useState(
    String(currentSnapshot.manufacturer ?? "")
  );
  const [notes, setNotes] = useState(String(currentSnapshot.notes ?? ""));
  const [accessories, setAccessories] = useState<AccessoryDraft[]>(() =>
    snapshotAccessories(currentSnapshot.accessories)
  );
  const [saving, setSaving] = useState(false);
  const attributes = record(record(requirement.value_json).attributes);
  const attributeEntries = Object.entries(attributes).slice(0, 8);

  function applyMemory(memory: Row) {
    setProductName(String(memory.product_name ?? ""));
    setProductNumber(String(memory.product_number ?? ""));
    setManufacturerName(String(memory.manufacturer_name ?? ""));
    setNotes(String(memory.notes ?? ""));
    setAccessories(
      memoryAccessories
        .filter((accessory) => accessory.memory_id === memory.id)
        .map((accessory) => ({
          name: String(accessory.product_name ?? ""),
          productNumber: String(accessory.product_number ?? ""),
          quantity: numeric(accessory.quantity_per_main_product, 1),
          unit: String(accessory.unit ?? "st"),
          notes: String(accessory.notes ?? "")
        }))
    );
  }

  async function save() {
    setSaving(true);
    onError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/product-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementId: requirement.id,
          productName,
          productNumber,
          manufacturerName,
          notes,
          accessories
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Produktvalet kunde inte sparas.");
      }
      await onSaved(payload?.message ?? "Produktvalet är sparat.");
    } catch (saveError) {
      onError(
        saveError instanceof Error
          ? saveError.message
          : "Produktvalet kunde inte sparas."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-100 bg-ink-50 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#0073b6]/10 px-2 py-1 text-xs font-semibold text-[#00649e]">
                {String(requirement.category)}
              </span>
              <span className="font-semibold text-ink-950">
                {String(requirement.requirement_key)}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-700">
              {String(requirement.value_text ?? "Tekniskt krav")}
            </p>
          </div>
          {assignment && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Produkt registrerad
            </span>
          )}
        </div>
        {attributeEntries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attributeEntries.map(([key, value]) => (
              <span key={key} className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-600">
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5 p-5">
        {memories.length > 0 && (
          <div className="rounded-xl border border-[#0073b6]/20 bg-[#0073b6]/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#005d91]">
              <History className="h-4 w-4" aria-hidden="true" />
              Tidigare produktval för samma tekniska krav
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {memories.map((memory) => (
                <button
                  key={memory.id}
                  type="button"
                  onClick={() => applyMemory(memory)}
                  className="rounded-lg border border-[#0073b6]/20 bg-white p-3 text-left transition hover:border-[#0073b6]/60"
                >
                  <p className="font-semibold text-ink-950">
                    {String(memory.product_name)}
                  </p>
                  <p className="mt-1 text-xs text-ink-600">
                    Art.nr {String(memory.product_number)}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-[#00649e]">
                    Använt {String(memory.usage_count ?? 1)} gånger · använd förslaget
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Input
            id={`product-name-${requirement.id}`}
            label="Produktnamn"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            required
          />
          <Input
            id={`product-number-${requirement.id}`}
            label="Ahlsells artikelnummer"
            value={productNumber}
            onChange={(event) => setProductNumber(event.target.value)}
            required
          />
          <Input
            id={`manufacturer-${requirement.id}`}
            label="Tillverkare (valfritt)"
            value={manufacturerName}
            onChange={(event) => setManufacturerName(event.target.value)}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-950">Tillbehör som normalt följer med</h3>
              <p className="mt-1 text-xs text-ink-500">
                Tillbehören sparas tillsammans med produktvalet och rangordnas efter användning.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setAccessories((current) => [
                  ...current,
                  { name: "", productNumber: "", quantity: 1, unit: "st", notes: "" }
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Lägg till tillbehör
            </Button>
          </div>

          {accessories.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-ink-200 bg-ink-50 p-4 text-sm text-ink-500">
              Inga tillbehör tillagda ännu.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {accessories.map((accessory, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-ink-200 bg-ink-50 p-3 md:grid-cols-[2fr_1.3fr_0.7fr_0.7fr_auto]">
                  <CompactInput
                    label="Tillbehör"
                    value={accessory.name}
                    onChange={(value) => updateAccessory(setAccessories, index, "name", value)}
                  />
                  <CompactInput
                    label="Artikelnummer"
                    value={accessory.productNumber}
                    onChange={(value) => updateAccessory(setAccessories, index, "productNumber", value)}
                  />
                  <CompactInput
                    label="Antal"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={String(accessory.quantity)}
                    onChange={(value) => updateAccessory(setAccessories, index, "quantity", Number(value))}
                  />
                  <CompactInput
                    label="Enhet"
                    value={accessory.unit}
                    onChange={(value) => updateAccessory(setAccessories, index, "unit", value)}
                  />
                  <button
                    type="button"
                    aria-label="Ta bort tillbehör"
                    onClick={() => setAccessories((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="mt-6 flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink-700">Intern motivering eller kommentar</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-[#0073b6] focus:ring-[#0073b6]"
          />
        </label>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={save}
            disabled={saving || !productName.trim() || !productNumber.trim()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Sparar produktval…" : assignment ? "Uppdatera produktval" : "Spara produktval"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function WorkflowStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3 bg-white p-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0073b6] text-xs font-bold text-white">
        {number}
      </span>
      <span className="text-sm font-semibold text-ink-800">{label}</span>
    </div>
  );
}

function CompactInput({
  label,
  value,
  onChange,
  type = "text",
  min,
  step
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block h-10 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 focus:border-[#0073b6] focus:ring-[#0073b6]"
      />
    </label>
  );
}

function updateAccessory(
  setAccessories: Dispatch<SetStateAction<AccessoryDraft[]>>,
  index: number,
  key: keyof AccessoryDraft,
  value: string | number
) {
  setAccessories((current) =>
    current.map((accessory, itemIndex) =>
      itemIndex === index ? { ...accessory, [key]: value } : accessory
    )
  );
}

function snapshotAccessories(value: unknown): AccessoryDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const accessory = record(item);
    const name = String(accessory.name ?? "");
    if (!name) return [];
    return [
      {
        name,
        productNumber: String(accessory.productNumber ?? ""),
        quantity: numeric(accessory.quantity, 1),
        unit: String(accessory.unit ?? "st"),
        notes: String(accessory.notes ?? "")
      }
    ];
  });
}

function requirementOperation(requirement: Row) {
  return String(record(requirement.value_json).operation ?? "install").toLowerCase();
}

function numeric(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
