import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { colors, input, focusRing, radius } from '../../../../_shared/theme/tokens';

/**
 * Checklist of tax districts, indented by hierarchy (country → county → city…).
 * Picking none means "applies everywhere".
 */
export default function DistrictPicker({ districts, value = [], onChange, disabled }) {
  const [query, setQuery] = useState('');
  const selected = new Set(value.map(Number));

  const byParent = useMemo(() => {
    const m = new Map();
    districts.forEach((d) => {
      const k = d.parent_id ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    });
    m.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return m;
  }, [districts]);

  const flat = useMemo(() => {
    const out = [];
    const seen = new Set();
    const walk = (parentId, depth) => {
      (byParent.get(parentId) ?? []).forEach((d) => {
        if (seen.has(d.id)) return; // guards against bad data with cycles
        seen.add(d.id);
        out.push({ ...d, depth });
        walk(d.id, depth + 1);
      });
    };
    walk(null, 0);
    // orphans whose parent isn't loaded
    districts.forEach((d) => { if (!seen.has(d.id)) out.push({ ...d, depth: 0 }); });
    return out;
  }, [byParent, districts]);

  const q = query.trim().toLowerCase();
  const visible = q ? flat.filter((d) => d.name.toLowerCase().includes(q) || (d.code ?? '').toLowerCase().includes(q)) : flat;

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  };

  return (
    <div style={{ border: `1.5px solid ${colors.tint(0.15)}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <div style={{ padding: 8, borderBottom: `1px solid ${colors.tint(0.08)}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search districts"
          aria-label="Search districts" disabled={disabled} style={{ ...input, padding: '5px 9px' }} {...focusRing}
        />
        {selected.size > 0 && !disabled && (
          <button type="button" onClick={() => onChange([])}
            style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', color: colors.primaryDeep, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear ({selected.size})
          </button>
        )}
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
        {visible.length === 0 ? (
          <p style={{ margin: 0, padding: 12, fontSize: '0.78rem', color: colors.textFaint }}>
            {districts.length ? 'No district matches that search.' : 'No districts set up yet — add them on the Districts tab.'}
          </p>
        ) : visible.map((d) => (
          <label key={d.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: radius.sm,
            paddingLeft: 8 + (q ? 0 : d.depth * 18), cursor: disabled ? 'default' : 'pointer',
            background: selected.has(d.id) ? colors.tint(0.06) : 'transparent', fontSize: '0.8rem', color: colors.textBody,
          }}>
            <input type="checkbox" checked={selected.has(d.id)} disabled={disabled} onChange={() => toggle(d.id)} style={{ accentColor: colors.primary }} />
            {!q && d.depth > 0 && <ChevronRight size={11} style={{ color: colors.textGhost, marginLeft: -4 }} />}
            <span style={{ flex: 1 }}>{d.name}</span>
            <span style={{ fontSize: '0.68rem', color: colors.textFaint }}>{d.level?.replace('_', ' ')}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
