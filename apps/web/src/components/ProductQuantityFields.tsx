"use client";

export function ProductQuantityFields({ id, quantity, unit, disabled, onQuantityChange, onUnitChange }: {
  id: string;
  quantity: string;
  unit: string;
  disabled?: boolean;
  onQuantityChange: (value: string) => void;
  onUnitChange: (value: string) => void;
}) {
  const style = "mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm focus:border-flow-500 focus:ring-flow-500 disabled:opacity-50";
  return <div className="grid grid-cols-[minmax(120px,1fr)_minmax(80px,0.6fr)] gap-3">
    <label htmlFor={`${id}-quantity`} className="text-xs font-bold text-ink-800">Total mengde for posten
      <input id={`${id}-quantity`} inputMode="decimal" value={quantity} maxLength={15} placeholder="Angi mengde" disabled={disabled}
        className={style} onChange={event => onQuantityChange(event.target.value)} />
    </label>
    <label htmlFor={`${id}-unit`} className="text-xs font-bold text-ink-800">Enhet
      <input id={`${id}-unit`} value={unit} maxLength={30} placeholder="st / m" disabled={disabled}
        className={style} onChange={event => onUnitChange(event.target.value)} />
    </label>
  </div>;
}
