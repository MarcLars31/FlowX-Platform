import { Badge } from "@/components/Badge";

export function Topbar({
  organizationName = "FlowX",
  userName = "Plattformsadministratör",
  roleLabel = "Intern administration"
}: {
  organizationName?: string;
  userName?: string;
  roleLabel?: string;
}) {
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "FX";

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-ink-200 bg-white/92 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold text-ink-900">{organizationName}</p>
        <p className="text-xs text-ink-500">FlowX workspace</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone="teal">Säker anslutning</Badge>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink-900">{userName}</p>
          <p className="text-xs text-ink-500">{roleLabel}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-sm font-semibold text-white">
          {initials}
        </div>
      </div>
    </header>
  );
}
