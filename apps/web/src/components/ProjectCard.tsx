import Link from "next/link";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { Badge } from "@/components/Badge";
import type { Project } from "@/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone="teal">{project.status}</Badge>
          <h3 className="mt-3 text-lg font-semibold tracking-normal text-ink-950">
            {project.name}
          </h3>
        </div>
        <Link
          href="/projects/demo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          aria-label={`Open ${project.name}`}
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4 space-y-2 text-sm text-ink-600">
        <p className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-ink-400" aria-hidden="true" />
          {project.customer}
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-ink-400" aria-hidden="true" />
          {project.address}
        </p>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-medium text-ink-500">
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-ink-100">
          <div
            className="h-2 rounded-full bg-flow-500"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>
    </article>
  );
}
