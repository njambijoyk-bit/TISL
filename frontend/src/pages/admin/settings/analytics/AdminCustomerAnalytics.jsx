import { useState, useEffect } from 'react';
import {
  Search, ShoppingCart, Heart, FileText, Activity, Eye,
  Clock, Package, ChevronRight, User, Star, CreditCard,
  TrendingUp, AlertTriangle, Mail, Phone, Calendar, Zap,
  BookMarked, Flag, Trash2, Tag, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../../../../api/axios';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n) => Number(n || 0).toLocaleString();
const fmtKES = (n) => `KES ${Number(n || 0).toLocaleString()}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Tier config ───────────────────────────────────────────────────────────────
const TIER = {
  gold:     { bg: 'rgba(245,158,11,0.1)',  color: '#d97706', label: 'Gold'     },
  silver:   { bg: 'rgba(156,163,175,0.15)', color: '#6b7280', label: 'Silver'   },
  bronze:   { bg: 'rgba(180,83,9,0.1)',    color: '#b45309', label: 'Bronze'    },
  standard: { bg: 'rgba(168,85,247,0.1)',  color: '#a855f7', label: 'Standard'  },
};

// ── Event type icon/color map ─────────────────────────────────────────────────
const EVENT_META = {
  search:            { color: '#3b82f6', label: 'Search'        },
  product_not_found: { color: '#ef4444', label: 'No Results'    },
  product_view:      { color: '#10b981', label: 'Viewed'        },
  service_view:      { color: '#06b6d4', label: 'Service View'  },
  add_to_cart:       { color: '#f59e0b', label: 'Added to Cart' },
  add_to_wishlist:   { color: '#ec4899', label: 'Wishlisted'    },
  add_to_quotelist:  { color: '#8b5cf6', label: 'Quoted'        },
  filter:            { color: '#a855f7', label: 'Filter'        },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 14, radius = 6 }) {
  return (
    <div style={{ width: w, height: h, background: '#f3f4f6', borderRadius: radius, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = '#a855f7' }) {
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '16px 18px',
      border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }} className="dark:bg-gray-800 dark:border-gray-700">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', lineHeight: 1 }} className="dark:text-white">{value}</div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, action, noPad }) {
  return (
    <div style={{
      background: 'white', borderRadius: 16, border: '1px solid #f3f4f6',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
    }} className="dark:bg-gray-800 dark:border-gray-700">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid #f3f4f6' }} className="dark:border-gray-700">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {Icon && <Icon size={14} style={{ color: '#a855f7' }} />}
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827' }} className="dark:text-white">{title}</span>
        </div>
        {action}
      </div>
      {noPad ? children : <div style={{ padding: '16px 18px' }}>{children}</div>}
    </div>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = '#a855f7' }) {
  const w = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', minWidth: 40 }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 500ms ease' }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminCustomerAnalytics({ customerId, from, to, onSessionClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [note, setNote]               = useState(null);      // live note object {note, updated_at}
  const [savedNotes, setSavedNotes]   = useState([]);        // admin snapshots
  const [noteLoading, setNoteLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [tagInput, setTagInput]       = useState('');
  const [savedOpen, setSavedOpen]     = useState(false);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    api.get(`/admin/analytics/customers/${customerId}`, { params: { from, to } })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId, from, to]);

  useEffect(() => {
    if (!customerId) return;
    setNoteLoading(true);
    Promise.all([
      api.get(`/admin/customers/${customerId}/note`),
      api.get(`/admin/customers/${customerId}/note/saved`),
    ])
      .then(([noteRes, savedRes]) => {
        setNote(noteRes.data);
        setSavedNotes(savedRes.data.snapshots ?? []);
      })
      .catch(() => {})
      .finally(() => setNoteLoading(false));
  }, [customerId]);

  const handleSaveSnapshot = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/admin/customers/${customerId}/note/save`, {
        internal_tag: tagInput.trim() || null,
      });
      if (res.data.success) {
        // reload snapshots
        const saved = await api.get(`/admin/customers/${customerId}/note/saved`);
        setSavedNotes(saved.data.snapshots ?? []);
        setTagInput('');
      }
    } catch {}
    setSaving(false);
  };

  const handleDeleteSnapshot = async (snapshotId) => {
    try {
      await api.delete(`/admin/customers/${customerId}/note/saved/${snapshotId}`);
      setSavedNotes(prev => prev.filter(s => s.id !== snapshotId));
    } catch {}
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <Skeleton w={64} h={64} radius={16} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w="40%" h={20} />
            <Skeleton w="30%" h={14} />
            <Skeleton w="50%" h={12} />
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, padding: 18, border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton w="60%" /><Skeleton w="40%" h={28} />
          </div>
        ))}
      </div>
    </div>
  );

  if (!data?.customer) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
      Customer not found
    </div>
  );

  const { customer: c, analytics: a, sessions, top_queries, product_activity } = data;
  const tier = TIER[c.tier] || TIER.standard;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Profile card ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'white', borderRadius: 16, padding: 22,
        border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }} className="dark:bg-gray-800 dark:border-gray-700">
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Avatar */}
          <div style={{
            width: 62, height: 62, borderRadius: 16, flexShrink: 0,
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>
              {(c.first_name || '?')[0]}{(c.last_name || '')[0]}
            </span>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: 0 }} className="dark:text-white">
                {c.first_name} {c.last_name}
              </h2>
              <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, textTransform: 'capitalize', background: tier.bg, color: tier.color }}>
                {tier.label}
              </span>
              <span style={{
                padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, textTransform: 'capitalize',
                background: c.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: c.status === 'active' ? '#10b981' : '#ef4444',
              }}>{c.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Mail size={11} /> {c.email}
              </span>
              {c.phone && (
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={11} /> {c.phone}
                </span>
              )}
              <span style={{ fontSize: '0.72rem', color: '#c084fc', fontFamily: 'monospace', fontWeight: 600 }}>
                {c.customer_number}
              </span>
            </div>
          </div>

          {/* Right stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, flexShrink: 0 }}>
            {[
              { label: 'Total Orders', value: fmt(c.total_orders), color: '#3b82f6' },
              { label: 'Total Spent',  value: fmtKES(c.total_spent), color: '#10b981' },
              { label: 'Loyalty Pts',  value: fmt(c.loyalty_points), color: '#f59e0b' },
              { label: 'Store Credit', value: fmtKES(c.store_credit), color: '#a855f7' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color }} className="dark:text-white">{value}</div>
                <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cart / Wishlist / Quote badges */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { icon: ShoppingCart, label: 'Cart Items',     value: c.cart_items,      color: '#f59e0b', updated: c.cart_updated_at },
            { icon: Heart,        label: 'Wishlist',        value: c.wishlist_count,  color: '#ec4899', updated: c.wishlist_updated_at },
            { icon: FileText,     label: 'Quote List',      value: c.quotelist_items, color: '#8b5cf6', updated: c.quotelist_updated_at },
          ].map(({ icon: Icon, label, value, color, updated }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
              background: `${color}10`, borderRadius: 10, border: `1px solid ${color}20`,
            }}>
              <Icon size={13} style={{ color }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{label}</span>
              {updated && (
                <span style={{ fontSize: '0.65rem', color: '#d1d5db' }}>· {fmtDate(updated)}</span>
              )}
            </div>
          ))}
          {c.last_order_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f9fafb', borderRadius: 10, border: '1px solid #f3f4f6' }}>
              <Calendar size={12} style={{ color: '#9ca3af' }} />
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Last order: {fmtDate(c.last_order_date)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Analytics stat cards ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
        <StatCard icon={Activity}     label="Sessions"      value={fmt(a?.total_sessions)} color="#a855f7" />
        <StatCard icon={Search}       label="Searches"      value={fmt(a?.searches)}       color="#3b82f6" />
        <StatCard icon={Eye}          label="Product Views" value={fmt(a?.product_views)}  color="#10b981" />
        <StatCard icon={ShoppingCart} label="Cart Adds"     value={fmt(a?.cart_adds)}      color="#f59e0b" />
        <StatCard icon={Heart}        label="Wishlisted"    value={fmt(a?.wishlist_adds)}  color="#ec4899" />
        <StatCard icon={AlertTriangle} label="No Results"   value={fmt(a?.zero_results)}   color="#ef4444" />
      </div>

      {/* ── Top queries + Product activity ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Top queries */}
        <Section title="What They Search" icon={Search} noPad>
          {top_queries?.length ? (
            <div>
              {top_queries.map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: '1px solid #f9fafb' }} className="dark:border-gray-700">
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#a855f7', width: 18, flexShrink: 0 }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="dark:text-white">
                    {row.query}
                  </span>
                  <MiniBar value={row.times} max={top_queries[0]?.times || 1} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280' }}>{row.times}×</span>
                    {row.times_not_found > 0 && (
                      <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700 }}>
                        {row.times_not_found} miss
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ padding: '16px 18px', color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>No search activity in this period</p>
          )}
        </Section>

        {/* Product activity */}
        <Section title="Products They Engaged" icon={Package} noPad>
          {product_activity?.length ? (
            <div>
              {product_activity.slice(0, 12).map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid #f9fafb' }} className="dark:border-gray-700">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="dark:text-white">
                      {row.entity_name || `Product #${row.entity_id}`}
                    </p>
                    {row.entity_sku && (
                      <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>{row.entity_sku}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span title="Views"    style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>👁 {row.views}</span>
                    {row.cart_adds > 0     && <span title="Cart"     style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700 }}>🛒 {row.cart_adds}</span>}
                    {row.wishlist_adds > 0 && <span title="Wishlist" style={{ fontSize: '0.68rem', color: '#ec4899', fontWeight: 700 }}>♥ {row.wishlist_adds}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ padding: '16px 18px', color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>No product activity in this period</p>
          )}
        </Section>
      </div>

      {/* ── Sessions list ─────────────────────────────────────────────────── */}
      <Section
        title={`Sessions in Period (${sessions?.length || 0})`}
        icon={Activity}
        noPad
        action={
          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
            {a?.first_event ? `${fmtDate(a.first_event)} — ${fmtDate(a.last_event)}` : ''}
          </span>
        }>
        {sessions?.length ? (
          <div>
            {sessions.map((s, i) => {
              const duration = s.last_event_at && s.started_at
                ? Math.round((new Date(s.last_event_at) - new Date(s.started_at)) / 60000)
                : 0;
              return (
                <div
                  key={i}
                  onClick={() => onSessionClick?.(s.session_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}
                  className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:border-gray-700">

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#a855f7', fontWeight: 600 }}>
                        {s.session_id.slice(0, 16)}…
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{fmtTime(s.started_at)}</span>
                    </div>
                    {s.queries_in_session && (
                      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Searched: {s.queries_in_session}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{s.events} events</span>
                    {s.searches > 0     && <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 700 }}>{s.searches} search</span>}
                    {s.cart_adds > 0    && <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>{s.cart_adds} cart</span>}
                    <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{duration > 0 ? `${duration}m` : '<1m'}</span>
                  </div>

                  <ChevronRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ padding: '16px 18px', color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>No sessions in this period</p>
        )}
      </Section>
      {/* ── Bookmark Note ────────────────────────────────────────────────── */}
      <Section title="Bookmark Note" icon={BookMarked}
        action={
          note?.note && (
            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
              updated {fmtDate(note.updated_at)}
            </span>
          )
        }>
        {noteLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w="100%" h={80} radius={10} />
            <Skeleton w="40%" h={12} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* live note — only if active */}
            {note?.note ? (
              <>
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(168,85,247,0.04)',
                  border: '1px solid rgba(168,85,247,0.15)',
                  borderRadius: 10,
                  fontSize: '0.82rem', lineHeight: 1.65,
                  color: '#374151', fontFamily: 'Georgia, serif',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {note.note}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Tag size={11} style={{
                      position: 'absolute', left: 10, top: '50%',
                      transform: 'translateY(-50%)', color: '#a855f7', opacity: 0.5,
                    }} />
                    <input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      placeholder="tag (optional)"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        paddingLeft: 28, paddingRight: 10,
                        height: 34, borderRadius: 8,
                        border: '1px solid rgba(168,85,247,0.2)',
                        background: 'rgba(168,85,247,0.04)',
                        fontSize: '0.78rem', color: '#374151', outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSaveSnapshot}
                    disabled={saving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0 14px', height: 34, borderRadius: 8, border: 'none',
                      background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                    }}
                  >
                    <Flag size={11} strokeWidth={2.5} />
                    {saving ? 'saving…' : 'flag & save'}
                  </button>
                </div>
              </>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0, fontStyle: 'italic' }}>
                Customer has no active note.
              </p>
            )}

            {/* saved snapshots — always visible regardless of live note */}
            {savedNotes.length > 0 && (
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
                <button
                  onClick={() => setSavedOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 0', marginBottom: savedOpen ? 10 : 0,
                  }}
                >
                  {savedOpen ? <ChevronUp size={12} color="#a855f7" /> : <ChevronDown size={12} color="#a855f7" />}
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a855f7' }}>
                    {savedNotes.length} saved snapshot{savedNotes.length > 1 ? 's' : ''}
                  </span>
                </button>

                {savedOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {savedNotes.map(s => (
                      <div key={s.id} style={{
                        padding: '10px 12px', background: '#fafafa',
                        border: '1px solid #f3f4f6', borderRadius: 10,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            {s.internal_tag && (
                              <span style={{
                                display: 'inline-block', marginBottom: 6,
                                fontSize: '0.65rem', fontWeight: 700,
                                padding: '2px 7px', borderRadius: 99,
                                background: 'rgba(168,85,247,0.1)', color: '#a855f7',
                                border: '1px solid rgba(168,85,247,0.2)',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                              }}>
                                {s.internal_tag}
                              </span>
                            )}
                            <p style={{
                              margin: 0, fontSize: '0.78rem', lineHeight: 1.6,
                              color: '#374151', fontFamily: 'Georgia, serif',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                              {s.note_snapshot}
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: '0.65rem', color: '#9ca3af' }}>
                              saved by {s.admin_name} · {fmtDate(s.saved_at)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteSnapshot(s.id)}
                            title="Remove snapshot"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#d1d5db', padding: 4, borderRadius: 6, flexShrink: 0,
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#d1d5db'}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </Section>
    </div>
  );
}