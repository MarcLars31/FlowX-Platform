"use client";



import type { AssemblyComponent, ProductAssemblyPlan } from "@/lib/product-assembly-plan";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function ProductAssemblyParts({ id, plan, accessories = [], disabled, onChoose, activeComponentId, children }: {
  id: string; plan: ProductAssemblyPlan; disabled: boolean;
  onChoose: (component: AssemblyComponent) => void;
  accessories?: readonly { productNumber: string; name: string; notes: string }[];
  activeComponentId?: string | null;
  children?: ReactNode;
}) {
  if (!plan.components.length) return null;
  return <section id={id} className="scroll-mt-80 overflow-hidden rounded-md border border-flow-300 bg-white lg:scroll-mt-52" aria-labelledby={`${id}-title`}>
    <div className="border-b border-flow-200 bg-flow-50 p-4">
      <h5 id={`${id}-title`} className="text-sm font-bold text-ink-950">Välj tillbehörsgrupp</h5>
      {plan.guidance && <p className="mt-2 text-xs leading-5 text-ink-700">{plan.guidance}</p>}
      <p className="mt-2 text-sm leading-5 text-ink-700">Klicka på en tillbehörsgrupp för att se alternativen som programmet söker fram till din huvudprodukt.</p>
      {plan.kind === "pipe"
        ? <p className="mt-1 text-xs font-semibold leading-5 text-ink-700">Rörlängden gäller huvudprodukten. Antalet böjar, T-stycken, ändlock och fästen behöver mängdas separat från ritningen. Mängdfälten lämnas tomma tills du fyller i dem.</p>
        : <p className="mt-1 text-xs leading-5 text-ink-700">Delar som redan ingår i huvudproduktens leverans behöver inte läggas till igen.</p>}
    </div>
    <ul className="divide-y divide-ink-200">
      {plan.components.map(component => {
        const expanded = activeComponentId === component.id;
        const selected = accessories.filter(item => item.notes.startsWith(`Kravdel: ${component.label}. `));
        return <li key={component.id} className="min-w-0">
          <button id={`${id}-${component.id}-trigger`} type="button" disabled={disabled} aria-expanded={expanded} aria-controls={`${id}-${component.id}-options`}
            onClick={() => onChoose(component)} className={`flex w-full scroll-mt-80 items-center justify-between gap-3 p-4 text-left transition hover:bg-flow-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-flow-600 disabled:cursor-not-allowed disabled:opacity-60 lg:scroll-mt-52 ${expanded ? "bg-flow-50" : "bg-white"}`}>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink-950">{component.label}</span>
              <span className="mt-1 block text-xs text-ink-600">{component.optional ? "Valfritt" : component.conditional ? "Kontrollera montagevillkoret" : "Ingår i postens omfattning"}</span>
              {selected.length > 0 && <span className="mt-2 block text-xs font-semibold text-flow-800">{selected.length} valda</span>}
            </span>
            {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-flow-800" aria-hidden="true" /> : <ChevronRight className="h-5 w-5 shrink-0 text-flow-800" aria-hidden="true" />}
          </button>
          <div id={`${id}-${component.id}-options`} role="region" aria-labelledby={`${id}-${component.id}-trigger`} hidden={!expanded}>
            {expanded && <div className="space-y-3 border-t border-flow-200 p-4">
              <p className="text-sm leading-5 text-ink-700">{component.requirement}</p>
              {children}
            </div>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
