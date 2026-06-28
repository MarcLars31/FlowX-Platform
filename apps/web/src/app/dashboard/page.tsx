import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ProjectCard } from "@/components/ProjectCard";
import { StatCard } from "@/components/StatCard";
import { recentProjects, stats } from "@/lib/mock-data";

function projectTone(status: string) {
  if (status === "Issue") return "rose";
  if (status === "Procurement") return "teal";
  if (status === "Validation") return "amber";
  return "blue";
}

export default function DashboardPage() {
  const highlightedProject = recentProjects[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
            Welcome back, Marcus
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            Project activity, engineering throughput and supplier-ready outputs
            for Demo VVS AS.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create New Project
          </Button>
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
            <h2 className="text-base font-semibold text-ink-950">
              Recent projects
            </h2>
            <Link
              href="/projects/demo"
              className="inline-flex items-center gap-1 text-sm font-semibold text-flow-700"
            >
              Open workspace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200">
              <thead className="bg-ink-50">
                <tr>
                  {["Project", "Customer", "Standard", "Status", "Updated"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {recentProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-ink-50/70">
                    <td className="whitespace-nowrap px-5 py-4">
                      <Link
                        href="/projects/demo"
                        className="text-sm font-semibold text-ink-950 hover:text-flow-700"
                      >
                        {project.name}
                      </Link>
                      <p className="mt-1 text-xs text-ink-500">
                        {project.systemType}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-600">
                      {project.customer}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-600">
                      {project.standard}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <Badge tone={projectTone(project.status)}>
                        {project.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-500">
                      {project.updatedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ProjectCard project={highlightedProject} />
      </section>
    </div>
  );
}
