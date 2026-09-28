import { Check } from 'lucide-react';
import { formatMoney } from '../../../../_shared/lib/money';

const pill = (on, disabled) => ({
  padding: '7px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: 5,
  border: on ? '2px solid var(--color-primary-500)' : '1.5px solid #e5e7eb',
  background: on ? 'color-mix(in srgb, var(--color-primary-500) 8%, white)' : 'white',
  color: on ? 'var(--color-primary-600)' : '#374151',
});

/** Option pills, plus cards for hand-made packages that aren't built from options. */
export default function ServicePackagePicker({ picker }) {
  const { data, options, variants, selection, variant, pick, setVariantId, setSelection } = picker;
  if (!data || variants.length === 0) return null;

  const isAvailable = (optionId, valueId) => variants.some((v) =>
    String(v.selection?.[optionId]) === String(valueId)
    && options.every((o) => o.id === optionId || !selection[o.id] || String(v.selection?.[o.id]) === String(selection[o.id])));

  const customs = variants.filter((v) => Object.keys(v.selection ?? {}).length === 0);
  const showCustoms = customs.length > 1 || (customs.length === 1 && options.length > 0);
  const fmt = (n) => formatMoney(n ?? 0, data.display_currency, { decimals: 'auto' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {options.map((o) => (
        <fieldset key={o.id} style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 8 }}>
            {o.name}
          </legend>
          <div role="radiogroup" aria-label={o.name} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {o.values.map((val) => {
              const on = String(selection[o.id]) === String(val.id);
              const ok = isAvailable(o.id, val.id);
              return (
                <button key={val.id} type="button" role="radio" aria-checked={on} disabled={!ok} onClick={() => pick(o.id, val.id)} style={pill(on, !ok)}>
                  {on && <Check size={13} />} {val.value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {showCustoms && (
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 8 }}>Package</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {customs.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={variant?.id === c.id}
                onClick={() => { setVariantId(c.id); setSelection({}); }} style={pill(variant?.id === c.id, false)}>
                {variant?.id === c.id && <Check size={13} />} {c.name}{c.display_price != null ? ` · ${fmt(c.display_price)}` : ''}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
