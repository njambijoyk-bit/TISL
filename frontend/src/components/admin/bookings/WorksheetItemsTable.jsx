import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, Search, Loader2, AlertCircle, Package, Edit2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

const inputStyle = (width = '100%') => ({
  width, padding: '5px 8px', borderRadius: 7, fontSize: '0.78rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.15)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms',
});

const SORT_OPTIONS = [
  { value: 'manual', label: 'Manual order' },
  { value: 'name',   label: 'Alphabetical' },
  { value: 'price',  label: 'Price (low → high)' },
  { value: 'total',  label: 'Line total (high → low)' },
];

const WorksheetItemsTable = ({
  items = [],
  currencyCode = 'KES',
  exchangeRate = 1,
  readOnly = false,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
  productsAPI,
}) => {
  const [addMode,    setAddMode]    = useState(null);   // 'system' | 'manual' | null
  const [editingId,  setEditingId]  = useState(null);
  const [sortBy,     setSortBy]     = useState('manual');
  const [saving,     setSaving]     = useState(false);
  const [dragOver,   setDragOver]   = useState(null);
  const [dragging,   setDragging]   = useState(null);

  // New item form state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', quantity: 1, unit_of_measure: 'each', unit_price: '', notes: '' });
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Edit form state
  const [editVals, setEditVals] = useState({});

  // ── Sorting ──────────────────────────────────────────────────────────────
  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'name')  return a.name.localeCompare(b.name);
    if (sortBy === 'price') return parseFloat(a.unit_price) - parseFloat(b.unit_price);
    if (sortBy === 'total') return parseFloat(b.line_total) - parseFloat(a.line_total);
    return a.sort_order - b.sort_order;
  });

  // ── Product search ────────────────────────────────────────────────────────
  const searchProducts = async (q) => {
    setProductSearch(q); setSelectedProduct(null);
    if (!q.trim()) { setProductResults([]); return; }
    setSearching(true);
    try {
      const res = await productsAPI.getAdminProducts({ search: q, per_page: 20 });
      setProductResults(res.data ?? res ?? []);
    } catch { toast.error('Product search failed'); }
    finally { setSearching(false); }
  };

  const selectProduct = (p) => {
    setSelectedProduct(p);
    setNewItem(prev => ({ ...prev, name: p.name, sku: p.sku ?? '', unit_price: p.price ?? '', unit_of_measure: p.unit_of_measure ?? 'each' }));
    setProductSearch(p.name);
    setProductResults([]);
  };

  // ── Add item ─────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newItem.name || !newItem.unit_price || !newItem.quantity) {
      toast.error('Name, quantity and unit price are required.'); return;
    }
    setSaving(true);
    try {
      await onAdd({
        source:          addMode === 'system' ? 'system' : 'manual',
        product_id:      selectedProduct?.id ?? undefined,
        name:            newItem.name,
        sku:             newItem.sku || undefined,
        quantity:        parseFloat(newItem.quantity),
        unit_of_measure: newItem.unit_of_measure,
        unit_price:      parseFloat(newItem.unit_price),
        notes:           newItem.notes || undefined,
      });
      setAddMode(null);
      setNewItem({ name: '', sku: '', quantity: 1, unit_of_measure: 'each', unit_price: '', notes: '' });
      setSelectedProduct(null); setProductSearch('');
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Failed to add item'); }
    finally { setSaving(false); }
  };

  // ── Inline edit ───────────────────────────────────────────────────────────
  const startEdit = (item) => {
    setEditingId(item.id);
    setEditVals({ quantity: item.quantity, unit_price: item.unit_price, name: item.name, unit_of_measure: item.unit_of_measure, notes: item.notes ?? '' });
  };
  const cancelEdit = () => { setEditingId(null); setEditVals({}); };
  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await onUpdate(id, {
        quantity:        parseFloat(editVals.quantity),
        unit_price:      parseFloat(editVals.unit_price),
        name:            editVals.name,
        unit_of_measure: editVals.unit_of_measure,
        notes:           editVals.notes || undefined,
      });
      setEditingId(null);
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  // ── Drag to reorder ───────────────────────────────────────────────────────
  const handleDragEnd = async () => {
    if (dragging === null || dragOver === null || dragging === dragOver) { setDragging(null); setDragOver(null); return; }
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragging, 1);
    reordered.splice(dragOver, 0, moved);
    setDragging(null); setDragOver(null);
    try { await onReorder(reordered.map(i => i.id)); }
    catch { toast.error('Reorder failed'); }
  };

  const fmt = (n) => `${currencyCode} ${parseFloat(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  const totalMaterials = items.reduce((s, i) => s + parseFloat(i.line_total ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Controls */}
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setAddMode('system')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
              border: '1.5px dashed rgba(168,85,247,0.3)',
            }}><Package size={12} /> From products</button>
            <button type="button" onClick={() => setAddMode('manual')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              background: 'rgba(37,99,235,0.06)', color: '#2563eb',
              border: '1.5px dashed rgba(37,99,235,0.25)',
            }}><Plus size={12} /> Manual entry</button>
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle('auto'), padding: '5px 10px', cursor: 'pointer' }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Add item form */}
      {addMode && (
        <div style={{ padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.02)', marginBottom: 10 }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {addMode === 'system' ? '📦 Add from products catalogue' : '✏️ Manual item entry'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Name / Product search */}
            <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
              {addMode === 'system' ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#a855f7' }} />
                    <input value={productSearch} onChange={e => searchProducts(e.target.value)}
                      placeholder="Search products…"
                      style={{ ...inputStyle(), paddingLeft: 28 }}
                      onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                      onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
                    />
                  </div>
                  {(productResults.length > 0 || searching) && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: 'white', border: '1.5px solid rgba(168,85,247,0.15)', borderRadius: 9, marginTop: 3, overflow: 'hidden', boxShadow: '0 6px 20px rgba(168,85,247,0.1)' }}>
                      {searching ? (
                        <div style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: '0.75rem', justifyContent: 'center' }}>
                          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Searching…
                          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                      ) : productResults.map(p => (
                        <div key={p.id} onClick={() => selectProduct(p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(168,85,247,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 100ms' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >
                          <div>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0 }}>{p.name}</p>
                            <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>{p.sku}</p>
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed' }}>{fmt(p.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                  placeholder="Item name *"
                  style={inputStyle()}
                  onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
                />
              )}
            </div>

            {/* SKU */}
            <input value={newItem.sku} onChange={e => setNewItem(p => ({ ...p, sku: e.target.value }))}
              placeholder="SKU (optional)" style={inputStyle()}
              onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
            />

            {/* UoM */}
            <input value={newItem.unit_of_measure} onChange={e => setNewItem(p => ({ ...p, unit_of_measure: e.target.value }))}
              placeholder="Unit (each, kg, hr…)" style={inputStyle()}
              onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
            />

            {/* Qty */}
            <input type="number" value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))}
              placeholder="Qty *" min="0.01" step="0.01" style={inputStyle()}
              onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
            />

            {/* Unit price */}
            <input type="number" value={newItem.unit_price} onChange={e => setNewItem(p => ({ ...p, unit_price: e.target.value }))}
              placeholder={`Unit price (${currencyCode}) *`} min="0" step="0.01" style={inputStyle()}
              onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
            />

            {/* Notes */}
            <div style={{ gridColumn: '1 / -1' }}>
              <input value={newItem.notes} onChange={e => setNewItem(p => ({ ...p, notes: e.target.value }))}
                placeholder="Notes (optional)" style={inputStyle()}
                onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => { setAddMode(null); setProductSearch(''); setProductResults([]); setSelectedProduct(null); setNewItem({ name: '', sku: '', quantity: 1, unit_of_measure: 'each', unit_price: '', notes: '' }); }}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(168,85,247,0.18)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={saving} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
              border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1,
            }}>
              {saving ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Adding…</> : <><Plus size={12} /> Add item</>}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem', border: '1.5px dashed rgba(168,85,247,0.15)', borderRadius: 12 }}>
          No items yet — add from the catalogue or enter manually.
        </div>
      ) : (
        <div style={{ border: '1.5px solid rgba(168,85,247,0.12)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 70px 80px 90px 100px 36px', gap: 8, padding: '8px 12px', background: 'rgba(168,85,247,0.04)', borderBottom: '1px solid rgba(168,85,247,0.1)', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>
            <span />
            <span>Item</span>
            <span>Qty</span>
            <span>UoM</span>
            <span>Unit Price</span>
            <span style={{ textAlign: 'right' }}>Line Total</span>
            <span />
          </div>

          {sorted.map((item, idx) => {
            const isEditing = editingId === item.id;
            return (
              <div key={item.id}
                draggable={!readOnly && sortBy === 'manual'}
                onDragStart={() => setDragging(idx)}
                onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'grid', gridTemplateColumns: '20px 1fr 70px 80px 90px 100px 36px',
                  gap: 8, padding: '9px 12px', alignItems: 'center',
                  borderBottom: idx < sorted.length - 1 ? '1px solid rgba(168,85,247,0.06)' : 'none',
                  background: dragOver === idx ? 'rgba(168,85,247,0.04)' : isEditing ? 'rgba(168,85,247,0.02)' : 'white',
                  transition: 'background 100ms',
                }}
              >
                {/* Drag handle */}
                <span style={{ color: '#d1d5db', cursor: sortBy === 'manual' && !readOnly ? 'grab' : 'default', display: 'flex', alignItems: 'center' }}>
                  <GripVertical size={13} />
                </span>

                {/* Name */}
                <div style={{ minWidth: 0 }}>
                  {isEditing ? (
                    <input value={editVals.name} onChange={e => setEditVals(p => ({ ...p, name: e.target.value }))}
                      style={{ ...inputStyle(), fontSize: '0.75rem' }}
                      onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                      onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
                    />
                  ) : (
                    <div>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                        {item.price_overridden && <span title="Price overridden from system" style={{ marginLeft: 5, fontSize: '0.58rem', color: '#f59e0b', fontWeight: 700 }}>✦ overridden</span>}
                      </p>
                      {item.sku && <p style={{ fontSize: '0.62rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{item.sku}</p>}
                    </div>
                  )}
                </div>

                {/* Qty */}
                {isEditing ? (
                  <input type="number" value={editVals.quantity} onChange={e => setEditVals(p => ({ ...p, quantity: e.target.value }))} min="0.01" step="0.01"
                    style={{ ...inputStyle(), fontSize: '0.75rem' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
                  />
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>{item.quantity}</span>
                )}

                {/* UoM */}
                {isEditing ? (
                  <input value={editVals.unit_of_measure} onChange={e => setEditVals(p => ({ ...p, unit_of_measure: e.target.value }))}
                    style={{ ...inputStyle(), fontSize: '0.75rem' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
                  />
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{item.unit_of_measure}</span>
                )}

                {/* Unit price */}
                {isEditing ? (
                  <input type="number" value={editVals.unit_price} onChange={e => setEditVals(p => ({ ...p, unit_price: e.target.value }))} min="0" step="0.01"
                    style={{ ...inputStyle(), fontSize: '0.75rem' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#a855f7'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'}
                  />
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#374151' }}>{fmt(item.unit_price)}</span>
                )}

                {/* Line total */}
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed', textAlign: 'right' }}>
                  {fmt(item.line_total)}
                </span>

                {/* Actions */}
                {!readOnly && (
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(item.id)} disabled={saving} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(16,185,129,0.1)', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {saving ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
                        </button>
                        <button onClick={cancelEdit} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(107,114,128,0.08)', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={11} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(item)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'none', color: '#c4b5fd', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 100ms, background 100ms' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#c4b5fd'; e.currentTarget.style.background = 'none'; }}
                        ><Edit2 size={11} /></button>
                        <button onClick={() => onRemove(item.id)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'none', color: '#fca5a5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 100ms, background 100ms' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.background = 'none'; }}
                        ><Trash2 size={11} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Total footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 70px 80px 90px 100px 36px', gap: 8, padding: '9px 12px', background: 'rgba(168,85,247,0.04)', borderTop: '1px solid rgba(168,85,247,0.1)' }}>
            <span /><span /><span /><span /><span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af' }}>Total</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#7c3aed', textAlign: 'right' }}>{fmt(totalMaterials)}</span>
            <span />
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default WorksheetItemsTable;