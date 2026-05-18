import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Package, Users, ShoppingBag, Settings,
  Plus, Trash2, Search, CheckCircle, AlertTriangle,
  Shield, RefreshCw, Lightbulb, Edit2, X, Tag,
  Wallet, Star, Clock,
} from 'lucide-react';
import AdminLayout from '../../../components/layout/AdminLayout';
import ProductSelectorModalAdmin from '../../../components/quotes/request-wizard/ProductSelectorModalAdmin';
import hampersAPI from '../../../api/hampers';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Tokens ────────────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  border: '1px solid #dcb6ff',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  color: '#0b080e',
};

const thStyle = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: '0.68rem', fontWeight: 700,
  color: '#a855f7',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border-tertiary)',
  fontSize: '0.875rem',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  fontSize: '0.875rem', border: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-primary)',
  color: '#111827',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--color-text-secondary)',
  display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Btn({ onClick, disabled, style, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
      border: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      fontFamily: 'inherit', transition: 'background 150ms', ...style,
    }}>{children}</button>
  );
}

function PrimaryBtn({ onClick, disabled, loading, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
      border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
      color: 'white', cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.6 : 1, fontFamily: 'inherit', ...style,
    }}>{children}</button>
  );
}

function DangerBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600,
      border: 'none', background: 'var(--color-background-danger)',
      color: 'var(--color-text-danger)',
      cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    }}>{children}</button>
  );
}

function Toggle({ value, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 32, height: 18, borderRadius: 9, background: value ? '#a855f7' : '#e3cdf8', position: 'relative', transition: 'background 200ms' }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:      { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    suspended:   { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
    blacklisted: { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
    draft:       { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
    inactive:    { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
    pending:     { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
    confirmed:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    shipped:     { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
    delivered:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    cancelled:   { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
  };
  const s = map[status] || { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' };
  return (
    <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {(status || '').toUpperCase()}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ margin: '0 0 16px', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 10, borderBottom: '1px solid var(--color-border-tertiary)' }}>
      {children}
    </p>
  );
}

// ── Modal: Set quantity for selected products ─────────────────────────────────

function QuantityModal({ products, onConfirm, onClose }) {
  const [qtys, setQtys] = useState(
    Object.fromEntries(products.map(p => [p.id, 1]))
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }} onClick={onClose}>
      <div style={{ ...card, width: '100%', maxWidth: 480, padding: 24, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Set Quantities</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a855f7' }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {products.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border-tertiary)' }}>
              {p.main_image_url && <img src={p.main_image_url} alt={p.name} style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>{fmt(p.price)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <label style={{ ...labelStyle, marginBottom: 0, fontSize: '0.65rem' }}>QTY</label>
                <input
                  type="number" min="1" value={qtys[p.id]}
                  onChange={e => setQtys(q => ({ ...q, [p.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={{ ...inputStyle, width: 70, padding: '6px 8px', textAlign: 'center' }}
                />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border-tertiary)' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <PrimaryBtn onClick={() => onConfirm(qtys)}>
            <Plus size={14} /> Add {products.length} Product{products.length !== 1 ? 's' : ''}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ hamper }) {
  const rows = [
    { label: 'Price',            value: fmt(hamper.price) },
    { label: 'Status',           value: <StatusBadge status={hamper.status} /> },
    { label: 'Eligibility Type', value: hamper.eligibility_type },
    { label: 'Max Per Customer', value: hamper.max_purchases_per_customer ?? 'Unlimited' },
    { label: 'Edition Size',      value: hamper.total_stock ?? 'Unlimited' },
    { label: 'Stock Remaining',  value: hamper.stock_remaining ?? '—' },
    { label: 'Valid From',       value: hamper.valid_from ? format(new Date(hamper.valid_from), 'dd MMM yyyy') : '—' },
    { label: 'Valid Until',      value: hamper.valid_until ? format(new Date(hamper.valid_until), 'dd MMM yyyy') : '—' },
    { label: 'Created',          value: format(new Date(hamper.created_at), 'dd MMM yyyy, HH:mm') },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ ...card, padding: 20 }}>
        <SectionLabel>Settings</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 20 }}>
        <SectionLabel>Feature Toggles</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Toggle value={hamper.apply_vat}           label="Apply VAT (16%)" />
          <Toggle value={hamper.allow_promo_codes}   label="Allow Promo Codes" />
          <Toggle value={hamper.allow_store_credit}  label="Allow Store Credit" />
          <Toggle value={hamper.earn_loyalty_points} label="Earn Loyalty Points" />
          <Toggle value={hamper.is_visible}          label="Visible to Customers" />
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border-tertiary)' }}>
          <p style={{ ...labelStyle, marginBottom: 10 }}>Accent Color</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: hamper.accent_color, border: '2px solid var(--color-border-tertiary)', boxShadow: `0 0 8px ${hamper.accent_color}50` }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{hamper.accent_color}</span>
          </div>
        </div>

        {hamper.eligible_tiers?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={labelStyle}>Eligible Tiers</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {hamper.eligible_tiers.map(t => (
                <span key={t} style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(168,85,247,0.1)', color: '#7c3aed' }}>{t}</span>
              ))}
            </div>
          </div>
        )}
        {hamper.eligible_customer_types?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={labelStyle}>Eligible Customer Types</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {hamper.eligible_customer_types.map(t => (
                <span key={t} style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Products ─────────────────────────────────────────────────────────────

function ProductsTab({ hamper, onRefresh }) {
  const [showSelector, setShowSelector]     = useState(false);
  const [showQtyModal, setShowQtyModal]     = useState(false);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [suggestions, setSuggestions]       = useState([]);
  const [suggesting, setSuggesting]         = useState(false);
  const [removingId, setRemovingId]         = useState(null);
  const [addingLoading, setAddingLoading]   = useState(false);

  const handleRemove = async (productId) => {
    if (!confirm('Remove this product from the hamper?')) return;
    setRemovingId(productId);
    try {
      await hampersAPI.removeProduct(hamper.id, productId);
      toast.success('Product removed');
      onRefresh();
    } catch { toast.error('Failed to remove product'); }
    finally { setRemovingId(null); }
  };

  // called by ProductSelectorModal with selected products array
  const handleModalSelect = (products) => {
    setShowSelector(false);
    if (!products.length) return;
    setPendingProducts(products);
    setShowQtyModal(true);
  };

  // called by QuantityModal with { productId: qty } map
  const handleConfirmQtys = async (qtys) => {
    setAddingLoading(true);
    setShowQtyModal(false);
    let successCount = 0;
    for (const product of pendingProducts) {
      try {
        await hampersAPI.addProduct(hamper.id, {
          product_id: product.id,
          quantity:   qtys[product.id] ?? 1,
        });
        successCount++;
      } catch (err) {
        toast.error(`Failed to add ${product.name}: ${err?.response?.data?.message || 'error'}`);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} product${successCount !== 1 ? 's' : ''} added`);
      onRefresh();
    }
    setPendingProducts([]);
    setAddingLoading(false);
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const data = await hampersAPI.suggestProducts(hamper.id);
      setSuggestions(Array.isArray(data) ? data : []);
      if (!data.length) toast('No suggestions found', { icon: '🔍' });
    } catch { toast.error('Failed to fetch suggestions'); }
    finally { setSuggesting(false); }
  };

  const handleAddSuggestion = (product) => {
    setPendingProducts([product]);
    setShowQtyModal(true);
  };

  // existing product ids to pass as already-selected to modal
  const existingProductIds = (hamper.items || []).map(i => ({ product_id: i.product_id }));

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PrimaryBtn onClick={() => setShowSelector(true)} disabled={addingLoading}>
            <Plus size={14} /> {addingLoading ? 'Adding…' : 'Add Products'}
          </PrimaryBtn>
          <Btn onClick={handleSuggest} disabled={suggesting}>
            <Lightbulb size={14} /> {suggesting ? 'Loading…' : 'Suggest from Related'}
          </Btn>
        </div>

        {/* Current items */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-tertiary)' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#a855f7' }}>
              Current Items ({hamper.items?.length ?? 0})
            </p>
          </div>
          {!hamper.items?.length ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <Package size={36} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: '0.82rem' }}>No products added yet</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#a855f7' }}>
                  {['Product', 'SKU', 'Qty', 'Snapshot Price', ''].map((h, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hamper.items.map(item => {
                  const snap = item.snapshot || {};
                  return (
                    <tr key={item.id}
                      onMouseEnter={e => e.currentTarget.style.background = '#e3cdf8'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      style={{ transition: 'background 120ms' }}
                    >
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {snap.main_image ? (
                            <img src={snap.main_image} alt={snap.name} style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 7, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Package size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                            </div>
                          )}
                          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{snap.name || `Product #${item.product_id}`}</span>
                        </div>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{snap.sku || '—'}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 700 }}>×{item.quantity}</span></td>
                      <td style={tdStyle}>{snap.price ? fmt(snap.price) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <DangerBtn onClick={() => handleRemove(item.product_id)} disabled={removingId === item.product_id}>
                          <Trash2 size={13} /> {removingId === item.product_id ? 'Removing…' : 'Remove'}
                        </DangerBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={15} style={{ color: '#f59e0b' }} />
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>Suggested ({suggestions.length})</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Product', 'SKU', 'Price', ''].map((h, i) => <th key={i} style={{ ...thStyle, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {suggestions.map(p => (
                  <tr key={p.id}
                    onMouseEnter={e => e.currentTarget.style.background = '#e3cdf8'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ transition: 'background 120ms' }}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {p.main_image && <img src={p.main_image} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{p.sku || '—'}</span></td>
                    <td style={tdStyle}>{fmt(p.price)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <PrimaryBtn onClick={() => handleAddSuggestion(p)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                        <Plus size={12} /> Add
                      </PrimaryBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product selector modal */}
      {showSelector && (
        <ProductSelectorModalAdmin
          onClose={() => setShowSelector(false)}
          onSelect={handleModalSelect}
          selectedProducts={existingProductIds}
        />
      )}

      {/* Quantity modal */}
      {showQtyModal && pendingProducts.length > 0 && (
        <QuantityModal
          products={pendingProducts}
          onConfirm={handleConfirmQtys}
          onClose={() => { setShowQtyModal(false); setPendingProducts([]); }}
        />
      )}
    </>
  );
}

// ── Tab: Eligibility ──────────────────────────────────────────────────────────

function EligibilityTab({ hamper }) {
  const [rows, setRows]                   = useState([]);
  const [loading, setLoading]             = useState(true);
  const [statusFilter, setStatusFilter]   = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [noteModal, setNoteModal]         = useState(null);
  const [noteText, setNoteText]           = useState('');
  const searchDebounce                    = useRef(null);

  // eligible customers matching tier/type/all criteria
  const [eligibleCustomers, setEligibleCustomers] = useState([]);
  const [eligibleLoading, setEligibleLoading]     = useState(false);

  // checkbox state for bulk-add from matching customers
  const [checkedIds, setCheckedIds]       = useState([]);
  const [bulkAdding, setBulkAdding]       = useState(false);

  // load manual eligibility rows
  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await hampersAPI.listEligibility(hamper.id, { status: statusFilter, per_page: 1000 });
      setRows(res.data ?? res);
    } catch { toast.error('Failed to load eligibility list'); }
    finally { setLoading(false); }
  };

  // load customers matching the hamper's eligibility criteria
  const fetchEligibleCustomers = async () => {
    setEligibleLoading(true);
    try {
      const res = await hampersAPI.listEligibleCustomers(hamper.id, { per_page: 200 });
      setEligibleCustomers(res.data ?? res);
    } catch { /* endpoint may not exist yet */ }
    finally { setEligibleLoading(false); }
  };

  useEffect(() => { fetchRows(); }, [statusFilter]);
  useEffect(() => { fetchEligibleCustomers(); }, [hamper.id, hamper.eligibility_type]);

  const toggleCheck = (id) => {
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleCheckAll = () => {
    if (checkedIds.length === eligibleCustomers.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(eligibleCustomers.map(c => c.id));
    }
  };

  const handleBulkAdd = async () => {
    if (checkedIds.length === 0) return;
    setBulkAdding(true);
    let added = 0;
    for (const customerId of checkedIds) {
      try {
        await hampersAPI.addCustomer(hamper.id, { customer_id: customerId, status: 'active', note: '' });
        added++;
      } catch { /* skip duplicates / errors */ }
    }
    if (added > 0) {
      toast.success(`${added} customer${added !== 1 ? 's' : ''} added to eligibility`);
      fetchRows();
      fetchEligibleCustomers();
    }
    setCheckedIds([]);
    setBulkAdding(false);
  };

  const handleSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(searchDebounce.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await hampersAPI.searchCustomers(hamper.id, q);
        setSearchResults(Array.isArray(res) ? res : []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
  };

  const handleAddCustomer = async (customerId, status = 'active', note = '') => {
    setActionLoading(customerId);
    try {
      await hampersAPI.addCustomer(hamper.id, { customer_id: customerId, status, note });
      toast.success('Customer added');
      setSearchResults([]);
      setSearchQuery('');
      fetchRows();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to add customer'); }
    finally { setActionLoading(null); }
  };

  const handleUpdateStatus = async (customerId, status, note = '') => {
    setActionLoading(customerId);
    try {
      await hampersAPI.updateCustomerStatus(hamper.id, customerId, { status, note });
      toast.success('Status updated');
      fetchRows();
      setNoteModal(null);
      setNoteText('');
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to update status'); }
    finally { setActionLoading(null); }
  };

  const eligIcon = (status) => {
    if (status === 'eligible')    return <CheckCircle size={14} style={{ color: '#22c55e' }} />;
    if (status === 'blacklisted') return <Shield size={14} style={{ color: '#ef4444' }} />;
    if (status === 'suspended')   return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />;
    return null;
  };

  // criteria summary at top
  const criteriaSummary = () => {
    if (hamper.eligibility_type === 'all')     return 'All customers are eligible.';
    if (hamper.eligibility_type === 'manual')  return 'Eligibility is managed manually — only customers added below can access this hamper.';
    if (hamper.eligibility_type === 'tier')    return `Customers in tiers: ${(hamper.eligible_tiers || []).join(', ') || 'none set'}.`;
    if (hamper.eligibility_type === 'customer_type') return `Customer types: ${(hamper.eligible_customer_types || []).join(', ') || 'none set'}.`;
    return '';
  };

  const filteredRows = statusFilter
    ? rows.filter(r => r.status === statusFilter)
    : rows;

  const matchingLabel = hamper.eligibility_type === 'manual' ? 'Available Customers' : 'Matching Customers';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Criteria banner */}
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)', fontSize: '0.82rem', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Shield size={14} style={{ flexShrink: 0 }} />
        <span><strong>{hamper.eligibility_type?.toUpperCase()}</strong> — {criteriaSummary()}</span>
      </div>

      {/* ── Selected customers (Eligibility Records) ── */}
      <div style={{ ...card }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ margin: 0, flex: 1, fontSize: '0.82rem', fontWeight: 700, color: '#a855f7' }}>
            Eligibility Records ({filteredRows.length})
          </p>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '6px 10px', cursor: 'pointer', color: '#111827' }}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.82rem' }}>Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <Users size={36} style={{ display: 'block', margin: '0 auto 10px', color: 'var(--color-text-tertiary)', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>No eligibility records</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Customer', 'Status', 'Note', 'Added By', 'Actions'].map((h, i) => (
                  <th key={i} style={{ ...thStyle, textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#e3cdf8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ transition: 'background 120ms' }}
                >
                  <td style={tdStyle}>
                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.82rem' }}>{row.customer?.name}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{row.customer?.email}</p>
                  </td>
                  <td style={tdStyle}><StatusBadge status={row.status} /></td>
                  <td style={tdStyle}><span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{row.note || '—'}</span></td>
                  <td style={tdStyle}><span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{row.added_by?.name || '—'}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {row.status !== 'active' && (
                        <Btn onClick={() => setNoteModal({ customerId: row.customer_id, action: 'active', name: row.customer?.name })} disabled={actionLoading === row.customer_id}
                          style={{ padding: '5px 10px', fontSize: '0.72rem', color: '#22c55e', borderColor: '#22c55e' }}>
                          <CheckCircle size={11} /> Activate
                        </Btn>
                      )}
                      {row.status === 'active' && (
                        <Btn onClick={() => setNoteModal({ customerId: row.customer_id, action: 'suspended', name: row.customer?.name })} disabled={actionLoading === row.customer_id}
                          style={{ padding: '5px 10px', fontSize: '0.72rem', color: '#f59e0b', borderColor: '#f59e0b' }}>
                          <AlertTriangle size={11} /> Suspend
                        </Btn>
                      )}
                      {row.status !== 'blacklisted' && (
                        <DangerBtn onClick={() => setNoteModal({ customerId: row.customer_id, action: 'blacklisted', name: row.customer?.name })} disabled={actionLoading === row.customer_id}>
                          <Shield size={11} /> Blacklist
                        </DangerBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Search to add ── */}
      <div style={{ ...card, padding: 20 }}>
        <SectionLabel>Add Customer to Eligibility List</SectionLabel>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
          <input
            type="text" value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{ ...inputStyle, paddingLeft: 32 }}
          />
        </div>

        {(searching || searchResults.length > 0) && (
          <div style={{ marginTop: 10, border: '1px solid var(--color-border-tertiary)', borderRadius: 8, overflow: 'hidden' }}>
            {searching ? (
              <div style={{ padding: '12px 16px', fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>Searching…</div>
            ) : searchResults.map(c => {
              const elig = c.eligibility || {};
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>{c.name}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{c.email}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {eligIcon(elig.status)}
                    <span style={{ fontSize: '0.72rem', color: elig.is_blocked ? '#ef4444' : 'var(--color-text-secondary)', fontWeight: 600 }}>{elig.message}</span>
                  </div>
                  {!elig.is_blocked && (
                    <PrimaryBtn onClick={() => handleAddCustomer(c.id)} disabled={actionLoading === c.id} style={{ padding: '5px 10px', fontSize: '0.72rem' }}>
                      <Plus size={11} /> Add
                    </PrimaryBtn>
                  )}
                  {elig.status === 'blacklisted' && (
                    <Btn onClick={() => setNoteModal({ customerId: c.id, action: 'active', name: c.name })} style={{ padding: '5px 10px', fontSize: '0.72rem', color: '#22c55e', borderColor: '#22c55e' }}>
                      <RefreshCw size={11} /> Reactivate
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Available / Matching Customers ── */}
      <div style={{ ...card }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ margin: 0, flex: 1, fontSize: '0.82rem', fontWeight: 700, color: '#a855f7' }}>
            {matchingLabel} ({eligibleCustomers.length})
          </p>
          {checkedIds.length > 0 && (
            <PrimaryBtn onClick={handleBulkAdd} disabled={bulkAdding} style={{ padding: '6px 12px', fontSize: '0.72rem' }}>
              <Plus size={12} /> {bulkAdding ? 'Adding…' : `Add ${checkedIds.length} to Eligibility`}
            </PrimaryBtn>
          )}
        </div>
        {eligibleLoading ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#a855f7', fontSize: '0.82rem' }}>Loading…</div>
        ) : eligibleCustomers.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <Users size={36} style={{ display: 'block', margin: '0 auto 10px', color: '#a855f7', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#c51d07' }}>No customers match this criteria</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>
                    <input type="checkbox" checked={checkedIds.length === eligibleCustomers.length && eligibleCustomers.length > 0} onChange={toggleCheckAll}
                      style={{ cursor: 'pointer', accentColor: '#7c3aed' }} />
                  </th>
                  {['Customer', 'Tier', 'Type', 'Status', ''].map((h, i) => (
                    <th key={i} style={{ ...thStyle, textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eligibleCustomers.map(c => (
                  <tr key={c.id}
                    onMouseEnter={e => e.currentTarget.style.background = '#e3cdf8'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ transition: 'background 120ms' }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'center', width: 40 }}>
                      <input type="checkbox" checked={checkedIds.includes(c.id)} onChange={() => toggleCheck(c.id)}
                        style={{ cursor: 'pointer', accentColor: '#7c3aed' }} />
                    </td>
                    <td style={tdStyle}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.82rem', color: '#a855f7' }}>{c.full_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{c.email}</p>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{c.tier || '—'}</span></td>
                    <td style={tdStyle}><span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{c.customer_type || '—'}</span></td>
                    <td style={tdStyle}><StatusBadge status={c.status || 'active'} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <PrimaryBtn onClick={() => handleAddCustomer(c.id)} disabled={actionLoading === c.id} style={{ padding: '5px 10px', fontSize: '0.72rem' }}>
                        <Plus size={11} /> Add
                      </PrimaryBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note modal */}
      {noteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}
          onClick={() => { setNoteModal(null); setNoteText(''); }}>
          <div style={{ ...card, width: '100%', maxWidth: 420, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>
              {noteModal.action === 'active' ? 'Activate' : noteModal.action} Customer
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{noteModal.name}</p>
            <label style={labelStyle}>Note (optional)</label>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Reason for this action…" rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn onClick={() => { setNoteModal(null); setNoteText(''); }}>Cancel</Btn>
              <PrimaryBtn onClick={() => handleUpdateStatus(noteModal.customerId, noteModal.action, noteText)} loading={actionLoading === noteModal.customerId}>
                Confirm
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Orders ───────────────────────────────────────────────────────────────

function OrdersTab({ hamper }) {
  const [orders, setOrders]         = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]       = useState(true);

  const fetchOrders = async (page = 1) => {
    setLoading(true);
    try {
      const res = await hampersAPI.getHamperOrders(hamper.id, { page, per_page: 20 });
      setOrders(res.data ?? res);
      setPagination(res.meta ?? res.pagination ?? null);
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.82rem' }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <ShoppingBag size={40} style={{ display: 'block', margin: '0 auto 12px', color: 'var(--color-text-tertiary)', opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>No orders yet</p>
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Order #', 'Customer', 'Total', 'Status', 'Date'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#e3cdf8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  style={{ transition: 'background 120ms' }}
                >
                  <td style={tdStyle} onClick={() => navigate(`/admin/hampers/orders/${order.id}`)}><span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed' }}>{order.order_number}</span></td>
                  <td style={tdStyle} onClick={() => navigate(`/admin/hampers/orders/${order.id}`)}>
                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.82rem', color: '#a855f7' }}>{order.customer?.name || `${order.customer?.first_name} ${order.customer?.last_name}`}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{order.customer?.email}</p>
                  </td>
                  <td style={tdStyle} onClick={() => navigate(`/admin/hampers/orders/${order.id}`)}><span style={{ fontWeight: 700 }}>{fmt(order.total)}</span></td>
                  <td style={tdStyle} onClick={() => navigate(`/admin/hampers/orders/${order.id}`)}><StatusBadge status={order.status} /></td>
                  <td style={tdStyle} onClick={() => navigate(`/admin/hampers/orders/${order.id}`)}><span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{format(new Date(order.created_at), 'dd MMM yyyy')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination && pagination.last_page > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Page {pagination.current_page} of {pagination.last_page}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => fetchOrders(pagination.current_page - 1)} disabled={pagination.current_page === 1}>← Prev</Btn>
                <Btn onClick={() => fetchOrders(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page}>Next →</Btn>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',    label: 'Overview',    icon: Settings },
  { key: 'products',    label: 'Products',    icon: Package },
  { key: 'eligibility', label: 'Eligibility', icon: Users },
  { key: 'orders',      label: 'Orders',      icon: ShoppingBag },
];

export default function AdminHamperDetail() {
  const { id }              = useParams();
  const navigate            = useNavigate();
  const [hamper, setHamper] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [deleting, setDeleting]   = useState(false);

  const fetchHamper = async () => {
    try {
      const data = await hampersAPI.getHamper(id);
      setHamper(data);
    } catch {
      toast.error('Failed to load hamper');
      navigate('/admin/hampers');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchHamper(); }, [id]);

  const handleDelete = async () => {
    if (!confirm(`Delete "${hamper.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await hampersAPI.deleteHamper(id);
      toast.success('Hamper deleted');
      navigate('/admin/hampers');
    } catch { toast.error('Failed to delete'); setDeleting(false); }
  };

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  if (!hamper) return null;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>

        {/* Back */}
        <button onClick={() => navigate('/admin/hampers')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
          <ChevronLeft size={15} /> Back to Hampers
        </button>

        {/* Header */}
        <div style={{ ...card, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: `2px solid ${hamper.accent_color}40`, background: `${hamper.accent_color}10` }}>
              {hamper.cover_image ? (
                <img src={hamper.cover_image} alt={hamper.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={28} style={{ color: hamper.accent_color, opacity: 0.4 }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: 'var(--color-text-primary)' }}>{hamper.name}</h1>
                <StatusBadge status={hamper.status} />
                {hamper.is_sold_out && <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>SOLD OUT</span>}
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                {fmt(hamper.price)} · {hamper.items?.length ?? 0} items · {hamper.eligibility_type} eligibility
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={() => navigate(`/admin/hampers/${id}/edit`)}>
                <Edit2 size={14} /> Edit
              </Btn>
              <DangerBtn onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </DangerBtn>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border-tertiary)' }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', fontSize: '0.82rem', fontWeight: active ? 700 : 500,
                color: active ? '#7c3aed' : 'var(--color-text-secondary)',
                background: 'none', border: 'none',
                borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'color 150ms',
                marginBottom: -1,
              }}>
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'overview'    && <OverviewTab hamper={hamper} />}
        {activeTab === 'products'    && <ProductsTab hamper={hamper} onRefresh={fetchHamper} />}
        {activeTab === 'eligibility' && <EligibilityTab hamper={hamper} />}
        {activeTab === 'orders'      && <OrdersTab hamper={hamper} />}

      </div>
    </AdminLayout>
  );
}
