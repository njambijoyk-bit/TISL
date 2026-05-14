import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Activity, AlertTriangle, CreditCard, Star,
  ShoppingBag, LogIn, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import customersAPI from '../../api/customers';
import customerTiersAPI from '../../api/customerTiers';

// ── Constants ──────────────────────────────────────────────────────────────────

const TIER_STYLES_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.25)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.2)'  },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.25)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.25)'  },
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) {
    return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  }
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}

const STATUS_STYLES = {
  suspended:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
  blacklisted: { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
};

const DORMANT_WINDOWS = [
  { label: '30 days',  value: '30'    },
  { label: '60 days',  value: '60'    },
  { label: '90 days',  value: '90'    },
  { label: '1 year',   value: '365'   },
  { label: 'Never',    value: 'never' },
];

const TABS = [
  { id: 'low_loyalty',    label: 'Low Loyalty',  icon: Star          },
  { id: 'idle_credit',    label: 'Idle Credit',  icon: CreditCard    },
  { id: 'at_risk',        label: 'At Risk',      icon: AlertTriangle },
  { id: 'dormant',        label: 'Dormant',      icon: Activity      },
];

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const inputStyle = {
  padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#374151', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 150ms, box-shadow 150ms',
  width: 90,
};

const fmt    = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtPts = (n) => Number(n ?? 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';

// ── Shared sub-components ──────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>Loading…</p>
    </div>
  );
}

function Empty({ message }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <Activity size={32} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 12px', display: 'block' }} />
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>{message}</p>
    </div>
  );
}

function TierBadge({ tier }) {
  const t = tierStyle(tier, tierOptions);
  return (
    <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700, background: t.bg, color: t.color, boxShadow: `0 0 0 1px ${t.ring}`, textTransform: 'capitalize' }}>
      {tier}
    </span>
  );
}

function CustomerRow({ c, onClick, right }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
        border: '1px solid rgba(168,85,247,0.1)', transition: 'all 150ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.background = 'rgba(168,85,247,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'; e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.08)', color: '#7c3aed', fontSize: '0.78rem', fontWeight: 800 }}>
          {`${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase() || '?'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.first_name} {c.last_name}
            </p>
            <TierBadge tier={c.tier} />
          </div>
          <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</p>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>{right}</div>
    </div>
  );
}

function Pagination({ meta, onPage }) {
  if (!meta || meta.last_page <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(168,85,247,0.08)' }}>
      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
        Page {meta.current_page} of {meta.last_page} · {meta.total} customers
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onPage(meta.current_page - 1)} disabled={meta.current_page <= 1}
          style={{ padding: '4px 10px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: meta.current_page <= 1 ? 'not-allowed' : 'pointer', border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#a855f7', opacity: meta.current_page <= 1 ? 0.3 : 1 }}>
          <ChevronLeft size={13} style={{ display: 'inline' }} /> Prev
        </button>
        <button onClick={() => onPage(meta.current_page + 1)} disabled={meta.current_page >= meta.last_page}
          style={{ padding: '4px 10px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: meta.current_page >= meta.last_page ? 'not-allowed' : 'pointer', border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#a855f7', opacity: meta.current_page >= meta.last_page ? 0.3 : 1 }}>
          Next <ChevronRight size={13} style={{ display: 'inline' }} />
        </button>
      </div>
    </div>
  );
}

// ── Tab content components ─────────────────────────────────────────────────────

function LowLoyaltyTab({ navigate, onClose }) {
  const [threshold, setThreshold] = useState(100);
  const [input, setInput]         = useState('100');
  const [data, setData]           = useState([]);
  const [meta, setMeta]           = useState(null);
  const [loading, setLoading]     = useState(false);

  const fetch = useCallback(async (page = 1, t = threshold) => {
    setLoading(true);
    try {
      const res = await customersAPI.getHealth({ tab: 'low_loyalty', threshold: t, per_page: 20, page });
      setData(res.data || []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch { toast.error('Failed to load low loyalty customers'); }
    finally { setLoading(false); }
  }, [threshold]);

  useEffect(() => { fetch(1, 100); }, []);

  const handleApply = () => {
    const val = parseInt(input);
    if (isNaN(val) || val < 0) return toast.error('Enter a valid number');
    setThreshold(val);
    fetch(1, val);
  };

  return (
    <div>
      {/* Config */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)' }}>
        <Star size={14} style={{ color: '#d97706', flexShrink: 0 }} />
        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Customers with fewer than</span>
        <input
          type="number" min="0" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
        />
        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>points</span>
        <button onClick={handleApply} style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white' }}>
          Apply
        </button>
      </div>

      {loading ? <Spinner /> : data.length === 0 ? <Empty message={`No customers with fewer than ${threshold} loyalty points`} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.map(c => (
            <CustomerRow key={c.id} c={c} onClick={() => { onClose(); navigate(`/admin/customers/${c.id}`); }}
              right={
                <div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 800, color: c.loyalty_points === 0 ? '#ef4444' : '#d97706', margin: '0 0 1px' }}>
                    {fmtPts(c.loyalty_points)} pts
                  </p>
                  {c.loyalty_points === 0 && <p style={{ fontSize: '0.65rem', color: '#ef4444', margin: 0 }}>Zero points</p>}
                </div>
              }
            />
          ))}
        </div>
      )}
      <Pagination meta={meta} onPage={p => fetch(p)} />
    </div>
  );
}

function IdleCreditTab({ navigate, onClose }) {
  const [minCredit, setMinCredit] = useState(100);
  const [input, setInput]         = useState('100');
  const [data, setData]           = useState([]);
  const [meta, setMeta]           = useState(null);
  const [loading, setLoading]     = useState(false);

  const fetch = useCallback(async (page = 1, m = minCredit) => {
    setLoading(true);
    try {
      const res = await customersAPI.getHealth({ tab: 'idle_credit', min_credit: m, per_page: 20, page });
      setData(res.data || []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch { toast.error('Failed to load idle credit customers'); }
    finally { setLoading(false); }
  }, [minCredit]);

  useEffect(() => { fetch(1, 100); }, []);

  const handleApply = () => {
    const val = parseFloat(input);
    if (isNaN(val) || val < 0) return toast.error('Enter a valid amount');
    setMinCredit(val);
    fetch(1, val);
  };

  return (
    <div>
      {/* Config */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.12)' }}>
        <CreditCard size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Customers with credit above KES</span>
        <input
          type="number" min="0" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
        />
        <button onClick={handleApply} style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white' }}>
          Apply
        </button>
      </div>

      {loading ? <Spinner /> : data.length === 0 ? <Empty message={`No customers with credit above KES ${minCredit}`} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.map(c => (
            <CustomerRow key={c.id} c={c} onClick={() => { onClose(); navigate(`/admin/customers/${c.id}`); }}
              right={
                <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>
                  {fmt(c.store_credit)}
                </p>
              }
            />
          ))}
        </div>
      )}
      <Pagination meta={meta} onPage={p => fetch(p)} />
    </div>
  );
}

function AtRiskTab({ navigate, onClose }) {
  const [data, setData]     = useState([]);
  const [meta, setMeta]     = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = async (page = 1) => {
    setLoading(true);
    try {
      const res = await customersAPI.getHealth({ tab: 'at_risk', per_page: 20, page });
      setData(res.data || []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch { toast.error('Failed to load at-risk customers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  return (
    <div>
      {loading ? <Spinner /> : data.length === 0 ? <Empty message="No suspended or blacklisted customers" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.map(c => {
            const s = STATUS_STYLES[c.status] ?? STATUS_STYLES.suspended;
            return (
              <div
                key={c.id}
                onClick={() => { onClose(); navigate(`/admin/customers/${c.id}`); }}
                style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                  padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1px solid ${s.ring}`, background: s.bg,
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)', color: s.color, fontSize: '0.78rem', fontWeight: 800 }}>
                    {`${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0 }}>{c.first_name} {c.last_name}</p>
                      <TierBadge tier={c.tier} />
                    </div>
                    <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0 0 3px' }}>{c.email}</p>
                    {c.status_reason && (
                      <p style={{ fontSize: '0.68rem', color: s.color, margin: 0, fontStyle: 'italic' }}>
                        "{c.status_reason}"
                      </p>
                    )}
                  </div>
                </div>
                <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(255,255,255,0.5)', color: s.color, boxShadow: `0 0 0 1px ${s.ring}`, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, display: 'inline-block', marginRight: 4 }} />
                  {c.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <Pagination meta={meta} onPage={p => fetch(p)} />
    </div>
  );
}

function DormantTab({ navigate, onClose }) {
  const [subTab, setSubTab]   = useState('orders'); // 'orders' | 'login'
  const [window_, setWindow]  = useState('90');
  const [data, setData]       = useState([]);
  const [meta, setMeta]       = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (page = 1, sub = subTab, win = window_) => {
    setLoading(true);
    try {
      const tab = sub === 'orders' ? 'dormant_orders' : 'dormant_login';
      const res = await customersAPI.getHealth({ tab, days: win, per_page: 20, page });
      setData(res.data || []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch { toast.error('Failed to load dormant customers'); }
    finally { setLoading(false); }
  }, [subTab, window_]);

  useEffect(() => { fetch(1, 'orders', '90'); }, []);

  const handleSubTab = (s) => { setSubTab(s); fetch(1, s, window_); };
  const handleWindow = (w) => { setWindow(w); fetch(1, subTab, w); };

  const dateKey   = subTab === 'orders' ? 'last_order_date' : 'last_login_at';
  const dateLabel = subTab === 'orders' ? 'Last order' : 'Last login';

  return (
    <div>
      {/* Sub-tab toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[
          { id: 'orders', label: 'Last Order',  icon: ShoppingBag },
          { id: 'login',  label: 'Last Login',  icon: LogIn       },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => handleSubTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 13px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', border: 'none', transition: 'all 120ms',
            background: subTab === id ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.07)',
            color: subTab === id ? 'white' : '#9ca3af',
            boxShadow: subTab === id ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
          }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Window toggle */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
        {DORMANT_WINDOWS.map(({ label, value }) => (
          <button key={value} onClick={() => handleWindow(value)} style={{
            padding: '4px 11px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', border: 'none', transition: 'all 120ms',
            background: window_ === value ? '#6b7280' : 'rgba(107,114,128,0.08)',
            color: window_ === value ? 'white' : '#6b7280',
          }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : data.length === 0 ? <Empty message={`No dormant customers for this window`} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.map(c => {
            const date = c[dateKey] ?? c.last_login_at ?? null;
            const isNever = !date;
            return (
              <CustomerRow key={c.id} c={c} onClick={() => { onClose(); navigate(`/admin/customers/${c.id}`); }}
                right={
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0 0 1px' }}>{dateLabel}</p>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: isNever ? '#ef4444' : '#374151', margin: 0 }}>
                      {isNever ? 'Never' : fmtDate(date)}
                    </p>
                  </div>
                }
              />
            );
          })}
        </div>
      )}
      <Pagination meta={meta} onPage={p => fetch(p, subTab, window_)} />
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export default function CustomerHealthModal({ onClose }) {
  const navigate  = useNavigate();
  const [activeTab, setActiveTab] = useState('low_loyalty');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 660, maxHeight: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.1)' }}>
              <Activity size={18} style={{ color: '#a855f7' }} />
            </div>
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>Customer Health</p>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Loyalty, credit, risk and engagement insights</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(168,85,247,0.1)', padding: '0 4px', flexShrink: 0 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '11px 15px', fontSize: '0.78rem',
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? '#a855f7' : '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2.5px solid ${activeTab === tab.id ? '#a855f7' : 'transparent'}`,
              marginBottom: -1, transition: 'color 150ms',
            }}>
              <tab.icon size={13} /> {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {activeTab === 'low_loyalty' && <LowLoyaltyTab navigate={navigate} onClose={onClose} />}
          {activeTab === 'idle_credit' && <IdleCreditTab navigate={navigate} onClose={onClose} />}
          {activeTab === 'at_risk'     && <AtRiskTab     navigate={navigate} onClose={onClose} />}
          {activeTab === 'dormant'     && <DormantTab    navigate={navigate} onClose={onClose} />}
        </div>

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}