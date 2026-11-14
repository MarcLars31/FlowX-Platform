"use client";

export function ProductSelectionCheckbox({ checked, approved = false, disabled, name, label, onChange }: {
  checked: boolean;
  approved?: boolean;
  disabled?: boolean;
  name?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold ${checked && approved ? "border-neutral-600 bg-neutral-100 text-neutral-900" : checked ? "border-neutral-600 bg-neutral-800 text-white" : "border-neutral-300 bg-white text-neutral-800"} has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50`}>
    <input type="checkbox" name={name} checked={checked} disabled={disabled}
      aria-label={`${checked ? "Fjern valget av" : "Velg"} ${label}`}
      onChange={event => onChange(event.target.checked)}
      className={`h-5 w-5 shrink-0 cursor-pointer rounded border-neutral-300 focus:ring-neutral-600 disabled:cursor-not-allowed ${approved ? "text-neutral-700" : "text-neutral-700"}`} />
    <span aria-hidden="true">{checked && approved ? "Godkjent" : checked ? "Valgt" : "Velg"}</span>
  </label>;
}
