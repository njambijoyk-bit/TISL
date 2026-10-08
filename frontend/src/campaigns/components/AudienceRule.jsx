import { useEffect, useState } from 'react';
import customerTiersAPI from '../../_shared/api/customerTiers';
import { colors } from '../../_shared/theme/tokens';

const chip = (on) => ({ padding: '4px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--line)',
  background: on ? 'var(--color-primary-500)' : 'var(--surface-card)', color: on ? '#fff' : colors.text });

/**
 * Who something is for: everyone, or only some people. `value` is a rule ({ signed_in, tiers, has_purchased }) or null for everyone;
 * `onChange` gets a rule or null. Staff always see everything, which the note says. Tiers are the shop's customer tiers.
 * `parent` is the rule of whatever this sits inside (a section inside a campaign): it can only narrow that, so "everyone" becomes "same as the campaign",
 * the tiers offered are the parent's, and what the parent already asks for is shown ticked and locked.
 */
export default function AudienceRule({ value, onChange, disabled = false, noun = 'it', parent = null }) {
  const [tiers, setTiers] = useState([]);
  useEffect(() => { customerTiersAPI.getActiveTiers().then((r) => setTiers(Array.isArray(r) ? r : (r?.data ?? []))).catch(() => setTiers([])); }, []);

  const rule = value ?? {};
  const some = Boolean(value);
  const parentTiers = parent?.tiers ?? [];
  const offered = parentTiers.length ? tiers.filter((t) => parentTiers.includes(t.slug)) : tiers;
  const chosen = (rule.tiers ?? []).filter((t) => !parentTiers.length || parentTiers.includes(t));
  const emit = (next) => {
    const out = {};
    if (next.signed_in) out.signed_in = true;
    const keep = (next.tiers ?? []).filter((t) => !parentTiers.length || parentTiers.includes(t));
    if (keep.length) out.tiers = keep;
    if (next.has_purchased) out.has_purchased = true;
    onChange(Object.keys(out).length ? out : null);
  };
  const toggleTier = (slug) => emit({ ...rule, tiers: chosen.includes(slug) ? chosen.filter((t) => t !== slug) : [...chosen, slug] });
  const small = { fontSize: '0.74rem', color: colors.textFaint };

  const names = (slugs) => slugs.map((sl) => tiers.find((t) => t.slug === sl)?.name ?? sl).join(', ');
  const parentLine = parent ? [parent.signed_in && 'signed-in customers', parentTiers.length > 0 && `tiers: ${names(parentTiers)}`, parent.has_purchased && 'customers who have bought before'].filter(Boolean).join(' · ') : '';

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {parent && <span style={small}>The campaign is for: {parentLine}. This can only narrow that.</span>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled} style={chip(!some)} onClick={() => onChange(null)}>{parent ? 'Same as the campaign' : 'Everyone'}</button>
        <button type="button" disabled={disabled} style={chip(some)} onClick={() => { if (!some) onChange(parent?.signed_in && parentTiers.length ? { tiers: [parentTiers[0]] } : { signed_in: true }); }}>{parent ? 'Narrow it further' : 'Only some people'}</button>
      </div>
      {some && (
        <div style={{ display: 'grid', gap: 8, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: colors.text }}>
            <input type="checkbox" disabled={disabled || Boolean(parent?.signed_in)} checked={Boolean(rule.signed_in || parent?.signed_in)} onChange={(e) => emit({ ...rule, signed_in: e.target.checked })} /> Signed-in customers{parent?.signed_in ? ' (the campaign needs this)' : ''}
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: colors.text }}>
            <input type="checkbox" disabled={disabled || Boolean(parent?.has_purchased)} checked={Boolean(rule.has_purchased || parent?.has_purchased)} onChange={(e) => emit({ ...rule, has_purchased: e.target.checked })} /> Customers who have bought before{parent?.has_purchased ? ' (the campaign needs this)' : ''}
          </label>
          {offered.length > 1 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={small}>Only these customer tiers (none chosen = any tier shown)</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {offered.map((t) => <button key={t.slug} type="button" disabled={disabled} aria-pressed={chosen.includes(t.slug)} style={chip(chosen.includes(t.slug))} onClick={() => toggleTier(t.slug)}>{t.name}</button>)}
              </div>
            </div>
          )}
          <span style={small}>Everyone who ticks a box here must match all of them. Staff can always see {noun}, so you can check the page.</span>
        </div>
      )}
    </div>
  );
}
