import { useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const defaults = (d) => Object.fromEntries(d.options.map((g) => [g.id, g.options.filter((o) => o.is_default).map((o) => o.id).slice(0, g.kind === 'single' ? 1 : undefined)]));

const EXTRAS = ['free_extra', 'paid_extra'];
/** The sides a slot starts with: the one chosen to begin with, or those chosen to begin with. A slot of extras starts with none. */
const startPicks = (m) => Object.fromEntries(m.slots.filter((s) => s.kind !== 'fixed').map((s) => [s.id, EXTRAS.includes(s.kind) ? [] : s.choices.filter((c) => c.is_default && c.available).map((c) => ({ side_id: c.side_id, qty: 1 }))]));
const total = (list) => list.reduce((n, p) => n + p.qty, 0);

/** The choices on a dish (size, sides, things to leave out) before it goes in the basket. A required group must be answered; a pick-one group takes one; "up to n" stops at n. A dish put together from sides asks its size first, then what goes with it. */
export default function DishPicker({ dish, onAdd, onClose }) {
  const makeup = dish.makeup ?? null;
  const [picked, setPicked] = useState(() => defaults(dish));
  const [serving, setServing] = useState(() => makeup?.servings?.[0]?.id ?? null);
  const [sides, setSides] = useState(() => (makeup ? startPicks(makeup) : {}));
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [mods, setMods] = useState([]);   // what the guest leaves out or asks extra of: [{ ingredient_id, kind }]

  const size = makeup?.servings?.find((s) => s.id === serving) ?? null;
  const base = size ? Number(size.price) : (dish.price ?? 0);
  const sideProblems = useMemo(() => (makeup ? makeup.slots.flatMap((s) => {
    if (s.kind === 'fixed') return [];
    const list = sides[s.id] ?? [];
    const n = total(list);
    if (s.kind === 'choose_one' && n !== 1) return [`${s.name}: please choose one.`];
    if (s.kind === 'choose_any' && n < s.min) return [s.min > 1 ? `${s.name}: choose at least ${s.min}.` : `${s.name}: please choose one.`];
    if (s.max && n > s.max) return [`${s.name}: no more than ${s.max}.`];
    return [];
  }) : []), [makeup, sides]);
  const sideDelta = makeup ? makeup.slots.reduce((n, s) => n + (sides[s.id] ?? []).reduce((m, p) => m + Number(s.choices.find((c) => c.side_id === p.side_id)?.upcharge ?? 0) * p.qty, 0), 0) : 0;
  const sideNames = makeup ? makeup.slots.flatMap((s) => (s.kind === 'fixed' ? s.choices : (sides[s.id] ?? []).map((p) => ({ ...s.choices.find((c) => c.side_id === p.side_id), qty: p.qty }))).map((c) => `${c.name}${c.qty > 1 ? ` x${c.qty}` : ''}`)) : [];

  const pickOne = (s, c) => setSides((p) => ({ ...p, [s.id]: [{ side_id: c.side_id, qty: 1 }] }));
  const pickAny = (s, c) => setSides((p) => {
    const now = p[s.id] ?? [];
    if (now.some((x) => x.side_id === c.side_id)) return { ...p, [s.id]: now.filter((x) => x.side_id !== c.side_id) };
    if (s.max && total(now) >= s.max) return p;
    return { ...p, [s.id]: [...now, { side_id: c.side_id, qty: 1 }] };
  });
  const setExtra = (s, c, qty) => setSides((p) => {
    const rest = (p[s.id] ?? []).filter((x) => x.side_id !== c.side_id);
    if (qty <= 0) return { ...p, [s.id]: rest };
    if (s.max && total(rest) + qty > s.max) return p;
    return { ...p, [s.id]: [...rest, { side_id: c.side_id, qty }] };
  });

  const problems = useMemo(() => [...dish.options.flatMap((g) => {
    const n = (picked[g.id] ?? []).length;
    if (n < g.min_choices) return [g.min_choices > 1 ? `${g.name}: choose at least ${g.min_choices}.` : `${g.name}: please choose one.`];
    return [];
  }), ...sideProblems, ...(makeup?.servings?.length && !serving ? ['Please choose a size.'] : [])], [dish, picked, sideProblems, makeup, serving]);
  const offered = dish.modifiers ?? [];
  const feeOf = (m) => (m.fee.kind === 'fixed' ? Number(m.fee.amount) : m.fee.kind === 'percent' ? (base * Number(m.fee.amount)) / 100 : 0);
  const modOn = (m) => mods.some((x) => x.ingredient_id === m.ingredient_id && x.kind === m.kind);
  const toggleMod = (m) => setMods((xs) => (modOn(m) ? xs.filter((x) => !(x.ingredient_id === m.ingredient_id && x.kind === m.kind)) : [...xs.filter((x) => x.ingredient_id !== m.ingredient_id), { ingredient_id: m.ingredient_id, kind: m.kind }]));
  const modNames = offered.filter(modOn).map((m) => `${m.kind === 'remove' ? 'No' : 'Extra'} ${m.name.toLowerCase()}`);
  const modFees = offered.filter(modOn).reduce((n, m) => n + feeOf(m), 0);
  const chosen = dish.options.flatMap((g) => g.options.filter((o) => (picked[g.id] ?? []).includes(o.id)));
  const delta = chosen.reduce((n, o) => n + Number(o.price_delta), 0) + sideDelta + modFees;

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
        {makeup?.servings?.length > 0 && (
          <fieldset style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: '8px 12px 10px', margin: 0 }}>
            <legend style={{ fontWeight: 800, fontSize: '0.88rem', padding: '0 6px' }}>Size <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>required</span></legend>
            {makeup.servings.map((sv) => (
              <label key={sv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: '0.88rem' }}>
                <input type="radio" name="size" checked={serving === sv.id} onChange={() => setServing(sv.id)} />
                <span style={{ flex: 1 }}>{sv.name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{money(sv.price)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {makeup?.slots.map((s) => (
          <fieldset key={s.id} data-slot={s.name} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: '8px 12px 10px', margin: 0 }}>
            <legend style={{ fontWeight: 800, fontSize: '0.88rem', padding: '0 6px' }}>{s.name} <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>{s.kind === 'fixed' ? 'comes with it' : s.kind === 'choose_one' ? 'choose one' : s.kind === 'choose_any' ? `${s.min > 0 ? `at least ${s.min}` : 'optional'}${s.max ? `, up to ${s.max}` : ''}` : `optional${s.max ? `, up to ${s.max}` : ''}`}</span></legend>
            {s.choices.map((c) => {
              const mine = (sides[s.id] ?? []).find((x) => x.side_id === c.side_id);
              const price = Number(c.upcharge) !== 0 ? <span style={{ color: 'var(--text-secondary)' }}>{c.upcharge > 0 ? '+' : ''}{money(c.upcharge)}</span> : null;
              const out = !c.available && <small style={{ color: '#b91c1c' }}> sold out</small>;
              if (s.kind === 'fixed') return <div key={c.side_id} style={{ padding: '4px 0', fontSize: '0.88rem' }}>{c.name}{out}</div>;
              if (EXTRAS.includes(s.kind)) {
                return (
                  <div key={c.side_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.88rem' }}>
                    <span style={{ flex: 1 }}>{c.name}{out}</span>{price}
                    <button type="button" aria-label={`Fewer ${c.name}`} onClick={() => setExtra(s, c, (mine?.qty ?? 0) - 1)} disabled={!mine} style={{ width: 28, height: 28, borderRadius: 999, border: '1.5px solid var(--line, #e5e7eb)', background: 'none', cursor: 'pointer' }}><Minus size={12} /></button>
                    <strong aria-label={`${c.name} count`} style={{ minWidth: 16, textAlign: 'center' }}>{mine?.qty ?? 0}</strong>
                    <button type="button" aria-label={`More ${c.name}`} onClick={() => setExtra(s, c, (mine?.qty ?? 0) + 1)} disabled={!c.available} style={{ width: 28, height: 28, borderRadius: 999, border: '1.5px solid var(--line, #e5e7eb)', background: 'none', cursor: 'pointer' }}><Plus size={12} /></button>
                  </div>
                );
              }
              return (
                <label key={c.side_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: c.available ? 'pointer' : 'not-allowed', fontSize: '0.88rem', opacity: c.available ? 1 : 0.55 }}>
                  <input type={s.kind === 'choose_one' ? 'radio' : 'checkbox'} name={`slot${s.id}`} disabled={!c.available} checked={!!mine} onChange={() => (s.kind === 'choose_one' ? pickOne(s, c) : pickAny(s, c))} />
                  <span style={{ flex: 1 }}>{c.name}{out}</span>{price}
                </label>
              );
            })}
          </fieldset>
        ))}
        {offered.length > 0 && (
          <fieldset data-testid="picker-mods" style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 12, padding: '8px 12px 10px', margin: 0 }}>
            <legend style={{ fontWeight: 800, fontSize: '0.88rem', padding: '0 6px' }}>Leave out or add <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>optional</span></legend>
            {offered.map((m) => (
              <label key={`${m.ingredient_id}:${m.kind}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: '0.88rem' }}>
                <input type="checkbox" checked={modOn(m)} onChange={() => toggleMod(m)} />
                <span style={{ flex: 1 }}>{m.kind === 'remove' ? `No ${m.name.toLowerCase()}` : `Extra ${m.name.toLowerCase()}`}</span>
                {feeOf(m) > 0 && <span style={{ color: 'var(--text-secondary)' }}>+{money(feeOf(m))}</span>}
              </label>
            ))}
          </fieldset>
        )}
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
          <button type="button" disabled={problems.length > 0} onClick={() => onAdd(dish, {
              option_ids: chosen.map((o) => o.id),
              option_names: [...(size ? [size.name] : []), ...sideNames, ...modNames, ...chosen.map((o) => o.name)],
              ...(mods.length ? { mods } : {}),
              option_delta: delta, note, quantity,
              ...(makeup ? { serving_id: serving, price: base, picks: Object.fromEntries(Object.entries(sides).map(([id, list]) => [id, list.map((p) => ({ side_id: p.side_id, qty: p.qty }))])) } : {}),
            })}
            style={{ padding: '11px 20px', borderRadius: 10, border: 'none', cursor: problems.length ? 'not-allowed' : 'pointer', opacity: problems.length ? 0.5 : 1, fontWeight: 800, fontFamily: 'inherit', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            Add · {money((base + delta) * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
