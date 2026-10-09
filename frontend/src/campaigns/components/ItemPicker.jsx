import { useEffect, useState } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import campaignsAPI from '../../_shared/api/campaigns';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { colors, btnGhost, btnPrimary } from '../../_shared/theme/tokens';
import { TextInput, SelectInput } from '../../core/components/admin/ui/Form';
import { itemKey } from '../lib/itemKey';

const money = (n, c) => (n == null ? '' : `${c ? `${c} ` : ''}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * Search products, services, hampers or auctions by name or SKU and pick one (needs E-commerce). A product with several options (or a service with several packages) asks what to feature:
 * the whole thing, or the ones you tick (each is its own card on the page). `taken` is a Set of item keys already chosen (itemKey).
 * `onAdd` is given an array of rows, in the shape the page builder keeps in `resolved`.
 */
export default function ItemPicker({ allowed, onAdd, taken }) {
  const [type, setType] = useState(allowed[0] ?? 'product');
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(null);     // a product whose options are being picked: { product, options }
  const [ticked, setTicked] = useState(new Set());
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { setBusy(true); campaignsAPI.catalogue(type, q).then((r) => live && setRes(r.data)).catch(() => live && setRes([])).finally(() => live && setBusy(false)); }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [type, q]);

  const optionsTaken = (kind, id) => [...taken].filter((k) => k.startsWith(`${kind}:${id}:v`)).length;

  const choose = async (r) => {
    if (r.type !== 'product' && r.type !== 'service') { onAdd([r]); return; }
    try {
      const v = await campaignsAPI.catalogueVariants(r.id, r.type);
      if (!v.can_feature_options || v.data.length < 2) { onAdd([r]); return; }   // one option (or script 106 not run): the product itself
      setChosen({ product: r, options: v.data }); setTicked(new Set());
    } catch { onAdd([r]); }
  };

  if (chosen) {
    const { product, options } = chosen;
    const kind = product.type;                       // product (options) or service (packages)
    const part = kind === 'service' ? 'package' : 'option';
    const wholeTaken = taken.has(itemKey(kind, product.id));
    const someTaken = options.some((o) => taken.has(itemKey(kind, product.id, o.variant_id)));
    const rowFor = (o) => ({ key: itemKey(kind, product.id, o.variant_id), type: kind, id: product.id, variant_id: o.variant_id, name: product.name, variant: o.variant, sku: o.sku ?? product.sku, image: o.image ?? product.image, price: o.price ?? product.price, currency: product.currency, available: true });
    const toggle = (id) => setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const done = () => setChosen(null);
    return (
      <div style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
        <button type="button" onClick={done} style={{ ...btnGhost, justifyContent: 'flex-start', padding: '4px 8px', fontSize: '0.76rem' }}><ArrowLeft size={13} /> Back to search</button>
        <strong style={{ fontSize: '0.86rem' }}>{product.name}</strong>
        <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>Feature the whole {kind} (the customer picks the {part}), or only the {part}s you tick. It is featured one way or the other, not both.</p>
        <div>
          <button type="button" style={btnGhost} disabled={wholeTaken || someTaken} onClick={() => { onAdd([product]); done(); }}>{wholeTaken ? `Whole ${kind} already added` : someTaken ? `Whole ${kind} (remove the ${part}s first)` : `Add the whole ${kind}`}</button>
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
          {options.map((o) => {
            const has = taken.has(itemKey(kind, product.id, o.variant_id));
            const off = has || wholeTaken;
            return (
              <label key={o.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', opacity: off ? 0.5 : 1, cursor: off ? 'default' : 'pointer' }}>
                <input type="checkbox" disabled={off} checked={has || ticked.has(o.variant_id)} onChange={() => toggle(o.variant_id)} />
                <span style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--surface-input, rgba(148,163,184,0.2))', overflow: 'hidden', flexShrink: 0 }}>{(o.image ?? product.image) && <img src={storageUrl(o.image ?? product.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
                <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>{o.variant}{o.sku && <span style={{ fontFamily: 'monospace', fontWeight: 400, color: colors.textFaint, marginLeft: 6 }}>{o.sku}</span>}</span>
                <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{money(o.price ?? product.price, product.currency)}{o.in_stock === false ? ' · out of stock' : ''}{has ? ' · added' : ''}</span>
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" style={btnPrimary} disabled={ticked.size === 0} onClick={() => { onAdd(options.filter((o) => ticked.has(o.variant_id)).map(rowFor)); done(); }}>Add {ticked.size || ''} selected {part}{ticked.size === 1 ? '' : 's'}</button>
        </div>
      </div>
    );
  }

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
          const n = r.type === 'product' || r.type === 'service' ? optionsTaken(r.type, r.id) : 0;
          return (
            <button key={r.key} type="button" disabled={has} onClick={() => choose(r)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', cursor: has ? 'default' : 'pointer', opacity: has ? 0.5 : 1, fontFamily: 'inherit' }}>
              <span style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--surface-input, rgba(148,163,184,0.2))', overflow: 'hidden', flexShrink: 0 }}>{r.image && <img src={storageUrl(r.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
              <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600 }}>{r.name}{r.sku && <span style={{ fontFamily: 'monospace', fontWeight: 400, color: colors.textFaint, marginLeft: 6 }}>{r.sku}</span>}</span>
              <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>{has ? 'Added' : n ? `${n} ${r.type === 'service' ? 'package' : 'option'}${n === 1 ? '' : 's'} added · add more` : r.type === 'product' || r.type === 'service' ? 'Choose…' : 'Add'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
