import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Edit3, Play, Pause, Archive, Trash2,
  Copy, Check, Users, DollarSign, TrendingUp, Zap,
  Calendar, Tag, UserCheck, RefreshCw, AlertCircle,
  BarChart2, Clock, ShoppingBag,
} from 'lucide-react';
import SettingsLayout from '../../../components/layout/SettingsLayout';
import usePromoCodeStore from '../../../store/promoCodeStore';
import promoCodesAPI from '../../../api/promoCodes';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Design tokens ─────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ── Meta ──────────────────────────────────────────────────────────────────────
const EVENT_META = {
  birthday:          { label: 'Birthday',          color: '#db2777', bg: '#fdf2f8', icon: '🎂' },
  first_time:        { label: 'First Time',        color: '#0891b2', bg: '#ecfeff', icon: '🎉' },
  vip_upgrade:       { label: 'VIP Upgrade',       color: '#d97706', bg: '#fffbeb', icon: '🏆' },
  loyalty_milestone: { label: 'Loyalty Milestone', color: '#7c3aed', bg: '#f5f3ff', icon: '🎯' },
  win_back:          { label: 'Win-Back',          color: '#dc2626', bg: '#fef2f2', icon: '👋' },
  seasonal:          { label: 'Seasonal',          color: '#059669', bg: '#f0fdf4', icon: '🌟' },
  flash_sale:        { label: 'Flash Sale',        color: '#f59e0b', bg: '#fffbeb', icon: '⚡' },
  bulk_order:        { label: 'Bulk Order',        color: '#6366f1', bg: '#eef2ff', icon: '📦' },
  general:           { label: 'General',           color: '#6b7280', bg: '#f9fafb', icon: '🏷' },
};

const STATUS_META = {
  draft:    { label: 'Draft',    color: '#6b7280', dot: '#9ca3af' },
  active:   { label: 'Active',   color: '#15803d', dot: '#22c55e' },
  paused:   { label: 'Paused',   color: '#d97706', dot: '#f59e0b' },
  expired:  { label: 'Expired',  color: '#dc2626', dot: '#ef4444' },
  depleted: { label: 'Depleted', color: '#7c3aed', dot: '#a855f7' },
  archived: { label: 'Archived', color: '#9ca3af', dot: '#d1d5db' },
};

// ── Atoms ─────────────────────────────────────────────────────────────────────
const Panel = ({ children, style = {} }) => (
  <div style={{
    background: 'white', borderRadius: 16,
    border: '1px solid #f3f4f6',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    overflow: 'hidden', ...style,
  }}>
    {children}
  </div>
);

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>
      {children}
    </p>
  </div>
);

const Pill = ({ children, color = purple }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 9999,
    fontSize: '0.7rem', fontWeight: 700,
    color, background: `${color}18`, border: `1px solid ${color}30`,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
    {children}
  </span>
);

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 8,
        fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem',
        letterSpacing: '0.08em', color: purple,
        background: purpleLt, border: `1.5px solid ${purpleBd}`,
        cursor: 'pointer',
      }}>
      {code}
      {copied
        ? <Check size={13} color="#10b981" />
        : <Copy size={13} color={purple} />}
    </button>
  );
}

const Btn = ({ children, onClick, disabled, variant = 'ghost', icon, size = 'md' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}` },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb' },
    warning: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', border: 'none' },
  };
  const pad = size === 'sm' ? '6px 14px' : '9px 20px';
  const fs  = size === 'sm' ? '0.78rem'  : '0.83rem';
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 10, fontSize: fs,
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}>
      {icon}{children}
    </button>
  );
};

const fmt     = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtDate = (d) => { try { return format(new Date(d), 'MMM d, yyyy'); } catch { return '—'; } };
const fmtDT   = (d) => { try { return format(new Date(d), 'MMM d, yyyy · h:mm a'); } catch { return '—'; } };

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PromoCodeDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { activateCode, pauseCode, archiveCode, deleteCode } = usePromoCodeStore();

  const [code,    setCode]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [actLoading, setActLoading] = useState(null);

  const [redemptions, setRedemptions] = useState([]);

  useEffect(() => {
    if (!id) return;
    promoCodesAPI.getRedemptions(id)
      .then(data => setRedemptions(data.redemptions ?? []))
      .catch(() => setRedemptions([]));
  }, [id]);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await promoCodesAPI.getOne(id);
      setCode(res.code);
    } catch {
      toast.error('Failed to load promo code.');
      navigate('/admin/promo-codes');
    } finally {
      setLoading(false);
    }
  };

  const run = async (action, label) => {
    setActLoading(action);
    try {
      if (action === 'activate') await activateCode(id);
      if (action === 'pause')    await pauseCode(id);
      if (action === 'archive')  await archiveCode(id);
      if (action === 'delete') {
        if (!confirm(`Delete promo code ${code.code}?`)) { setActLoading(null); return; }
        await deleteCode(id);
        toast.success('Code deleted.');
        navigate('/admin/promo-codes');
        return;
      }
      toast.success(`${label} successful.`);
      await load();
    } catch {
      toast.error(`${label} failed.`);
    } finally {
      setActLoading(null);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <SettingsLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${purpleBd}`, borderTopColor: purple, animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </SettingsLayout>
  );

  if (!code) return null;

  const eventMeta  = EVENT_META[code.event_type]  || EVENT_META.general;
  const statusMeta = STATUS_META[code.status]     || {};

  const rewardStr = code.reward_type === 'percentage'
    ? `${code.reward_value}% off`
    : code.reward_type === 'fixed_amount'
      ? `KES ${Number(code.reward_value).toLocaleString()} off`
      : code.reward_type === 'free_shipping'
        ? 'Free Shipping'
        : 'Store Credit';

  const usagePct = code.max_uses
    ? Math.min((code.times_used / code.max_uses) * 100, 100)
    : null;

  return (
    <SettingsLayout>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate('/admin/promo-codes')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 600, padding: 0, marginBottom: 12 }}>
          <ChevronLeft size={14} /> Back to Promo Codes
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.8rem' }}>{eventMeta.icon}</span>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: purple, margin: 0 }}>
                {code.name}
              </h1>
              <Pill color={statusMeta.color || '#9ca3af'}>
                {statusMeta.label}
              </Pill>
              {code.auto_generated && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', background: '#f0fdf4', padding: '2px 8px', borderRadius: 99, border: '1px solid #bbf7d0' }}>
                  Auto-generated
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <CopyCode code={code.code} />
              <span style={{
                padding: '4px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                background: eventMeta.bg, color: eventMeta.color,
              }}>
                {eventMeta.icon} {eventMeta.label}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {code.status !== 'active'   && <Btn variant="success" icon={<Play size={14} />}    onClick={() => run('activate', 'Activation')} disabled={!!actLoading}>Activate</Btn>}
            {code.status === 'active'   && <Btn variant="warning" icon={<Pause size={14} />}   onClick={() => run('pause',    'Pause')}      disabled={!!actLoading}>Pause</Btn>}
            {code.status !== 'archived' && <Btn variant="outline" icon={<Archive size={14} />} onClick={() => run('archive',  'Archive')}    disabled={!!actLoading}>Archive</Btn>}
            <Btn variant="danger" icon={<Trash2 size={14} />} onClick={() => run('delete', 'Delete')} disabled={!!actLoading}>Delete</Btn>
          </div>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Reward details */}
          <Panel>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f3f4f6' }}>
              <SectionLabel icon={Tag}>Reward Details</SectionLabel>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Reward',       value: rewardStr,                         color: purple },
                  { label: 'Reward Type',  value: code.reward_type?.replace(/_/g,' ') },
                  { label: 'Stackable',    value: code.stackable ? '✓ Yes' : '✕ No', color: code.stackable ? '#10b981' : '#6b7280' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '12px 14px', borderRadius: 10, background: purpleLt, border: `1px solid ${purpleBd}`, textAlign: 'center' }}>
                    <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
                    <p style={{ fontSize: '0.92rem', fontWeight: 800, color: color || '#111827', margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {code.description && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6', marginBottom: 12 }}>
                  <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>
                    {code.description}
                  </p>
                </div>
              )}

              {/* Conditions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Min Order Value',     value: code.min_order_value ? `KES ${Number(code.min_order_value).toLocaleString()}` : 'None' },
                  { label: 'Min Items',           value: code.min_items       ? code.min_items                                          : 'None' },
                  { label: 'Max Uses (Total)',    value: code.max_uses        ? code.max_uses                                           : 'Unlimited' },
                  { label: 'Max Per Customer',    value: code.max_uses_per_customer ?? 'Unlimited' },
                  { label: 'Valid From',          value: code.valid_from      ? fmtDate(code.valid_from)  : 'Immediately' },
                  { label: 'Valid Until',         value: code.valid_until     ? fmtDate(code.valid_until) : 'No expiry' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f9fafb', fontSize: '0.8rem' }}>
                    <span style={{ color: '#6b7280' }}>{label}</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Redemptions */}
          <Panel>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f3f4f6' }}>
              <SectionLabel icon={ShoppingBag}>Redemptions</SectionLabel>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {redemptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
                  No orders have used this code yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                      {['Order', 'Customer', 'Subtotal (KES)', 'Discount', 'Status', 'Date'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {redemptions.map((r, i) => (
                      <tr key={r.order_id} style={{ borderBottom: '1px solid #f9fafb', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: purple }}>{r.order_number}</td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{r.customer_name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{r.customer_email}</div>
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 700 }}>KES {r.subtotal_kes.toLocaleString()}</td>
                        <td style={{ padding: '10px 10px', color: '#ef4444', fontWeight: 700 }}>- KES {r.promo_discount.toLocaleString()}</td>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                            background: r.status === 'delivered' ? '#d1fae5' : r.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                            color:      r.status === 'delivered' ? '#065f46' : r.status === 'cancelled' ? '#991b1b' : '#92400e',
                          }}>{r.status}</span>
                        </td>
                        <td style={{ padding: '10px 10px', color: '#6b7280' }}>{new Date(r.redeemed_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>

          {/* Performance */}
          <Panel>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #f3f4f6' }}>
              <SectionLabel icon={BarChart2}>Performance</SectionLabel>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Total Uses',    value: code.times_used      ?? 0 },
                  { label: 'Revenue Subtotal',       value: fmt(code.total_revenue) },
                  { label: 'Discount Given',value: fmt(code.total_discount_given) },
                  { label: 'Conversion',    value: `${Number(code.conversion_rate ?? 0).toFixed(1)}%` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: '12px 14px', borderRadius: 10, background: purpleLt, border: `1px solid ${purpleBd}`, textAlign: 'center' }}>
                    <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
                    <p style={{ fontSize: '0.92rem', fontWeight: 800, color: purple, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Usage progress bar */}
              {code.max_uses && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.78rem' }}>
                    <span style={{ color: '#6b7280' }}>Usage</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>
                      {code.times_used} / {code.max_uses} uses
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99, transition: 'width 0.4s ease',
                      width: `${usagePct}%`,
                      background: usagePct >= 90 ? '#ef4444' : usagePct >= 70 ? '#f59e0b' : purple,
                    }} />
                  </div>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>
                    {code.uses_remaining !== null ? `${code.uses_remaining} uses remaining` : ''}
                  </p>
                </div>
              )}

              {/* Funnel: views → attempts → uses */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'Views',    value: code.views    ?? 0, color: '#6b7280' },
                  { label: 'Attempts', value: code.attempts ?? 0, color: '#f59e0b' },
                  { label: 'Successes',value: code.successful_uses ?? 0, color: '#10b981' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '8px 10px', borderRadius: 8, background: `${color}10`, border: `1px solid ${color}25`, textAlign: 'center' }}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 700, color, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                    <p style={{ fontSize: '1rem', fontWeight: 900, color, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Admin notes */}
          {code.admin_notes && (
            <Panel>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid #f3f4f6' }}>
                <SectionLabel>Admin Notes (Internal)</SectionLabel>
              </div>
              <div style={{ padding: '16px 22px' }}>
                <p style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {code.admin_notes}
                </p>
              </div>
            </Panel>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status */}
          <Panel>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6' }}>
              <SectionLabel>Status</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Pill color={statusMeta.color || '#9ca3af'}>{statusMeta.label}</Pill>
              </div>
              {[
                { label: 'Is Valid',   value: code.is_valid   ? '✓ Yes' : '✕ No', color: code.is_valid   ? '#10b981' : '#ef4444' },
                { label: 'Expired',    value: code.is_expired ? '✓ Yes' : 'No',   color: code.is_expired ? '#ef4444' : '#6b7280' },
                { label: 'Depleted',   value: code.is_depleted? '✓ Yes' : 'No',   color: code.is_depleted? '#ef4444' : '#6b7280' },
                { label: 'Public',     value: code.is_public  ? '✓ Yes' : 'No',   color: code.is_public  ? '#10b981' : '#6b7280' },
                { label: 'Auto-Gen',   value: code.auto_generated ? '✓ Yes' : 'No', color: code.auto_generated ? '#0891b2' : '#6b7280' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f9fafb', fontSize: '0.78rem' }}>
                  <span style={{ color: '#9ca3af' }}>{label}</span>
                  <span style={{ fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Target customer */}
          {code.target_customer && (
            <Panel>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6' }}>
                <SectionLabel icon={UserCheck}>Target Customer</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <img
                    src={code.target_customer.profile_image_url}
                    alt={code.target_customer.full_name}
                    style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', background: '#f3f4f6' }}
                  />
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                      {code.target_customer.full_name}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
                      {code.target_customer.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/admin/customers/${code.target_customer.id}`)}
                  style={{
                    width: '100%', padding: '7px', borderRadius: 8,
                    background: purpleLt, border: `1px solid ${purpleBd}`,
                    color: purple, fontSize: '0.78rem', fontWeight: 700,
                    cursor: 'pointer',
                  }}>
                  View Customer →
                </button>
              </div>
            </Panel>
          )}

          {/* Timeline */}
          <Panel>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6' }}>
              <SectionLabel icon={Clock}>Timeline</SectionLabel>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {[
                { label: 'Created',      value: code.created_at },
                { label: 'Updated',      value: code.updated_at },
                { label: 'Valid From',   value: code.valid_from },
                { label: 'Valid Until',  value: code.valid_until },
              ].filter(t => t.value).map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>
                    {label}
                  </p>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                    {fmtDT(value)}
                  </p>
                </div>
              ))}

              {/* Days until expiry */}
              {code.days_until_expiry !== null && !code.is_expired && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  background: code.days_until_expiry <= 7 ? 'rgba(245,158,11,0.08)' : purpleLt,
                  border: `1px solid ${code.days_until_expiry <= 7 ? 'rgba(245,158,11,0.25)' : purpleBd}`,
                }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: code.days_until_expiry <= 7 ? '#d97706' : purple, margin: 0 }}>
                    {code.days_until_expiry <= 7 ? '⚠ ' : ''}
                    {code.days_until_expiry === 0 ? 'Expires today' : `Expires in ${code.days_until_expiry} day(s)`}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          {/* Generation info */}
          {code.auto_generated && (
            <Panel>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6' }}>
                <SectionLabel icon={RefreshCw}>Generation Info</SectionLabel>
              </div>
              <div style={{ padding: '14px 18px' }}>
                {[
                  { label: 'Batch',    value: code.generation_batch ?? '—' },
                  { label: 'Milestone',value: code.milestone_trigger ? `Order #${code.milestone_trigger}` : '—' },
                  { label: 'Inactive Days', value: code.inactive_days ? `${code.inactive_days} days` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f9fafb', fontSize: '0.78rem' }}>
                    <span style={{ color: '#9ca3af' }}>{label}</span>
                    <span style={{ fontWeight: 700, color: '#374151', fontFamily: 'monospace', fontSize: '0.72rem' }}>{value}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}