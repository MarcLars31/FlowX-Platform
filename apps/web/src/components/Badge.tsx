import { cn } from "@/lib/utils";

type BadgeTone = "blue" | "teal" | "amber" | "rose" | "slate" | "green";

type BadgeProps = {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
};

const toneClasses: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  teal: "bg-flow-50 text-flow-800 ring-flow-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-ink-100 text-ink-700 ring-ink-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200"
};

export function Badge({ children, className, tone = "slate" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
