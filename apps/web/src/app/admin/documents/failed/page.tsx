import { FileWarning } from "lucide-react";
import { FailedProductDocumentsTable } from "@/components/FailedProductDocumentsTable";

export default function FailedProductDocumentsPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
          <FileWarning className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Dokumentbearbetning
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-ink-950">
            Datablad som inte kunde läsas
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-600">
            Granska olästa och delvis behandlade produktdatablad, öppna originalfilen
            och starta ett nytt läsförsök när underlaget har kontrollerats.
          </p>
        </div>
      </header>

      <FailedProductDocumentsTable />
    </div>
  );
}
