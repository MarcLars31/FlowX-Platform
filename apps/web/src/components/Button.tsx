import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  neutral?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-cyan-400 text-[#03162d] shadow-sm hover:bg-cyan-300 focus-visible:outline-cyan-500",
  secondary:
    "border border-ink-200 bg-white text-ink-800 hover:border-flow-300 hover:bg-flow-50 focus-visible:outline-flow-600",
  ghost:
    "text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-flow-600",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:outline-rose-600"
};

const neutralVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-neutral-900 text-white shadow-sm hover:bg-neutral-700 focus-visible:outline-neutral-700",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500 hover:bg-neutral-100 focus-visible:outline-neutral-700",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-neutral-700",
  danger: "bg-neutral-900 text-white shadow-sm hover:bg-neutral-700 focus-visible:outline-neutral-700"
};

export function Button({
  className,
  variant = "primary",
  neutral = false,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        (neutral ? neutralVariantClasses : variantClasses)[variant],
        className
      )}
      {...props}
    />
  );
}
