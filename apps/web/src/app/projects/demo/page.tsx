"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  Factory,
  FileCheck2,
  Gauge,
  RotateCw,
  UploadCloud
} from "lucide-react";
import { AiAssistantPanel } from "@/components/AiAssistantPanel";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import { PipelineStep } from "@/components/PipelineStep";
import {
  demoFlowPages,
  demoMaterialLines,
  demoProjectProfile,
  pipelineSteps,
  recentProjects
} from "@/lib/mock-data";

const demoProject = recentProjects[0];

export default function EngineeringWorkspacePage() {
  const [generated, setGenerated] = useState(false);

  const steps = generated
    ? pipelineSteps.map((step) => ({ ...step, status: "completed" as const }))
    : pipelineSteps;

  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="teal">Project</Badge>
              <DemoBadge />
              <Badge tone={generated ? "green" : "amber"}>
                {generated ? "Material list generated" : "Pipeline ready"}
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              {demoProject.name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {demoProject.customer} - {demoProject.address}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects/demo/upload">
              <Button className="w-full justify-center sm:w-auto">
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                Upload Technical Specification
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setGenerated(true)}>
              {generated ? (
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <RotateCw className="h-4 w-4" aria-hidden="true" />
              )}
              Generate Material List
            </Button>
            <Link href="/projects/demo/material-list">
              <Button variant="secondary">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                View Material List
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[300px_1fr_360px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-950">
              Project input
            </h2>
            <dl className="mt-4 space-y-4 text-sm">
              {[
                ["Country", demoProject.country],
                ["Standard", demoProject.standard],
                ["System type", demoProject.systemType],
                ["Preferred supplier", demoProject.supplier]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="text-right font-medium text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-950">
              Workspace navigation
            </h2>
            <div className="mt-4 space-y-2">
              {demoFlowPages.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium text-ink-700 transition hover:bg-ink-100"
                >
                  {item.label}
                  <ArrowRight className="h-4 w-4 text-ink-400" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink-950">
                FlowX Engineering Pipeline
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Controlled sequence for engineering output.
              </p>
            </div>
            <Gauge className="h-5 w-5 text-flow-700" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            {steps.map((step) => (
              <PipelineStep key={step.name} step={step} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
                <Factory className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink-950">
                  Result summary
                </h2>
                <p className="text-sm text-ink-500">Current project state</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {[
                ["Lines", generated ? `${demoMaterialLines.length}` : "Pending"],
                ["Supplier", demoProjectProfile.preferredSupplier],
                ["Rule status", generated ? "Verified" : "Ready"],
                ["Export status", generated ? "Available" : "Pending"]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-3 text-sm"
                >
                  <span className="text-ink-500">{label}</span>
                  <span className="font-semibold text-ink-950">{value}</span>
                </div>
              ))}
            </div>
            {generated && (
              <Link href="/projects/demo/material-list" className="mt-5 block">
                <Button className="w-full justify-center" variant="secondary">
                  Open generated list
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
            )}
          </div>

          <AiAssistantPanel />
        </div>
      </section>
    </div>
  );
}
