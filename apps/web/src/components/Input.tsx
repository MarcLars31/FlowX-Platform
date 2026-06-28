import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ className, id, label, ...props }: InputProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-medium text-ink-700">{label}</span>
      <input
        id={id}
        className={cn(
          "block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm transition placeholder:text-ink-400 focus:border-flow-500 focus:ring-flow-500",
          className
        )}
        {...props}
      />
    </label>
  );
}
