import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { priceListPath } from '../../../_shared/lib/itemPath';
import { X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import { Field } from '../../../core/components/admin/ui/Form';
import priceListsAPI from '../../../_shared/api/priceLists';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import { AudiencePicker } from '../../components/admin/catalogue/bits';
import { fieldStyle, fromLocalInput, useCatalogueMeta } from '../../components/admin/catalogue/catalogueMeta';
import { EARLIER_LABEL } from '../../lib/priceList/format';
import { hasPermission } from '../../../_shared/lib/roles';

const KINDS = [['product', 'Products'], ['category', 'Categories'], ['brand', 'Brands'], ['service', 'Services'], ['service_category', 'Service categories']];

/** Make a price list: choose what goes on it, who can see it, and whether to keep it as a draft or publish it. The prices are taken, and kept, when you save. */
export default function PriceListEditor() {
  const navigate = useNavigate();
  const roleUser = useAuthStore((s) => s.user);
  const canPublish = hasPermission(roleUser, 'catalogue.publish');
  const [meta] = useCatalogueMeta();
  const [f, setF] = useState({ name: '', description: '', access: 'staff', customer_types: [], earlier_price: null, active_from: '' });
  const [picks, setPicks] = useState([]);
  const [kind, setKind] = useState('product');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (meta && f.earlier_price === null) setF((x) => ({ ...x, earlier_price: meta.data.earlier_price })); }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => { priceListsAPI.picker(kind, q).then((r) => on && setFound(r.data)).catch(() => on && setFound([])); }, 250);

    return () => { on = false; clearTimeout(t); };
  }, [kind, q]);

  const has = (type, id) => picks.some((p) => p.type === type && p.id === id);
  const add = (type, id, label) => { if (!has(type, id)) setPicks((p) => [...p, { type, id, label }]); };
  const everything = () => setPicks((p) => (p.some((x) => x.type === 'all_products') && p.some((x) => x.type === 'all_services')
    ? p.filter((x) => x.type !== 'all_products' && x.type !== 'all_services')
    : [...p.filter((x) => x.type !== 'all_products' && x.type !== 'all_services'), { type: 'all_products', id: null, label: 'Every product on sale' }, { type: 'all_services', id: null, label: 'Every available service' }]));
  const addShown = () => setPicks((p) => [...p, ...found.filter((x) => !p.some((y) => y.type === kind && y.id === x.id)).map((x) => ({ type: kind, id: x.id, label: x.label }))]);
  const allOn = (type) => picks.some((p) => p.type === type);
  const toggleAll = (type, label) => setPicks((p) => (p.some((x) => x.type === type) ? p.filter((x) => x.type !== type) : [...p, { type, id: null, label }]));

  const save = async (publish) => {
    if (!f.name.trim()) { toast.error('Give the list a name.'); return; }
    if (!picks.length) { toast.error('Choose what goes on the list.'); return; }
    setBusy(true);
    try {
      const r = await priceListsAPI.create({ ...f, active_from: fromLocalInput(f.active_from), picks, publish });
      toast.success(r.message, { duration: 6000 });
      navigate(priceListPath(r.data, true));
    } catch (e) { toast.error(errMsg(e, 'Could not save the list'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div><CatalogueTabs back="/admin/price-lists" backLabel="Price lists" /><HubHeader title="New price list" description="Choose the items, who can see the list and when it goes live. The prices are taken when you save and kept as they were." /></div>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <strong style={{ color: colors.text }}>The list</strong>
          <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={160} placeholder="e.g. Retail prices, spring 2027" style={fieldStyle} /></Field>
          <Field label="Note (optional)"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} style={fieldStyle} /></Field>
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 12 }}>
          <div><strong style={{ color: colors.text }}>What goes on it</strong><div style={{ fontSize: '0.78rem', color: colors.textFaint }}>Products (every variant and unit) and services (every package). A category includes its sub-categories. Hampers and auctions are short term, so they are not on price lists. Their prices are never read from cost.</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['all_products', 'Every product on sale'], ['all_services', 'Every available service']].map(([t, l]) => (
              <button key={t} type="button" aria-pressed={allOn(t)} onClick={() => toggleAll(t, l)}
                style={{ ...btnGhost, padding: '6px 14px', fontSize: '0.8rem', background: allOn(t) ? 'var(--color-primary-500)' : 'var(--surface-card)', color: allOn(t) ? '#fff' : colors.text }}>{allOn(t) ? '✓ ' : '+ '}{l}</button>
            ))}
            <button type="button" style={{ ...btnGhost, padding: '6px 14px', fontSize: '0.8rem' }} onClick={everything}>{allOn('all_products') && allOn('all_services') ? 'Clear both' : 'Add everything'}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.78rem', borderRadius: 999, background: kind === k ? 'var(--color-primary-500)' : 'var(--surface-card)', color: kind === k ? '#fff' : colors.text }}>{l}</button>)}
            <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.78rem', marginLeft: 'auto' }} disabled={found.every((x) => has(kind, x.id))} onClick={addShown}>Add all {found.length} shown</button>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ ...fieldStyle, width: 220 }} />
          </div>
          <div style={{ display: 'grid', gap: 4, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 6 }}>
            {found.length === 0 && <div style={{ padding: 8, fontSize: '0.82rem', color: colors.textFaint }}>Nothing found.</div>}
            {found.map((x) => (
              <button key={x.id} type="button" disabled={has(kind, x.id)} onClick={() => add(kind, x.id, x.label)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '6px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: colors.text, fontFamily: 'inherit', fontSize: '0.84rem', cursor: has(kind, x.id) ? 'default' : 'pointer', opacity: has(kind, x.id) ? 0.45 : 1 }}>
                <span>{x.label}{x.sub && <span style={{ color: colors.textFaint }}> · {x.sub}</span>}</span><Plus size={14} />
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {picks.length === 0 && <span style={{ fontSize: '0.8rem', color: colors.textFaint }}>Nothing chosen yet.</span>}
            {picks.map((p, i) => (
              <span key={`${p.type}-${p.id}-${i}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 6px 3px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', fontSize: '0.78rem', color: colors.text }}>
                {KINDS.find(([k]) => k === p.type)?.[1]?.replace(/s$/, '') ?? ''}{p.id ? ': ' : ''}{p.label}
                <button type="button" aria-label={`Remove ${p.label}`} onClick={() => setPicks((x) => x.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={13} /></button>
              </span>
            ))}
          </div>
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <strong style={{ color: colors.text }}>Who sees it, and when</strong>
          <Field label="Who can see it" hint="Customer types come from your customer types setup."><AudiencePicker access={f.access} types={f.customer_types} onChange={(a) => setF({ ...f, ...a })} /></Field>
          <Field label="Active from" hint="Customers see a published list from this moment. Leave blank for as soon as it is published."><input type="datetime-local" value={f.active_from} onChange={(e) => setF({ ...f, active_from: e.target.value })} style={{ ...fieldStyle, maxWidth: 260 }} /></Field>
          <Field label="Earlier price"><select value={f.earlier_price ?? 'discounts'} onChange={(e) => setF({ ...f, earlier_price: e.target.value })} style={fieldStyle}>{Object.entries(EARLIER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={btnGhost} disabled={busy} onClick={() => save(false)}>Save as draft</button>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => save(true)}>{canPublish ? 'Publish now' : 'Send for activation'}</button>
          {!canPublish && <span style={{ fontSize: '0.78rem', color: colors.textFaint }}>Someone else has to activate a list you make.</span>}
          <button type="button" style={{ ...btnGhost, marginLeft: 'auto' }} onClick={() => navigate('/admin/price-lists')}>Cancel</button>
        </div>
      </div>
    </AdminLayout>
  );
}
