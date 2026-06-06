import { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import paymentsAPI from '../../../../api/payments';
import toast from 'react-hot-toast';

// ── Role helpers ───────────────────────────────────────────────────────────────

const canRaise   = (user) => ['finance', 'admin', 'super_admin'].includes(user?.role);
const canResolve = (user) => ['admin', 'super_admin'].includes(user?.role);

// ── Tiny shared styles ────────────────────────────────────────────────────────

const label = {
  margin: 0, fontSize: '0.67rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af',
  marginBottom: 5, display: 'block',
};

const textarea = {
  width: '100%', borderRadius: 8, padding: '9px 12px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-text, #111827)',
  fontSize: '0.83rem', fontFamily: 'inherit',
  resize: 'vertical', minHeight: 90, outline: 'none',
  boxSizing: 'border-box',
};

const input = {
  width: '100%', borderRadius: 8, padding: '8px 12px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-text, #111827)',
  fontSize: '0.83rem', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};

const btn = (bg, color = '#fff') => ({
  padding: '9px 18px', borderRadius: 8, border: 'none',
  background: bg, color,
  fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'opacity 150ms',
});

function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Status badge ───────────────────────────────────────────────────────────────

const DISPUTE_BADGE = {
  none:     null,
  raised:        { label: 'Disputed',       bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
  investigating: { label: 'Investigating',  bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
  resolved:      { label: 'Resolved',       bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
  rejected:      { label: 'Rejected',       bg: '#fee2e2', color: '#7f1d1d', dot: '#ef4444' },
};

function DisputeBadge({ status }) {
  const d = DISPUTE_BADGE[status];
  if (!d) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: d.bg, color: d.color,
      fontSize: '0.72rem', fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.dot }} />
      {d.label}
    </span>
  );
}

// ── Evidence list input ────────────────────────────────────────────────────────
// Lets the user type a line and press + to add it to the list.

function EvidenceInput({ value, onChange }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setDraft('');
  };

  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      {/* Existing lines */}
      {value.length > 0 && (
        <ul style={{ margin: '0 0 8px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {value.map((line, i) => (
            <li key={i} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
              padding: '6px 10px', borderRadius: 7,
              background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text, #374151)', flex: 1 }}>{line}</span>
              <button
                onClick={() => remove(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af', flexShrink: 0 }}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new line */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Add an evidence note and press +"
          style={{ ...input, flex: 1 }}
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          style={{
            ...btn('rgba(168,85,247,0.15)', '#a855f7'),
            padding: '8px 12px', flexShrink: 0,
            opacity: draft.trim() ? 1 : 0.4,
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: '0.67rem', color: '#9ca3af' }}>
        Each line is a separate piece of evidence. Press + or Enter to add.
      </p>
    </div>
  );
}

// ── State: none ───────────────────────────────────────────────────────────────
// Finance/Admin can raise a dispute.

function RaiseForm({ payment, onUpdate }) {
  const [open, setOpen]         = useState(false);
  const [reason, setReason]     = useState('');
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading]   = useState(false);

  const submit = async () => {
    if (!reason.trim()) { toast.error('Reason is required.'); return; }
    setLoading(true);
    try {
      const res = await paymentsAPI.raiseDispute(payment.id, reason, evidence); 
      toast.success('Dispute raised.');
      onUpdate(res.payment);
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to raise dispute.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 8,
            border: '1px solid rgba(249,115,22,0.3)',
            background: 'rgba(249,115,22,0.07)', color: '#c2410c',
            fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <AlertTriangle size={14} />
          Raise a Dispute
        </button>
      ) : (
        <div style={{
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: 10, padding: 16,
          background: 'rgba(249,115,22,0.04)',
        }}>
          <p style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 700, color: '#c2410c' }}>
            Raise Dispute
          </p>

          {/* Reason */}
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Reason <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe the discrepancy — e.g. customer was charged KSh 500 extra, M-Pesa confirmed but system shows failed…"
              style={textarea}
            />
          </div>

          {/* Evidence */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Evidence Notes (optional)</label>
            <EvidenceInput value={evidence} onChange={setEvidence} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={submit}
              disabled={loading || !reason.trim()}
              style={{ ...btn('#f97316'), opacity: loading || !reason.trim() ? 0.6 : 1 }}
            >
              {loading ? 'Submitting…' : 'Submit Dispute'}
            </button>
            <button
              onClick={() => { setOpen(false); setReason(''); setEvidence([]); }}
              style={btn('rgba(255,255,255,0.06)', 'var(--color-text-secondary, #6b7280)')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── State: raised ─────────────────────────────────────────────────────────────
// Shows dispute details. Admin/super_admin get resolve controls.

function RaisedView({ payment, user, onUpdate }) {
  const [resolution, setResolution]   = useState('resolved');
  const [notes, setNotes]             = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [loading, setLoading]         = useState(false);

  const resolve = async () => {
    if (!notes.trim()) { toast.error('Resolution notes are required.'); return; }
    setLoading(true);
    try {
      const res = await paymentsAPI.resolveDispute(payment.id, resolution, notes);
      toast.success(`Dispute ${resolution}.`);
      onUpdate(res.payment);
    } catch (err) {
      toast.error(err?.response?.data?.message ?? 'Failed to resolve dispute.');
    } finally {
      setLoading(false);
    }
  };

  const evidence = Array.isArray(payment.dispute_evidence) ? payment.dispute_evidence : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Who raised it */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <p style={label}>Raised By</p>
          <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text, #374151)' }}>
            {payment.dispute_raised_by?.name ?? `User #${payment.dispute_raised_by}`}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#9ca3af', textTransform: 'capitalize' }}>
            {payment.dispute_raised_by?.role ?? ''}
          </p>
        </div>
        <div>
          <p style={label}>Raised At</p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text, #374151)' }}>
            {fmtDate(payment.dispute_raised_at)}
          </p>
        </div>
      </div>

      {/* Reason */}
      <div>
        <p style={label}>Reason</p>
        <p style={{
          margin: 0, fontSize: '0.83rem', color: '#92400e',
          background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)',
          borderRadius: 8, padding: '10px 12px', lineHeight: 1.5,
        }}>
          {payment.dispute_reason}
        </p>
      </div>

      {/* Evidence */}
      {evidence.length > 0 && (
        <div>
          <p style={label}>Evidence</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {evidence.map((line, i) => (
              <li key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '6px 10px', borderRadius: 7,
                background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)',
              }}>
                <span style={{ color: '#a855f7', fontSize: '0.75rem', marginTop: 2, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text, #374151)' }}>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resolve controls — admin/super_admin only */}
      {canResolve(user) && (
        <div>
          <button
            onClick={() => setShowResolve(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#a855f7', fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', padding: 0,
            }}
          >
            {showResolve ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showResolve ? 'Hide' : 'Resolve / Reject this dispute'}
          </button>

          {showResolve && (
            <div style={{
              marginTop: 12, padding: 14,
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, background: 'rgba(255,255,255,0.02)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Resolution picker */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { val: 'resolved', label: 'Mark Resolved', icon: <CheckCircle size={14} />, bg: '#10b981', activeBg: 'rgba(16,185,129,0.12)', activeColor: '#065f46', activeBorder: 'rgba(16,185,129,0.3)' },
                  { val: 'rejected', label: 'Reject Dispute', icon: <XCircle size={14} />,    bg: '#ef4444', activeBg: 'rgba(239,68,68,0.1)',   activeColor: '#7f1d1d', activeBorder: 'rgba(239,68,68,0.3)'  },
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setResolution(opt.val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
                      flex: 1, justifyContent: 'center',
                      border: resolution === opt.val ? `1px solid ${opt.activeBorder}` : '1px solid rgba(255,255,255,0.1)',
                      background: resolution === opt.val ? opt.activeBg : 'transparent',
                      color: resolution === opt.val ? opt.activeColor : 'var(--color-text-secondary, #6b7280)',
                      transition: 'all 150ms',
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Resolution notes */}
              <div>
                <label style={label}>
                  Resolution Notes <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={
                    resolution === 'resolved'
                      ? 'Describe what was confirmed and how the dispute was resolved…'
                      : 'Explain why this dispute is being rejected…'
                  }
                  style={textarea}
                />
              </div>

              <button
                onClick={resolve}
                disabled={loading || !notes.trim()}
                style={{
                  ...btn(resolution === 'resolved' ? '#10b981' : '#ef4444'),
                  opacity: loading || !notes.trim() ? 0.6 : 1,
                  alignSelf: 'flex-start',
                }}
              >
                {loading
                  ? 'Submitting…'
                  : resolution === 'resolved'
                  ? 'Confirm Resolution'
                  : 'Confirm Rejection'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── State: resolved / rejected ────────────────────────────────────────────────
// Full read-only thread for everyone.

function ClosedView({ payment }) {
  const evidence = Array.isArray(payment.dispute_evidence) ? payment.dispute_evidence : [];
  const isResolved = payment.dispute_status === 'resolved';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Raised block */}
      <div>
        <p style={{ ...label, marginBottom: 8 }}>Raised</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <p style={label}>By</p>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text, #374151)' }}>
              {payment.dispute_raised_by?.name ?? `User #${payment.dispute_raised_by}`}
            </p>
          </div>
          <div>
            <p style={label}>At</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text, #374151)' }}>
              {fmtDate(payment.dispute_raised_at)}
            </p>
          </div>
        </div>
        <p style={{
          margin: 0, fontSize: '0.82rem', color: '#92400e',
          background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)',
          borderRadius: 8, padding: '9px 12px', lineHeight: 1.5,
        }}>
          {payment.dispute_reason}
        </p>
        {evidence.length > 0 && (
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {evidence.map((line, i) => (
              <li key={i} style={{
                display: 'flex', gap: 8, padding: '5px 10px', borderRadius: 7,
                background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.1)',
              }}>
                <span style={{ color: '#a855f7', fontSize: '0.75rem', marginTop: 2 }}>•</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text, #374151)' }}>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Divider with arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: isResolved ? '#10b981' : '#ef4444',
        }}>
          {isResolved ? '✓ Resolved' : '✗ Rejected'}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      </div>

      {/* Resolution block */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <p style={label}>By</p>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text, #374151)' }}>
              {payment.dispute_resolved_by?.name ?? `User #${payment.dispute_resolved_by}`}
            </p>
          </div>
          <div>
            <p style={label}>At</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text, #374151)' }}>
              {fmtDate(payment.dispute_resolved_at)}
            </p>
          </div>
        </div>
        <p style={{
          margin: 0, fontSize: '0.82rem',
          color: isResolved ? '#065f46' : '#7f1d1d',
          background: isResolved ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
          border: `1px solid ${isResolved ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          borderRadius: 8, padding: '9px 12px', lineHeight: 1.5,
        }}>
          {payment.dispute_resolution_notes}
        </p>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DisputePanel({ payment, user, onUpdate }) {
  const status = payment.dispute_status ?? 'none';
  const badge  = DISPUTE_BADGE[status];

  // Finance cannot see the raise form if payment isn't confirmed
  const showRaiseForm = status === 'none' && canRaise(user);

  if (status === 'none' && !canRaise(user)) return null;

  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${
        status === 'none'          ? 'rgba(255,255,255,0.08)' :
        status === 'raised'        ? 'rgba(249,115,22,0.25)'  :
        status === 'investigating' ? 'rgba(59,130,246,0.25)'  :
        status === 'resolved'      ? 'rgba(16,185,129,0.25)'  :
                                     'rgba(239,68,68,0.25)'
      }`,
      background: 'var(--color-bg-elevated, var(--color-bg))',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${
          status === 'none'   ? 'rgba(255,255,255,0.06)' :
          status === 'raised' ? 'rgba(249,115,22,0.15)'  :
          status === 'resolved' ? 'rgba(16,185,129,0.15)' :
          status === 'rejected' ? 'rgba(239,68,68,0.15)' :
          'rgba(255,255,255,0.06)'
        }`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text, #111827)' }}>
          Dispute
        </p>
        {badge && <DisputeBadge status={status} />}
      </div>

      {/* Body */}
      <div style={{ padding: 18 }}>
        {status === 'none' && canRaise(user) && (
          <RaiseForm payment={payment} onUpdate={onUpdate} />
        )}
        {(status === 'raised' || status === 'investigating') && (
          <RaisedView payment={payment} user={user} onUpdate={onUpdate} />
        )}
        {(status === 'resolved' || status === 'rejected') && (
          <ClosedView payment={payment} />
        )}
      </div>

    </div>
  );
}