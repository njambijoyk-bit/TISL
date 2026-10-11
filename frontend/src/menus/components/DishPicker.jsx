import { useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const defaults = (d) => Object.fromEntries(d.options.map((g) => [g.id, g.options.filter((o) => o.is_default).map((o) => o.id).slice(0, g.kind === 'single' ? 1 : undefined)]));

/** The choices on a dish (size, sides, things to leave out) before it goes in the basket. A required group must be answered; a pick-one group takes one; "up to n" stops at n. */
export default function DishPicker({ dish, onAdd, onClose }) {
  const [picked, setPicked] = useState(() => defaults(dish));
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  const problems = useMemo(() => dish.options.flatMap((g) => {
    const n = (picked[g.id] ?? []).length;
    if (n < g.min_choices) return [g.min_choices > 1 ? `${g.name}: choose at least ${g.min_choices}.` : `${g.name}: please choose one.`];
    return [];
  }), [dish, picked]);
  const chosen = dish.options.flatMap((g) => g.options.filter((o) => (picked[g.id] ?? []).includes(o.id)));
  const delta = chosen.reduce((n, o) => n + Number(o.price_delta), 0);

  const toggle = (g, o) => setPicked((p) => {
    const now = p[g.id] ?? [];
    if (g.kind === 'single') return { ...p, [g.id]: now.includes(o.id) && g.min_choices === 0 ? [] : [o.id] };
    if (now.includes(o.id)) return { ...p, [g.id]: now.filter((x) => x !== o.id) };
    if (g.max_choices && now.length >= g.max_choices) return p;
    return { ...p, [g.id]: [...now, o.id] };
  });

  return (
    <div role="dialog" aria-modal="true" aria-label={`Choose for ${dish.name}`} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--surface-card, #fff)', borderRadius: 16, padding: 20, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{dish.name}</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={18} /></button>
        </div>
        {dish.options.map((g) => (
          <fieldset key={g.id} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: '8px 12px 10px', margin: 0 }}>
            <legend style={{ fontWeight: 800, fontSize: '0.88rem', padding: '0 6px' }}>{g.name} <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>{g.min_choices > 0 ? 'required' : 'optional'}{g.kind === 'multiple' && g.max_choices ? `, up to ${g.max_choices}` : ''}</span></legend>
            {g.options.map((o) => {
              const on = (picked[g.id] ?? []).includes(o.id);

              return (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input type={g.kind === 'single' ? 'radio' : 'checkbox'} name={`g${g.id}`} checked={on} onChange={() => toggle(g, o)} />
                  <span style={{ flex: 1 }}>{o.name}{o.dish ? <small style={{ color: 'var(--text-tertiary)' }}> ({o.dish})</small> : null}</span>
                  {Number(o.price_delta) !== 0 && <span style={{ color: 'var(--text-secondary)' }}>{o.price_delta > 0 ? '+' : ''}{money(o.price_delta)}</span>}
                </label>
              );
            })}
          </fieldset>
        ))}
        <label style={{ display: 'grid', gap: 4, fontSize: '0.8rem', fontWeight: 700 }}>A note for the kitchen
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="For example: not too spicy" style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--line, #e5e7eb)', fontFamily: 'inherit' }} />
        </label>
        {problems.length > 0 && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '0.82rem' }}>{problems[0]}</p>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <button type="button" aria-label="Fewer" onClick={() => setQuantity((q) => Math.max(1, q - 1))} style={{ width: 32, height: 32, borderRadius: 999, border: '1.5px solid var(--line, #e5e7eb)', background: 'none', cursor: 'pointer' }}><Minus size={14} /></button>
            <strong aria-label="Quantity" style={{ minWidth: 20, textAlign: 'center' }}>{quantity}</strong>
            <button type="button" aria-label="More" onClick={() => setQuantity((q) => Math.min(50, q + 1))} style={{ width: 32, height: 32, borderRadius: 999, border: '1.5px solid var(--line, #e5e7eb)', background: 'none', cursor: 'pointer' }}><Plus size={14} /></button>
          </div>
          <button type="button" disabled={problems.length > 0} onClick={() => onAdd(dish, { option_ids: chosen.map((o) => o.id), option_names: chosen.map((o) => o.name), option_delta: delta, note, quantity })}
            style={{ padding: '11px 20px', borderRadius: 10, border: 'none', cursor: problems.length ? 'not-allowed' : 'pointer', opacity: problems.length ? 0.5 : 1, fontWeight: 800, fontFamily: 'inherit', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            Add · {money(((dish.price ?? 0) + delta) * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
