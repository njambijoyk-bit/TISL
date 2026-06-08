/**
 * CatalogueBoostPage
 *
 * Inline boost content management for algorithm_bonus_content.
 * Products tab + Services tab, debounced search, category filter,
 * per-row dirty state, save/remove per row, bulk overlay spinner.
 *
 * Route: /admin/algorithm/catalogue-boosts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../store';
import AdminLayout from '../../../components/layout/AdminLayout';
import { Package, Wrench, Search, X, Save, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

const API      = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const PER_PAGE = 50;

const BADGE_OPTIONS = [
  { value: 'promo',        label: 'Promo',        color: '#f97316' },
  { value: 'social_proof', label: 'Social Proof', color: '#3b82f6' },
  { value: 'bundle',       label: 'Bundle',       color: '#8b5cf6' },
  { value: 'urgency',      label: 'Urgency',      color: '#ef4444' },
  { value: 'tip',          label: 'Tip',          color: '#10b981' },
];

const badgeMeta = (val) => BADGE_OPTIONS.find(b => b.value === val) ?? BADGE_OPTIONS[4];

// ── Helpers ────────────────────────────────────────────────────────────────────
function unwrap(res) {
  if (Array.isArray(res?.data?.data)) return { items: res.data.data, meta: res.data };
  if (Array.isArray(res?.data))       return { items: res.data,      meta: res       };
  return { items: [], meta: null };
}

function PageBtn({ label, icon: Icon, active, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      border: '1px solid rgba(168,85,247,0.3)',
      boxShadow: '0 0 6px rgba(124,58,237,0.2)',
      background: active ? '#7c3aed' : 'var(--bg-primary,#fff)',
      color: active ? '#fff' : disabled ? '#9ca3af' : 'var(--text-primary,#111)',
      fontWeight: active ? 700 : 400, opacity: disabled ? 0.45 : 1,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {Icon && <Icon size={12} />}{label}
    </button>
  );
}

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7',
      animation: 'cbSpin 600ms linear infinite', display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ── Row component ──────────────────────────────────────────────────────────────
function BoostRow({ row, dirty, onEdit, onSave, onRemove, saving, th, td }) {
  const isDirty   = !!dirty;
  const hasBoost  = row.boost_id != null;
  const draft     = dirty ?? {};

  const message    = draft.boost_message    ?? row.boost_message    ?? '';
  const badgeType  = draft.badge_type       ?? row.badge_type       ?? 'tip';
  const isActive   = draft.boost_active     !== undefined
                       ? draft.boost_active
                       : (row.boost_active  ?? true);

  const badge = badgeMeta(badgeType);

  const inputBase = {
    padding: '6px 10px', borderRadius: 7, fontSize: 12,
    border: `1px solid ${isDirty ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.2)'}`,
    background: isDirty ? 'rgba(168,85,247,0.04)' : 'var(--bg-primary,#fff)',
    color: 'var(--text-primary,#111)', outline: 'none',
    transition: 'border-color 0.15s',
  };

  return (
    <tr style={{ background: isDirty ? 'rgba(168,85,247,0.04)' : 'transparent', transition: 'background 0.2s' }}
        className="cb-row">
      {/* Entity */}
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {row.main_image ? (
            <img src={row.main_image} alt="" style={{ width: 36, height: 36, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(168,85,247,0.15)' }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 7, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {row.entity_type === 'service' ? <Wrench size={14} color="#a855f7" /> : <Package size={14} color="#a855f7" />}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary,#111)' }}>{row.name}</div>
            {row.category_name && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)', marginTop: 2 }}>{row.category_name}</div>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td style={td}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          background: row.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
          color: row.status === 'active' ? '#10b981' : '#6b7280',
        }}>{row.status}</span>
      </td>

      {/* Boost message */}
      <td style={{ ...td, minWidth: 240 }}>
        {hasBoost || isDirty ? (
          <input
            value={message}
            onChange={e => onEdit(row.id, row.entity_type, 'boost_message', e.target.value)}
            placeholder="Enter boost message…"
            style={{ ...inputBase, width: '100%', boxSizing: 'border-box' }}
          />
        ) : (
          <button
            onClick={() => onEdit(row.id, row.entity_type, 'boost_message', '')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 7, border: '1px dashed rgba(168,85,247,0.35)',
              background: 'transparent', color: '#a855f7', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            <Plus size={12} /> Add Boost
          </button>
        )}
      </td>

      {/* Badge type */}
      <td style={td}>
        {(hasBoost || isDirty) && (
          <select
            value={badgeType}
            onChange={e => onEdit(row.id, row.entity_type, 'badge_type', e.target.value)}
            style={{
              ...inputBase, padding: '5px 8px', cursor: 'pointer',
              color: badge.color, fontWeight: 700,
            }}
          >
            {BADGE_OPTIONS.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        )}
      </td>

      {/* Active toggle */}
      <td style={{ ...td, textAlign: 'center' }}>
        {(hasBoost || isDirty) && (
          <div
            onClick={() => onEdit(row.id, row.entity_type, 'boost_active', !isActive)}
            style={{
              width: 38, height: 22, borderRadius: 11, margin: '0 auto',
              background: isActive ? '#a855f7' : 'rgba(168,85,247,0.15)',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: isActive ? 19 : 3,
              width: 16, height: 16, borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }} />
          </div>
        )}
      </td>

      {/* Actions */}
      <td style={{ ...td, textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
          {isDirty && (
            <button
              onClick={() => onSave(row.id, row.entity_type)}
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 7, border: 'none',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}>
              {saving ? <Spinner size={12} /> : <Save size={12} />}
              Save
            </button>
          )}
          {hasBoost && !isDirty && (
            <button
              onClick={() => onRemove(row.id, row.entity_type)}
              disabled={saving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 7,
                border: '1px solid rgba(239,68,68,0.25)',
                background: 'rgba(239,68,68,0.07)',
                color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              }}>
              <Trash2 size={11} /> Remove
            </button>
          )}
          {isDirty && (
            <button
              onClick={() => onEdit(row.id, row.entity_type, '__reset__', null)}
              style={{
                padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(107,114,128,0.2)',
                background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer',
              }}>
              <X size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CatalogueBoostPage() {
  const { token } = useAuthStore();
  const headers   = { Authorization: `Bearer ${token}` };

  const [entityType, setEntityType] = useState('product');
  const [rows,       setRows]       = useState([]);
  const [meta,       setMeta]       = useState(null);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [categories, setCategories] = useState([]);

  // dirty[`${entityType}:${id}`] = { boost_message, badge_type, boost_active }
  const [dirty,      setDirty]      = useState({});
  // saving set of keys currently being saved
  const [saving,     setSaving]     = useState(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  const searchTimer = useRef(null);

  // ── Load categories once ────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${API}/categories`, { headers })
      .then(r => setCategories(r.data?.data ?? r.data ?? []))
      .catch(() => {});
  }, []);

  // ── Fetch rows ──────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (pg = 1, overrides = {}) => {
    setLoading(true);
    try {
      const params = {
        entity_type: entityType,
        page:        pg,
        per_page:    PER_PAGE,
        search:      overrides.search      !== undefined ? overrides.search      : search,
        category_id: overrides.category_id !== undefined ? overrides.category_id : catFilter || undefined,
      };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

      const res = await axios.get(`${API}/admin/algorithm/catalogue-boosts`, { headers, params });
      const { items, meta: m } = unwrap(res);
      setRows(items);
      setMeta(m);
      setPage(pg);
      setDirty({});
    } catch {
      toast.error('Failed to load items.');
    } finally {
      setLoading(false);
    }
  }, [entityType, search, catFilter, token]);

  useEffect(() => { fetchRows(1); }, [entityType]);

  // ── Search ──────────────────────────────────────────────────────────────────
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchRows(1, { search: val }), 300);
  };

  // ── Inline edit ────────────────────────────────────────────────────────────
  const handleEdit = (id, type, field, value) => {
    const key = `${type}:${id}`;
    if (field === '__reset__') {
      setDirty(d => { const n = { ...d }; delete n[key]; return n; });
      return;
    }
    setDirty(d => {
      const existing = d[key] ?? {};
      // seed from current row so we have all fields for upsert
      const row = rows.find(r => r.id === id);
      return {
        ...d,
        [key]: {
          boost_message: row?.boost_message ?? '',
          badge_type:    row?.badge_type    ?? 'tip',
          boost_active:  row?.boost_active  ?? true,
          ...existing,
          [field]: value,
        },
      };
    });
  };

  // ── Save row ────────────────────────────────────────────────────────────────
  const handleSave = async (id, type) => {
    const key     = `${type}:${id}`;
    const payload = dirty[key];
    if (!payload) return;
    if (!payload.boost_message?.trim()) return toast.error('Message cannot be empty.');

    setSaving(s => new Set(s).add(key));
    try {
      await axios.put(
        `${API}/admin/algorithm/catalogue-boosts/${type}/${id}`,
        { message: payload.boost_message, badge_type: payload.badge_type, is_active: payload.boost_active ? 1 : 0 },
        { headers }
      );
      // Merge into row
      setRows(prev => prev.map(r => r.id === id && r.entity_type === type
        ? { ...r, boost_id: r.boost_id ?? -1, boost_message: payload.boost_message, badge_type: payload.badge_type, boost_active: payload.boost_active }
        : r
      ));
      setDirty(d => { const n = { ...d }; delete n[key]; return n; });
      toast.success('Boost saved.');
    } catch {
      toast.error('Failed to save boost.');
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  // ── Remove boost ────────────────────────────────────────────────────────────
  const handleRemove = async (id, type) => {
    const key = `${type}:${id}`;
    setSaving(s => new Set(s).add(key));
    try {
      await axios.delete(`${API}/admin/algorithm/catalogue-boosts/${type}/${id}`, { headers });
      setRows(prev => prev.map(r => r.id === id && r.entity_type === type
        ? { ...r, boost_id: null, boost_message: null, badge_type: null, boost_active: null }
        : r
      ));
      toast.success('Boost removed.');
    } catch {
      toast.error('Failed to remove boost.');
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  // ── Save all dirty ───────────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    const entries = Object.entries(dirty);
    if (!entries.length) return;
    setBulkSaving(true);
    let ok = 0, fail = 0;
    await Promise.all(entries.map(async ([key, payload]) => {
      const [type, idStr] = key.split(':');
      const id = parseInt(idStr);
      if (!payload.boost_message?.trim()) { fail++; return; }
      try {
        await axios.put(
          `${API}/admin/algorithm/catalogue-boosts/${type}/${id}`,
          { message: payload.boost_message, badge_type: payload.badge_type, is_active: payload.boost_active ? 1 : 0 },
          { headers }
        );
        setRows(prev => prev.map(r => r.id === id && r.entity_type === type
          ? { ...r, boost_id: r.boost_id ?? -1, boost_message: payload.boost_message, badge_type: payload.badge_type, boost_active: payload.boost_active }
          : r
        ));
        ok++;
      } catch { fail++; }
    }));
    setDirty({});
    setBulkSaving(false);
    if (fail === 0) toast.success(`${ok} boost${ok !== 1 ? 's' : ''} saved.`);
    else toast.error(`${ok} saved, ${fail} failed.`);
  };

  const dirtyCount = Object.keys(dirty).length;

  // ── Shared cell styles ───────────────────────────────────────────────────────
  const th = {
    padding: '9px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'var(--text-secondary,#6b7280)', textAlign: 'left',
    borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.04)',
  };
  const td = {
    padding: '10px 14px', fontSize: 13, color: 'var(--text-primary,#111)',
    borderBottom: '1px solid rgba(168,85,247,0.06)', verticalAlign: 'middle',
  };

  const inputStyle = {
    padding: '7px 10px', borderRadius: 7, fontSize: 13,
    border: '1px solid rgba(168,85,247,0.3)',
    boxShadow: '0 0 6px rgba(124,58,237,0.2)',
    background: 'var(--bg-primary,#fff)', color: 'var(--text-primary,#111)',
    outline: 'none', boxSizing: 'border-box',
  };

  const lastPage = meta?.last_page ?? 1;

  return (
    <AdminLayout>
      <div style={{ padding: 24, minHeight: '100vh', background: 'var(--bg-primary,#f9fafb)', fontFamily: 'var(--font-body,system-ui,sans-serif)' }}>
        <style>{`
          @keyframes cbSpin { to { transform: rotate(360deg) } }
          .cb-row:hover td { background: rgba(168,85,247,0.025) !important; }
        `}</style>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Link
              to="/admin/algorithm"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem', fontWeight: 600, color: '#a855f7',
                textDecoration: 'none', marginBottom: 12, transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = 0.8}
              onMouseLeave={e => e.currentTarget.style.opacity = 1}
            >
              <ChevronLeft size={16} /> Back to Algorithm
            </Link>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#a855f7' }}>
              Catalogue Boosts
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary,#6b7280)' }}>
              Attach personalised messages and badge types to products and services. Boosted items rank higher in the personalised catalogue.
            </p>
          </div>
          {dirtyCount > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={bulkSaving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: bulkSaving ? 'not-allowed' : 'pointer',
                opacity: bulkSaving ? 0.7 : 1,
              }}>
              {bulkSaving ? <Spinner size={14} /> : <Save size={14} />}
              Save {dirtyCount} Change{dirtyCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* ── Entity type tabs ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: 6, background: 'rgba(168,85,247,0.06)', borderRadius: 12, width: 'fit-content' }}>
          {[
            { key: 'product', label: 'Products', Icon: Package },
            { key: 'service', label: 'Services', Icon: Wrench  },
          ].map(({ key, label, Icon }) => (
            <button key={key} onClick={() => { setEntityType(key); setSearch(''); setCatFilter(''); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: entityType === key ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
                color: entityType === key ? '#fff' : 'var(--text-secondary,#6b7280)',
                transition: 'all 0.2s',
              }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a855f7', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder={`Search ${entityType === 'product' ? 'name or SKU' : 'service name'}…`}
              style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
            />
          </div>

          {/* Category filter (products only) */}
          {entityType === 'product' && categories.length > 0 && (
            <select
              value={catFilter}
              onChange={e => { setCatFilter(e.target.value); fetchRows(1, { category_id: e.target.value }); }}
              style={{ ...inputStyle, cursor: 'pointer', flex: '0 0 180px' }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Clear */}
          {(search || catFilter) && (
            <button
              onClick={() => { setSearch(''); setCatFilter(''); fetchRows(1, { search: '', category_id: '' }); }}
              style={{ ...inputStyle, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#6b7280', fontSize: 12 }}>
              <X size={12} /> Clear
            </button>
          )}

          {/* Stats */}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary,#6b7280)', fontWeight: 600 }}>
            {meta?.total != null && `${meta.total.toLocaleString()} ${entityType}s`}
            {' · '}
            {rows.filter(r => r.boost_id != null).length} boosted
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{
          background: 'var(--bg-secondary,#fff)', borderRadius: 16,
          border: '1px solid rgba(168,85,247,0.12)',
          boxShadow: '0 2px 12px rgba(168,85,247,0.06)', overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Spinner size={32} />
              <span style={{ fontSize: 13, color: '#6b7280' }}>Loading {entityType}s…</span>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>
                {entityType === 'product' ? '📦' : '🔧'}
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No {entityType}s found</div>
              <div style={{ fontSize: 13 }}>Try a different search or clear the filters.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[entityType === 'product' ? 'Product' : 'Service', 'Status', 'Boost Message', 'Badge Type', 'Active', ''].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const key = `${row.entity_type}:${row.id}`;
                    return (
                      <BoostRow
                        key={key}
                        row={row}
                        dirty={dirty[key]}
                        onEdit={handleEdit}
                        onSave={handleSave}
                        onRemove={handleRemove}
                        saving={saving.has(key)}
                        th={th}
                        td={td}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {lastPage > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <PageBtn icon={ChevronLeft}  label="Prev" disabled={page <= 1}        onClick={() => fetchRows(page - 1)} />
            {getPaginationRange(page, lastPage).map((p, i) =>
              p === '...'
                ? <span key={`d${i}`} style={{ padding: '6px 4px', color: '#6b7280', fontSize: 12 }}>…</span>
                : <PageBtn key={p} label={p} active={p === page} onClick={() => fetchRows(p)} />
            )}
            <PageBtn icon={ChevronRight} label="Next" disabled={page >= lastPage} onClick={() => fetchRows(page + 1)} />
          </div>
        )}
      </div>

      {/* ── Bulk save overlay ── */}
      {bulkSaving && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(3px)',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            background: 'var(--bg-primary,#fff)', padding: '28px 40px', borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            border: '1px solid rgba(168,85,247,0.2)',
          }}>
            <Spinner size={32} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary,#111)' }}>Saving boosts…</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Please wait</span>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ── Pagination helper ──────────────────────────────────────────────────────────
function getPaginationRange(current, last) {
  const range = [];
  if (last <= 7) { for (let i = 1; i <= last; i++) range.push(i); return range; }
  range.push(1);
  if (current > 3) range.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(last - 1, current + 1); i++) range.push(i);
  if (current < last - 2) range.push('...');
  range.push(last);
  return range;
}