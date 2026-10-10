"use client";

import { CheckCircle2, Circle } from "lucide-react";
import {
  pendingRequirementDecision, requirementDecisionComplete, requirementReviewConfirmation,
  type RequirementCheck, type RequirementDecision, type RequirementReviewDraft, type ReviewProduct
} from "@/lib/product-requirement-review";

export function ProductRequirementReview({ id, checks, products, value, onChange, onAddProduct }: {
  id: string;
  checks: RequirementCheck[];
  products: ReviewProduct[];
  value: RequirementReviewDraft;
  onChange: (value: RequirementReviewDraft) => void;
  onAddProduct: () => void;
}) {
  if (!checks.length) return null;
  const completed = checks.filter(check => requirementDecisionComplete(check, value.decisions[check.id], products)).length;
  const confirmation = requirementReviewConfirmation(value, products);
  function update(check: RequirementCheck, patch: Partial<RequirementDecision>) {
    onChange({ ...value, confirmation: "", decisions: {
      ...value.decisions,
      [check.id]: { ...(value.decisions[check.id] ?? pendingRequirementDecision()), ...patch }
    } });
  }
  return <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 overflow-hidden rounded-md border border-flow-300 bg-white">
    <div className="border-b border-flow-200 bg-flow-50 p-4">
      <h5 id={`${id}-title`} className="text-base font-bold text-ink-950">3. Kontrollera hela postens krav</h5>
      <p className="mt-1 text-sm font-semibold text-flow-900" role="status">{completed} av {checks.length} krav hanterade · {checks.length - completed} återstår</p>
      <p className="mt-2 text-xs leading-5 text-ink-700">Kontrollera varje krav mot produktunderlaget. Koppla en eller flera valda produkter, eller dokumentera hur exempelvis montage och ritningskrav hanteras. Produktvalet i sig verifierar inte kravet.</p>
      <button type="button" onClick={onAddProduct} disabled={!products.length} className="mt-2 text-sm font-bold text-flow-800 underline disabled:opacity-50">Lägg till delprodukt eller tillbehör</button>
    </div>
    <ol className="divide-y divide-ink-200">
      {checks.map((check, index) => {
        const decision = value.decisions[check.id] ?? pendingRequirementDecision();
        const complete = requirementDecisionComplete(check, decision, products);
        const controlId = `${id}-${index}`;
        const staleProducts = decision.productKeys.some(key => !products.some(product => product.key === key));
        return <li key={check.id} className={`p-4 ${complete ? "bg-emerald-50" : "bg-white"}`}>
          <div className="flex items-start gap-2">
            {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <label htmlFor={controlId} className="text-sm font-bold text-ink-950">{index + 1}. {check.label}{check.optional ? " · valfritt" : ""}</label>
              {check.text.length > 500 ? <details className="mt-1 text-xs leading-5 text-ink-700"><summary className="cursor-pointer font-semibold">Läs hela kravtexten</summary><p className="mt-2 whitespace-pre-wrap">{check.text}</p></details>
                : <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink-700">{check.text}</p>}
              <select id={controlId} value={decision.status} onChange={event => update(check, { status: event.target.value as RequirementDecision["status"], productKeys: [] })} className="mt-2 w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm">
                <option value="pending">Återstår att kontrollera</option>
                <option value="product">Täcks av valda produkter</option>
                <option value="handled">Hanterat med kommentar</option>
                {check.optional && <option value="not_applicable">Valfritt – tillämpas inte</option>}
              </select>
              {decision.status === "product" && <fieldset className="mt-2 space-y-2">
                <legend className="mb-1 text-xs font-semibold">Vilka produkter täcker kravet?</legend>
                {!products.length && <p className="text-xs text-amber-900">Välj huvudprodukt först.</p>}
                {products.map(product => <label key={product.key} className="flex items-start gap-2 text-xs leading-5">
                  <input type="checkbox" className="mt-0.5 rounded border-ink-300 text-flow-700" checked={decision.productKeys.includes(product.key)} onChange={event => update(check, {
                    productKeys: event.target.checked ? [...decision.productKeys.filter(key => products.some(item => item.key === key)), product.key] : decision.productKeys.filter(key => key !== product.key)
                  })} />{product.label}
                </label>)}
                {staleProducts && <p role="status" className="text-xs font-semibold text-amber-900">En kopplad produkt eller mängd har ändrats. Välj produkter på nytt.</p>}
              </fieldset>}
              {decision.status !== "pending" && <label className="mt-2 block text-xs font-semibold">{decision.status === "product" ? "Underlag eller kommentar (valfritt)" : "Beskriv hur kravet är hanterat (obligatoriskt)"}
                <textarea value={decision.note} maxLength={1000} rows={2} onChange={event => update(check, { note: event.target.value })} className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm font-normal" placeholder="Exempel: datablad, ritningsreferens, installationslösning eller dokumenterat besked." />
              </label>}
            </div>
          </div>
        </li>;
      })}
    </ol>
    <label className="flex items-start gap-3 border-t border-flow-200 bg-flow-50 p-4 text-sm font-semibold text-ink-900">
      <input type="checkbox" className="mt-1 rounded border-ink-300 text-flow-700" disabled={completed !== checks.length || !products.length} checked={completed === checks.length && value.confirmation === confirmation} onChange={event => onChange({ ...value, confirmation: event.target.checked ? confirmation : "" })} />
      Jag har kontrollerat hela PDF-posten, tilläggskraven och att produkterna tillsammans med angivna åtgärder täcker kraven. Inga öppna frågor återstår.
    </label>
  </section>;
}
