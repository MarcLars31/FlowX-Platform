import { RefreshCw } from "lucide-react";
import { SprsokReconciliationPanel } from "@/components/SprsokReconciliationPanel";

export default function SprsokAdminPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Produktdata
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-ink-950">
            Sprsok-synkronisering
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-600">
            Jämför källan med produktdatabasen och sökindexet. En testkörning skriver
            inte produktdata. Reparation och full synk kräver separat bekräftelse.
          </p>
        </div>
      </header>
      <SprsokReconciliationPanel />
    </div>
  );
}
