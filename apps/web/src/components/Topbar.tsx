import { Badge } from "@/components/Badge";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-ink-200 bg-white/92 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold text-ink-900">Demo VVS AS</p>
        <p className="text-xs text-ink-500">Mechanical contractor workspace</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone="teal">Prototype</Badge>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink-900">Marcus Larsson</p>
          <p className="text-xs text-ink-500">Founder demo</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-sm font-semibold text-white">
          ML
        </div>
      </div>
    </header>
  );
}
