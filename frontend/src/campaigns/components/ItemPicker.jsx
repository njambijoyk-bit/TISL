import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import campaignsAPI from '../../_shared/api/campaigns';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { colors } from '../../_shared/theme/tokens';
import { TextInput, SelectInput } from '../../core/components/admin/ui/Form';

/** Search products, services, hampers or auctions by name or SKU and pick one (needs E-commerce). `taken` is a Set of "type:id" already chosen. */
export default function ItemPicker({ allowed, onAdd, taken }) {
  const [type, setType] = useState(allowed[0] ?? 'product');
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { setBusy(true); campaignsAPI.catalogue(type, q).then((r) => live && setRes(r.data)).catch(() => live && setRes([])).finally(() => live && setBusy(false)); }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [type, q]);

  return (
    <div style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <SelectInput value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 140 }}>{allowed.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}s</option>)}</SelectInput>
        <div style={{ position: 'relative', flex: 1 }}><Search size={13} style={{ position: 'absolute', left: 10, top: 12, color: colors.textFaint }} /><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU…" style={{ paddingLeft: 30 }} /></div>
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {busy && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>Searching…</span>}
        {!busy && res.length === 0 && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>Nothing found.</span>}
        {res.map((r) => {
          const has = taken.has(r.key);
          return (
            <button key={r.key} type="button" disabled={has} onClick={() => onAdd(r)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', cursor: has ? 'default' : 'pointer', opacity: has ? 0.5 : 1, fontFamily: 'inherit' }}>
              <span style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--surface-input, rgba(148,163,184,0.2))', overflow: 'hidden', flexShrink: 0 }}>{r.image && <img src={storageUrl(r.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
              <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>{r.name}{r.sku && <span style={{ fontFamily: 'monospace', fontWeight: 400, color: colors.textFaint, marginLeft: 6 }}>{r.sku}</span>}</span>
              <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>{has ? 'Added' : 'Add'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


