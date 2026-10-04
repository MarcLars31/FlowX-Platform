"use client";

import { useEffect, useRef, useState } from "react";
import { PackagePlus, Plus, Trash2, X } from "lucide-react";
import { AhlsellProductLookup } from "@/components/AhlsellProductLookup";
import { Button } from "@/components/Button";
import { ProductQuantityFields } from "@/components/ProductQuantityFields";
import { validateManualDistributorProduct } from "@/lib/distributor-product-mapping";
import { newProductAccessoryDraft, productAccessoryDraftError, type ProductAccessoryDraft } from "@/lib/product-card-accessories";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import { parseProductOrderQuantity } from "@/lib/product-order-quantity";
import { candidateSelectionReview, type ProductSelectionReview } from "@/lib/product-selection-review";

export type ManualProductChoice = {
  product: {
    productName: string;
    productSubtitle: string;
    productNumber: string;
    manufacturerArticleNumber: string;
    manufacturerName: string;
    deliveryTimeDays: string;
    unitPrice: string;
    currency: string;
  };
  quantity: { quantity: string; unit: string };
  accessories: ProductAccessoryDraft[];
  manual: boolean;
  review: ProductSelectionReview | null;
};

/** Changes remain a local draft until the complete product card is accepted. */
export function ManualProductCard({ projectId, requirementId, postNumber, initial, initialError, onApply, onCancel, onDirtyChange }: {
  projectId: string;
  requirementId: string;
  postNumber: string | null;
  initial: ManualProductChoice;
  initialError?: string | null;
  onApply: (choice: ManualProductChoice) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...initial, product: { ...initial.product }, quantity: { ...initial.quantity }, accessories: initial.accessories.map(row => ({ ...row })) }));
  const [error, setError] = useState(initialError ?? "");
  const dialog = useRef<HTMLDialogElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const prefix = `manual-product-${requirementId}`;
  useEffect(() => {
    const card = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    card?.showModal();
    document.getElementById(`${prefix}-name`)?.focus();
    return () => { card?.close(); document.body.style.overflow = previousOverflow; };
  }, [prefix]);

  function change(patch: Partial<ManualProductChoice>) {
    setDraft(current => ({ ...current, ...patch }));
    setError("");
    onDirtyChange(true);
  }
  function updateProduct(key: keyof ManualProductChoice["product"], value: string) {
    const identityChanged = ["productName", "productSubtitle", "productNumber", "manufacturerName", "manufacturerArticleNumber"].includes(key);
    change({ product: { ...draft.product, [key]: value }, ...(identityChanged ? { manual: true, review: candidateSelectionReview() } : {}) });
  }
  function updateAccessory(index: number, patch: Partial<ProductAccessoryDraft>) {
    change({ accessories: draft.accessories.map((row, current) => current === index ? { ...row, ...patch } : row) });
  }
  function addAccessory() {
    if (draft.accessories.length >= 20) return;
    const index = draft.accessories.length;
    change({ accessories: [...draft.accessories, newProductAccessoryDraft()] });
    window.requestAnimationFrame(() => document.getElementById(`${prefix}-accessory-${index}-name`)?.focus());
  }
  function apply() {
    const amount = parseProductOrderQuantity(draft.quantity);
    const validation = draft.manual ? validateManualDistributorProduct(draft.product, initial.product.currency) : null;
    const accessoryError = productAccessoryDraftError(draft.accessories);
    const invalidUnit = draft.accessories.find(row => !parseProductOrderQuantity(row));
    const problem = !draft.product.productNumber.trim() ? "Fyll inn Artikelnummer for hovedproduktet."
      : validation && "error" in validation ? validation.error
      : !amount ? "Angi gyldig total mengde og enhet for hovedproduktet."
      : accessoryError ?? (invalidUnit ? "Angi gyldig mengde og enhet for alle tilbehør." : "");
    if (problem || !amount) {
      setError(problem);
      window.requestAnimationFrame(() => errorMessage.current?.focus());
      return;
    }
    onApply({ ...draft, quantity: { quantity: String(amount.quantity), unit: amount.unit }, product: {
      ...draft.product,
      ...(validation && "data" in validation ? { ...validation.data, deliveryTimeDays: String(validation.data.deliveryTimeDays), unitPrice: String(validation.data.unitPrice) } : {})
    } });
  }

  return <dialog ref={dialog} id={`manual-product-card-${requirementId}`} className="manual-product-dialog"
    aria-labelledby={`${prefix}-title`} aria-describedby={`${prefix}-description`}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <header className="manual-product-dialog-header">
      <div><p>PDF-post {postNumber ?? "uten postnummer"}</p><h2 id={`${prefix}-title`}>Produkt og tilbehør</h2>
        <p id={`${prefix}-description`}>Fyll inn hovedproduktet og legg til tilbehør hvis du ønsker.</p></div>
      <Button variant="secondary" aria-label="Lukk produktkort" onClick={onCancel}><X aria-hidden="true" className="h-5 w-5" /></Button>
    </header>
    <div className="manual-product-dialog-body">
      <section aria-labelledby={`${prefix}-main-title`} className="manual-product-card-section">
        <h3 id={`${prefix}-main-title`}>Hovedprodukt</h3>
        <details className="manual-product-search"><summary>Søk hos Ahlsell eller lim inn produktlenke</summary>
          <AhlsellProductLookup projectId={projectId} requirementId={requirementId} id={`${prefix}-lookup`}
            defaultQuantity={draft.quantity.quantity} defaultUnit={draft.quantity.unit}
            selections={draft.product.productNumber ? [{ productNumber: draft.product.productNumber, ...draft.quantity }] : []}
            onSelect={(candidate, amount) => change({ product: { productName: candidate.productName, productSubtitle: candidate.subtitle ?? "", productNumber: candidate.articleNumber,
              manufacturerArticleNumber: "", manufacturerName: candidate.manufacturer, deliveryTimeDays: "", unitPrice: "", currency: initial.product.currency },
              quantity: amount, manual: false, review: candidateSelectionReview(candidate),
              accessories: normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(draft.product.productNumber) ? draft.accessories : [] })}
            onDeselect={() => change({ product: { ...draft.product, productName: "", productSubtitle: "", productNumber: "", manufacturerArticleNumber: "", manufacturerName: "", deliveryTimeDays: "", unitPrice: "" }, accessories: [], manual: true, review: candidateSelectionReview() })}
            onQuantityChange={(_candidate, amount) => change({ quantity: amount })} />
        </details>
        <div className="manual-product-form-grid">
          <Field id={`${prefix}-name`} label="Produktnavn" value={draft.product.productName} maxLength={240} onChange={value => updateProduct("productName", value)} />
          <Field id={`${prefix}-nrf`} label="Artikelnummer" value={draft.product.productNumber} required maxLength={120} onChange={value => updateProduct("productNumber", value)} />
          <Field id={`${prefix}-article`} label="Artikkelnummer" value={draft.product.manufacturerArticleNumber} required={draft.manual} maxLength={120} onChange={value => updateProduct("manufacturerArticleNumber", value)} />
          <Field id={`${prefix}-manufacturer`} label="Produsent" value={draft.product.manufacturerName} required={draft.manual} maxLength={200} onChange={value => updateProduct("manufacturerName", value)} />
          <Field id={`${prefix}-delivery`} label="Leveringstid (dager)" value={draft.product.deliveryTimeDays} required={draft.manual} inputMode="numeric" maxLength={4} onChange={value => updateProduct("deliveryTimeDays", value)} />
          <Field id={`${prefix}-price`} label={`Pris per enhet (${draft.product.currency})`} value={draft.product.unitPrice} required={draft.manual} inputMode="decimal" maxLength={20} onChange={value => updateProduct("unitPrice", value)} />
        </div>
        <ProductQuantityFields id={prefix} {...draft.quantity} onQuantityChange={value => change({ quantity: { ...draft.quantity, quantity: value } })} onUnitChange={value => change({ quantity: { ...draft.quantity, unit: value } })} />
      </section>
      <section aria-labelledby={`${prefix}-accessories-title`} className="manual-product-card-section">
        <div className="manual-product-section-heading"><h3 id={`${prefix}-accessories-title`}><PackagePlus aria-hidden="true" className="h-5 w-5" />Tilbehør <span>(valgfritt)</span></h3>
          <Button variant="secondary" onClick={addAccessory} disabled={draft.accessories.length >= 20}><Plus className="h-4 w-4" aria-hidden="true" />Legg til tilbehør</Button></div>
        {draft.accessories.length === 0 && <p className="manual-product-empty">Ingen tilbehør lagt til. Du kan bruke hovedproduktet alene.</p>}
        {draft.accessories.map((accessory, index) => <div key={index} className="manual-accessory-card">
          <div className="manual-product-section-heading"><h4>Tilbehør {index + 1}</h4><Button variant="ghost" aria-label={`Fjern tilbehør ${index + 1}`} onClick={() => change({ accessories: draft.accessories.filter((_, current) => current !== index) })}><Trash2 aria-hidden="true" className="h-4 w-4" />Fjern</Button></div>
          <div className="manual-product-form-grid">
            <Field id={`${prefix}-accessory-${index}-name`} label="Navn på tilbehør" value={accessory.name} required maxLength={240} onChange={value => updateAccessory(index, { name: value })} />
            <Field id={`${prefix}-accessory-${index}-nrf`} label="Artikelnummer (valgfritt)" value={accessory.productNumber} maxLength={120} onChange={value => updateAccessory(index, { productNumber: value })} />
          </div>
          {accessory.quantityBasis === "total" ? <ProductQuantityFields id={`${prefix}-accessory-${index}`} quantity={accessory.quantity} unit={accessory.unit}
            onQuantityChange={value => updateAccessory(index, { quantity: value })} onUnitChange={value => updateAccessory(index, { unit: value })} />
            : <div className="manual-product-form-grid">
              <Field id={`${prefix}-accessory-${index}-quantity`} label="Mengde per postenhet" value={accessory.quantity} required maxLength={15} inputMode="decimal" onChange={value => updateAccessory(index, { quantity: value })} />
              <Field id={`${prefix}-accessory-${index}-unit`} label="Enhet" value={accessory.unit} required maxLength={30} onChange={value => updateAccessory(index, { unit: value })} />
            </div>}
        </div>)}
        <details className="manual-product-search"><summary>Søk etter tilbehør hos Ahlsell</summary>
          {draft.product.productNumber.trim() ? <AhlsellProductLookup projectId={projectId} requirementId={requirementId} id={`${prefix}-accessory-lookup`} accessory mainArticleNumber={draft.product.productNumber}
            selectionLimitReached={draft.accessories.length >= 20} selections={draft.accessories.filter(row => row.productNumber).map(row => ({ productNumber: row.productNumber, quantity: row.quantity, unit: row.unit }))}
            onSelect={(candidate, amount) => { if (draft.accessories.length < 20 && !draft.accessories.some(row => normalizeNrfNumber(row.productNumber) === normalizeNrfNumber(candidate.articleNumber))) change({ accessories: [...draft.accessories, { ...newProductAccessoryDraft(), ...amount, name: candidate.subtitle || candidate.productName, productNumber: candidate.articleNumber, notes: `Valgt fra Ahlsell: ${candidate.productUrl}` }] }); }}
            onDeselect={candidate => change({ accessories: draft.accessories.filter(row => normalizeNrfNumber(row.productNumber) !== normalizeNrfNumber(candidate.articleNumber)) })}
            onQuantityChange={(candidate, amount) => change({ accessories: draft.accessories.map(row => normalizeNrfNumber(row.productNumber) === normalizeNrfNumber(candidate.articleNumber) ? { ...row, ...amount, quantityBasis: "total" } : row) })} />
            : <p>Fyll inn hovedproduktets Artikelnummer først.</p>}
        </details>
      </section>
    </div>
    <footer className="manual-product-dialog-footer">
      {error && <p ref={errorMessage} tabIndex={-1} role="alert">{error}</p>}
      <p>Valget lagres på posten når du trykker «Lagre produktvalg».</p>
      <div><Button variant="secondary" onClick={onCancel}>Avbryt</Button><Button onClick={apply}>Bruk produkt{draft.accessories.length ? ` og ${draft.accessories.length} tilbehør` : ""}</Button></div>
    </footer>
  </dialog>;
}

function Field({ id, label, value, required, maxLength, inputMode, onChange }: {
  id: string; label: string; value: string; required?: boolean; maxLength: number; inputMode?: "numeric" | "decimal"; onChange: (value: string) => void;
}) {
  return <label className="manual-product-field" htmlFor={id}><span>{label}{required ? " *" : ""}</span>
    <input id={id} value={value} required={required} maxLength={maxLength} inputMode={inputMode} onChange={event => onChange(event.target.value)} />
  </label>;
}
