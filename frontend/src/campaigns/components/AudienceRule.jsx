import { useEffect, useState } from 'react';
import customerTiersAPI from '../../_shared/api/customerTiers';
import { colors } from '../../_shared/theme/tokens';

const chip = (on) => ({ padding: '4px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--line)',
  background: on ? 'var(--color-primary-500)' : 'var(--surface-card)', color: on ? '#fff' : colors.text });

/**
 * Who something is for: everyone, or only some people. `value` is a rule ({ signed_in, tiers, has_purchased }) or null for everyone;
 * `onChange` gets a rule or null. Staff always see everything, which the note says. Tiers are the shop's customer tiers.
 */
export default function AudienceRule({ value, onChange, disabled = false, noun = 'it' }) {
  const [tiers, setTiers] = useState([]);
  useEffect(() => { customerTiersAPI.getActiveTiers().then((r) => setTiers(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => setTiers([])); }, []);

  const rule = value ?? {};
  const some = Boolean(value);
  const chosen = rule.tiers ?? [];
  const emit = (next) => {
    const out = {};
    if (next.signed_in) out.signed_in = true;
    if (next.tiers?.length) out.tiers = next.tiers;
    if (next.has_purchased) out.has_purchased = true;
    onChange(Object.keys(out).length ? out : null);
  };
  const toggleTier = (slug) => emit({ ...rule, tiers: chosen.includes(slug) ? chosen.filter((t) => t !== slug) : [...chosen, slug] });
  const small = { fontSize: '0.74rem', color: colors.textFaint };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled} style={chip(!some)} onClick={() => onChange(null)}>Everyone</button>
        <button type="button" disabled={disabled} style={chip(some)} onClick={() => { if (!some) onChange({ signed_in: true }); }}>Only some people</button>
      </div>
      {some && (
        <div style={{ display: 'grid', gap: 8, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: colors.text }}>
            <input type="checkbox" disabled={disabled} checked={Boolean(rule.signed_in)} onChange={(e) => emit({ ...rule, signed_in: e.target.checked })} /> Signed-in customers
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: colors.text }}>
            <input type="checkbox" disabled={disabled} checked={Boolean(rule.has_purchased)} onChange={(e) => emit({ ...rule, has_purchased: e.target.checked })} /> Customers who have bought before
          </label>
          {tiers.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={small}>Only these customer tiers (none chosen = any tier)</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tiers.map((t) => <button key={t.slug} type="button" disabled={disabled} aria-pressed={chosen.includes(t.slug)} style={chip(chosen.includes(t.slug))} onClick={() => toggleTier(t.slug)}>{t.name}</button>)}
              </div>
            </div>
          )}
          <span style={small}>Everyone who ticks a box here must match all of them. Staff can always see {noun}, so you can check the page.</span>
        </div>
      )}
    </div>
  );
}
