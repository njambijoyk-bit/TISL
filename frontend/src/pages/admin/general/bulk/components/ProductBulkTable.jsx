import { useState, useCallback } from 'react';
import SearchableDropdown from '../../../../../components/common/SearchableDropdown';
import ImageDrawer from './ImageDrawer';
import { productsAPI } from '../../../../../api';
import toast from 'react-hot-toast';

/**
 * ProductBulkTable
 * Renders rows with inline editing for price, category, brand
 * and image management via drawer
 */
export default function ProductBulkTable({
  products,
  categories,
  brands,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onProductUpdated,
}) {
  const [dirty, setDirty]         = useState({});   // { [id]: { price, original_price, price_is_negotiable, category_id, brand_id } }
  const [saving, setSaving]       = useState({});   // { [id]: bool }
  const [saved, setSaved]         = useState({});   // { [id]: bool } — green flash
  const [drawerProduct, setDrawerProduct] = useState(null);

  const markDirty = (id, field, value) => {
    setDirty(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
    // Clear saved flash
    setSaved(prev => ({ ...prev, [id]: false }));
  };

  const getVal = (product, field) => {
    return dirty[product.id]?.[field] !== undefined
      ? dirty[product.id][field]
      : product[field];
  };

  const isDirty = (id) => dirty[id] && Object.keys(dirty[id]).length > 0;

  const handleSave = async (product) => {
    const changes = dirty[product.id];
    if (!changes) return;

    setSaving(prev => ({ ...prev, [product.id]: true }));
    try {
      const payload = {};
      if (changes.name              !== undefined) payload.name           = changes.name;
      if (changes.stock_quantity    !== undefined) {
        payload.stock_quantity      = changes.stock_quantity;
        payload.in_stock            = changes.stock_quantity > 0 ? 1 : 0;
      }
      if (changes.price              !== undefined) payload.price              = changes.price;
      if (changes.original_price     !== undefined) payload.original_price     = changes.original_price;
      if (changes.price_is_negotiable !== undefined) payload.price_is_negotiable = changes.price_is_negotiable ? 1 : 0;
      if (changes.category_id        !== undefined) payload.category_id        = changes.category_id;
      if (changes.brand_id           !== undefined) payload.brand_id           = changes.brand_id;

      await productsAPI.updateProduct(product.id, payload);

      // Clear dirty for this row
      setDirty(prev => { const n = { ...prev }; delete n[product.id]; return n; });

      // Green flash
      setSaved(prev => ({ ...prev, [product.id]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [product.id]: false })), 2500);

      onProductUpdated(product.id, { ...product, ...payload });
      toast.success(`${product.name.substring(0, 30)} updated`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(prev => ({ ...prev, [product.id]: false }));
    }
  };

  const handleSaveAll = async () => {
    const dirtyIds = Object.keys(dirty);
    if (dirtyIds.length === 0) { toast('No pending changes', { icon: 'ℹ️' }); return; }

    const results = await Promise.allSettled(
        dirtyIds.map(id => {
        const product = products.find(p => String(p.id) === String(id));
        return product ? handleSave(product) : Promise.resolve();
        })
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed === 0) toast.success(`All ${dirtyIds.length} changes saved`);
    else toast.error(`${failed} failed, ${dirtyIds.length - failed} saved`);
 };

  const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.id));

  return (
    <>
    {Object.keys(dirty).length > 0 && (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', marginBottom: 8,
        background: 'rgba(124,58,237,0.06)',
        border: '1px solid rgba(124,58,237,0.2)',
        borderRadius: 8,
    }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary, #111)' }}>
        <strong style={{ color: '#7c3aed' }}>{Object.keys(dirty).length}</strong>
        {' '}unsaved {Object.keys(dirty).length === 1 ? 'change' : 'changes'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
        <button
            onClick={() => setDirty({})}
            style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-color, #e5e7eb)',
            background: 'transparent', fontSize: 12, cursor: 'pointer',
            color: 'var(--text-muted, #6b7280)',
            }}
        >Discard all</button>
        <button
            onClick={handleSaveAll}
            style={{
            padding: '6px 16px', borderRadius: 6, border: 'none',
            background: '#7c3aed', color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
            }}
        >
            💾 Save all ({Object.keys(dirty).length})
        </button>
        </div>
    </div>
    )}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-color, #e5e7eb)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary, #f9fafb)' }}>
              {/* Checkbox */}
              <Th width={40}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  style={{ cursor: 'pointer' }}
                />
              </Th>
              <Th width={64}>Image</Th>
              <Th>Name</Th> 
              <Th width={100}>SKU</Th>
              <Th width={110}>Stock Qty</Th>
              <Th width={160}>Category</Th>
              <Th width={140}>Brand</Th>
              <Th width={110}>Price (KSh)</Th>
              <Th width={110}>Original</Th>
              <Th width={90}>Negotiable</Th>
              <Th width={100}>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, idx) => (
              <ProductRow
                key={product.id}
                product={product}
                categories={categories}
                brands={brands}
                isSelected={selectedIds.has(product.id)}
                onToggleSelect={() => onToggleSelect(product.id)}
                dirtyData={dirty[product.id]}
                saving={saving[product.id]}
                saved={saved[product.id]}
                isDirty={isDirty(product.id)}
                getVal={(field) => getVal(product, field)}
                markDirty={(field, val) => markDirty(product.id, field, val)}
                onSave={() => handleSave(product)}
                onOpenDrawer={() => setDrawerProduct(product)}
                isEven={idx % 2 === 0}
              />
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
                  No products found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Image Drawer */}
      {drawerProduct && (
        <ImageDrawer
          product={drawerProduct}
          onClose={() => setDrawerProduct(null)}
          onSaved={(id, updated) => {
            onProductUpdated(id, updated);
            setDrawerProduct(null);
          }}
        />
      )}
    </>
  );
}

// ── Single Row ────────────────────────────────────────────────────────────────
function ProductRow({
  product, categories, brands,
  isSelected, onToggleSelect,
  saving, saved, isDirty,
  getVal, markDirty, onSave, onOpenDrawer,
  isEven,
}) {
  const [priceInput, setPriceInput]     = useState('');
  const [origInput, setOrigInput]       = useState('');
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingOrig, setEditingOrig]   = useState(false);

  const currentPrice = getVal('price');
  const currentOrig  = getVal('original_price');
  const isNegotiable = getVal('price_is_negotiable');

  const rowBg = saved
    ? 'rgba(34,197,94,0.06)'
    : isSelected
      ? 'var(--accent-light, #7c3aed75)'
      : isEven
        ? 'var(--bg-primary, #fff)'
        : 'var(--bg-secondary, #fafafa)';

  return (
    <tr style={{
      background: rowBg,
      transition: 'background 0.3s',
    }}>

      {/* Checkbox */}
      <Td center>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} style={{ cursor: 'pointer' }} />
      </Td>

      {/* Image */}
      <Td center>
        <div
          style={{
            width: 44, height: 44,
            borderRadius: 6,
            overflow: 'hidden',
            background: 'var(--bg-secondary, #f3f4f6)',
            border: '1px solid var(--accent, #7c3aed)',
            boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
            cursor: 'pointer',
          }}
          onClick={onOpenDrawer}
          title="Manage images"
        >
          <img
            src={product.main_image_url || product.main_image || '/images/product-placeholder.png'}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.src = '/images/product-placeholder.png'; }}
          />
        </div>
      </Td>

    {/* Name — editable */}
    <Td>
    <EditableCell
        value={getVal('name')}
        onCommit={val => markDirty('name', val)}
    />
    </Td>

    {/* SKU — read only */}
    <Td>
    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
        {product.sku || '—'}
    </span>
    </Td>

    {/* Stock Qty — editable number */}
    <Td>
    <EditableCell
        value={getVal('stock_quantity')}
        type="number"
        onCommit={val => {
        const n = parseInt(val);
        if (!isNaN(n) && n >= 0) markDirty('stock_quantity', n);
        }}
    />
    </Td>

      {/* Category */}
      <Td>
        <SearchableDropdown
          options={categories}
          value={getVal('category_id')}
          onChange={val => markDirty('category_id', val)}
          placeholder="Category"
          size="sm"
        />
      </Td>

      {/* Brand */}
      <Td>
        <SearchableDropdown
          options={brands}
          value={getVal('brand_id')}
          onChange={val => markDirty('brand_id', val)}
          placeholder="Brand"
          size="sm"
        />
      </Td>

      {/* Price */}
      <Td>
        {editingPrice ? (
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={priceInput}
            onChange={e => setPriceInput(e.target.value)}
            onBlur={() => {
              const v = parseFloat(priceInput);
              if (!isNaN(v)) markDirty('price', v);
              setEditingPrice(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setEditingPrice(false); }
            }}
            style={priceInputStyle}
          />
        ) : (
          <div
            onClick={() => { setEditingPrice(true); setPriceInput(currentPrice || ''); }}
            style={{
              ...priceCellStyle,
              color: currentPrice > 0 ? 'var(--text-primary, #111)' : 'var(--text-muted, #d1d5db)',
            }}
          >
            {currentPrice > 0 ? Number(currentPrice).toLocaleString() : '—'}
            <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.4 }}>✎</span>
          </div>
        )}
      </Td>

      {/* Original Price */}
      <Td>
        {editingOrig ? (
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={origInput}
            onChange={e => setOrigInput(e.target.value)}
            onBlur={() => {
              const v = parseFloat(origInput);
              if (!isNaN(v)) markDirty('original_price', v);
              setEditingOrig(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setEditingOrig(false); }
            }}
            style={priceInputStyle}
          />
        ) : (
          <div
            onClick={() => { setEditingOrig(true); setOrigInput(currentOrig || ''); }}
            style={{
              ...priceCellStyle,
              color: currentOrig > 0 ? 'var(--text-muted, #6b7280)' : 'var(--text-muted, #d1d5db)',
              textDecoration: currentOrig > 0 ? 'line-through' : 'none',
            }}
          >
            {currentOrig > 0 ? Number(currentOrig).toLocaleString() : '—'}
            <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.4 }}>✎</span>
          </div>
        )}
      </Td>

      {/* Negotiable toggle */}
      <Td center>
        <button
          onClick={() => markDirty('price_is_negotiable', !isNegotiable)}
          style={{
            padding: '3px 10px',
            borderRadius: 99,
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            background: isNegotiable ? '#dcfce7' : '#f6f3f3)',
            color: isNegotiable ? '#16a34a' : 'var(--text-muted, #ff0000)',
            transition: 'all 0.15s',
          }}
        >
          {isNegotiable ? 'Yes' : 'No'}
        </button>
      </Td>

      {/* Actions */}
      <Td center>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {/* Save button — only when dirty */}
          {isDirty && (
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: '4px 10px',
                background: saved ? '#22c55e' : 'var(--accent, #7c3aed)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {saving ? '…' : saved ? '✓' : 'Save'}
            </button>
          )}
          {/* Image button */}
            <button
            onClick={onOpenDrawer}
            title="Manage images"
            style={{
                padding: '4px 8px',
                background: 'var(--bg-secondary, #f3f4f6)',
                border: '1px solid var(--accent, #7c3aed)',
                boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-tertiary, #e5e7eb)';
                e.currentTarget.style.borderColor = 'var(--accent, #7c3aed)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-secondary, #f3f4f6)';
                e.currentTarget.style.borderColor = 'var(--border-color, #e5e7eb)';
            }}
            >
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted, #6b7280)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="12" cy="12" r="3" />
                <path d="M3 9a2 2 0 0 1 2-2h2.5" />
            </svg>
            </button>
        </div>
      </Td>
    </tr>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
function Th({ children, width, center }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: center ? 'center' : 'left',
      fontSize: 11, fontWeight: 700,
      color: 'var(--text-muted, #6b7280)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
      width: width || 'auto',
    }}>{children}</th>
  );
}

function Td({ children, center }) {
  return (
    <td style={{
      padding: '8px 12px',
      verticalAlign: 'middle',
      textAlign: center ? 'center' : 'left',
    }}>{children}</td>
  );
}

function EditableCell({ value, onCommit, type = 'text' }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState('');

  if (editing) {
    return (
      <input
        type={type}
        autoFocus
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={() => { onCommit(input); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.target.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={priceInputStyle}
      />
    );
  }
  return (
    <div
      onClick={() => { setEditing(true); setInput(value ?? ''); }}
      style={{ ...priceCellStyle, color: 'var(--text-primary, #111)', minWidth: type === 'text' ? 120 : 60 }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </span>
      <span style={{ fontSize: 10, marginLeft: 3, opacity: 0.4, flexShrink: 0 }}>✎</span>
    </div>
  );
}

const priceInputStyle = {
  width: '100%',
  padding: '5px 8px',
  border: '1px solid var(--accent, #7c3aed)',
  borderRadius: 5,
  fontSize: 12,
  outline: 'none',
  background: 'var(--bg-primary, #fff)',
  color: 'var(--text-primary, #111)',
  boxSizing: 'border-box',
};

const priceCellStyle = {
  padding: '5px 6px',
  borderRadius: 5,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  transition: 'background 0.1s',
  userSelect: 'none',
};