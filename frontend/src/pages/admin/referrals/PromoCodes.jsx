import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tag, Plus, Search, Filter, MoreHorizontal, Play, Pause,
  Archive, Trash2, Eye, ChevronLeft, ChevronRight,
  TrendingUp, Users, DollarSign, Zap, Copy, Check,
  RefreshCw, Star, UserCheck, AlertTriangle, Gift,
} from 'lucide-react';
import usePromoCodeStore from '../../../store/promoCodeStore';
import toast from 'react-hot-toast';
import CreatePromoModal from './CreatePromoModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_META = {
  birthday:          { label: 'Birthday',          color: '#be185d', bg: 'rgba(236,72,153,0.1)',  ring: 'rgba(236,72,153,0.25)'  },
  first_time:        { label: 'First Time',        color: '#0e7490', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.25)'   },
  vip_upgrade:       { label: 'VIP Upgrade',       color: '#b45309', bg: 'rgba(234,179,8,0.1)',   ring: 'rgba(234,179,8,0.25)'   },
  loyalty_milestone: { label: 'Loyalty Milestone', color: '#7c3aed', bg: 'rgba(168,85,247,0.1)',  ring: 'rgba(168,85,247,0.25)'  },
  win_back:          { label: 'Win-Back',          color: '#b91c1c', bg: 'rgba(239,68,68,0.1)',   ring: 'rgba(239,68,68,0.25)'   },
  seasonal:          { label: 'Seasonal',          color: '#065f46', bg: 'rgba(16,185,129,0.1)',  ring: 'rgba(16,185,129,0.25)'  },
  flash_sale:        { label: 'Flash Sale',        color: '#b45309', bg: 'rgba(245,158,11,0.1)',  ring: 'rgba(245,158,11,0.25)'  },
  bulk_order:        { label: 'Bulk Order',        color: '#4338ca', bg: 'rgba(99,102,241,0.1)',  ring: 'rgba(99,102,241,0.25)'  },
  general:           { label: 'General',           color: '#4b5563', bg: 'rgba(107,114,128,0.1)', ring: 'rgba(107,114,128,0.2)'  },
};

const STATUS_STYLES = {
  draft:    { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)'  },
  active:   { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)'  },
  paused:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
  expired:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
  depleted: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', dot: '#a855f7', ring: 'rgba(168,85,247,0.25)'  },
  archived: { bg: 'rgba(107,114,128,0.08)',color: '#9ca3af', dot: '#d1d5db', ring: 'rgba(107,114,128,0.15)' },
};

const REWARD_META = {
  percentage:    { label: 'Percentage'    },
  fixed_amount:  { label: 'Fixed Amount'  },
  free_shipping: { label: 'Free Shipping' },
  store_credit:  { label: 'Store Credit'  },
};

const STAT_META = [
  { key: 'total',          label: 'Total codes',    icon: <Tag size={18} />,        accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)',  val: (s) => s.counts?.total ?? 0                                    },
  { key: 'active',         label: 'Active',         icon: <Zap size={18} />,        accent: '#059669', bg: 'rgba(5,150,105,0.08)',   val: (s) => s.counts?.active ?? 0                                   },
  { key: 'auto_generated', label: 'Auto-generated', icon: <RefreshCw size={18} />,  accent: '#0891b2', bg: 'rgba(8,145,178,0.08)',   val: (s) => s.counts?.auto_generated ?? 0                           },
  { key: 'revenue',        label: 'Total revenue',  icon: <DollarSign size={18} />, accent: '#2563eb', bg: 'rgba(37,99,235,0.08)',   val: (s) => fmt(s.totals?.revenue)                                  },
  { key: 'discount',       label: 'Discount given', icon: <Tag size={18} />,        accent: '#dc2626', bg: 'rgba(220,38,38,0.08)',   val: (s) => fmt(s.totals?.discount_given)                           },
  { key: 'orders',         label: 'Total orders',   icon: <TrendingUp size={18} />, accent: '#d97706', bg: 'rgba(217,119,6,0.08)',   val: (s) => (s.totals?.orders ?? 0).toLocaleString()                },
  { key: 'avg_order',      label: 'Avg order value',icon: <Star size={18} />,       accent: '#a855f7', bg: 'rgba(168,85,247,0.08)',  val: (s) => fmt(s.totals?.avg_order_value)                          },
];

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const selectStyle = {
  padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#374151', outline: 'none',
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const selectFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const selectBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const TH_LABEL = ({ children }) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>
    {children}
  </span>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent, bg }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: accent,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
      </div>
    </div>
  );
}

function Badge({ bg, color, ring, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 7,
      fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700,
      background: 'rgba(168,85,247,0.06)', color: '#6d28d9',
      border: '1px solid rgba(168,85,247,0.18)', cursor: 'pointer',
      transition: 'background 120ms, border-color 120ms',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.12)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; }}
    >
      {code}
      {copied
        ? <Check size={10} style={{ color: '#10b981', flexShrink: 0 }} />
        : <Copy size={10} style={{ color: '#c4b5fd', flexShrink: 0 }} />
      }
    </button>
  );
}

function ActionMenu({ code, onView, onActivate, onPause, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);

  const items = [
    { icon: Eye,     label: 'View details', onClick: onView,     danger: false },
    null,
    ...(code.status !== 'active'   ? [{ icon: Play,    label: 'Activate', onClick: onActivate, danger: false }] : []),
    ...(code.status === 'active'   ? [{ icon: Pause,   label: 'Pause',    onClick: onPause,    danger: false }] : []),
    ...(code.status !== 'archived' ? [{ icon: Archive, label: 'Archive',  onClick: onArchive,  danger: false }] : []),
    null,
    { icon: Trash2, label: 'Delete', onClick: onDelete, danger: true },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer',
          color: '#c4b5fd', transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = '#a855f7'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#c4b5fd'; }}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 180, zIndex: 20,
            background: 'white', borderRadius: 12, padding: '6px 0',
            border: '1.5px solid rgba(168,85,247,0.15)',
            boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
          }}
            onClick={e => e.stopPropagation()}
          >
            {items.map((item, i) => item === null ? (
              <div key={i} style={{ margin: '4px 0', borderTop: '1px solid rgba(168,85,247,0.08)' }} />
            ) : (
              <button key={i} onClick={() => { item.onClick(); setOpen(false); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', fontSize: '0.8rem', fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: item.danger ? '#ef4444' : '#374151',
                transition: 'background 120ms',
              }}
                onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(239,68,68,0.05)' : 'rgba(168,85,247,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <item.icon size={13} style={{ flexShrink: 0 }} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
      {[180, 90, 100, 70, 110, 60, 80, 0].map((w, j) => (
        <td key={j} style={{ padding: '14px 20px' }}>
          {w > 0 && <div style={{ width: w, height: 10, borderRadius: 6, background: 'rgba(168,85,247,0.07)' }} />}
        </td>
      ))}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PromoCodes() {
  const navigate = useNavigate();
  const {
    codes, statistics, pagination, filters, loading,
    fetchCodes, fetchStatistics, setFilter, resetFilters,
    activateCode, pauseCode, archiveCode, deleteCode,
    triggerBirthday, triggerWinBack, triggerExpire,
  } = usePromoCodeStore();

  const [showCreate,      setShowCreate]      = useState(false);
  const [showFilters,     setShowFilters]      = useState(false);
  const [triggerLoading,  setTriggerLoading]  = useState(null);

  useEffect(() => { fetchStatistics(); }, []);
  useEffect(() => { fetchCodes(); }, [filters]);

  const handleActivate = async (id) => {
    try { await activateCode(id); toast.success('Code activated.'); }
    catch { toast.error('Failed.'); }
  };
  const handlePause = async (id) => {
    try { await pauseCode(id); toast.success('Code paused.'); }
    catch { toast.error('Failed.'); }
  };
  const handleArchive = async (id) => {
    try { await archiveCode(id); toast.success('Code archived.'); }
    catch { toast.error('Failed.'); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this promo code?')) return;
    try { await deleteCode(id); toast.success('Code deleted.'); }
    catch { toast.error('Failed to delete.'); }
  };

  const handleTrigger = async (type) => {
    setTriggerLoading(type);
    try {
      let result;
      if (type === 'birthday') result = await triggerBirthday();
      if (type === 'winback')  result = await triggerWinBack();
      if (type === 'expire')   result = await triggerExpire();
      if (type === 'expire') {
        toast.success(`Expired ${result.count} code(s).`);
      } else {
        const { generated = 0, skipped = 0, errors = 0 } = result.stats ?? {};
        toast.success(`Generated ${generated}, skipped ${skipped}${errors > 0 ? `, ${errors} errors` : ''}.`);
      }
      fetchCodes();
      fetchStatistics();
    } catch {
      toast.error('Trigger failed. Check logs.');
    } finally {
      setTriggerLoading(null);
    }
  };

  const rewardStr = (code) => {
    if (code.reward_type === 'percentage')   return `${code.reward_value}% off`;
    if (code.reward_type === 'fixed_amount') return `${fmt(code.reward_value)} off`;
    return REWARD_META[code.reward_type]?.label ?? '—';
  };

  const hasFilters = filters.search || filters.event_type || filters.status || filters.reward_type || filters.auto || filters.public || filters.expiring;
  const activeFilterCount = [filters.event_type, filters.status, filters.reward_type, filters.auto && 'auto', filters.public && 'public', filters.expiring && 'expiring'].filter(Boolean).length;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
            Promo Codes
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            Manage discount codes, seasonal campaigns and auto-generated rewards
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Trigger buttons */}
          {[
            { key: 'birthday', label: 'Birthday codes'  },
            { key: 'winback',  label: 'Win-back codes'  },
            { key: 'expire',   label: 'Run expiry sweep' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => handleTrigger(key)} disabled={!!triggerLoading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 600,
              fontFamily: 'inherit', cursor: triggerLoading ? 'not-allowed' : 'pointer',
              background: 'transparent', color: '#9ca3af',
              border: '1.5px solid rgba(168,85,247,0.18)',
              opacity: triggerLoading && triggerLoading !== key ? 0.5 : 1,
              transition: 'border-color 150ms, color 150ms',
            }}
              onMouseEnter={e => { if (!triggerLoading) { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.color = '#a855f7'; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.color = '#9ca3af'; }}
            >
              <RefreshCw size={13} style={{ animation: triggerLoading === key ? 'spin 1s linear infinite' : 'none' }} />
              {label}
            </button>
          ))}

          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)', transition: 'box-shadow 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
          >
            <Plus size={15} /> New code
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {statistics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
          {STAT_META.map(({ key, label, icon, accent, bg, val }) => (
            <StatCard key={key} icon={icon} label={label} value={val(statistics)} accent={accent} bg={bg} />
          ))}
        </div>
      )}

      {/* ── Event type breakdown ── */}
      {statistics?.by_event_type?.length > 0 && (
        <div style={{ ...card, padding: '16px 20px' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 12px' }}>
            By event type
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {statistics.by_event_type.map(row => {
              const meta    = EVENT_META[row.event_type] ?? EVENT_META.general;
              const isActive = filters.event_type === row.event_type;
              return (
                <button
                  key={row.event_type}
                  onClick={() => setFilter('event_type', isActive ? '' : row.event_type)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                    background: isActive ? meta.color : meta.bg,
                    color:      isActive ? 'white'    : meta.color,
                    border:    `1px solid ${isActive ? meta.color : meta.ring}`,
                  }}
                >
                  {meta.label}
                  <span style={{ opacity: 0.7 }}>({row.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search + filters ── */}
      <div style={card}>
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#c4b5fd', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search name or code…"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              style={{
                width: '100%', padding: '7px 12px 7px 32px', borderRadius: 8, fontSize: '0.82rem',
                background: 'rgba(168,85,247,0.04)',
                border: '1.5px solid rgba(168,85,247,0.18)',
                color: '#111827', outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box', transition: 'border-color 150ms, box-shadow 150ms',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
              background: showFilters || hasFilters ? 'rgba(168,85,247,0.08)' : 'transparent',
              border: `1.5px solid ${showFilters || hasFilters ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.18)'}`,
              color: showFilters || hasFilters ? '#7c3aed' : '#9ca3af',
            }}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%', fontSize: '0.6rem', fontWeight: 800,
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div style={{
            padding: '12px 16px 14px',
            borderTop: '1px solid rgba(168,85,247,0.1)',
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            <select value={filters.status ?? ''} onChange={e => setFilter('status', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All statuses</option>
              {Object.keys(STATUS_STYLES).map(v => (
                <option key={v} value={v} style={{ textTransform: 'capitalize' }}>{v}</option>
              ))}
            </select>

            <select value={filters.reward_type ?? ''} onChange={e => setFilter('reward_type', e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All reward types</option>
              {Object.entries(REWARD_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>

            {[
              { key: 'auto',     label: 'Auto-generated' },
              { key: 'public',   label: 'Public only'    },
              { key: 'expiring', label: 'Expiring soon'  },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key, !filters[key])} style={{
                padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                background: filters[key] ? 'rgba(168,85,247,0.1)' : 'transparent',
                border: `1.5px solid ${filters[key] ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.18)'}`,
                color: filters[key] ? '#7c3aed' : '#9ca3af',
              }}>
                {label}
              </button>
            ))}

            {hasFilters && (
              <button onClick={resetFilters} style={{
                fontSize: '0.78rem', fontWeight: 600, color: '#c4b5fd',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '0 4px', transition: 'color 150ms',
              }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', minWidth: 200 }}><TH_LABEL>Code / Name</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 130 }}><TH_LABEL>Event type</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 120 }}><TH_LABEL>Reward</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 100 }}><TH_LABEL>Status</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 140 }}><TH_LABEL>Target</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'right', minWidth: 80  }}><TH_LABEL>Uses</TH_LABEL></th>
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 110 }}><TH_LABEL>Expires</TH_LABEL></th>
                <th style={{ padding: '10px 16px', width: 44 }} />
              </tr>
            </thead>

            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)

                : codes.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '64px 24px', textAlign: 'center' }}>
                        <Tag size={36} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '0 0 8px' }}>No promo codes found</p>
                        <button onClick={() => setShowCreate(true)} style={{
                          fontSize: '0.75rem', fontWeight: 600, color: '#a855f7',
                          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          Create your first code →
                        </button>
                      </td>
                    </tr>
                  )

                  : codes.map((code, i) => {
                      const em     = EVENT_META[code.event_type]   ?? EVENT_META.general;
                      const sm     = STATUS_STYLES[code.status]    ?? STATUS_STYLES.draft;
                      const isLast = i === codes.length - 1;
                      const expiringSoon = code.valid_until && new Date(code.valid_until) < new Date(Date.now() + 7 * 86400000);

                      return (
                        <tr
                          key={code.id}
                          onClick={() => navigate(`/admin/promo-codes/${code.id}`)}
                          style={{
                            borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                            cursor: 'pointer', transition: 'background 120ms',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >

                          {/* Code / Name */}
                          <td style={{ padding: '12px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                {code.name}
                              </p>
                              {code.auto_generated && (
                                <span style={{
                                  padding: '1px 6px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                                  background: 'rgba(5,150,105,0.1)', color: '#065f46',
                                  border: '1px solid rgba(5,150,105,0.2)', whiteSpace: 'nowrap',
                                }}>
                                  Auto
                                </span>
                              )}
                            </div>
                            <CopyCode code={code.code} />
                          </td>

                          {/* Event type */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={em.bg} color={em.color} ring={em.ring}>
                              {em.label}
                            </Badge>
                          </td>

                          {/* Reward */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                              {rewardStr(code)}
                            </span>
                            {code.min_order_value > 0 && (
                              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>
                                min. {fmt(code.min_order_value)}
                              </p>
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={sm.bg} color={sm.color} ring={sm.ring}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.dot, flexShrink: 0 }} />
                              {code.status}
                            </Badge>
                          </td>

                          {/* Target */}
                          <td style={{ padding: '12px 16px' }}>
                            {code.target_customer ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <UserCheck size={12} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                  {code.target_customer.full_name || code.target_customer.email}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#d1d5db' }}>Public</span>
                            )}
                          </td>

                          {/* Uses */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                              {(code.times_used ?? 0).toLocaleString()}
                            </span>
                            {code.max_uses && (
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                                {' '}/ {code.max_uses.toLocaleString()}
                              </span>
                            )}
                            {code.max_uses && (
                              <div style={{ width: 56, height: 3, borderRadius: 99, background: 'rgba(168,85,247,0.1)', marginTop: 4, marginLeft: 'auto', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%', borderRadius: 99,
                                  width: `${Math.min((code.times_used / code.max_uses) * 100, 100)}%`,
                                  background: code.times_used >= code.max_uses ? '#ef4444' : 'linear-gradient(90deg,#a855f7,#7c3aed)',
                                }} />
                              </div>
                            )}
                          </td>

                          {/* Expires */}
                          <td style={{ padding: '12px 16px' }}>
                            {code.valid_until ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {expiringSoon && <AlertTriangle size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                                <span style={{ fontSize: '0.75rem', color: expiringSoon ? '#b45309' : '#374151', fontWeight: expiringSoon ? 600 : 400 }}>
                                  {fmtDate(code.valid_until)}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#d1d5db' }}>No expiry</span>
                            )}
                          </td>

                          {/* Action */}
                          <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                            <ActionMenu
                              code={code}
                              onView={() => navigate(`/admin/promo-codes/${code.id}`)}
                              onActivate={() => handleActivate(code.id)}
                              onPause={() => handlePause(code.id)}
                              onArchive={() => handleArchive(code.id)}
                              onDelete={() => handleDelete(code.id)}
                            />
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && codes.length > 0 && pagination.last_page > 1 && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(168,85,247,0.02)',
          }}>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
              Page {pagination.current_page} of {pagination.last_page} — {pagination.total?.toLocaleString()} codes
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setFilter('page', pagination.current_page - 1)}
                disabled={pagination.current_page <= 1}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: pagination.current_page <= 1 ? 'not-allowed' : 'pointer',
                  border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', opacity: pagination.current_page <= 1 ? 0.3 : 1, transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (pagination.current_page > 1) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                const p = pagination.current_page <= 3
                  ? i + 1
                  : pagination.current_page >= pagination.last_page - 2
                  ? pagination.last_page - 4 + i
                  : pagination.current_page - 2 + i;
                if (p < 1 || p > pagination.last_page) return null;
                const isActive = p === pagination.current_page;
                return (
                  <button
                    key={p} onClick={() => setFilter('page', p)}
                    style={{
                      width: 30, height: 30, borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
                      background: isActive ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'none',
                      border: isActive ? 'none' : '1.5px solid rgba(168,85,247,0.18)',
                      color: isActive ? 'white' : '#9ca3af',
                      boxShadow: isActive ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setFilter('page', pagination.current_page + 1)}
                disabled={pagination.current_page >= pagination.last_page}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: pagination.current_page >= pagination.last_page ? 'not-allowed' : 'pointer',
                  border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', opacity: pagination.current_page >= pagination.last_page ? 0.3 : 1, transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (pagination.current_page < pagination.last_page) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreatePromoModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            fetchCodes();
            fetchStatistics();
            toast.success('Promo code created!');
          }}
        />
      )}
    </div>
  );
}