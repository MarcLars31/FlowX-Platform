import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileCheck2,
  FileText,
  ShieldCheck,
  Truck,
  UploadCloud
} from "lucide-react";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import { demoProjectProfile } from "@/lib/mock-data";

export default function UploadTechnicalSpecificationPage() {
  const projectDetails = [
    {
      label: "Project",
      value: demoProjectProfile.project,
      icon: Building2
    },
    {
      label: "Customer",
      value: demoProjectProfile.customer,
      icon: FileCheck2
    },
    {
      label: "Standard",
      value: demoProjectProfile.standard,
      icon: ShieldCheck
    },
    {
      label: "Preferred supplier",
      value: demoProjectProfile.preferredSupplier,
      icon: Truck
    }
  ];

  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge />
              <span className="rounded-full bg-flow-50 px-2.5 py-1 text-xs font-semibold text-flow-800 ring-1 ring-flow-200">
                Technical specification intake
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              Upload Technical Specification
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
              FlowX turns the project specification into reviewed requirements,
              compatible product options and a supplier-ready material list.
            </p>
          </div>
          <Link href="/projects/demo/analysis">
            <Button className="w-full justify-center sm:w-auto">
              Analyze Technical Specification
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {projectDetails.map((detail) => {
            const Icon = detail.icon;

            return (
              <div
                key={detail.label}
                className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm text-ink-500">{detail.label}</p>
                    <p className="mt-1 text-sm font-semibold text-ink-950">
                      {detail.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-dashed border-flow-300 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg bg-flow-50/60 px-6 py-10 text-center ring-1 ring-inset ring-flow-100">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white text-flow-700 shadow-sm ring-1 ring-flow-100">
              <UploadCloud className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-normal text-ink-950">
              Drop technical specification PDF here
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-ink-600">
              This prototype uses demo data and a mocked uploaded file.
            </p>

            <div className="mt-8 flex w-full max-w-xl items-center gap-3 rounded-lg border border-ink-200 bg-white p-4 text-left shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-950">
                  {demoProjectProfile.fileName}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  Uploaded for customer demo
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Ready
              </span>
            </div>

            <Link href="/projects/demo/analysis" className="mt-8">
              <Button className="justify-center">
                Analyze Technical Specification
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
