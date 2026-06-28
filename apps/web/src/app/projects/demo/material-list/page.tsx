import { FileSpreadsheet, FileText, Send } from "lucide-react";
import { AiAssistantPanel } from "@/components/AiAssistantPanel";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { MaterialListTable } from "@/components/MaterialListTable";
import { materialLines, recentProjects } from "@/lib/mock-data";

const demoProject = recentProjects[0];

export default function MaterialListPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">Verified</Badge>
            <Badge tone="teal">{demoProject.supplier}</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
            Material List
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {demoProject.name} - {demoProject.standard}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </Button>
          <Button variant="secondary">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Export Excel
          </Button>
          <Button>
            <Send className="h-4 w-4" aria-hidden="true" />
            Send to Supplier
          </Button>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <MaterialListTable lines={materialLines} />
        <AiAssistantPanel />
      </section>
    </div>
  );
}
