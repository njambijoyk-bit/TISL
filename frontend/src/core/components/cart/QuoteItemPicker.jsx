import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import productsAPI from '../../../_shared/api/products';
import { getServices } from '../../../_shared/api/services';
import useRequestListStore from '../../../_shared/store/requestListStore';
import VariantPicker from '../../../ecommerce/components/storefront/products/VariantPicker';
import useServicePackages from '../../../ecommerce/components/storefront/services/useServicePackages';
import ServicePackagePicker from '../../../ecommerce/components/storefront/services/ServicePackagePicker';

const rowsOf = (res) => res?.data ?? res?.products?.data ?? res?.services?.data ?? (Array.isArray(res) ? res : []);
const box = { border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)' };
const inner = { background: 'var(--surface-input)' };
const tabBtn = (on) => ({ padding: '6px 14px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, background: on ? 'var(--color-primary-500)' : 'transparent', color: on ? 'white' : 'inherit' });
const qtyInput = { width: 80, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', textAlign: 'right', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)' };
const addBtn = { padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' };

function ProductChooser({ product, onDone }) {
  const add = useRequestListStore((s) => s.add);
  const [choice, setChoice] = useState(null);
  const [structured, setStructured] = useState(null);   // null until the variants load
  const [qty, setQty] = useState(1);
  const submit = () => {
    if (structured && !choice) { toast.error('Choose from the options first'); return; }
    add({ kind: 'product', product_id: product.id, variant_id: choice?.variant.id ?? null, variant_unit_id: choice?.unit.id ?? null, name: product.name,
      variant_label: choice ? (choice.variant.name || choice.label) : null, unit_code: choice?.unit.unit?.code ?? null, quantity: Number(qty) || 1 });
    toast.success(`${product.name} added`);
    onDone();
  };
  return (
    <div style={{ ...box, ...inner, marginTop: 10 }}>
      <strong>{product.name}</strong>
      <div style={{ margin: '10px 0' }}><VariantPicker product={product} onChange={setChoice} onLoaded={setStructured} /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem' }}>Qty <input type="number" min="1" step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={qtyInput} aria-label="Quantity" /></label>
        <button type="button" onClick={submit} style={addBtn}>Add to request</button>
        <button type="button" onClick={onDone} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
      </div>
    </div>
  );
}

function ServiceChooser({ service, onDone }) {
  const add = useRequestListStore((s) => s.add);
  const picker = useServicePackages(service.id);
  const [qty, setQty] = useState(1);
  const submit = () => {
    if (picker.variants.length > 0 && !picker.variant) { toast.error('Choose a package first'); return; }
    add({ kind: 'service', service_id: service.id, service_variant_id: picker.variant?.id ?? null, name: service.name, variant_label: picker.variant ? (picker.label || picker.variant.name) : null, unit_code: null, quantity: Number(qty) || 1 });
    toast.success(`${service.name} added`);
    onDone();
  };
  return (
    <div style={{ ...box, ...inner, marginTop: 10 }}>
      <strong>{service.name}</strong>
      <div style={{ margin: '10px 0' }}><ServicePackagePicker picker={picker} /></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem' }}>Qty <input type="number" min="1" step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={qtyInput} aria-label="Quantity" /></label>
        <button type="button" onClick={submit} style={addBtn}>Add to request</button>
        <button type="button" onClick={onDone} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
      </div>
    </div>
  );
}

/** Find a product or service and add it (with its variant and quantity) to the quote request. */
export default function QuoteItemPicker() {
  const [tab, setTab] = useState('product');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const call = tab === 'product' ? productsAPI.getProducts({ search: q || undefined, per_page: 8 }) : getServices({ search: q || undefined, per_page: 8 });
      call.then((r) => setRows(rowsOf(r))).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, tab]);

  return (
    <div style={{ ...box, marginBottom: 22 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button" style={tabBtn(tab === 'product')} onClick={() => { setTab('product'); setOpen(null); }}>Products</button>
        <button type="button" style={tabBtn(tab === 'service')} onClick={() => { setTab('service'); setOpen(null); }}>Services</button>
      </div>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-tertiary)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab === 'product' ? 'products' : 'services'} to add…`} aria-label="Search items"
          style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)', fontSize: '0.88rem' }} />
      </div>
      <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        {rows.map((r) => (
          <button key={r.id} type="button" onClick={() => setOpen(open?.id === r.id ? null : r)}
            style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${open?.id === r.id ? 'var(--color-primary-500)' : 'var(--line)'}`, background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: '0.85rem' }}>
            {r.name}
          </button>
        ))}
        {rows.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Nothing found.</span>}
      </div>
      {open && (tab === 'product' ? <ProductChooser key={`p${open.id}`} product={open} onDone={() => setOpen(null)} /> : <ServiceChooser key={`s${open.id}`} service={open} onDone={() => setOpen(null)} />)}
    </div>
  );
}
