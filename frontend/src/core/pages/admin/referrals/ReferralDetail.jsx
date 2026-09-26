import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Gift, Play, Pause, Archive, Trash2,
  Copy, Check, TrendingUp, Users, DollarSign, Zap,
  Calendar, Clock, Tag, ChevronRight,
  BadgeCheck, AlertCircle, Edit2, Save, X,
} from 'lucide-react';
import useReferralsStore from '../../../../_shared/store/referralsStore';
import referralsAPI from '../../../../_shared/api/referrals';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  general:           { label: 'General',    color: '#4338ca', bg: 'rgba(99,102,241,0.1)',  ring: 'rgba(99,102,241,0.25)'  },
  customer_referral: { label: 'Referral',   color: '#065f46', bg: 'rgba(16,185,129,0.1)',  ring: 'rgba(16,185,129,0.25)'  },
  first_time:        { label: 'First Time', color: '#0e7490', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.25)'   },
  bulk_order:        { label: 'Bulk Order', color: 'var(--color-primary-600)', bg: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',  ring: 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)'  },
  vip:               { label: 'VIP',        color: '#b45309', bg: 'rgba(234,179,8,0.1)',   ring: 'rgba(234,179,8,0.25)'   },
  birthday:          { label: 'Birthday',   color: '#be185d', bg: 'rgba(236,72,153,0.1)',  ring: 'rgba(236,72,153,0.25)'  },
  event:             { label: 'Event',      color: '#b91c1c', bg: 'rgba(239,68,68,0.1)',   ring: 'rgba(239,68,68,0.25)'   },
};

const STATUS_STYLES = {
  draft:    { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)'  },
  active:   { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)'  },
  paused:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)'  },
  expired:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)'   },
  depleted: { bg: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',  color: 'var(--color-primary-600)', dot: 'var(--color-primary-500)', ring: 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)'  },
  archived: { bg: 'rgba(107,114,128,0.08)',color: '#9ca3af', dot: '#d1d5db', ring: 'rgba(107,114,128,0.15)' },
};

const USAGE_STATUS = {
  pending:   { label: 'Pending',   color: '#b45309', dot: '#f59e0b' },
  completed: { label: 'Completed', color: '#065f46', dot: '#10b981' },
  expired:   { label: 'Expired',   color: '#b91c1c', dot: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#4b5563', dot: '#9ca3af' },
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
  padding: 20,
};

const sectionHeader = {
  fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary-600)',
  display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px',
};

const fmt     = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDT   = (d) => d ? new Date(d).toLocaleString('en-GB',  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ children, bg, color, ring }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`,
    }}>
      {children}
    </span>
  );
}

function StatBlock({ label, value, color }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
    }}>
      <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <p style={{ fontSize: '1.2rem', fontWeight: 800, color: color || '#111827', margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function EditField({ label, value, onChange, editMode, type = 'text' }) {
  return (
    <Field label={label}>
      {editMode
        ? <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        : <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, fontWeight: 500 }}>{value || '—'}</p>
      }
    </Field>
  );
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 8,
        fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700,
        background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)', color: 'var(--color-primary-700)',
        border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', cursor: 'pointer',
        transition: 'background 120ms, border-color 120ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 40%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'; }}
    >
      {code}
      {copied
        ? <Check size={12} style={{ color: '#10b981' }} />
        : <Copy size={12} style={{ color: '#c4b5fd' }} />
      }
    </button>
  );
}

function ActionBtn({ icon: Icon, label, onClick, loading, danger, primary }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '7px 13px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
      fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.6 : 1, transition: 'all 150ms',
      ...(primary ? {
        background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
        border: 'none', boxShadow: '0 2px 10px color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
      } : danger ? {
        background: 'rgba(239,68,68,0.06)', color: '#b91c1c',
        border: '1.5px solid rgba(239,68,68,0.2)',
      } : {
        background: 'transparent', color: '#6b7280',
        border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
      }),
    }}
      onMouseEnter={e => {
        if (!loading) {
          if (primary) e.currentTarget.style.boxShadow = '0 4px 16px color-mix(in srgb, var(--color-primary-500) 45%, transparent)';
          else if (danger) e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
          else { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 40%, transparent)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }
        }
      }}
      onMouseLeave={e => {
        if (primary) e.currentTarget.style.boxShadow = '0 2px 10px color-mix(in srgb, var(--color-primary-500) 30%, transparent)';
        else if (danger) e.currentTarget.style.background = 'rgba(239,68,68,0.06)';
        else { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.color = '#6b7280'; }
      }}
    >
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

function SkeletonBlock({ height }) {
  return <div style={{ height, borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)', marginBottom: 16 }} />;
}

function TH_LABEL({ children }) {
  return (
    <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>
      {children}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReferralDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const {
    currentCode, loading, actionLoading,
    fetchCodeById, updateCode, activateCode, pauseCode, archiveCode, deleteCode, clearCurrentCode,
  } = useReferralsStore();

  const [tab,       setTab]       = useState('overview');
  const [editMode,  setEditMode]  = useState(false);
  const [formData,  setFormData]  = useState({});
  const [usagePage, setUsagePage] = useState(1);
  const [usageData, setUsageData] = useState(null);

  useEffect(() => {
    fetchCodeById(id);
    return () => clearCurrentCode();
  }, [id]);

  useEffect(() => {
    if (currentCode?.code) {
      const c = currentCode.code;
      setFormData({
        name:                    c.name                    || '',
        description:             c.description             || '',
        max_uses:                c.max_uses                || '',
        max_uses_per_customer:   c.max_uses_per_customer   || 1,
        valid_from:              c.valid_from  ? c.valid_from.substring(0, 10)  : '',
        valid_until:             c.valid_until ? c.valid_until.substring(0, 10) : '',
        min_order_value:         c.min_order_value         || '',
        reward_value:            c.reward_value            || '',
        referrer_reward_value:   c.referrer_reward_value   || '',
        admin_notes:             c.admin_notes             || '',
      });
    }
  }, [currentCode]);

  useEffect(() => { loadUsage(); }, [id, usagePage]);

  const loadUsage = async () => {
    try {
      const data = await referralsAPI.getUsage(id, { page: usagePage, per_page: 10 });
      setUsageData(data);
    } catch {}
  };

  const code    = currentCode?.code;
  const metrics = currentCode?.metrics;
  const monthly = currentCode?.monthly_trend  || [];
  const byStatus= currentCode?.usage_by_status || {};
  const tm      = TYPE_META[code?.type]    ?? TYPE_META.general;
  const sm      = STATUS_STYLES[code?.status] ?? STATUS_STYLES.draft;

  const setF = (k) => (v) => setFormData(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    try { await updateCode(id, formData); toast.success('Code updated.'); setEditMode(false); fetchCodeById(id); }
    catch (err) { toast.error(err.response?.data?.message || 'Update failed.'); }
  };

  const handleActivate = async () => { try { await activateCode(id); toast.success('Activated.'); fetchCodeById(id); } catch { toast.error('Failed.'); } };
  const handlePause    = async () => { try { await pauseCode(id);    toast.success('Paused.');    fetchCodeById(id); } catch { toast.error('Failed.'); } };
  const handleArchive  = async () => { try { await archiveCode(id); toast.success('Archived.');  fetchCodeById(id); } catch { toast.error('Failed.'); } };
  const handleDelete   = async () => {
    if (!confirm('Delete this code?')) return;
    try { await deleteCode(id); toast.success('Deleted.'); navigate('/admin/referrals'); }
    catch { toast.error('Failed.'); }
  };

  const rewardStr = code?.reward_type === 'percentage'
    ? `${code.reward_value}% off`
    : code?.reward_type === 'fixed_amount'
      ? `${fmt(code.reward_value)} off`
      : code?.reward_type ?? '—';

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading || !code) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
      <SkeletonBlock height={40} />
      <SkeletonBlock height={130} />
      <SkeletonBlock height={300} />
    </div>
  );

  return (
    <SettingsLayout>
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Back ── */}
      <button onClick={() => navigate('/admin/referrals')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.82rem', color: '#9ca3af', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start', transition: 'color 150ms',
      }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-600)'}
        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
      >
        <ChevronLeft size={16} /> Referral codes
      </button>

      {/* ── Hero ── */}
      <div style={{ ...card, padding: 24, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
        {/* accent strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${tm.color},var(--color-primary-600))` }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', paddingTop: 4 }}>

          {/* Icon */}
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tm.bg, boxShadow: `0 0 0 1px ${tm.ring}`,
          }}>
            <Gift size={22} style={{ color: tm.color }} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0 }}>{code.name}</h1>
              <Badge bg={tm.bg} color={tm.color} ring={tm.ring}>{tm.label}</Badge>
              <Badge bg={sm.bg} color={sm.color} ring={sm.ring}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.dot, flexShrink: 0 }} />
                {code.status}
              </Badge>
              {code.days_until_expiry !== null && code.days_until_expiry <= 7 && code.days_until_expiry > 0 && (
                <Badge bg="rgba(245,158,11,0.1)" color="#b45309" ring="rgba(245,158,11,0.25)">
                  Expires in {code.days_until_expiry}d
                </Badge>
              )}
            </div>
            {code.description && (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 10px', lineHeight: 1.5 }}>{code.description}</p>
            )}
            <CopyCode code={code.code} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {editMode
              ? <><ActionBtn icon={Save} label="Save" onClick={handleSave} loading={actionLoading} primary /><ActionBtn icon={X} label="Cancel" onClick={() => setEditMode(false)} /></>
              : <ActionBtn icon={Edit2} label="Edit" onClick={() => setEditMode(true)} />
            }
            {code.status !== 'active'   && <ActionBtn icon={Play}    label="Activate" onClick={handleActivate} loading={actionLoading} />}
            {code.status === 'active'   && <ActionBtn icon={Pause}   label="Pause"    onClick={handlePause}    loading={actionLoading} />}
            {code.status !== 'archived' && <ActionBtn icon={Archive} label="Archive"  onClick={handleArchive}  loading={actionLoading} />}
            <ActionBtn icon={Trash2} label="Delete" onClick={handleDelete} loading={actionLoading} danger />
          </div>
        </div>
      </div>

      {/* ── Tabs + content ── */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '2px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)', padding: '0 20px' }}>
          {['overview', 'settings', 'usage'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '12px 16px', fontSize: '0.82rem', fontWeight: tab === t ? 700 : 500,
              color: tab === t ? 'var(--color-primary-500)' : '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2px solid ${tab === t ? 'var(--color-primary-500)' : 'transparent'}`,
              marginBottom: -2, textTransform: 'capitalize', transition: 'color 150ms',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t}
              {t === 'usage' && usageData && (
                <span style={{
                  padding: '1px 7px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
                  background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)',
                }}>
                  {usageData.total}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Main metrics */}
              <div>
                <p style={sectionHeader}><TrendingUp size={14} style={{ color: '#c4b5fd' }} /> Performance</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                  <StatBlock label="Total uses"      value={(metrics?.total_uses_count ?? code.times_used ?? 0).toLocaleString()} color="var(--color-primary-600)" />
                  <StatBlock label="Revenue"         value={fmt(metrics?.total_revenue)}  color="#065f46" />
                  <StatBlock label="Discount given"  value={fmt(metrics?.total_discount)} color="#b91c1c" />
                  <StatBlock label="Conversion rate 'conversion_rate' => ($this->successful_uses / $this->attempts) * 100" value={`${Number(code.conversion_rate || 0).toFixed(1)}%`} color="#0891b2" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  <StatBlock label="Views"     value={(code.views      ?? 0).toLocaleString()} />
                  <StatBlock label="Attempts"  value={(code.attempts   ?? 0).toLocaleString()} />
                  <StatBlock label="Successful"value={(code.successful_uses ?? 0).toLocaleString()} />
                  <StatBlock label="Avg order" value={fmt(code.average_order_value)} />
                </div>
              </div>

              {/* Usage by status */}
              <div>
                <p style={sectionHeader}><Zap size={14} style={{ color: '#c4b5fd' }} /> Usage by status</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {Object.entries(USAGE_STATUS).map(([status, meta]) => (
                    <div key={status} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: 10,
                      background: 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{meta.label}</span>
                      </div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>{byStatus[status] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly trend */}
              {monthly.length > 0 && (
                <div>
                  <p style={sectionHeader}><TrendingUp size={14} style={{ color: '#c4b5fd' }} /> Monthly trend</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(() => {
                      const max = Math.max(...monthly.map(m => m.count), 1);
                      return monthly.map(m => (
                        <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', width: 56, flexShrink: 0 }}>{m.month}</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 99,
                              width: `${Math.min(100, (m.count / max) * 100)}%`,
                              background: 'linear-gradient(90deg,var(--color-primary-500),var(--color-primary-600))',
                            }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', width: 24, textAlign: 'right' }}>{m.count}</span>
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', width: 80, textAlign: 'right' }}>{fmt(m.revenue)}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Configuration */}
              <div>
                <p style={sectionHeader}><Tag size={14} style={{ color: '#c4b5fd' }} /> Code configuration</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {[
                    { label: 'Reward',            value: rewardStr },
                    { label: 'Referrer reward',   value: code.referrer_reward_type === 'none' || !code.referrer_reward_type ? 'None' : `${code.referrer_reward_value} ${code.referrer_reward_type}` },
                    { label: 'Max uses',          value: code.max_uses ? `${code.times_used} / ${code.max_uses}` : 'Unlimited' },
                    { label: 'Per customer',      value: `${code.max_uses_per_customer ?? 1} use${code.max_uses_per_customer !== 1 ? 's' : ''}` },
                    { label: 'Min order',         value: code.min_order_value ? fmt(code.min_order_value) : 'None' },
                    { label: 'Min items',         value: code.min_items ?? 'None' },
                    { label: 'Valid from',        value: fmtDate(code.valid_from) },
                    { label: 'Valid until',       value: fmtDate(code.valid_until) },
                    { label: 'Stackable',         value: code.stackable  ? 'Yes' : 'No' },
                    { label: 'Public',            value: code.is_public  ? 'Yes' : 'No' },
                    { label: 'Auto apply',        value: code.auto_apply ? 'Yes' : 'No' },
                    { label: 'Created by',        value: code.created_by?.name || '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 4px' }}>{label}</p>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
                {code.admin_notes && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)' }}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>Admin notes</p>
                    <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{code.admin_notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Settings ── */}
          {tab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>

              {/* Basic */}
              <div>
                <p style={sectionHeader}><Tag size={14} style={{ color: '#c4b5fd' }} /> Basic</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <EditField label="Name"        value={formData.name}        onChange={setF('name')}        editMode={editMode} />
                  <EditField label="Description" value={formData.description} onChange={setF('description')} editMode={editMode} />
                </div>
              </div>

              {/* Limits */}
              <div>
                <p style={sectionHeader}><Zap size={14} style={{ color: '#c4b5fd' }} /> Limits</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <EditField label="Max uses"          value={formData.max_uses}              onChange={setF('max_uses')}              editMode={editMode} type="number" />
                  <EditField label="Per customer"      value={formData.max_uses_per_customer} onChange={setF('max_uses_per_customer')} editMode={editMode} type="number" />
                  <EditField label="Min order (KES)"   value={formData.min_order_value}       onChange={setF('min_order_value')}       editMode={editMode} type="number" />
                  <EditField label="Reward value"      value={formData.reward_value}          onChange={setF('reward_value')}          editMode={editMode} type="number" />
                  <EditField label="Referrer reward"   value={formData.referrer_reward_value} onChange={setF('referrer_reward_value')} editMode={editMode} type="number" />
                </div>
              </div>

              {/* Validity */}
              <div>
                <p style={sectionHeader}><Calendar size={14} style={{ color: '#c4b5fd' }} /> Validity</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <EditField label="Valid from"  value={formData.valid_from}  onChange={setF('valid_from')}  editMode={editMode} type="date" />
                  <EditField label="Valid until" value={formData.valid_until} onChange={setF('valid_until')} editMode={editMode} type="date" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <p style={sectionHeader}><Tag size={14} style={{ color: '#c4b5fd' }} /> Admin notes</p>
                {editMode
                  ? <textarea rows={4} value={formData.admin_notes} onChange={e => setF('admin_notes')(e.target.value)}
                      placeholder="Internal notes for this code…"
                      style={{ ...inputStyle, resize: 'none' }} onFocus={inputFocus} onBlur={inputBlur} />
                  : <p style={{ fontSize: '0.82rem', color: formData.admin_notes ? '#6b7280' : '#d1d5db', margin: 0, lineHeight: 1.5, fontStyle: formData.admin_notes ? 'normal' : 'italic' }}>
                      {formData.admin_notes || 'No notes'}
                    </p>
                }
              </div>

              {/* Edit actions */}
              {!editMode
                ? <ActionBtn icon={Edit2} label="Edit settings" onClick={() => setEditMode(true)} />
                : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ActionBtn icon={Save} label="Save changes" onClick={handleSave} loading={actionLoading} primary />
                    <ActionBtn label="Cancel" onClick={() => setEditMode(false)} />
                  </div>
                )
              }
            </div>
          )}

          {/* ── Usage ── */}
          {tab === 'usage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!usageData || usageData.data?.length === 0 ? (
                <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                  <Users size={32} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No usage records yet</p>
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)', background: 'color-mix(in srgb, var(--color-primary-500) 2%, transparent)' }}>
                          {['Referrer', 'Referred Customer', 'Order', 'Referred Discount', 'Referrer Reward', 'Status', 'IP Address', 'User Agent', 'Date'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                              <TH_LABEL>{h}</TH_LABEL>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {usageData.data.map((u, i) => {
                          const um     = USAGE_STATUS[u.status] ?? USAGE_STATUS.pending;
                          const isLast = i === usageData.data.length - 1;
                          return (
                            <tr key={u.id}
                              style={{ borderBottom: isLast ? 'none' : '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)', transition: 'background 120ms' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 2%, transparent)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              {/* Referrer */}
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                {u.referrer ? (
                                  <>
                                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px' }}>
                                      {u.referrer.user?.name || '—'}
                                    </p>
                                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
                                      {u.referrer.customer_number}
                                    </p>
                                  </>
                                ) : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>}
                              </td>

                              {/* Referred Customer */}
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                {u.customer ? (
                                  <>
                                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px' }}>
                                      {u.customer.user?.name || '—'}
                                    </p>
                                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
                                      {u.customer.customer_number}
                                    </p>
                                  </>
                                ) : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>}
                              </td>

                              {/* Order */}
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                {u.order
                                  ? <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--color-primary-600)', fontWeight: 700 }}>#{u.order.order_number}</span>
                                  : u.hamper_order
                                    ? <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#d97706', fontWeight: 700 }}>#{u.hamper_order.order_number} <span style={{ fontSize: '0.65rem', background: 'rgba(217,119,6,0.1)', padding: '1px 6px', borderRadius: 4 }}>Hamper</span></span>
                                    : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>}
                              </td>

                              {/* Referred Discount */}
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                {(() => {
                                  const discount = parseFloat(u.order?.referral_discount) || parseFloat(u.discount_amount) || 0;
                                  return discount > 0
                                    ? <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b91c1c' }}>-{fmt(discount)}</span>
                                    : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>;
                                })()}
                              </td>

                              {/* Referrer Reward */}
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                {u.referrer_reward_amount ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{fmt(u.referrer_reward_amount)}</span>
                                    {u.referrer_reward_paid
                                      ? <BadgeCheck size={13} style={{ color: '#10b981' }} />
                                      : <AlertCircle size={13} style={{ color: '#f59e0b' }} />}
                                  </div>
                                ) : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>}
                              </td>

                              {/* Status */}
                              <td style={{ padding: '11px 16px' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                                  background: `${um.dot}18`, color: um.color,
                                  boxShadow: `0 0 0 1px ${um.dot}44`,
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: um.dot, flexShrink: 0 }} />
                                  {um.label}
                                </span>
                              </td>

                              {/* IP Address */}
                              <td style={{ padding: '11px 16px' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#6b7280' }}>
                                  {u.ip_address || '—'}
                                </span>
                              </td>

                              {/* User Agent */}
                              <td style={{ padding: '11px 16px', maxWidth: 180 }}>
                                <span
                                  title={u.user_agent}
                                  style={{
                                    fontSize: '0.68rem', color: '#9ca3af',
                                    display: 'block', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    maxWidth: 180,
                                  }}
                                >
                                  {u.user_agent || '—'}
                                </span>
                              </td>

                              {/* Date */}
                              <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{fmtDT(u.created_at)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination — unchanged */}
                  {usageData.last_page > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
                        {usageData.from}–{usageData.to} of {usageData.total} records
                      </p>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => setUsagePage(p => p - 1)} disabled={usagePage === 1} style={{
                          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', background: 'none',
                          color: 'var(--color-primary-500)', cursor: usagePage === 1 ? 'not-allowed' : 'pointer',
                          opacity: usagePage === 1 ? 0.3 : 1,
                        }}>
                          <ChevronLeft size={13} />
                        </button>
                        <span style={{
                          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                          background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
                          boxShadow: '0 2px 8px color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
                        }}>
                          {usagePage}
                        </span>
                        <button onClick={() => setUsagePage(p => p + 1)} disabled={usagePage === usageData.last_page} style={{
                          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', background: 'none',
                          color: 'var(--color-primary-500)', cursor: usagePage === usageData.last_page ? 'not-allowed' : 'pointer',
                          opacity: usagePage === usageData.last_page ? 0.3 : 1,
                        }}>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </SettingsLayout>
  );
}