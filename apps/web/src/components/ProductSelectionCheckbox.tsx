"use client";

export function ProductSelectionCheckbox({ checked, approved = false, disabled, name, label, onChange }: {
  checked: boolean;
  approved?: boolean;
  disabled?: boolean;
  name?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold ${checked && approved ? "border-emerald-600 bg-emerald-100 text-emerald-900" : checked ? "border-flow-600 bg-flow-800 text-white" : "border-ink-300 bg-white text-flow-800"} has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}>
    <input type="checkbox" name={name} checked={checked} disabled={disabled}
      aria-label={`${checked ? "Fjern valget av" : "Velg"} ${label}`}
      onChange={event => onChange(event.target.checked)}
      className={`h-5 w-5 shrink-0 cursor-pointer rounded border-ink-300 focus:ring-flow-600 disabled:cursor-not-allowed ${approved ? "text-emerald-700" : "text-flow-700"}`} />
    <span aria-hidden="true">{checked && approved ? "Godkjent" : checked ? "Valgt" : "Velg"}</span>
  </label>;
}
