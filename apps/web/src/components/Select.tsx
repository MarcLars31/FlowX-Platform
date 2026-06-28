import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: string[];
};

export function Select({ className, id, label, options, ...props }: SelectProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-sm font-medium text-ink-700">{label}</span>
      <select
        id={id}
        className={cn(
          "block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm transition focus:border-flow-500 focus:ring-flow-500",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
