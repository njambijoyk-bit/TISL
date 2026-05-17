import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';
import currencyAPI from '../../../api/currency';
import api from '../../../api/axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const ITEM_TYPES     = ['product', 'service', 'fee', 'custom_product', 'custom_service'];
const STATUS_OPTIONS = ['planned','requested','quoted','approved','ordered','delivered','completed','cancelled'];

const UNIT_OPTIONS_BY_TYPE = {
  product:        ['each','pair','set','box','carton','bag','roll','sheet','piece','pack','pallet','lot','kg','g','tonne','lb','m','cm','mm','m²','m³','l','ml'],
  service:        ['hr','day','week','month','session','visit','trip','call','project','task','milestone','sqm','lm'],
  fee:            ['flat fee','%','per item','per kg','per km','per hr','per day','per order','per unit','per sqm'],
  custom_product: ['each','pair','set','box','carton','bag','roll','sheet','piece','pack','lot','kg','g','tonne','m','m²','m³','l','ml'],
  custom_service: ['hr','day','week','month','session','visit','trip','project','task','sqm','lm'],
};
const getUnits = (type) => UNIT_OPTIONS_BY_TYPE[type] || UNIT_OPTIONS_BY_TYPE.product;

const typeLabel      = (t) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money          = (n, d = 2) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const isLinkedType   = (t) => t === 'product' || t === 'service';
const isProductType  = (t) => t === 'product';

const emptyItem = (currency = 'KES') => ({
  _id: Math.random().toString(36).slice(2),
  item_type: 'product', product_id: null, service_id: null,
  description: '', quantity: 1, unit_of_measure: 'each',
  currency, unit_price: '', status: 'planned', notes: '',
  _search: '', _results: [], _searching: false, _selected: null,
  _showVariants: false, _variants: [],
});

const itemFromExisting = (existing) => ({
  _id: Math.random().toString(36).slice(2),
  item_type:       existing.item_type       || 'product',
  product_id:      existing.product_id      || null,
  service_id:      existing.service_id      || null,
  description:     existing.description     || '',
  quantity:        existing.quantity        ?? 1,
  unit_of_measure: existing.unit_of_measure || 'each',
  currency:        existing.currency        || 'KES',
  unit_price:      existing.unit_price      ?? '',
  status:          existing.status          || 'planned',
  notes:           existing.notes           || '',
  _search:         isLinkedType(existing.item_type) ? (existing.description || '') : '',
  _results: [], _searching: false,
  _selected: isLinkedType(existing.item_type) && (existing.product_id || existing.service_id)
    ? { id: existing.product_id || existing.service_id, name: existing.description || '' }
    : null,
  _showVariants: !!(existing.variant_details && Object.keys(existing.variant_details || {}).length > 0),
  _variants: existing.variant_details
    ? Object.entries(existing.variant_details).map(([key, value]) => ({ key, value }))
    : [],
});

const calcTotals = (item, currencyMap) => {
  const price = parseFloat(item.unit_price) || 0;
  const qty   = parseFloat(item.quantity)   || 0;
  const total = parseFloat((price * qty).toFixed(2));
  if (item.currency === 'KES' || !currencyMap[item.currency]) {
    return { line_total: total, unit_price_kes: price, line_total_kes: total, exchange_rate_to_kes: 1, converted_currency_at: null };
  }
  const cur  = currencyMap[item.currency];
  const rate = parseFloat(cur.exchange_rate_to_kes || cur.rate || cur.conversion_rate || 1);
  return {
    line_total: total,
    unit_price_kes:        parseFloat((price * rate).toFixed(2)),
    line_total_kes:        parseFloat((total * rate).toFixed(2)),
    exchange_rate_to_kes:  rate,
    converted_currency_at: new Date().toISOString(),
  };
};

// ── Shared input styles ───────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

// ── ItemRow ───────────────────────────────────────────────────────────────────
const ItemRow = ({ item, index, currencies, currencyMap, onChange, onRemove, isOnly }) => {
  const dropdownRef = useRef(null);
  const abortRef    = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (!item._search || item._selected || !isLinkedType(item.item_type)) {
      onChange(index, '_results', []);
      onChange(index, '_searching', false);
      if (!item._selected) setShowDropdown(false);
      return;
    }
    setShowDropdown(true);
    onChange(index, '_searching', true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => {
      const endpoint = isProductType(item.item_type) ? '/admin/products' : '/admin/services';
      api.get(endpoint, { params: { search: item._search, per_page: 250 }, signal: controller.signal })
        .then((res) => { onChange(index, '_results', res.data.data || res.data || []); onChange(index, '_searching', false); })
        .catch((err) => { if (err.name !== 'CanceledError' && err.name !== 'AbortError') onChange(index, '_searching', false); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [item._search, item.item_type]);

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectResult = (result) => {
    onChange(index, '_selected', result);
    onChange(index, '_search', result.name || '');
    onChange(index, 'description', result.name || '');
    onChange(index, isProductType(item.item_type) ? 'product_id' : 'service_id', result.id);
    onChange(index, isProductType(item.item_type) ? 'service_id' : 'product_id', null);
    if (result.price || result.base_price) onChange(index, 'unit_price', result.price || result.base_price || '');
    setShowDropdown(false);
  };

  const clearSelection = () => {
    onChange(index, '_selected', null);
    onChange(index, '_search', '');
    onChange(index, 'description', '');
    onChange(index, 'product_id', null);
    onChange(index, 'service_id', null);
  };

  const handleTypeChange = (newType) => {
    onChange(index, 'item_type', newType);
    onChange(index, 'unit_of_measure', getUnits(newType)[0]);
    clearSelection();
  };

  const addVariant    = () => onChange(index, '_variants', [...item._variants, { key: '', value: '' }]);
  const removeVariant = (vi) => onChange(index, '_variants', item._variants.filter((_, i) => i !== vi));
  const setVariant    = (vi, field, val) =>
    onChange(index, '_variants', item._variants.map((v, i) => i === vi ? { ...v, [field]: val } : v));

  const totals  = calcTotals(item, currencyMap);
  const showKes = item.currency !== 'KES' && !!currencyMap[item.currency];
  const noRate  = item.currency !== 'KES' && !currencyMap[item.currency];
  const rate    = currencyMap[item.currency]
    ? parseFloat(currencyMap[item.currency].exchange_rate_to_kes || currencyMap[item.currency].rate || currencyMap[item.currency].conversion_rate || 1)
    : null;

  return (
    <div style={{
      borderRadius: 14, padding: 16,
      background: 'rgba(168,85,247,0.03)',
      border: '1px solid rgba(168,85,247,0.18)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a855f7' }}>
          Item {index + 1}
        </span>
        {!isOnly && (
          <button type="button" onClick={() => onRemove(index)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 600, color: '#f87171',
            padding: '2px 8px', borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.25)',
            transition: 'background 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Remove
          </button>
        )}
      </div>

      {/* Type + Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <span style={labelStyle}>Type *</span>
          <select value={item.item_type} onChange={e => handleTypeChange(e.target.value)}
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
        <div>
          <span style={labelStyle}>Status</span>
          <select value={item.status} onChange={e => onChange(index, 'status', e.target.value)}
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{typeLabel(s)}</option>)}
          </select>
        </div>
      </div>

      {/* Product/Service search OR description */}
      <div>
        <span style={labelStyle}>
          {isProductType(item.item_type) ? 'Product *' : item.item_type === 'service' ? 'Service *' : 'Description *'}
        </span>
        {isLinkedType(item.item_type) ? (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input type="text" value={item._search}
                onChange={e => { onChange(index, '_search', e.target.value); if (item._selected) clearSelection(); }}
                onFocus={e => { if (item._search && !item._selected) setShowDropdown(true); inputFocus(e); }}
                onBlur={inputBlur}
                placeholder={`Type to search ${item.item_type}s...`}
                style={{ ...inputStyle, paddingRight: 32 }}
              />
              {item._searching && (
                <Loader2 style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#c084fc', animation: 'spin 1s linear infinite', pointerEvents: 'none' }} />
              )}
              {item._selected && !item._searching && (
                <button type="button" onClick={clearSelection} style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex',
                }}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
            {item._selected && (
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                <Check style={{ width: 11, height: 11 }} />
                {item._selected.name}{item._selected.sku ? ` · ${item._selected.sku}` : ''}
              </div>
            )}
            {showDropdown && !item._selected && (
              <div style={{
                position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: 4,
                borderRadius: 10, overflow: 'hidden',
                background: 'white',
                border: '1px solid rgba(168,85,247,0.25)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {item._searching && (
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#9ca3af' }}>
                    <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> Searching...
                  </div>
                )}
                {!item._searching && item._results.map(r => (
                  <button key={r.id} type="button" onClick={() => selectResult(r)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 14px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid rgba(168,85,247,0.08)',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 120ms',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{r.name || r.title}</span>
                      {r.sku && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#9ca3af' }}>{r.sku}</span>}
                    </div>
                    {(r.price || r.base_price) && (
                      <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, flexShrink: 0 }}>
                        KES {parseFloat(r.price || r.base_price).toFixed(2)}
                      </span>
                    )}
                  </button>
                ))}
                {!item._searching && item._search.length > 0 && item._results.length === 0 && (
                  <p style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
                    No results found
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <textarea required rows={2} value={item.description}
            onChange={e => onChange(index, 'description', e.target.value)}
            placeholder="Describe this item..."
            style={{ ...inputStyle, resize: 'none' }}
            onFocus={inputFocus} onBlur={inputBlur}
          />
        )}
      </div>

      {/* Qty + Unit + Currency */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <span style={labelStyle}>Qty *</span>
          <input type="number" min="0.01" step="0.01" required value={item.quantity}
            onChange={e => onChange(index, 'quantity', e.target.value)}
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </div>
        <div>
          <span style={labelStyle}>Unit</span>
          <select value={item.unit_of_measure} onChange={e => onChange(index, 'unit_of_measure', e.target.value)}
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
            {getUnits(item.item_type).map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <span style={labelStyle}>Currency</span>
          <select value={item.currency} onChange={e => onChange(index, 'currency', e.target.value)}
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
            {currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>

      {/* Unit Price + Line Total */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <span style={labelStyle}>Unit Price</span>
          <input type="number" min="0" step="0.01" value={item.unit_price}
            onChange={e => onChange(index, 'unit_price', e.target.value)}
            placeholder="0.00" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </div>
        <div>
          <span style={labelStyle}>Line Total</span>
          <div style={{
            padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
            background: 'rgba(168,85,247,0.06)',
            border: '1px solid rgba(168,85,247,0.18)',
            color: '#7c3aed', fontWeight: 700,
          }}>
            {item.currency} {money(totals.line_total)}
          </div>
        </div>
      </div>

      {/* KES conversion panel */}
      {showKes && (
        <div style={{
          borderRadius: 10, padding: '10px 14px',
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.2)',
        }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#2563eb', marginBottom: 6 }}>
            KES Equivalent · 1 {item.currency} = {rate.toFixed(4)} KES
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.72rem', color: '#3b82f6' }}>
            <span>Unit: <strong>KES {money(totals.unit_price_kes)}</strong></span>
            <span>Total: <strong>KES {money(totals.line_total_kes)}</strong></span>
          </div>
        </div>
      )}
      {noRate && (
        <p style={{ fontSize: '0.72rem', color: '#d97706', margin: 0 }}>
          ⚠ No exchange rate for {item.currency} — KES fields will be skipped.
        </p>
      )}

      {/* Notes */}
      <div>
        <span style={labelStyle}>Notes</span>
        <input type="text" value={item.notes}
          onChange={e => onChange(index, 'notes', e.target.value)}
          placeholder="Optional notes..."
          style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
      </div>

      {/* Variant Details */}
      <div>
        <button type="button"
          onClick={() => onChange(index, '_showVariants', !item._showVariants)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af',
            padding: 0, transition: 'color 120ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
          {item._showVariants
            ? <ChevronUp style={{ width: 13, height: 13 }} />
            : <ChevronDown style={{ width: 13, height: 13 }} />}
          Variant Details
          {item._variants.filter(v => v.key.trim()).length > 0 && (
            <span style={{
              marginLeft: 2, padding: '1px 7px', borderRadius: 20,
              background: 'rgba(168,85,247,0.12)',
              border: '1px solid rgba(168,85,247,0.25)',
              color: '#a855f7', fontSize: '0.65rem', fontWeight: 700,
            }}>
              {item._variants.filter(v => v.key.trim()).length}
            </span>
          )}
        </button>

        {item._showVariants && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {item._variants.map((v, vi) => (
              <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="text" value={v.key} onChange={e => setVariant(vi, 'key', e.target.value)}
                  placeholder="Key (e.g. color)"
                  style={{ ...inputStyle, flex: 1, fontSize: '0.78rem' }}
                  onFocus={inputFocus} onBlur={inputBlur} />
                <input type="text" value={v.value} onChange={e => setVariant(vi, 'value', e.target.value)}
                  placeholder="Value (e.g. red)"
                  style={{ ...inputStyle, flex: 1, fontSize: '0.78rem' }}
                  onFocus={inputFocus} onBlur={inputBlur} />
                <button type="button" onClick={() => removeVariant(vi)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', flexShrink: 0,
                }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addVariant} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, color: '#a855f7', padding: 0,
            }}>
              <Plus style={{ width: 12, height: 12 }} /> Add variant
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Modal ────────────────────────────────────────────────────────────────
const CreateItemModal = ({ project, onClose, editItem = null }) => {
  const { createItem, updateItem, loading } = useProjectStore();
  const isEditMode = !!editItem;

  const [currencies,  setCurrencies]  = useState([{ code: project.base_currency || 'KES' }]);
  const [currencyMap, setCurrencyMap] = useState({});
  const [items,       setItems]       = useState(() =>
    isEditMode ? [itemFromExisting(editItem)] : [emptyItem(project.base_currency || 'KES')]
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    currencyAPI.getCurrencies()
      .then((res) => {
        const active = (res.data || res || []).filter(c => c.is_active);
        if (active.length > 0) {
          setCurrencies(active);
          setCurrencyMap(Object.fromEntries(active.map(c => [c.code, c])));
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = useCallback((index, key, value) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }, []);

  const addRow    = () => setItems(prev => [...prev, emptyItem(prev.at(-1)?.currency || project.base_currency || 'KES')]);
  const removeRow = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const buildPayload = (item) => {
    const totals = calcTotals(item, currencyMap);
    const variantPairs    = item._variants.filter(v => v.key.trim());
    const variant_details = variantPairs.length > 0
      ? Object.fromEntries(variantPairs.map(v => [v.key.trim(), v.value.trim()]))
      : undefined;
    return {
      item_type:       item.item_type,
      description:     item.description || item._search || '',
      quantity:        parseFloat(item.quantity),
      unit_of_measure: item.unit_of_measure,
      currency:        item.currency,
      unit_price:      parseFloat(item.unit_price) || 0,
      line_total:      totals.line_total,
      status:          item.status,
      ...(item.notes       && { notes: item.notes }),
      ...(item.product_id  && { product_id: item.product_id }),
      ...(item.service_id  && { service_id: item.service_id }),
      ...(variant_details  && { variant_details }),
      ...(item.currency !== 'KES' && currencyMap[item.currency] && {
        exchange_rate_to_kes:  totals.exchange_rate_to_kes,
        unit_price_kes:        totals.unit_price_kes,
        line_total_kes:        totals.line_total_kes,
        converted_currency_at: totals.converted_currency_at,
      }),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description.trim() && !item._selected) { toast.error(`Item ${i + 1}: description or product/service required.`); return; }
      if (!item.quantity || parseFloat(item.quantity) <= 0) { toast.error(`Item ${i + 1}: quantity must be > 0.`); return; }
    }
    setSubmitting(true);
    if (isEditMode) {
      const res = await updateItem(project.id, editItem.id, buildPayload(items[0]));
      setSubmitting(false);
      if (res.success) { toast.success('Item updated successfully.'); onClose(); }
      else             { toast.error(res.error || 'Failed to update item.'); }
      return;
    }
    let ok = 0, fail = 0;
    for (const item of items) {
      const res = await createItem(project.id, buildPayload(item));
      if (res.success) ok++; else fail++;
    }
    setSubmitting(false);
    if (fail === 0)  { toast.success(`${ok} item${ok > 1 ? 's' : ''} added.`); onClose(); }
    else if (ok > 0) { toast.success(`${ok} added.`); toast.error(`${fail} failed.`); onClose(); }
    else             { toast.error('All items failed to save.'); }
  };

  const mixedCurrencies = new Set(items.map(i => i.currency)).size > 1;
  const grandTotal = items.reduce((sum, item) => sum + calcTotals(item, currencyMap).line_total, 0);
  const isBusy = submitting || loading.submitting;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 640, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 18, overflow: 'hidden',
        background: 'white',
        border: '1px solid rgba(168,85,247,0.3)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>

        {/* Accent strip */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7', margin: 0 }}>
              {isEditMode ? 'Edit Item' : 'Add Project Items'}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '2px 0 0' }}>
              {isEditMode
                ? `Editing: ${editItem.description}`
                : `${items.length} item${items.length > 1 ? 's' : ''} — submit all at once`}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', display: 'flex', padding: 4, borderRadius: 6,
            transition: 'color 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item, index) => (
            <ItemRow
              key={item._id} item={item} index={index}
              currencies={currencies} currencyMap={currencyMap}
              onChange={handleChange} onRemove={removeRow}
              isOnly={items.length === 1}
            />
          ))}

          {!isEditMode && (
            <button type="button" onClick={addRow} style={{
              width: '100%', padding: '10px 0',
              borderRadius: 12, border: '2px dashed rgba(168,85,247,0.25)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af',
              transition: 'border-color 150ms, color 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; e.currentTarget.style.color = '#a855f7'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; e.currentTarget.style.color = '#9ca3af'; }}>
              <Plus style={{ width: 14, height: 14 }} /> Add Another Item
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 14px',
          borderTop: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
        }}>
          {!isEditMode && (
            !mixedCurrencies ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Total</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#7c3aed' }}>
                  {items[0]?.currency} {money(grandTotal)}
                </span>
              </div>
            ) : (
              <p style={{ fontSize: '0.72rem', color: '#d97706', marginBottom: 12 }}>
                ⚠ Multiple currencies — totals shown per item.
              </p>
            )
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
              background: 'transparent', color: '#9ca3af',
              border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer',
              transition: 'border-color 150ms, color 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={isBusy} style={{
              padding: '6px 18px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
              border: 'none', cursor: isBusy ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
              opacity: isBusy ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 7,
              transition: 'box-shadow 150ms, opacity 150ms',
            }}
              onMouseEnter={e => { if (!isBusy) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
              {isBusy && <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />}
              {isBusy ? 'Saving…' : isEditMode ? 'Save Changes' : `Save ${items.length} Item${items.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateItemModal;