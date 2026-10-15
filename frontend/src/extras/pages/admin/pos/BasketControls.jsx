import { Minus, Plus, X } from 'lucide-react';

const tile = { display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', padding: 0, fontFamily: 'inherit', touchAction: 'manipulation' };

/** [ - 2 + ] in one small pill. `onType` makes the number a box that can be typed in (the cashier's till). */
export function Stepper({ value, onMinus, onPlus, onType, label, size = 30 }) {
  return (
    <span role="group" aria-label={`Quantity of ${label}`} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--bg-tertiary, #f3f4f6)', border: '1px solid var(--line)', height: size, overflow: 'hidden' }}>
      <button type="button" aria-label={`Less ${label}`} onClick={onMinus} style={{ ...tile, width: size, height: size }}><Minus size={14} /></button>
      {onType
        ? <input value={value} inputMode="decimal" aria-label={`Quantity of ${label}`} onChange={(e) => onType(e.target.value)} style={{ width: 38, height: size - 4, textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none' }} />
        : <strong style={{ minWidth: 26, textAlign: 'center', fontSize: '0.9rem' }}>{value}</strong>}
      <button type="button" aria-label={`More ${label}`} onClick={onPlus} style={{ ...tile, width: size, height: size }}><Plus size={14} /></button>
    </span>
  );
}

/** A small round remove button: quiet until it is wanted, then red. */
export function RemoveButton({ onClick, label, size = 30 }) {
  return (
    <button type="button" aria-label={`Remove ${label}`} title="Remove" onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; }}
      style={{ ...tile, width: size, height: size, borderRadius: '50%', color: '#dc2626', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', transition: 'background 120ms' }}><X size={14} strokeWidth={2.5} /></button>
  );
}
