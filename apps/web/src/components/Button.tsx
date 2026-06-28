import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-flow-600 text-white shadow-sm hover:bg-flow-700 focus-visible:outline-flow-600",
  secondary:
    "border border-ink-200 bg-white text-ink-800 hover:border-flow-300 hover:bg-flow-50 focus-visible:outline-flow-600",
  ghost:
    "text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-flow-600",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:outline-rose-600"
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
