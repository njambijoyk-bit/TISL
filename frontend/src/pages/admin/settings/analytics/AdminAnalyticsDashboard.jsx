import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Search, ShoppingCart, Heart, FileText,
  Users, Activity, AlertTriangle, Eye, Filter, Calendar,
  ChevronRight, RefreshCw, BarChart2, Zap, Package, Clock
} from 'lucide-react';
import searchAnalyticsImg from '../diagrams/searchanalyticsimg.png';
import SettingsLayout from '../../../../components/layout/SettingsLayout';
import api from '../../../../api/axios';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Date presets ──────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Today',    days: 0  },
  { label: '7 days',   days: 7  },
  { label: '30 days',  days: 30 },
  { label: '90 days',  days: 90 },
];

function getPresetDates(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#a855f7', accent }) {
  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '18px 20px',
      border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }} className="dark:bg-gray-800 dark:border-gray-700">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: accent || `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', lineHeight: 1 }} className="dark:text-white">{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, action }) {
  return (
    <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }} className="dark:bg-gray-800 dark:border-gray-700">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }} className="dark:border-gray-700">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={15} style={{ color: '#a855f7' }} />}
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }} className="dark:text-white">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = '#a855f7' }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 600ms ease' }} />
    </div>
  );
}

// ── Sparkline (simple SVG) ────────────────────────────────────────────────────
function Sparkline({ data, color = '#a855f7' }) {
  if (!data?.length) return null;
  const vals = data.map(d => Number(d.sessions));
  const max = Math.max(...vals, 1);
  const w = 120, h = 32;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [custLoading, setCustLoading] = useState(true);
  const [preset, setPreset] = useState(1); // 7 days default
  const [from, setFrom] = useState(getPresetDates(7).from);
  const [to,   setTo]   = useState(getPresetDates(7).to);
  const [tab, setTab] = useState('overview'); // 'overview' | 'customers' | 'sessions'
  const [devModal,   setDevModal]   = useState(false);
  const [fullscreen, setFullscreen] = useState(false); 

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/analytics/dashboard', { params: { from, to } });
      setData(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [from, to]);

  const loadCustomers = useCallback(async () => {
    setCustLoading(true);
    try {
      const res = await api.get('/admin/analytics/customers', { params: { from, to, per_page: 20 } });
      setCustomers(res.data);
    } catch { /* silent */ }
    finally { setCustLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); loadCustomers(); }, [from, to]);

  const applyPreset = (idx) => {
    setPreset(idx);
    const { from: f, to: t } = getPresetDates(PRESETS[idx].days);
    setFrom(f); setTo(t);
  };

  const t = data?.totals;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SettingsLayout>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a855f7', margin: 0 }} className="dark:text-white">
              Search Analytics
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>
              {data?.period ? `${fmtDate(data.period.from)} — ${fmtDate(data.period.to)}` : 'Loading…'}
            </p>
          </div>

          {/* ── Date controls ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p, i) => (
              <button key={i} type="button" onClick={() => applyPreset(i)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600,
                  background: preset === i ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#f3f4f6',
                  color: preset === i ? 'white' : '#6b7280',
                }}>
                {p.label}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }} className="dark:bg-gray-800 dark:border-gray-600">
              <Calendar size={13} style={{ color: '#9ca3af' }} />
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
                style={{ border: 'none', outline: 'none', fontSize: '0.78rem', background: 'transparent', color: '#374151', cursor: 'pointer' }}
                className="dark:text-gray-200" />
              <span style={{ color: '#d1d5db' }}>—</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
                style={{ border: 'none', outline: 'none', fontSize: '0.78rem', background: 'transparent', color: '#374151', cursor: 'pointer' }}
                className="dark:text-gray-200" />
            </div>
            <button type="button" onClick={load} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dark:bg-gray-800 dark:border-gray-600">
              <RefreshCw size={14} style={{ color: '#9ca3af', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              type="button"
              onClick={() => setDevModal(true)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: 'white', cursor: 'pointer', fontSize: '0.72rem',
                fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              className="dark:bg-gray-800 dark:border-gray-600 hover:border-purple-300 hover:text-purple-500"
              title="Developer flow diagram">
              // dev
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {['overview', 'customers', 'sessions'].map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{
                padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600, transition: 'all 150ms',
                background: tab === t ? 'white' : 'transparent',
                color: tab === t ? '#a855f7' : '#9ca3af',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                textTransform: 'capitalize',
              }}>
              {t}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#9ca3af', gap: 10 }}>
            <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
            Loading analytics…
          </div>
        )}

        {!loading && tab === 'overview' && data && (
          <>
            {/* ── Stat cards ───────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard icon={Activity}     label="Total Sessions"   value={fmt(t?.total_sessions)}   color="#a855f7" />
              <StatCard icon={Search}       label="Searches"         value={fmt(t?.search_events)}    color="#3b82f6" />
              <StatCard icon={AlertTriangle} label="Zero Results"    value={fmt(t?.zero_result_searches)} color="#ef4444" sub="searches with no match" />
              <StatCard icon={Eye}          label="Product Views"    value={fmt(t?.product_views)}    color="#10b981" />
              <StatCard icon={ShoppingCart} label="Cart Adds"        value={fmt(t?.cart_adds)}        color="#f59e0b" />
              <StatCard icon={Heart}        label="Wishlist Adds"    value={fmt(t?.wishlist_adds)}    color="#ec4899" />
              <StatCard icon={FileText}     label="Quote Adds"       value={fmt(t?.quotelist_adds)}   color="#8b5cf6" />
              <StatCard icon={Users}        label="Unique Customers" value={fmt(t?.unique_customers)} color="#06b6d4" sub={`+ ${fmt(t?.guest_sessions)} guest sessions`} />
            </div>

            {/* ── Sessions trend + Zero results ─────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

              {/* Sessions trend */}
              <Section title="Sessions Over Time" icon={BarChart2}>
                <div style={{ padding: '16px 20px' }}>
                  {data.sessions_trend?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.sessions_trend.slice(-14).map((d, i) => {
                        const max = Math.max(...data.sessions_trend.map(x => x.sessions));
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af', width: 60, flexShrink: 0 }}>
                              {new Date(d.day).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                            </span>
                            <MiniBar value={d.sessions} max={max} color="#a855f7" />
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', width: 24, textAlign: 'right' }}>{d.sessions}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No data yet</p>}
                </div>
              </Section>

              {/* Zero results — what to stock */}
              <Section title="Zero-Result Searches" icon={AlertTriangle}
                action={<span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>STOCK THESE</span>}>
                <div style={{ padding: '8px 0' }}>
                  {data.zero_result_searches?.slice(0, 10).map((row, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid #f9fafb' }} className="dark:border-gray-700">
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ef4444', width: 20 }}>#{i + 1}</span>
                      <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }} className="dark:text-white">{row.query}</span>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{row.times}× · {row.sessions} sessions</span>
                    </div>
                  ))}
                  {!data.zero_result_searches?.length && <p style={{ padding: '16px 20px', color: '#9ca3af', fontSize: '0.82rem' }}>No zero-result searches 🎉</p>}
                </div>
              </Section>
            </div>

            {/* ── Top searches + Top filters ─────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

              {/* Top searches with conversion */}
              <Section title="Top Searches" icon={Search}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }} className="dark:bg-gray-700">
                        {['Query', 'Searches', 'Cart Adds', 'Conv%'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_searches?.slice(0, 12).map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }} className="dark:border-gray-700">
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }} className="dark:text-white">{row.query}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280' }}>{fmt(row.searches)}</td>
                          <td style={{ padding: '8px 12px', color: '#6b7280' }}>{fmt(row.cart_adds)}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                              background: row.cart_conversion_pct > 10 ? 'rgba(16,185,129,0.1)' : row.cart_conversion_pct > 0 ? 'rgba(245,158,11,0.1)' : '#f3f4f6',
                              color: row.cart_conversion_pct > 10 ? '#10b981' : row.cart_conversion_pct > 0 ? '#f59e0b' : '#9ca3af',
                            }}>
                              {pct(row.cart_conversion_pct)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Top filters */}
              <Section title="Top Filters Clicked" icon={Filter}>
                <div style={{ padding: '8px 0' }}>
                  {data.top_filters?.slice(0, 12).map((row, i) => {
                    const max = data.top_filters[0]?.clicks || 1;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 20px' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.1)', padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>
                          {row.filter_type}
                        </span>
                        <span style={{ flex: 1, fontSize: '0.8rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="dark:text-gray-300">{row.filter_value}</span>
                        <MiniBar value={row.clicks} max={max} color="#7c3aed" />
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af', width: 28, textAlign: 'right', flexShrink: 0 }}>{row.clicks}</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>

            {/* ── Trending products + Frustrated sessions ────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

              {/* Trending products */}
              <Section title="Trending Products" icon={TrendingUp}>
                <div style={{ padding: '8px 0' }}>
                  {data.trending_products?.slice(0, 10).map((row, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid #f9fafb' }} className="dark:border-gray-700">
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#a855f7', width: 20 }}>#{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="dark:text-white">
                          {row.entity_name || `Product #${row.entity_id}`}
                        </p>
                        {row.entity_sku && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{row.entity_sku}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <span title="Views" style={{ fontSize: '0.7rem', color: '#6b7280' }}>👁 {fmt(row.views)}</span>
                        <span title="Cart" style={{ fontSize: '0.7rem', color: '#f59e0b' }}>🛒 {fmt(row.cart_adds)}</span>
                        <span title="Wishlist" style={{ fontSize: '0.7rem', color: '#ec4899' }}>♥ {fmt(row.wishlist_adds)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Frustrated sessions */}
              <Section title="Frustrated Sessions" icon={AlertTriangle}
                action={<span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>3+ SAME QUERY</span>}>
                <div style={{ padding: '8px 0' }}>
                  {data.frustrated_sessions?.slice(0, 10).map((row, i) => (
                    <div key={i}
                      onClick={() => navigate(`/admin/settings/analytics/${row.session_id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}
                      className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:border-gray-700">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0 }} className="dark:text-white">"{row.query}"</p>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{row.session_id.slice(0, 16)}…</p>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 700 }}>
                        ×{row.repeat_count}
                      </span>
                      <ChevronRight size={14} style={{ color: '#d1d5db' }} />
                    </div>
                  ))}
                  {!data.frustrated_sessions?.length && <p style={{ padding: '16px 20px', color: '#9ca3af', fontSize: '0.82rem' }}>No frustrated sessions 🎉</p>}
                </div>
              </Section>
            </div>
          </>
        )}

        {/* ── CUSTOMERS TAB ─────────────────────────────────────────────── */}
        {tab === 'customers' && (
          <Section title="All Customers" icon={Users}
            action={
              <button type="button" onClick={loadCustomers}
                style={{ fontSize: '0.72rem', color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={12} /> Refresh
              </button>
            }>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }} className="dark:bg-gray-700">
                    {['Customer', 'Tier', 'Cart', 'Wishlist', 'Quote List', 'Orders', 'Spent', 'Sessions', 'Last Activity', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {custLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <td key={j} style={{ padding: '10px 14px' }}>
                            <div style={{ height: 12, background: '#e5e7eb', borderRadius: 6, width: j === 0 ? 140 : 40 }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : customers?.data?.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:border-gray-700"
                      onClick={() => navigate(`/admin/settings/analytics/${c.customer_id}`)}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#111827' }} className="dark:text-white">{c.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{c.email}</div>
                        <div style={{ fontSize: '0.68rem', color: '#c084fc', fontFamily: 'monospace' }}>{c.customer_number}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, textTransform: 'capitalize',
                          background: c.tier === 'gold' ? 'rgba(245,158,11,0.1)' : c.tier === 'silver' ? 'rgba(156,163,175,0.15)' : 'rgba(168,85,247,0.1)',
                          color: c.tier === 'gold' ? '#d97706' : c.tier === 'silver' ? '#6b7280' : '#a855f7',
                        }}>{c.tier}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: c.cart_items > 0 ? '#f59e0b' : '#d1d5db' }}>{c.cart_items}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: c.wishlist_count > 0 ? '#ec4899' : '#d1d5db' }}>{c.wishlist_count}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: c.quotelist_items > 0 ? '#8b5cf6' : '#d1d5db' }}>{c.quotelist_items}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#6b7280', textAlign: 'center' }}>{fmt(c.total_orders)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }} className="dark:text-white">
                        KES {fmt(c.total_spent)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>{c.sessions_in_period || 0}</td>
                      <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {c.last_activity_at ? fmtTime(c.last_activity_at) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <ChevronRight size={14} style={{ color: '#d1d5db' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {customers && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="dark:border-gray-700">
                <span>{fmt(customers.total)} customers total</span>
                <span>Page {customers.current_page} of {customers.last_page}</span>
              </div>
            )}
          </Section>
        )}

        {/* ── SESSIONS TAB ──────────────────────────────────────────────── */}
        {tab === 'sessions' && (
          <SessionsTable from={from} to={to} navigate={navigate} />
        )}
      </div>
      {/* ── Dev modal ────────────────────────────────────────────────── */}
      {devModal && (
        <div
          onClick={() => setDevModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 18, width: '100%', maxWidth: 720,
              boxShadow: '0 24px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
            }}
            className="dark:bg-gray-800">

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }} className="dark:border-gray-700">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.1)', padding: '3px 8px', borderRadius: 6 }}>
                  // dev
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }} className="dark:text-white">
                  Analytics Code Flow
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDevModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}>
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 6px', lineHeight: 1.6 }}>
                4 pages: <strong style={{ color: '#111827' }}>Dashboard</strong> (overview / customers / sessions tabs) →
                navigate by id → <strong style={{ color: '#111827' }}>AnalyticsDetail</strong> (detects numeric = customer, UUID = session) →
                renders <strong style={{ color: '#111827' }}>CustomerAnalytics</strong> or <strong style={{ color: '#111827' }}>SessionDetail</strong> as tabs.
                <code style={{ fontSize: '0.72rem', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4, marginLeft: 4 }}>onSessionClick</code> switches tabs without navigation.
              </p>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 14px' }}>
                Click the diagram to open full view.
              </p>

              {/* Image — cropped preview, click goes fullscreen */}
              <div
                onClick={() => setFullscreen(true)}
                style={{
                  cursor: 'zoom-in', borderRadius: 12, overflow: 'hidden',
                  border: '1px solid #f3f4f6', position: 'relative',
                  maxHeight: 160,  // ← crop here
                }}
                className="dark:border-gray-700">
                <img
                  src={searchAnalyticsImg}
                  alt="Analytics code flow diagram"
                  style={{ width: '100%', display: 'block' }}
                />
                {/* fade gradient over the crop edge */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
                  background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.92))',
                  pointerEvents: 'none',
                }} className="dark:bg-gradient-to-b dark:from-transparent dark:to-gray-800" />
                <div style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: 'rgba(0,0,0,0.45)', color: 'white',
                  fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px',
                  borderRadius: 6, backdropFilter: 'blur(4px)',
                }}>
                  click to expand
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen image view ─────────────────────────────────────── */}
      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', padding: 24,
          }}>
          <img
            src={searchAnalyticsImg}
            alt="Analytics code flow diagram — full view"
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }}
          />
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            style={{
              position: 'fixed', top: 20, right: 24,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: 'white', fontSize: '1.4rem', cursor: 'pointer',
              borderRadius: 8, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            ×
          </button>
        </div>
      )}
      </SettingsLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sessions table (lazy loaded) ──────────────────────────────────────────────
function SessionsTable({ from, to, navigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/analytics/sessions', { params: { from, to, page, per_page: 30 } })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to, page]);

  return (
    <Section title="All Sessions" icon={Activity}
      action={<span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{data ? `${fmt(data.total)} sessions` : ''}</span>}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }} className="dark:bg-gray-700">
              {['Session', 'Customer', 'Events', 'Searches', 'Views', 'Cart', 'Wishlist', 'Started', 'Duration', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}><td colSpan={10} style={{ padding: '10px 14px' }}><div style={{ height: 12, background: '#e5e7eb', borderRadius: 6 }} /></td></tr>
            )) : data?.data?.map((s, i) => {
              const duration = s.last_event_at && s.started_at
                ? Math.round((new Date(s.last_event_at) - new Date(s.started_at)) / 60000)
                : 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:border-gray-700"
                  onClick={() => navigate(`/admin/settings/analytics/${s.session_id}`)}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#a855f7' }}>
                    {s.session_id.slice(0, 14)}…
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {s.customer_name
                      ? <><div style={{ fontWeight: 600, color: '#111827' }} className="dark:text-white">{s.customer_name}</div>
                          <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{s.customer_number}</div></>
                      : <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>Guest</span>
                    }
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151' }} className="dark:text-gray-300">{s.total_events}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>{s.searches}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>{Number(s.product_views) + Number(s.service_views)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {s.cart_adds > 0 ? <span style={{ fontWeight: 700, color: '#f59e0b' }}>{s.cart_adds}</span> : <span style={{ color: '#e5e7eb' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {s.wishlist_adds > 0 ? <span style={{ fontWeight: 700, color: '#ec4899' }}>{s.wishlist_adds}</span> : <span style={{ color: '#e5e7eb' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{fmtTime(s.started_at)}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: '0.75rem' }}>{duration > 0 ? `${duration}m` : '<1m'}</td>
                  <td style={{ padding: '10px 14px' }}><ChevronRight size={14} style={{ color: '#d1d5db' }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && data.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px' }}>
          {Array.from({ length: Math.min(data.last_page, 10) }, (_, i) => i + 1).map(p => (
            <button key={p} type="button" onClick={() => setPage(p)}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                background: p === page ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#f3f4f6',
                color: p === page ? 'white' : '#6b7280' }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}