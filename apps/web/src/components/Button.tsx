import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  neutral?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "portal-button font-bold",
  secondary: "portal-button",
  ghost: "portal-button",
  danger: "portal-button font-bold"
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
      data-variant={variant}
      data-neutral={neutral || undefined}
      className={cn(
        "inline-flex min-h-7 items-center justify-center gap-2 px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
