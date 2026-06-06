import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store';
import ThemeSwitcher from '../../../components/common/ThemeSwitcher';
import toast from 'react-hot-toast';

const LEDGER_META = {
  payments:       { label: 'Payments',       color: '#10b981', icon: '💳', amountLabel: 'KES' },
  store_credit:   { label: 'Store Credit',   color: '#3b82f6', icon: '🎟', amountLabel: 'KES' },
  loyalty_points: { label: 'Loyalty Points', color: '#a855f7', icon: '⭐', amountLabel: 'PTS' },
  credit_account: { label: 'Credit Account', color: '#f59e0b', icon: '🏦', amountLabel: 'KES' },
  vat:            { label: 'VAT',            color: '#ef4444', icon: '🧾', amountLabel: 'KES' },
};

const LINE_STATUS_COLORS = {
  pending:     { bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   text: '#f59e0b' },
  confirmed:   { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   text: '#10b981' },
  disputed:    { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    text: '#ef4444' },
  written_off: { bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.3)', text: '#64748b' },
  voided:      { bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.2)',    text: '#dc2626' },
};

const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary, #0f0f1a)',
    padding: '32px',
    fontFamily: 'monospace',
  },
  back: {
    color: '#475569',
    fontSize: '12px',
    cursor: 'pointer',
    marginBottom: '20px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'color 0.15s',
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  title: {
    color: '#e2e8f0',
    fontSize: '20px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  subtitle: { color: '#475569', fontSize: '11px', letterSpacing: '0.06em' },
  actions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },

  btn: (color, disabled) => ({
    padding: '9px 18px',
    background: disabled ? 'rgba(255,255,255,0.04)' : `${color}22`,
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : `${color}55`}`,
    borderRadius: '8px',
    color: disabled ? '#334155' : color,
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
  }),

  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginBottom: '24px',
  },
  statCard: (color) => ({
    background: 'linear-gradient(160deg, #0f0f1a, #1a1a2e)',
    border: `1px solid ${color}30`,
    borderRadius: '10px',
    padding: '14px',
  }),
  statVal: (color) => ({
    color,
    fontSize: '22px',
    fontWeight: 800,
    fontFamily: 'monospace',
  }),
  statLabel: {
    color: '#475569',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginTop: '4px',
  },

  filters: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  filterSelect: {
    background: '#0f0f1a',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '8px 12px',
    fontFamily: 'monospace',
    outline: 'none',
    cursor: 'pointer',
  },

  // bulk confirm banner
  bulkBanner: (hasBlockers) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    marginBottom: '14px',
    background: hasBlockers ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)',
    border: `1px solid ${hasBlockers ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
    borderRadius: '10px',
    flexWrap: 'wrap',
    gap: '10px',
  }),
  bulkBannerText: (hasBlockers) => ({
    color: hasBlockers ? '#ef4444' : '#10b981',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    flex: 1,
  }),

  tableWrap: {
    background: 'linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    color: '#475569',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(168,85,247,0.15)',
    background: 'rgba(168,85,247,0.04)',
    fontFamily: 'monospace',
  },
  thCheck: {
    padding: '12px 12px 12px 16px',
    width: '36px',
    borderBottom: '1px solid rgba(168,85,247,0.15)',
    background: 'rgba(168,85,247,0.04)',
  },
  td: {
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'top',
  },
  tdCheck: {
    padding: '14px 12px 14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    width: '36px',
  },
  tr: (hover, selected) => ({
    background: selected
      ? 'rgba(16,185,129,0.05)'
      : hover ? 'rgba(168,85,247,0.03)' : 'transparent',
    transition: 'background 0.15s',
    outline: selected ? '1px solid rgba(16,185,129,0.15)' : 'none',
    outlineOffset: '-1px',
  }),
  pill: (colors) => ({
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  }),
  amt: (variance) => ({
    fontSize: '13px',
    fontWeight: 700,
    color: variance === null ? '#94a3b8'
      : variance === 0 ? '#10b981'
        : variance > 0 ? '#f59e0b' : '#ef4444',
    fontFamily: 'monospace',
  }),
  meta: { color: '#475569', fontSize: '10px', lineHeight: 1.6 },

  lineActions: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  lineBtn: (color) => ({
    padding: '4px 10px',
    background: `${color}18`,
    border: `1px solid ${color}44`,
    borderRadius: '6px',
    color,
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'all 0.15s',
  }),

  noteBox: {
    background: 'rgba(168,85,247,0.06)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '6px',
    padding: '6px 10px',
    marginTop: '6px',
    color: '#94a3b8',
    fontSize: '10px',
    lineHeight: 1.5,
  },

  metaTag: (color) => ({
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    background: `${color}15`,
    border: `1px solid ${color}30`,
    color,
    fontFamily: 'monospace',
    marginRight: '4px',
    marginTop: '3px',
  }),

  empty: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#475569',
    fontSize: '13px',
  },

  // progress bar for bulk confirm
  progressWrap: {
    height: '3px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
    width: '120px',
  },
  progressBar: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: '#10b981',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  }),

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBox: {
    background: 'linear-gradient(160deg, #0f0f1a, #1a1a2e)',
    border: '1px solid rgba(168,85,247,0.4)',
    borderRadius: '16px',
    padding: '28px',
    width: '420px',
    fontFamily: 'monospace',
    boxShadow: '0 0 60px rgba(168,85,247,0.15)',
  },
  modalTitle: { color: '#e2e8f0', fontSize: '15px', fontWeight: 800, marginBottom: '16px' },
  modalLabel: { color: '#94a3b8', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' },
  modalInput: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px', padding: '9px 12px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' },
  modalTextarea: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px', padding: '9px 12px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: '80px' },
  modalFooter: { display: 'flex', gap: '10px', marginTop: '20px' },
  btnCancel: { flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer' },
  btnConfirm: (color) => ({ flex: 2, padding: '10px', background: `linear-gradient(135deg, ${color}, ${color}cc)`, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer' }),

  checkbox: {
    width: '15px',
    height: '15px',
    accentColor: '#10b981',
    cursor: 'pointer',
  },
};

// ── Ledger meta renderers ─────────────────────────────────────────────────────

const STORE_CREDIT_TYPE_COLORS = {
  admin_grant:       '#10b981',
  admin_deduct:      '#ef4444',
  referral_reward:   '#a855f7',
  points_redemption: '#3b82f6',
  order_refund:      '#06b6d4',
  order_spend:       '#f59e0b',
  adjustment:        '#64748b',
  expiry:            '#475569',
};

const LOYALTY_TYPE_COLORS = {
  order_earn:     '#10b981',
  admin_grant:    '#10b981',
  referral_bonus: '#a855f7',
  birthday_bonus: '#ec4899',
  review_bonus:   '#06b6d4',
  redemption:     '#f59e0b',
  expiry:         '#475569',
  adjustment:     '#64748b',
  order_cancel:   '#ef4444',
  order_restore:  '#3b82f6',
  admin_deduct:   '#ef4444',
};

const CREDIT_TYPE_COLORS = {
  purchase:   '#f59e0b',
  payment:    '#10b981',
  adjustment: '#64748b',
  write_off:  '#475569',
  interest:   '#ef4444',
};

function RefTrace({ type, id }) {
  if (!type || !id) return null;
  // shorten the morph class to just the model name e.g. App\Models\Order => Order
  const short = type.includes('\\') ? type.split('\\').pop() : type;
  return (
    <span style={S.metaTag('#475569')} title={`${type} #${id}`}>
      {short} #{id}
    </span>
  );
}

function PaymentMeta({ meta }) {
  if (!meta) return null;
  return (
    <div style={{ marginTop: '5px' }}>
      {meta.payment_number && (
        <span style={S.metaTag('#10b981')}>{meta.payment_number}</span>
      )}
      {meta.method && (
        <span style={S.metaTag('#3b82f6')}>{meta.method.toUpperCase()}</span>
      )}
      {meta.payment_status && (
        <span style={S.metaTag('#94a3b8')}>{meta.payment_status.toUpperCase()}</span>
      )}
      {meta.payment_reference && (
        <span style={S.metaTag('#f59e0b')} title={meta.payment_reference}>
          {meta.payment_reference.length > 14 ? meta.payment_reference.slice(0, 14) + '…' : meta.payment_reference}
        </span>
      )}
      {meta.is_partial && (
        <span style={S.metaTag('#f59e0b')}>PARTIAL</span>
      )}
      {meta.order_number && (
        <span style={S.metaTag('#a855f7')}>{meta.order_number}</span>
      )}
      {meta.customer_name && (
        <span style={S.metaTag('#64748b')}>👤 {meta.customer_name}</span>
      )}
    </div>
  );
}

function StoreCreditMeta({ meta }) {
  if (!meta) return null;
  const typeColor = STORE_CREDIT_TYPE_COLORS[meta.type] ?? '#64748b';
  return (
    <div style={{ marginTop: '5px' }}>
      {meta.type && (
        <span style={S.metaTag(typeColor)}>{meta.type.replace(/_/g, ' ').toUpperCase()}</span>
      )}
      {meta.balance_after != null && (
        <span style={S.metaTag('#475569')}>
          BAL {Number(meta.balance_after).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
        </span>
      )}
      {meta.expires_at && (
        <span style={S.metaTag('#f59e0b')} title={`Expires ${meta.expires_at}`}>
          EXP {new Date(meta.expires_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      )}
      {meta.order_number
        ? <span style={S.metaTag('#a855f7')}>{meta.order_number}</span>
        : <RefTrace type={meta.reference_type} id={meta.reference_id} />
      }
      {meta.customer_name && (
        <span style={S.metaTag('#64748b')}>👤 {meta.customer_name}</span>
      )}
    </div>
  );
}

function LoyaltyMeta({ meta }) {
  if (!meta) return null;
  const typeColor      = LOYALTY_TYPE_COLORS[meta.type] ?? '#64748b';
  const pointTypeColor = meta.point_type === 'expiring' ? '#f59e0b' : '#a855f7';
  return (
    <div style={{ marginTop: '5px' }}>
      {meta.type && (
        <span style={S.metaTag(typeColor)}>{meta.type.replace(/_/g, ' ').toUpperCase()}</span>
      )}
      {meta.point_type && (
        <span style={S.metaTag(pointTypeColor)}>{meta.point_type.toUpperCase()}</span>
      )}
      {meta.balance_after != null && (
        <span style={S.metaTag('#475569')}>BAL {Number(meta.balance_after).toLocaleString('en-KE')} PTS</span>
      )}
      {meta.expires_at && (
        <span style={S.metaTag('#f59e0b')} title={`Expires ${meta.expires_at}`}>
          EXP {new Date(meta.expires_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      )}
      {meta.order_number
        ? <span style={S.metaTag('#a855f7')}>{meta.order_number}</span>
        : <RefTrace type={meta.reference_type} id={meta.reference_id} />
      }
      {meta.customer_name && (
        <span style={S.metaTag('#64748b')}>👤 {meta.customer_name}</span>
      )}
    </div>
  );
}

function CreditAccountMeta({ meta }) {
  if (!meta) return null;
  const typeColor      = CREDIT_TYPE_COLORS[meta.type] ?? '#64748b';
  const directionColor = meta.direction === 'debit' ? '#ef4444' : '#10b981';
  return (
    <div style={{ marginTop: '5px' }}>
      {meta.direction && (
        <span style={S.metaTag(directionColor)}>{meta.direction.toUpperCase()}</span>
      )}
      {meta.type && (
        <span style={S.metaTag(typeColor)}>{meta.type.replace(/_/g, ' ').toUpperCase()}</span>
      )}
      {meta.balance_before != null && meta.balance_after != null && (
        <span style={S.metaTag('#475569')}>
          {Number(meta.balance_before).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
          {' → '}
          {Number(meta.balance_after).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
        </span>
      )}
      {meta.order_number
        ? <span style={S.metaTag('#a855f7')}>{meta.order_number}</span>
        : <RefTrace type={meta.reference_type} id={meta.reference_id} />
      }
      {meta.customer_name && (
        <span style={S.metaTag('#64748b')}>👤 {meta.customer_name}</span>
      )}
    </div>
  );
}

function VatMeta({ meta }) {
  if (!meta) return null;
  return (
    <div style={{ marginTop: '5px' }}>
      {meta.order_number && (
        <span style={S.metaTag('#ef4444')}>{meta.order_number}</span>
      )}
      {meta.source === 'auction_order' && (
        <span style={S.metaTag('#f59e0b')}>AUCTION</span>
      )}
      {meta.is_exempt && (
        <span style={S.metaTag('#475569')}>EXEMPT</span>
      )}
      {meta.currency && meta.currency !== 'KES' && (
        <span style={S.metaTag('#f59e0b')}>{meta.currency}</span>
      )}
      {meta.payment_status && (
        <span style={S.metaTag('#94a3b8')}>{meta.payment_status.toUpperCase()}</span>
      )}
      {meta.order_status && (
        <span style={S.metaTag(
          meta.order_status === 'cancelled' || meta.order_status === 'failed' ? '#dc2626' : '#64748b'
        )}>{meta.order_status.toUpperCase()}</span>
      )}
      {meta.customer_name && (
        <span style={S.metaTag('#64748b')}>👤 {meta.customer_name}</span>
      )}
    </div>
  );
}

function LineMeta({ ledger, meta }) {
  if (!meta) return null;
  if (ledger === 'payments')       return <PaymentMeta meta={meta} />;
  if (ledger === 'store_credit')   return <StoreCreditMeta meta={meta} />;
  if (ledger === 'loyalty_points') return <LoyaltyMeta meta={meta} />;
  if (ledger === 'credit_account') return <CreditAccountMeta meta={meta} />;
  if (ledger === 'vat')            return <VatMeta meta={meta} />;
  return null;
}

// ── Action Modal ──────────────────────────────────────────────────────────────

function ActionModal({ line, action, ledger, onClose, onDone }) {
  const [actualAmount, setActualAmount] = useState(line.expected_amount ?? '');
  const [note, setNote]                 = useState('');
  const [saving, setSaving]             = useState(false);

  const isPoints   = ledger === 'loyalty_points';
  const isPayments = ledger === 'payments';

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = { action };
      if (action === 'confirm' && isPayments) payload.actual_amount   = actualAmount;
      if (action === 'dispute')               payload.dispute_note    = note;
      if (action === 'write_off')             payload.resolution_note = note;
      if (action === 'void')                  payload.resolution_note = note;

      await api.put(`/admin/reconciliation/lines/${line.id}`, payload);
      toast.success(`Line ${
        action === 'confirm' ? 'confirmed'
        : action === 'dispute' ? 'disputed'
        : action === 'void' ? 'voided'
        : 'written off'
      }`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const titles = {
    confirm:   '✅ CONFIRM LINE',
    dispute:   '🚩 RAISE DISPUTE',
    write_off: '✍ WRITE OFF',
    void:      '🚫 VOID LINE',
  };
  const colors = {
    confirm:   '#10b981',
    dispute:   '#ef4444',
    write_off: '#64748b',
    void:      '#dc2626',
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalTitle}>{titles[action]}</div>
        <div style={{ color: '#475569', fontSize: '11px', marginBottom: '16px' }}>
          {line.subject_table} #{line.subject_id}
          {line.note && <span style={{ color: '#a855f7', marginLeft: '8px' }}>📓 has note</span>}
          {line.meta?.payment_number && (
            <span style={{ color: '#10b981', marginLeft: '8px' }}>{line.meta.payment_number}</span>
          )}
          {line.meta?.order_number && (
            <span style={{ color: '#a855f7', marginLeft: '8px' }}>{line.meta.order_number}</span>
          )}
          {line.meta?.customer_name && (
            <span style={{ color: '#64748b', marginLeft: '8px' }}>· {line.meta.customer_name}</span>
          )}
        </div>

        {action === 'confirm' && isPayments && (
          <>
            <label style={S.modalLabel}>Actual Amount ({isPoints ? 'Points' : 'KES'})</label>
            <input
              style={S.modalInput}
              type="number"
              step="0.01"
              value={actualAmount}
              onChange={e => setActualAmount(e.target.value)}
              placeholder={`Expected: ${line.expected_amount}`}
            />
            {line.expected_amount && actualAmount && Number(actualAmount) !== Number(line.expected_amount) && (
              <div style={{ color: '#f59e0b', fontSize: '11px', marginBottom: '12px' }}>
                ⚠ Variance: {(Number(actualAmount) - Number(line.expected_amount)).toFixed(2)}
              </div>
            )}
          </>
        )}

        {(action === 'dispute' || action === 'write_off' || action === 'void') && (
          <>
            <label style={S.modalLabel}>
              {action === 'dispute' ? 'Dispute Reason'
               : action === 'void' ? 'Void Reason'
               : 'Resolution Note'} *
            </label>
            <textarea
              style={S.modalTextarea}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                action === 'dispute' ? 'What is wrong with this record?'
                : action === 'void' ? 'Why is this line being voided? e.g. order cancelled'
                : 'Why is this being written off?'
              }
            />
          </>
        )}

        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>CANCEL</button>
          <button
            style={S.btnConfirm(colors[action])}
            disabled={saving || (['dispute', 'write_off', 'void'].includes(action) && !note.trim())}
            onClick={handleSubmit}
          >
            {saving ? 'SAVING...' : action.toUpperCase().replace('_', ' ')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionMetaModal({ session, onClose }) {
  const events = session.meta?.events ?? [];

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric'
  }) : '—';

  const eventTypeColors = {
    session_created:    '#10b981',
    session_closed:     '#64748b',
    session_reopened:   '#f59e0b',
    line_status_change: '#a855f7',
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modalBox, width: '580px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalTitle}>📊 SESSION META — {session.session_number}</div>

        {/* Session fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          {[
            ['Period',    `${fmtDate(session.period_start)} → ${fmtDate(session.period_end)}`],
            ['Ledger',    session.ledger],
            ['Status',    session.status],
            ['Opened At', fmt(session.opened_at)],
            ['Closed At', fmt(session.closed_at)],
            ['Notes',     session.notes ?? '—'],
          ].map(([key, val]) => (
            <div key={key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: '100px', paddingTop: '1px' }}>
                {key}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: '11px', fontFamily: 'monospace' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Events audit trail */}
        <div style={{ color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
          Audit Trail ({events.length})
        </div>

        {events.length === 0 ? (
          <div style={{ color: '#334155', fontSize: '11px' }}>No events recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.map((ev, i) => {
              const color = eventTypeColors[ev.type] ?? '#94a3b8';
              return (
                <div key={i} style={{ background: `${color}08`, border: `1px solid ${color}25`, borderRadius: '8px', padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: ev.type === 'line_status_change' ? '6px' : '0' }}>
                    <span style={{ color, fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {ev.type.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: '#475569', fontSize: '10px' }}>·</span>
                    <span style={{ color: '#475569', fontSize: '10px' }}>{ev.name ?? `#${ev.by}`}</span>
                    <span style={{ color: '#475569', fontSize: '10px', marginLeft: 'auto' }}>
                      {fmt(ev.at)}
                    </span>
                  </div>
                  {ev.type === 'line_status_change' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      <span style={S.metaTag('#475569')}>line #{ev.line_id}</span>
                      <span style={S.metaTag('#f59e0b')}>{ev.from}</span>
                      <span style={{ color: '#475569', fontSize: '10px', alignSelf: 'center' }}>→</span>
                      <span style={S.metaTag(color)}>{ev.to}</span>
                      {ev.line_meta?.order_number   && <span style={S.metaTag('#a855f7')}>{ev.line_meta.order_number}</span>}
                      {ev.line_meta?.customer_name  && <span style={S.metaTag('#64748b')}>👤 {ev.line_meta.customer_name}</span>}
                      {ev.line_meta?.payment_number && <span style={S.metaTag('#10b981')}>{ev.line_meta.payment_number}</span>}
                      {ev.dispute_note    && <div style={{ ...S.noteBox, marginTop: '6px', width: '100%' }}>🚩 {ev.dispute_note}</div>}
                      {ev.resolution_note && <div style={{ ...S.noteBox, marginTop: '6px', width: '100%' }}>✍ {ev.resolution_note}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

function MetaModal({ line, onClose }) {
  if (!line.meta) return null;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalTitle}>📋 LINE META</div>
        <div style={{ color: '#475569', fontSize: '11px', marginBottom: '16px' }}>
          {line.subject_table} #{line.subject_id}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(line.meta).map(([key, value]) => (
            value !== null && value !== undefined && (
              <div key={key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: '130px', paddingTop: '1px' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#e2e8f0', fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </span>
              </div>
            )
          ))}
        </div>
        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReconciliationDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [session, setSession]           = useState(null);
  const [lines, setLines]               = useState([]);
  const [meta, setMeta]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [linesLoading, setLinesLoading] = useState(true);
  const [hoveredRow, setHovered]        = useState(null);
  const [page, setPage]                 = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [populating, setPopulating]     = useState(false);
  const [closing, setClosing]           = useState(false);
  const [actionModal, setActionModal]   = useState(null);
  const [metaModal, setMetaModal]       = useState(null);
  const [sessionMetaModal, setSessionMetaModal] = useState(false);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue]     = useState('');
  const [savingNotes, setSavingNotes]   = useState(false);

  // ── Bulk confirm state ────────────────────────────────────────
  const [selectedIds, setSelectedIds]   = useState(new Set()); // line IDs checked
  const [bulkRunning, setBulkRunning]   = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const [reopening, setReopening] = useState(false);
  const abortRef                        = useRef(false);

  // ── Data fetching ─────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    try {
      const res = await api.get(`/admin/reconciliation/sessions/${id}`);
      setSession(res.data);
    } catch {
      toast.error('Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLines = useCallback(async () => {
    setLinesLoading(true);
    try {
      const params = { page, per_page: 50 };
      if (filterStatus) params.status       = filterStatus;
      if (varianceOnly) params.variance_only = 1;
      const res = await api.get(`/admin/reconciliation/sessions/${id}/lines`, { params });
      setLines(res.data.data);
      setMeta(res.data);
    } catch {
      toast.error('Failed to load lines');
    } finally {
      setLinesLoading(false);
    }
  }, [id, page, filterStatus, varianceOnly]);

  const handleReopen = async () => {
    if (!confirm('Reopen this session? It will be editable again.')) return;
    setReopening(true);
    try {
        await api.post(`/admin/reconciliation/sessions/${id}/reopen`);
        toast.success('Session reopened');
        fetchSession();
    } catch (err) {
        toast.error(err?.response?.data?.message || 'Cannot reopen session');
    } finally {
        setReopening(false);
    }
    };

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => {
    fetchLines();
    setSelectedIds(new Set()); // clear selection on page/filter change
  }, [fetchLines]);

  // ── Actions ───────────────────────────────────────────────────

  const handlePopulate = async () => {
    setPopulating(true);
    try {
      const res = await api.post(`/admin/reconciliation/sessions/${id}/populate`);
      toast.success(res.data.message);
      fetchSession();
      fetchLines();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Populate failed');
    } finally {
      setPopulating(false);
    }
  };

  const handleClose = async () => {
    if (!confirm('Close this session?')) return;
    setClosing(true);
    try {
      await api.post(`/admin/reconciliation/sessions/${id}/close`);
      toast.success('Session closed');
      fetchSession();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Cannot close session');
    } finally {
      setClosing(false);
    }
  };

  const handleSaveNotes = async () => {
  setSavingNotes(true);
  try {
    await api.patch(`/admin/reconciliation/sessions/${id}/notes`, { notes: notesValue });
    toast.success('Notes saved');
    setEditingNotes(false);
    fetchSession();
  } catch (err) {
    toast.error(err?.response?.data?.message || 'Failed to save notes');
  } finally {
    setSavingNotes(false);
  }
};

  // ── Checkbox helpers ──────────────────────────────────────────

  const toggleLine = (lineId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });
  };

  // Only pending lines are selectable; selectAll only touches pending on this page
  const pendingOnPage    = lines.filter(l => l.status === 'pending');
  const allPageSelected  = pendingOnPage.length > 0 && pendingOnPage.every(l => selectedIds.has(l.id));
  const somePageSelected = pendingOnPage.some(l => selectedIds.has(l.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pendingOnPage.forEach(l => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pendingOnPage.forEach(l => next.add(l.id));
        return next;
      });
    }
  };

  // ── Bulk confirm ──────────────────────────────────────────────

  // Identify any selected lines that are NOT pending (shouldn't happen but guard anyway)
  // and any selected lines that are disputed / written_off (already reviewed, can't bulk)
  const selectedLines     = lines.filter(l => selectedIds.has(l.id));
  const blockerLines      = selectedLines.filter(l => ['disputed', 'written_off'].includes(l.status));
  const confirmableLines  = selectedLines.filter(l => l.status === 'pending');
  const hasBlockers       = blockerLines.length > 0;
  const hasSelection      = selectedIds.size > 0;

  const handleBulkConfirm = async () => {
    if (confirmableLines.length === 0) return;

    abortRef.current = false;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: confirmableLines.length });

    let successCount = 0;
    let failCount    = 0;

    for (let i = 0; i < confirmableLines.length; i++) {
      if (abortRef.current) break;

      const line = confirmableLines[i];
      try {
        await api.put(`/admin/reconciliation/lines/${line.id}`, {
          action: 'confirm',
          ...(session.ledger === 'payments' ? { actual_amount: line.expected_amount } : {}),
        });
        successCount++;
        // remove from selection on success
        setSelectedIds(prev => { const n = new Set(prev); n.delete(line.id); return n; });
      } catch (err) {
        failCount++;
        toast.error(`Line #${line.id} failed: ${err?.response?.data?.message || 'error'}`);
      }

      setBulkProgress({ done: i + 1, total: confirmableLines.length });
    }

    setBulkRunning(false);

    if (successCount > 0) {
      toast.success(`${successCount} line${successCount > 1 ? 's' : ''} confirmed.`);
      fetchSession();
      fetchLines();
    }
    if (failCount > 0) {
      toast.error(`${failCount} line${failCount > 1 ? 's' : ''} failed — check individually.`);
    }
  };

  // ── Render ────────────────────────────────────────────────────

  if (loading) return <div style={{ ...S.page, color: '#475569' }}>Loading session...</div>;
  if (!session) return <div style={{ ...S.page, color: '#ef4444' }}>Session not found.</div>;

  const ledger     = LEDGER_META[session.ledger];
  const isOpen     = session.status === 'open';
  const isFinance  = ['super_admin', 'finance', 'admin'].includes(user?.role);
  const total      = session.lines_count      || 0;
  const confirmed  = session.confirmed_count  || 0;
  const disputed   = session.disputed_count   || 0;
  const pending    = session.pending_count    || 0;
  const writtenOff = session.written_off_count|| 0;
  const pct        = total ? Math.round((confirmed + writtenOff) / total * 100) : 0;

  const progressPct = bulkProgress.total
    ? Math.round((bulkProgress.done / bulkProgress.total) * 100)
    : 0;

  return (
    <div style={S.page}>

      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={S.back} onClick={() => navigate('/admin/reconciliation')}>
            ← RECONCILIATION
        </div>
        <ThemeSwitcher />
        </div>

      {/* Top row */}
      <div style={S.topRow}>
        <div>
          <div style={S.title}>
            {ledger?.icon} {session.session_number}
            {session.meta && (
                <button style={{ ...S.lineBtn('#a855f7'), marginLeft: '10px', verticalAlign: 'middle' }} onClick={() => setSessionMetaModal(true)}>
                META
                </button>
            )}
          </div>
          <div style={S.subtitle}>
            {ledger?.label} · {new Date(session.period_start).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
            {' → '}
            {new Date(session.period_end).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>

            {/* Notes */}
            {isFinance && (
            <div style={{ marginTop: '8px' }}>
                {editingNotes ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <textarea
                    value={notesValue}
                    onChange={e => setNotesValue(e.target.value)}
                    placeholder="Session notes..."
                    style={{ ...S.modalTextarea, minHeight: '60px', fontSize: '11px' }}
                    autoFocus
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={S.lineBtn('#10b981')} disabled={savingNotes} onClick={handleSaveNotes}>
                        {savingNotes ? 'SAVING...' : 'SAVE'}
                    </button>
                    <button style={S.lineBtn('#475569')} onClick={() => setEditingNotes(false)}>
                        CANCEL
                    </button>
                    </div>
                </div>
                ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: session.notes ? '#94a3b8' : '#334155', fontSize: '11px', fontFamily: 'monospace' }}>
                    {session.notes || 'No notes'}
                    </span>
                    <button
                    style={S.lineBtn('#475569')}
                    onClick={() => { setNotesValue(session.notes || ''); setEditingNotes(true); }}
                    >
                    {session.notes ? 'EDIT' : '+ ADD'}
                    </button>
                </div>
                )}
            </div>
            )}
        </div>
        {isFinance && (
            <div style={S.actions}>
                {isOpen && (
                <>
                    <button style={S.btn('#3b82f6', populating)} disabled={populating} onClick={handlePopulate}>
                    {populating ? 'POPULATING...' : '⟳ POPULATE'}
                    </button>
                    <button style={S.btn('#10b981', closing || pending > 0)} disabled={closing || pending > 0} onClick={handleClose}>
                    {closing ? 'CLOSING...' : '✓ CLOSE SESSION'}
                    </button>
                </>
                )}
                {!isOpen && (
                <button style={S.btn('#f59e0b', reopening)} disabled={reopening} onClick={handleReopen}>
                    {reopening ? 'REOPENING...' : '↩ REOPEN SESSION'}
                </button>
                )}
            </div>
        )}
      </div>

      {/* Stats */}
      <div style={S.statsRow}>
        {[
          { val: total,      label: 'Total Lines', color: '#94a3b8' },
          { val: pending,    label: 'Pending',      color: '#f59e0b' },
          { val: confirmed,  label: 'Confirmed',    color: '#10b981' },
          { val: disputed,   label: 'Disputed',     color: '#ef4444' },
          { val: writtenOff, label: 'Written Off',  color: '#64748b' },
          { val: `${pct}%`,  label: 'Complete',     color: ledger?.color },
        ].map(({ val, label, color }) => (
          <div key={label} style={S.statCard(color)}>
            <div style={S.statVal(color)}>{val}</div>
            <div style={S.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <select style={S.filterSelect} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="disputed">Disputed</option>
            <option value="written_off">Written Off</option>
            <option value="voided">Voided</option>
        </select>
        <button
          style={{ ...S.filterSelect, background: varianceOnly ? 'rgba(245,158,11,0.15)' : '#0f0f1a', borderColor: varianceOnly ? '#f59e0b' : 'rgba(168,85,247,0.2)', color: varianceOnly ? '#f59e0b' : '#e2e8f0', cursor: 'pointer' }}
          onClick={() => { setVarianceOnly(v => !v); setPage(1); }}
        >
          {varianceOnly ? '⚠ Variance Only' : 'All Lines'}
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bulk confirm button — only shows when something is selected and session is open */}
        {isFinance && isOpen && hasSelection && (
          <button
            style={{
              ...S.btn('#10b981', bulkRunning || confirmableLines.length === 0),
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
            disabled={bulkRunning || confirmableLines.length === 0}
            onClick={handleBulkConfirm}
          >
            {bulkRunning ? (
              <>
                <div style={S.progressWrap}>
                  <div style={S.progressBar(progressPct)} />
                </div>
                {bulkProgress.done}/{bulkProgress.total}
              </>
            ) : (
              `✓ CONFIRM SELECTED (${confirmableLines.length})`
            )}
          </button>
        )}
      </div>

      {/* Blocker banner — shown when disputed/written_off lines are in selection */}
      {isFinance && isOpen && hasBlockers && (
        <div style={S.bulkBanner(true)}>
          <span style={S.bulkBannerText(true)}>
            ⚠ {blockerLines.length} selected line{blockerLines.length > 1 ? 's are' : ' is'} disputed or written off —
            these require a reason logged individually and cannot be bulk confirmed.
            They will remain selected.
          </span>
          {confirmableLines.length > 0 && (
            <span style={{ color: '#94a3b8', fontSize: '11px' }}>
              {confirmableLines.length} pending line{confirmableLines.length > 1 ? 's' : ''} will proceed.
            </span>
          )}
        </div>
      )}

      {/* Lines table */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {/* Select-all checkbox — only shown when session is open and finance */}
              {isFinance && isOpen && (
                <th style={S.thCheck}>
                  <input
                    type="checkbox"
                    style={S.checkbox}
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleSelectAll}
                    title="Select all pending on this page"
                  />
                </th>
              )}
              <th style={S.th}>Record</th>
              <th style={S.th}>Expected</th>
              <th style={S.th}>Actual</th>
              <th style={S.th}>Variance</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Note</th>
              <th style={S.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {linesLoading ? (
              <tr><td colSpan={isFinance && isOpen ? 8 : 7} style={S.empty}>Loading lines...</td></tr>
            ) : lines.length === 0 ? (
              <tr>
                <td colSpan={isFinance && isOpen ? 8 : 7} style={S.empty}>
                  {total === 0
                    ? 'No lines yet. Click POPULATE to pull records for this period.'
                    : 'No lines match the current filter.'}
                </td>
              </tr>
            ) : lines.map(line => {
              const variance = line.actual_amount !== null && line.expected_amount !== null
                ? Number(line.actual_amount) - Number(line.expected_amount)
                : null;

              const isSelected    = selectedIds.has(line.id);
              const isPending     = line.status === 'pending';
              const isBlocker     = ['disputed', 'written_off'].includes(line.status) && isSelected;

              return (
                <tr
                  key={line.id}
                  style={S.tr(hoveredRow === line.id, isSelected)}
                  onMouseEnter={() => setHovered(line.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Checkbox */}
                  {isFinance && isOpen && (
                    <td style={S.tdCheck}>
                      {isPending ? (
                        <input
                          type="checkbox"
                          style={S.checkbox}
                          checked={isSelected}
                          onChange={() => toggleLine(line.id)}
                        />
                      ) : isBlocker ? (
                        // stays checked but visually flagged
                        <input type="checkbox" style={{ ...S.checkbox, accentColor: '#ef4444' }} checked readOnly />
                      ) : (
                        <span style={{ display: 'block', width: '15px' }} />
                      )}
                    </td>
                  )}

                  {/* Record */}
                  <td style={S.td}>
                    <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                      {line.subject_table}
                    </div>
                    <div style={{ color: '#475569', fontSize: '11px' }}>#{line.subject_id}</div>
                    <LineMeta ledger={session.ledger} meta={line.meta} />
                  </td>

                  {/* Expected */}
                  <td style={S.td}>
                    <div style={{ color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {line.expected_amount !== null
                        ? Number(line.expected_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })
                        : '—'}
                    </div>
                  </td>

                  {/* Actual */}
                  <td style={S.td}>
                    <div style={{ color: '#e2e8f0', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}>
                      {line.actual_amount !== null
                        ? Number(line.actual_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })
                        : <span style={{ color: '#334155' }}>—</span>}
                    </div>
                  </td>

                  {/* Variance */}
                  <td style={S.td}>
                    <div style={S.amt(variance)}>
                      {variance === null ? '—'
                        : variance === 0 ? '✓ 0.00'
                          : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`}
                    </div>
                  </td>

                  {/* Status */}
                  <td style={S.td}>
                    <span style={S.pill(LINE_STATUS_COLORS[line.status] || LINE_STATUS_COLORS.pending)}>
                      {line.status.replace('_', ' ')}
                    </span>
                    {line.reviewed_by && (
                      <div style={S.meta}>by {line.reviewed_by?.name ?? `#${line.reviewed_by}`}</div>
                    )}
                    {/* Blocker hint inline */}
                    {isBlocker && (
                      <div style={{ color: '#ef4444', fontSize: '10px', marginTop: '4px' }}>
                        ⚠ needs reason
                      </div>
                    )}
                  </td>

                  {/* Note */}
                  <td style={S.td}>
                    {line.note ? (
                      <div style={S.noteBox}>
                        📓 {line.note.body?.slice(0, 80)}{line.note.body?.length > 80 ? '...' : ''}
                      </div>
                    ) : (
                      <span style={{ color: '#1e293b', fontSize: '11px' }}>—</span>
                    )}
                    {line.dispute_note && (
                      <div style={{ ...S.noteBox, borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', marginTop: '4px' }}>
                        🚩 {line.dispute_note}
                      </div>
                    )}
                    {line.resolution_note && (
                      <div style={{ ...S.noteBox, borderColor: 'rgba(100,116,139,0.3)', color: '#64748b', marginTop: '4px' }}>
                        ✍ {line.resolution_note}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                <td style={S.td}>
                    {isFinance && (
                        <div style={S.lineActions}>
                        {line.status !== 'confirmed' && (
                            <button style={S.lineBtn('#10b981')} onClick={() => setActionModal({ line, action: 'confirm' })}>
                                CONFIRM
                            </button>
                            )}
                            {line.status !== 'disputed' && (
                            <button style={S.lineBtn('#ef4444')} onClick={() => setActionModal({ line, action: 'dispute' })}>
                                DISPUTE
                            </button>
                            )}
                            {line.status !== 'written_off' && (
                            <button style={S.lineBtn('#64748b')} onClick={() => setActionModal({ line, action: 'write_off' })}>
                                WRITE OFF
                            </button>
                            )}
                            {line.status !== 'voided' && (
                            <button style={S.lineBtn('#dc2626')} onClick={() => setActionModal({ line, action: 'void' })}>
                                VOID
                            </button>
                            )}
                            {line.meta && (
                            <button style={S.lineBtn('#a855f7')} onClick={() => setMetaModal(line)}>
                                META
                            </button>
                        )}
                        </div>
                    )}
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid rgba(168,85,247,0.1)' }}>
            <span style={S.meta}>{meta.from}–{meta.to} of {meta.total} lines</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '6px', color: page === 1 ? '#334155' : '#a855f7', fontSize: '11px', fontFamily: 'monospace', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                disabled={page === 1} onClick={() => setPage(p => p - 1)}
              >← PREV</button>
              <button
                style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '6px', color: page === meta.last_page ? '#334155' : '#a855f7', fontSize: '11px', fontFamily: 'monospace', cursor: page === meta.last_page ? 'not-allowed' : 'pointer' }}
                disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)}
              >NEXT →</button>
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <ActionModal
          line={actionModal.line}
          action={actionModal.action}
          ledger={session.ledger}
          onClose={() => setActionModal(null)}
          onDone={() => { fetchSession(); fetchLines(); }}
        />
      )}
      {sessionMetaModal && (
        <SessionMetaModal
            session={session}
            onClose={() => setSessionMetaModal(false)}
        />
    )}
      {metaModal && (
        <MetaModal
            line={metaModal}
            onClose={() => setMetaModal(null)}
        />
        )}
    </div>
  );
}