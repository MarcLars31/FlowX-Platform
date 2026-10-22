import { cn } from "@/lib/utils";

type BadgeTone = "blue" | "teal" | "amber" | "rose" | "slate" | "green";

type BadgeProps = {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
};

export function Badge({ children, className, tone = "slate" }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "portal-badge",
        className
      )}
    >
      {children}
    </span>
  );
}
