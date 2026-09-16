"use client";

import type { AssemblyComponent, ProductAssemblyPlan } from "@/lib/product-assembly-plan";
import { Button } from "@/components/Button";

export function ProductAssemblyParts({ id, plan, mainProductName, accessories = [], disabled, onChoose }: {
  id: string; plan: ProductAssemblyPlan; mainProductName: string; disabled: boolean;
  onChoose: (component: AssemblyComponent) => void;
  accessories?: readonly { productNumber: string; notes: string }[];
}) {
  return <section id={id} className="scroll-mt-80 overflow-hidden rounded-md border border-flow-300 bg-white lg:scroll-mt-52" aria-labelledby={`${id}-title`}>
    <div className="border-b border-flow-200 bg-flow-50 p-4">
      <h5 id={`${id}-title`} className="text-base font-bold text-ink-950">2. Välj delprodukter och tillbehör</h5>
      <p className="mt-1 text-sm font-semibold text-flow-900">Huvudprodukt: {mainProductName || plan.mainLabel}</p>
      {plan.guidance && <p className="mt-2 text-xs leading-5 text-ink-700">{plan.guidance}</p>}
      <p className="mt-2 text-xs leading-5 text-ink-700">Motorn har läst ut delarna nedan ur PDF-posten. Produktförslagen söks hos Ahlsell utifrån delen och den valda huvudprodukten. Kontrollera kompatibiliteten före val.</p>
      {plan.kind === "pipe"
        ? <p className="mt-1 text-xs font-semibold leading-5 text-ink-700">Rörlängden gäller huvudprodukten. Antalet böjar, T-stycken, ändlock och fästen behöver mängdas separat från ritningen. Mängdfälten lämnas tomma tills du fyller i dem.</p>
        : <p className="mt-1 text-xs leading-5 text-ink-700">Om en del redan ingår i huvudproduktens leverans behöver den inte läggas till igen. Koppla då huvudprodukten till delens krav i steg 3.</p>}
      {!plan.components.length && <p className="mt-2 text-sm font-semibold text-ink-800">Inga separata tillbehör har identifierats i den här posten. Fortsätt med kravkontrollen nedan.</p>}
    </div>
    <ul className="divide-y divide-ink-200">
      {plan.components.map(component => <li key={component.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-950">{component.label} <span className="text-xs font-normal text-ink-600">· {component.optional ? "Valfritt" : component.conditional ? "Kontrollera montagevillkoret" : "Ingår i postens omfattning"}</span></p>
          <p className="mt-1 text-xs leading-5 text-ink-700">{component.requirement}</p>
          {accessories.filter(item => item.notes.startsWith(`Kravdel: ${component.label}. `)).map(item => <p key={item.productNumber} className="mt-2 text-xs font-bold text-flow-800">Vald för kontroll · NRF {item.productNumber}</p>)}
        </div>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onChoose(component)} className="shrink-0 text-xs">Visa produktförslag</Button>
      </li>)}
    </ul>
  </section>;
}
