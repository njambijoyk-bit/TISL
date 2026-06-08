import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft, User, AlertTriangle, Loader2, CreditCard, TrendingUp, TrendingDown,
  Calendar, FileText, Plus, X, Check, ChevronRight, Send, Download, Printer,
  MoreHorizontal, DollarSign, Percent, RefreshCw, Clock, Ban, ChevronDown,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { adminCreditAPI } from '../../api/customerCredit';
import customersAPI from '../../api/customers';

// ── Shared style atoms ───────────────────────────────────────────────────────

const containerStyle = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
  padding: '20px 24px',
};

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
  padding: 20,
};

const sectionHeader = {
  fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed',
  display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px',
};

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const fmt = (n, sym = 'KES') => {
  const num = Number(n ?? 0);
  return num.toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).replace('KES', sym).trim();
};

// ── Small shared pieces ───────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Pill({ children, color = '#7c3aed', bg = 'rgba(168,85,247,0.08)', ring = 'rgba(168,85,247,0.2)' }) {
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

const INVOICE_STATUS = {
  draft:   { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', ring: 'rgba(107,114,128,0.2)' },
  sent:    { color: '#1d4ed8', bg: 'rgba(59,130,246,0.08)',  ring: 'rgba(59,130,246,0.2)'  },
  paid:    { color: '#065f46', bg: 'rgba(16,185,129,0.08)',  ring: 'rgba(16,185,129,0.2)'  },
  overdue: { color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   ring: 'rgba(239,68,68,0.2)'   },
  void:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', ring: 'rgba(156,163,175,0.2)' },
};

const SCHEDULE_STATUS = {
  active:    { color: '#065f46', bg: 'rgba(16,185,129,0.08)',  ring: 'rgba(16,185,129,0.2)'  },
  completed: { color: '#1d4ed8', bg: 'rgba(59,130,246,0.08)',  ring: 'rgba(59,130,246,0.2)'  },
  defaulted: { color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   ring: 'rgba(239,68,68,0.2)'   },
  cancelled: { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', ring: 'rgba(156,163,175,0.2)' },
};

const ITEM_STATUS = {
  pending: { color: '#b45309', bg: 'rgba(245,158,11,0.08)',  ring: 'rgba(245,158,11,0.2)'  },
  paid:    { color: '#065f46', bg: 'rgba(16,185,129,0.08)',  ring: 'rgba(16,185,129,0.2)'  },
  overdue: { color: '#b91c1c', bg: 'rgba(239,68,68,0.08)',   ring: 'rgba(239,68,68,0.2)'   },
  waived:  { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', ring: 'rgba(107,114,128,0.2)' },
};

const TX_TYPE_ICON = {
  purchase:   <TrendingUp   size={12} />,
  payment:    <TrendingDown size={12} />,
  adjustment: <RefreshCw    size={12} />,
  write_off:  <Ban          size={12} />,
  interest:   <Percent      size={12} />,
};

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({ onClick, icon, label, variant = 'ghost' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', border: 'none',
    transition: 'box-shadow 150ms, background 150ms',
  };
  const styles = {
    primary: { background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 10px rgba(168,85,247,0.3)' },
    ghost:   { background: 'rgba(168,85,247,0.06)', color: '#7c3aed', border: '1px solid rgba(168,85,247,0.2)' },
    danger:  { background: 'rgba(239,68,68,0.06)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...styles[variant] }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      {icon}{label}
    </button>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, width = 440 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: width,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        border: '1px solid rgba(168,85,247,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
            display: 'flex', padding: 4, borderRadius: 6,
            transition: 'color 150ms, background 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSubmit, submitting, submitLabel = 'Confirm' }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
      <button onClick={onClose} style={{
        padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
        background: 'transparent', color: '#9ca3af',
        border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        Cancel
      </button>
      <button onClick={onSubmit} disabled={submitting} style={{
        padding: '8px 18px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
        border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
        boxShadow: '0 2px 10px rgba(168,85,247,0.3)', opacity: submitting ? 0.7 : 1,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {submitting && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
        {submitLabel}
      </button>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────

function PaymentModal({ customerId, onSuccess, onClose }) {
  const [form, setForm] = useState({ amount: '', note: '', reference_type: 'manual', reference_id: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return; }
    setSubmitting(true); setError('');
    try {
      const data = await adminCreditAPI.recordPayment(customerId, {
        amount: Number(form.amount),
        note: form.note || null,
        reference_type: form.reference_type,
        reference_id: form.reference_id ? Number(form.reference_id) : null,
      });
      onSuccess(data);
    } catch (e) { setError(e?.response?.data?.message ?? 'Failed to record payment.'); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Amount (KES) *">
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
            placeholder="0.00" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        <Field label="Note">
          <textarea rows={2} value={form.note} onChange={set('note')} placeholder="Optional note…"
            style={{ ...inputStyle, resize: 'none' }} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Reference type">
            <select value={form.reference_type} onChange={set('reference_type')}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
              {['manual', 'order', 'schedule', 'invoice'].map(t => (
                <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Reference ID">
            <input type="number" value={form.reference_id} onChange={set('reference_id')}
              placeholder="Optional" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>
        </div>
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0 }}>{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="Record Payment" />
    </Modal>
  );
}

// ── Adjustment Modal ──────────────────────────────────────────────────────────

function AdjustmentModal({ customerId, onSuccess, onClose }) {
  const [form, setForm] = useState({ amount: '', direction: 'credit', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return; }
    setSubmitting(true); setError('');
    try {
      const data = await adminCreditAPI.adjustment(customerId, {
        amount: Number(form.amount),
        direction: form.direction,
        note: form.note || null,
      });
      onSuccess(data);
    } catch (e) { setError(e?.response?.data?.message ?? 'Failed to apply adjustment.'); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal title="Manual Adjustment" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Debit / Credit toggle */}
        <Field label="Direction">
          <div style={{ display: 'flex', gap: 10 }}>
            {['credit', 'debit'].map(dir => {
              const active = form.direction === dir;
              const isDebit = dir === 'debit';
              return (
                <button key={dir} onClick={() => setForm(f => ({ ...f, direction: dir }))} style={{
                  flex: 1, padding: '9px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                  background: active ? (isDebit ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)') : 'transparent',
                  color: active ? (isDebit ? '#dc2626' : '#059669') : '#9ca3af',
                  border: `1.5px solid ${active ? (isDebit ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)') : 'rgba(168,85,247,0.15)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  {isDebit ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {dir === 'credit' ? 'Reduce balance' : 'Add to balance'}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '6px 0 0' }}>
            {form.direction === 'debit' ? 'Debit increases credit_used (customer owes more).' : 'Credit decreases credit_used (customer owes less).'}
          </p>
        </Field>

        <Field label="Amount (KES) *">
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
            placeholder="0.00" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        <Field label="Note">
          <textarea rows={2} value={form.note} onChange={set('note')} placeholder="Reason for adjustment…"
            style={{ ...inputStyle, resize: 'none' }} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0 }}>{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="Apply Adjustment" />
    </Modal>
  );
}

// ── Apply Interest Modal ──────────────────────────────────────────────────────

function InterestModal({ customerId, summary, onSuccess, onClose }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const interestAmt = summary
    ? ((Number(summary.credit_used) * Number(summary.interest_rate)) / 100).toFixed(2)
    : '0.00';

  const submit = async () => {
    setSubmitting(true); setError('');
    try {
      const data = await adminCreditAPI.applyInterest(customerId, { note: note || null });
      onSuccess(data);
    } catch (e) { setError(e?.response?.data?.message ?? 'Failed to apply interest.'); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal title="Apply Interest" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
            <span style={{ color: '#6b7280' }}>Current balance</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>{fmt(summary?.credit_used)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
            <span style={{ color: '#6b7280' }}>Interest rate</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>{summary?.interest_rate}%</span>
          </div>
          <div style={{ borderTop: '1px solid rgba(168,85,247,0.1)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span style={{ color: '#7c3aed', fontWeight: 700 }}>Interest to charge</span>
            <span style={{ fontWeight: 800, color: '#7c3aed' }}>KES {Number(interestAmt).toLocaleString()}</span>
          </div>
        </div>
        <Field label="Note">
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note…"
            style={{ ...inputStyle, resize: 'none' }} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0 }}>{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="Apply Interest" />
    </Modal>
  );
}

// ── New Schedule Modal ────────────────────────────────────────────────────────

function ScheduleModal({ customerId, onSuccess, onClose }) {
  const [form, setForm] = useState({
    total_amount: '', installments: 3, frequency: 'monthly',
    started_at: new Date().toISOString().substring(0, 10), note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const perInstallment = form.total_amount && form.installments
    ? (Number(form.total_amount) / Number(form.installments)).toFixed(2)
    : null;

  const submit = async () => {
    if (!form.total_amount || Number(form.total_amount) <= 0) { setError('Enter a valid total amount.'); return; }
    if (!form.installments || Number(form.installments) < 1) { setError('At least 1 installment required.'); return; }
    setSubmitting(true); setError('');
    try {
      const data = await adminCreditAPI.createSchedule(customerId, {
        total_amount: Number(form.total_amount),
        installments: Number(form.installments),
        frequency: form.frequency,
        started_at: form.started_at,
        note: form.note || null,
      });
      onSuccess(data);
    } catch (e) { setError(e?.response?.data?.message ?? 'Failed to create schedule.'); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal title="New Installment Schedule" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Total amount (KES) *">
            <input type="number" min="0.01" step="0.01" value={form.total_amount} onChange={set('total_amount')}
              placeholder="0.00" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>
          <Field label="No. of installments *">
            <input type="number" min="1" max="60" value={form.installments} onChange={set('installments')}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>
          <Field label="Frequency">
            <select value={form.frequency} onChange={set('frequency')}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" value={form.started_at} onChange={set('started_at')}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>
        </div>
        {perInstallment && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)',
            fontSize: '0.8rem', color: '#7c3aed', display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Per installment</span>
            <strong>KES {Number(perInstallment).toLocaleString()}</strong>
          </div>
        )}
        <Field label="Note">
          <textarea rows={2} value={form.note} onChange={set('note')} placeholder="Optional note…"
            style={{ ...inputStyle, resize: 'none' }} onFocus={inputFocus} onBlur={inputBlur} />
        </Field>
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0 }}>{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="Create Schedule" />
    </Modal>
  );
}

// ── New Invoice Modal ─────────────────────────────────────────────────────────

function InvoiceModal({ customerId, onSuccess, onClose }) {
  const [form, setForm] = useState({ due_date: '', note: '' });
  const [lineItems, setLineItems] = useState([{ description: '', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addLine = () => setLineItems(prev => [...prev, { description: '', amount: '' }]);
  const removeLine = (i) => setLineItems(prev => prev.filter((_, idx) => idx !== i));
  const setLine = (i, k, v) => setLineItems(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const total = lineItems.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const submit = async () => {
    const validLines = lineItems.filter(l => l.description.trim() && Number(l.amount) > 0);
    if (validLines.length === 0) { setError('Add at least one valid line item.'); return; }
    setSubmitting(true); setError('');
    try {
      const data = await adminCreditAPI.createInvoice(customerId, {
        due_date: form.due_date || null,
        note: form.note || null,
        line_items: validLines.map(l => ({ description: l.description, amount: Number(l.amount) })),
      });
      onSuccess(data);
    } catch (e) { setError(e?.response?.data?.message ?? 'Failed to create invoice.'); }
    finally { setSubmitting(false); }
  };

  return (
    <Modal title="New Invoice" onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Due date">
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>
          <Field label="Note">
            <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Optional note" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>
        </div>

        <div>
          <label style={labelStyle}>Line items</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lineItems.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: 8, alignItems: 'center' }}>
                <input type="text" value={line.description} onChange={e => setLine(i, 'description', e.target.value)}
                  placeholder="Description" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                <input type="number" min="0.01" step="0.01" value={line.amount} onChange={e => setLine(i, 'amount', e.target.value)}
                  placeholder="Amount" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
                <button onClick={() => removeLine(i)} disabled={lineItems.length === 1} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, border: 'none', cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                  background: 'rgba(239,68,68,0.07)', color: lineItems.length === 1 ? '#d1d5db' : '#dc2626',
                  transition: 'background 120ms',
                }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addLine} style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.75rem', color: '#a855f7', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: '4px 0',
          }}>
            <Plus size={13} /> Add line
          </button>
        </div>

        {total > 0 && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)',
            display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem',
          }}>
            <span style={{ color: '#7c3aed', fontWeight: 700 }}>Total</span>
            <strong style={{ color: '#7c3aed' }}>KES {total.toLocaleString()}</strong>
          </div>
        )}
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0 }}>{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="Create Invoice" />
    </Modal>
  );
}

// ── Summary sub-tab ───────────────────────────────────────────────────────────

function SummaryTab({ customerId, summary, onRefresh, onAction }) {
  if (!summary) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={24} style={{ color: '#a855f7', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  const { credit_limit, credit_used, credit_available, utilization_pct, interest_rate, currency, is_overdue } = summary;
  const pct = Math.min(Number(utilization_pct), 100);
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

      {/* Left — utilisation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ ...sectionHeader, margin: 0 }}><CreditCard size={14} style={{ color: '#c4b5fd' }} /> Credit utilisation</p>
            {is_overdue && (
              <Pill color="#b91c1c" bg="rgba(239,68,68,0.08)" ring="rgba(239,68,68,0.2)">
                <AlertTriangle size={10} /> Overdue
              </Pill>
            )}
          </div>

          {/* Big number */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', margin: '0 0 2px', letterSpacing: '-0.03em' }}>
              {fmt(credit_used)}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>of {fmt(credit_limit)} limit</p>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(168,85,247,0.08)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 4,
                background: barColor, transition: 'width 0.8s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
              <span style={{ color: '#9ca3af' }}>{pct.toFixed(1)}% used</span>
              <span style={{ color: '#9ca3af' }}>{fmt(credit_available)} available</span>
            </div>
          </div>

          {/* Row stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Credit limit',    fmt(credit_limit),    '#6b7280'],
              ['Used',            fmt(credit_used),     pct >= 100 ? '#ef4444' : '#6b7280'],
              ['Available',       fmt(credit_available),credit_available <= 0 ? '#ef4444' : '#059669'],
              ['Interest rate',   `${interest_rate}%`,  '#7c3aed'],
              ['Currency',        currency?.code ?? 'KES', '#7c3aed'],
            ].map(([lbl, val, color]) => (
              <div key={lbl} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', borderRadius: 8, background: 'rgba(168,85,247,0.03)',
                fontSize: '0.8rem',
              }}>
                <span style={{ color: '#9ca3af' }}>{lbl}</span>
                <span style={{ color, fontWeight: 700 }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — quick actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={card}>
          <p style={sectionHeader}><MoreHorizontal size={14} style={{ color: '#c4b5fd' }} /> Actions</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Record Payment',    icon: <TrendingDown size={14} />, action: 'payment',    variant: 'primary' },
              { label: 'Manual Adjustment', icon: <RefreshCw    size={14} />, action: 'adjustment', variant: 'ghost'   },
              { label: 'Apply Interest',    icon: <Percent      size={14} />, action: 'interest',   variant: 'ghost'   },
              { label: 'New Schedule',      icon: <Calendar     size={14} />, action: 'schedule',   variant: 'ghost'   },
              { label: 'New Invoice',       icon: <FileText     size={14} />, action: 'invoice',    variant: 'ghost'   },
            ].map(({ label, icon, action, variant }) => (
              <button key={action} onClick={() => onAction(action)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                ...(variant === 'primary'
                  ? { background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', border: 'none', boxShadow: '0 2px 10px rgba(168,85,247,0.3)' }
                  : { background: 'rgba(168,85,247,0.05)', color: '#7c3aed', border: '1px solid rgba(168,85,247,0.18)' }
                ),
                transition: 'opacity 150ms',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Statement sub-tab ─────────────────────────────────────────────────────────

function StatementTab({ customerId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [filters, setFilters] = useState({ type: '', direction: '', from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 20 };
      if (filters.type)      params.type      = filters.type;
      if (filters.direction) params.direction = filters.direction;
      if (filters.from)      params.from      = filters.from;
      if (filters.to)        params.to        = filters.to;
      const res = await adminCreditAPI.getStatement(customerId, params);
      setData(res);
    } catch {}
    finally { setLoading(false); }
  }, [customerId, page, filters]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.data ?? [];
  const meta = { current_page: data?.current_page ?? 1, last_page: data?.last_page ?? 1, total: data?.total ?? 0 };

  const TX_DIR_COLOR = { debit: '#dc2626', credit: '#059669' };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        {[
          { key: 'type', label: 'Type', opts: ['', 'purchase', 'payment', 'adjustment', 'write_off', 'interest'] },
          { key: 'direction', label: 'Direction', opts: ['', 'debit', 'credit'] },
        ].map(({ key, label, opts }) => (
          <select key={key} value={filters[key]}
            onChange={e => { setFilters(f => ({ ...f, [key]: e.target.value })); setPage(1); }}
            style={{ ...inputStyle, width: 'auto', minWidth: 130 }} onFocus={inputFocus} onBlur={inputBlur}>
            {opts.map(o => <option key={o} value={o}>{o ? (o.replace('_', ' ')) : `All ${label}s`}</option>)}
          </select>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={filters.from} onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1); }}
            style={{ ...inputStyle, width: 'auto' }} onFocus={inputFocus} onBlur={inputBlur} />
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>to</span>
          <input type="date" value={filters.to} onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1); }}
            style={{ ...inputStyle, width: 'auto' }} onFocus={inputFocus} onBlur={inputBlur} />
        </div>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => { setFilters({ type: '', direction: '', from: '', to: '' }); setPage(1); }} style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem',
            color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>
                {['Date', 'Type', 'Dir.', 'Note', 'Balance before', 'Amount', 'Balance after'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: '#9ca3af', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
                      {[70, 80, 55, 140, 90, 80, 90].map((w, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: 11, width: w, borderRadius: 6, background: 'rgba(168,85,247,0.08)' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <FileText size={28} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 10px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No transactions found</p>
                      </td>
                    </tr>
                  )
                  : rows.map((tx, i) => {
                      const isCredit = tx.direction === 'credit';
                      return (
                        <tr key={tx.id} style={{
                          borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(168,85,247,0.05)',
                          transition: 'background 120ms',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '11px 14px', fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                            {fmtDate(tx.created_at)}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>
                              {TX_TYPE_ICON[tx.type]} {tx.type?.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, textTransform: 'capitalize',
                              background: isCredit ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                              color: TX_DIR_COLOR[tx.direction],
                            }}>
                              {tx.direction}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.75rem', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.note ?? '—'}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.78rem', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmt(tx.balance_before)}
                          </td>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: TX_DIR_COLOR[tx.direction], fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {isCredit ? '−' : '+'}{fmt(tx.amount)}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmt(tx.balance_after)}
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {!loading && rows.length > 0 && meta.last_page > 1 && (
          <div style={{
            padding: '10px 14px', borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(168,85,247,0.02)',
          }}>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
              Page {meta.current_page} of {meta.last_page} · {meta.total} transactions
            </p>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ icon: <ChevronLeft size={13} />, page: meta.current_page - 1, disabled: meta.current_page <= 1 },
                { icon: <ChevronRight size={13} />, page: meta.current_page + 1, disabled: meta.current_page >= meta.last_page }]
                .map(({ icon, page: p, disabled }, i) => (
                  <button key={i} onClick={() => !disabled && setPage(p)} disabled={disabled} style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                    color: '#a855f7', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1,
                  }}>{icon}</button>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedules sub-tab ─────────────────────────────────────────────────────────

function SchedulesTab({ customerId, onRefresh, notify }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState({});
  const [actioning, setActioning] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminCreditAPI.getSchedules(customerId, { per_page: 50 })); }
    catch {} finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handlePay = async (customerId, scheduleId, item) => {
    setActioning(prev => ({ ...prev, [item.id]: 'paying' }));
    try {
      await adminCreditAPI.payInstallment(customerId, scheduleId, item.id);
      notify('Installment marked as paid');
      load(); onRefresh();
    } catch (e) { notify(e?.response?.data?.message ?? 'Failed', 'error'); }
    finally { setActioning(prev => ({ ...prev, [item.id]: null })); }
  };

  const handleWaive = async (scheduleId, item) => {
    setActioning(prev => ({ ...prev, [item.id]: 'waiving' }));
    try {
      await adminCreditAPI.waiveInstallment(customerId, scheduleId, item.id);
      notify('Installment waived');
      load();
    } catch (e) { notify(e?.response?.data?.message ?? 'Failed', 'error'); }
    finally { setActioning(prev => ({ ...prev, [item.id]: null })); }
  };

  const handleCancel = async (scheduleId) => {
    if (!window.confirm('Cancel this schedule?')) return;
    try {
      await adminCreditAPI.cancelSchedule(customerId, scheduleId);
      notify('Schedule cancelled'); load();
    } catch (e) { notify(e?.response?.data?.message ?? 'Failed', 'error'); }
  };

  const schedules = data?.data ?? [];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={24} style={{ color: '#a855f7', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (schedules.length === 0) return (
    <div style={{ ...card, textAlign: 'center', padding: '48px 24px', border: '1.5px dashed rgba(168,85,247,0.2)', background: 'transparent' }}>
      <Calendar size={28} style={{ color: 'rgba(168,85,247,0.2)', margin: '0 auto 8px', display: 'block' }} />
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No installment schedules yet</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {schedules.map(sched => {
        const ss = SCHEDULE_STATUS[sched.status] ?? SCHEDULE_STATUS.active;
        const isOpen = expanded[sched.id];
        const items = sched.items ?? [];
        const paid = items.filter(i => i.status === 'paid').length;

        return (
          <div key={sched.id} style={card}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                    {fmt(sched.total_amount)} — {sched.installments} installments ({sched.frequency})
                  </p>
                  <Pill color={ss.color} bg={ss.bg} ring={ss.ring}>{sched.status}</Pill>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                  <span>Started {fmtDate(sched.started_at)}</span>
                  {sched.next_due_date && <span>Next due {fmtDate(sched.next_due_date)}</span>}
                  <span>{paid}/{items.length} paid</span>
                </div>
                {/* Mini progress */}
                {items.length > 0 && (
                  <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(168,85,247,0.08)', overflow: 'hidden', maxWidth: 320 }}>
                    <div style={{ height: '100%', width: `${(paid / items.length) * 100}%`, background: '#10b981', borderRadius: 2, transition: 'width 0.5s ease' }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                {sched.status === 'active' && (
                  <button onClick={() => handleCancel(sched.id)} style={{
                    padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600,
                    background: 'rgba(239,68,68,0.06)', color: '#dc2626',
                    border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                  }}>Cancel</button>
                )}
                <button onClick={() => toggle(sched.id)} style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 7, border: '1px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', cursor: 'pointer',
                }}>
                  <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
                </button>
              </div>
            </div>

            {/* Items */}
            {isOpen && (
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => {
                  const is = ITEM_STATUS[item.status] ?? ITEM_STATUS.pending;
                  const acting = actioning[item.id];
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderRadius: 9,
                      background: 'rgba(168,85,247,0.025)', border: '1px solid rgba(168,85,247,0.08)',
                      gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', minWidth: 20 }}>#{item.installment_number}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{fmt(item.amount)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Due {fmtDate(item.due_date)}</span>
                        {item.paid_at && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Paid {fmtDate(item.paid_at)}</span>}
                        <Pill color={is.color} bg={is.bg} ring={is.ring}>{item.status}</Pill>
                      </div>
                      {(item.status === 'pending' || item.status === 'overdue') && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => handlePay(customerId, sched.id, item)} disabled={!!acting} style={{
                            padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
                            background: 'rgba(16,185,129,0.08)', color: '#059669',
                            border: '1px solid rgba(16,185,129,0.25)', cursor: acting ? 'wait' : 'pointer',
                            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            {acting === 'paying' ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
                            Mark paid
                          </button>
                          <button onClick={() => handleWaive(sched.id, item)} disabled={!!acting} style={{
                            padding: '5px 10px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600,
                            background: 'rgba(107,114,128,0.06)', color: '#6b7280',
                            border: '1px solid rgba(107,114,128,0.2)', cursor: acting ? 'wait' : 'pointer',
                            fontFamily: 'inherit',
                          }}>
                            Waive
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Invoices sub-tab ──────────────────────────────────────────────────────────

function InvoicesTab({ customerId, notify }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(1);
  const [actioning, setActioning] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminCreditAPI.getInvoices(customerId, { page, per_page: 15 })); }
    catch {} finally { setLoading(false); }
  }, [customerId, page]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async (invoiceId) => {
    setActioning(prev => ({ ...prev, [invoiceId]: 'sending' }));
    try {
      await adminCreditAPI.sendInvoice(customerId, invoiceId);
      notify('Invoice sent'); load();
    } catch (e) { notify(e?.response?.data?.message ?? 'Failed', 'error'); }
    finally { setActioning(prev => ({ ...prev, [invoiceId]: null })); }
  };

  const handleStatus = async (invoiceId, status) => {
    setActioning(prev => ({ ...prev, [invoiceId]: 'status' }));
    try {
      await adminCreditAPI.updateInvoiceStatus(customerId, invoiceId, { status });
      notify(`Invoice marked as ${status}`); load();
    } catch (e) { notify(e?.response?.data?.message ?? 'Failed', 'error'); }
    finally { setActioning(prev => ({ ...prev, [invoiceId]: null })); }
  };

  const invoices = data?.data ?? [];
  const meta = { current_page: data?.current_page ?? 1, last_page: data?.last_page ?? 1 };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <Loader2 size={24} style={{ color: '#a855f7', animation: 'spin 1s linear infinite' }} />
    </div>
  );

  if (invoices.length === 0) return (
    <div style={{ ...card, textAlign: 'center', padding: '48px 24px', border: '1.5px dashed rgba(168,85,247,0.2)', background: 'transparent' }}>
      <FileText size={28} style={{ color: 'rgba(168,85,247,0.2)', margin: '0 auto 8px', display: 'block' }} />
      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No invoices yet</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {invoices.map(inv => {
        const is = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft;
        const acting = actioning[inv.id];
        const lineCount = inv.items?.length ?? 0;

        return (
          <div key={inv.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#7c3aed', margin: 0, fontFamily: 'monospace' }}>
                    {inv.invoice_number}
                  </p>
                  <Pill color={is.color} bg={is.bg} ring={is.ring}>{inv.status}</Pill>
                  {inv.is_overdue && (
                    <Pill color="#b91c1c" bg="rgba(239,68,68,0.08)" ring="rgba(239,68,68,0.2)">
                      <AlertTriangle size={9} /> Overdue
                    </Pill>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                  <span>Created {fmtDate(inv.created_at)}</span>
                  {inv.due_date && <span>Due {fmtDate(inv.due_date)}</span>}
                  {inv.sent_at  && <span>Sent {fmtDate(inv.sent_at)}</span>}
                  {inv.paid_at  && <span>Paid {fmtDate(inv.paid_at)}</span>}
                  <span>{lineCount} line{lineCount !== 1 ? 's' : ''}</span>
                </div>

                {/* Line items preview */}
                {(inv.items ?? []).length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {inv.items.slice(0, 3).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#6b7280' }}>{item.description}</span>
                        <span style={{ color: '#111827', fontWeight: 600 }}>{fmt(item.amount)}</span>
                      </div>
                    ))}
                    {inv.items.length > 3 && (
                      <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
                        +{inv.items.length - 3} more lines
                      </p>
                    )}
                    <div style={{ borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: 6, marginTop: 2, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#9ca3af' }}>Total</span>
                      <span style={{ fontWeight: 800, color: '#7c3aed' }}>{fmt(inv.total)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                {inv.status !== 'void' && inv.status !== 'paid' && (
                  <button onClick={() => handleSend(inv.id)} disabled={!!acting} style={{
                    padding: '6px 12px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
                    background: 'rgba(59,130,246,0.08)', color: '#1d4ed8',
                    border: '1px solid rgba(59,130,246,0.25)', cursor: acting ? 'wait' : 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    {acting === 'sending' ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
                    Send
                  </button>
                )}
                {inv.status !== 'paid' && inv.status !== 'void' && (
                  <button onClick={() => handleStatus(inv.id, 'paid')} disabled={!!acting} style={{
                    padding: '6px 12px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
                    background: 'rgba(16,185,129,0.08)', color: '#059669',
                    border: '1px solid rgba(16,185,129,0.25)', cursor: acting ? 'wait' : 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    {acting === 'status' ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
                    Mark paid
                  </button>
                )}
                {inv.status !== 'void' && (
                  <button onClick={() => handleStatus(inv.id, 'void')} disabled={!!acting} style={{
                    padding: '6px 12px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600,
                    background: 'rgba(239,68,68,0.05)', color: '#dc2626',
                    border: '1px solid rgba(239,68,68,0.18)', cursor: acting ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    Void
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Page {meta.current_page} of {meta.last_page}</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ icon: <ChevronLeft size={13} />, p: meta.current_page - 1, d: meta.current_page <= 1 },
              { icon: <ChevronRight size={13} />, p: meta.current_page + 1, d: meta.current_page >= meta.last_page }]
              .map(({ icon, p, d }, i) => (
                <button key={i} onClick={() => !d && setPage(p)} disabled={d} style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', cursor: d ? 'not-allowed' : 'pointer', opacity: d ? 0.3 : 1,
                }}>{icon}</button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — CustomerCreditDetail (merged with all CreditTab logic)
// ═══════════════════════════════════════════════════════════════════════════════

export default function CustomerCreditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Inline CreditTab state ──
  const [creditTab,   setCreditTab]   = useState('summary');
  const [summary,     setSummary]     = useState(null);
  const [sumLoading,  setSumLoading]  = useState(true);
  const [modal,       setModal]       = useState(null); // 'payment'|'adjustment'|'interest'|'schedule'|'invoice'

  const notify = useCallback((msg, type = 'success') => {
    console.log(`[${type.toUpperCase()}] ${msg}`);
  }, []);

  // ── Load customer profile ──
  const loadCustomerProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await customersAPI.getCustomer(id);
      setCustomer(res.data || res);
    } catch (err) {
      console.error("Failed querying isolated record", err);
      setError("Failed to locate or sync customer data profile details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadCustomerProfile();
  }, [id, loadCustomerProfile]);

  // ── Load credit summary (directly using route param id) ──
  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try { setSummary(await adminCreditAPI.getSummary(id)); }
    catch (err) { console.error('Credit summary error:', err); }
    finally { setSumLoading(false); }
  }, [id]);

  useEffect(() => {
    if (id) loadSummary();
  }, [id, loadSummary]);

  const handleSuccess = (msg) => {
    notify(msg ?? 'Done');
    setModal(null);
    loadSummary();
  };

  // ── Render helpers ──
  const displayName = customer?.name || customer?.full_name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Loading Customer...';

  // Local view tab state to avoid modifying the external CreditTab component
  const [activeSubTab, setActiveSubTab] = useState('statement');

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: 12, color: '#7c3aed' }}>
          <Loader2 className="animate-spin" size={24} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Syncing ledger profile...</span>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div style={{ ...containerStyle, margin: '40px auto', maxWidth: 600, textAlign: 'center', border: '1px solid #fee2e2', background: '#fff5f5' }}>
          <AlertTriangle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
          <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>Ledger Connection Error</h3>
          <p style={{ fontSize: '0.85rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          <button onClick={loadCustomerProfile} style={{ marginTop: 16, padding: '8px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Retry Sync
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* ── Breadcrumbs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <Link to="/admin/customers" style={{ color: '#9ca3af', textDecoration: 'none' }}>Customers</Link>
          <span style={{ color: '#d1d5db' }}>/</span>
          <Link to="/admin/credit" style={{ color: '#9ca3af', textDecoration: 'none' }}>Credit Overview</Link>
          <span style={{ color: '#d1d5db' }}>/</span>
          <span style={{ color: '#a855f7', fontWeight: 600 }}>{displayName}</span>
        </div>

        {/* ── Customer Info Banner Header ── */}
        <div style={{ ...containerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
              <User size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>{displayName}</h2>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 600 }}>
                  #{customer?.customer_number || customer?.id}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '2px 0 0' }}>
                Email: <span style={{ fontWeight: 500, color: '#374151' }}>{customer?.email}</span> · Tier Strategy: <span style={{ color: '#7c3aed', fontWeight: 600 }}>{customer?.tier || 'Standard'}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/admin/credit')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, background: 'none', border: '1.5px solid rgba(168,85,247,0.2)', color: '#7c3aed', cursor: 'pointer' }}
          >
            <ChevronLeft size={14}/> Return to Ledger
          </button>
        </div>

        {/* ── Financial Ledger Cards Ribbon ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Credit Limit</span><CreditCard size={16} color="#7c3aed"/></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{summary?.currency || 'KES'} {Number(summary?.credit_limit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Credit Allocated / Used</span><TrendingUp size={16} color="#ef4444"/></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b91c1c' }}>{summary?.currency || 'KES'} {Number(summary?.credit_used || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Available Balance</span><TrendingDown size={16} color="#10b981"/></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d' }}>{summary?.currency || 'KES'} {Number(summary?.available_credit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Interest Parameters</span><Percent size={16} color="#f59e0b"/></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{summary?.interest_rate || 0}% <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>Per Annum</span></div>
          </div>
        </div>

        {/* ── Operational Management Control Dock ── */}
        <div style={{ ...containerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['statement', 'schedules', 'invoices'].map((t) => (
              <button
                key={t}
                onClick={() => setActiveSubTab(t)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                  background: activeSubTab === t ? '#7c3aed' : '#f3f4f6', color: activeSubTab === t ? 'white' : '#4b5563'
                }}
              >
                Account {t}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setModal('payment')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, background: '#10b981', color: 'white', border: 'none', cursor: 'pointer' }}><Plus size={14}/> Record Payment</button>
            <button onClick={() => setModal('adjustment')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer' }}><RefreshCw size={14}/> Adjustment</button>
            <button onClick={() => setModal('interest')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, background: '#f59e0b', color: 'white', border: 'none', cursor: 'pointer' }}><Percent size={14}/> Accrue Interest</button>
            <button onClick={() => setModal('schedule')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer' }}><Calendar size={14}/> Map Term Schedule</button>
            <button onClick={() => setModal('invoice')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, background: '#111827', color: 'white', border: 'none', cursor: 'pointer' }}><FileText size={14}/> Draft Invoice</button>
          </div>
        </div>

        {/* ── Sub-Tab Engines ── */}
        <div style={{ ...containerStyle, padding: '24px 0' }}>
          {activeSubTab === 'statement' && <LocalStatementTab customerId={id} />}
          {activeSubTab === 'schedules' && <LocalSchedulesTab customerId={id} onRefresh={loadSummary} notify={notify} />}
          {activeSubTab === 'invoices' && <LocalInvoicesTab customerId={id} notify={notify} />}
        </div>
      </div>

      {/* ── Inline Action Modals ── */}
      {modal === 'payment' && <LocalPaymentModal customerId={id} onClose={() => setModal(null)} onSuccess={() => handleSuccess('Payment posted successfully.')} />}
      {modal === 'adjustment' && <LocalAdjustmentModal customerId={id} onClose={() => setModal(null)} onSuccess={() => handleSuccess('Adjustment matrix applied.')} />}
      {modal === 'interest' && <LocalInterestModal customerId={id} summary={summary} onClose={() => setModal(null)} onSuccess={() => handleSuccess('Interest accrual logged.')} />}
      {modal === 'schedule' && <LocalScheduleModal customerId={id} onClose={() => setModal(null)} onSuccess={() => handleSuccess('Payment term layout mapped.')} />}
      {modal === 'invoice' && <LocalInvoiceModal customerId={id} onClose={() => setModal(null)} onSuccess={() => handleSuccess('Credit reference invoice initialized.')} />}
    </AdminLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL INTEGRATED SUB-TABS
// ─────────────────────────────────────────────────────────────────────────────

function LocalStatementTab({ customerId }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminCreditAPI.getStatement(customerId, { per_page: 50 })
      .then(res => setTxs(res.data || []))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Loader2 className="animate-spin" style={{ color: '#7c3aed', margin: '0 auto' }}/></div>;
  return (
    <div style={{ padding: '0 24px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
            <th style={{ padding: 12 }}>Booking Date</th>
            <th style={{ padding: 12 }}>Action Type</th>
            <th style={{ padding: 12 }}>Flow Position</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Tx Amount</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Running Balance</th>
          </tr>
        </thead>
        <tbody>
          {txs.length === 0 ? (
            <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No transaction line entries registered to this account ledger.</td></tr>
          ) : txs.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #f9fafb' }}>
              <td style={{ padding: 12, color: '#6b7280' }}>{new Date(t.created_at).toLocaleString()}</td>
              <td style={{ padding: 12, fontWeight: 600, textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</td>
              <td style={{ padding: 12 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: t.direction === 'credit' ? '#dcfce7' : '#fee2e2', color: t.direction === 'credit' ? '#15803d' : '#b91c1c' }}>
                  {t.direction.toUpperCase()}
                </span>
              </td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: t.direction === 'credit' ? '#16a34a' : '#dc2626' }}>
                {t.direction === 'credit' ? '-' : '+'}{Number(t.amount).toLocaleString()}
              </td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{Number(t.balance_after).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocalSchedulesTab({ customerId, onRefresh, notify }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSchedules = useCallback(() => {
    setLoading(true);
    adminCreditAPI.getSchedules(customerId)
      .then(res => setSchedules(res.data || res))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const handleWaive = async (schId, itemId) => {
    if (!window.confirm("Waive this targeted repayment installment row?")) return;
    try {
      await adminCreditAPI.waiveInstallment(customerId, schId, itemId);
      notify("Installment safely waived.");
      loadSchedules();
      onRefresh();
    } catch { notify("Could not complete waive request.", "error"); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Loader2 className="animate-spin" style={{ color: '#7c3aed', margin: '0 auto' }}/></div>;
  return (
    <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {schedules.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>No dynamic installment structured logs established.</p>
      ) : schedules.map(s => (
        <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 12 }}>
            <div><strong>Term Engine:</strong> {s.installments} Split Layout ({s.frequency})</div>
            <div style={{ fontWeight: 700 }}>Total: {Number(s.total_amount).toLocaleString()}</div>
          </div>
          {s.items?.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: '#f9fafb', borderRadius: 6, fontSize: '0.78rem', marginBottom: 6, alignItems: 'center' }}>
              <div>Step #{i.installment_number} · Due {new Date(i.due_date).toLocaleDateString()}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>{Number(i.amount).toLocaleString()}</span>
                <span style={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 800, color: i.status === 'paid' ? '#16a34a' : '#4b5563' }}>{i.status}</span>
                {i.status === 'pending' && <button onClick={() => handleWaive(s.id, i.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>Waive</button>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LocalInvoicesTab({ customerId, notify }) {
  const [invs, setInvs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminCreditAPI.getInvoices(customerId)
      .then(res => setInvs(res.data || res))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [customerId]);

  const handleSend = async (invId) => {
    try {
      await adminCreditAPI.sendInvoice(customerId, invId);
      notify("Credit notification dispatched.");
    } catch { notify("Transmission exception occurred.", "error"); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 24 }}><Loader2 className="animate-spin" style={{ color: '#7c3aed', margin: '0 auto' }}/></div>;
  return (
    <div style={{ padding: '0 24px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
            <th style={{ padding: 12 }}>Invoice ID</th>
            <th style={{ padding: 12 }}>Due Date</th>
            <th style={{ padding: 12 }}>Status</th>
            <th style={{ padding: 12, textAlign: 'right' }}>Total Amount</th>
            <th style={{ padding: 12, textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {invs.length === 0 ? (
            <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>No generated invoices match this customer reference.</td></tr>
          ) : invs.map(v => (
            <tr key={v.id} style={{ borderBottom: '1px solid #f9fafb' }}>
              <td style={{ padding: 12, fontWeight: 700 }}>{v.invoice_number}</td>
              <td style={{ padding: 12 }}>{new Date(v.due_date).toLocaleDateString()}</td>
              <td style={{ padding: 12 }}><span style={{ textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 700 }}>{v.status}</span></td>
              <td style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>{Number(v.total_amount).toLocaleString()}</td>
              <td style={{ padding: 12, textAlign: 'center' }}>
                {v.status === 'draft' && <button onClick={() => handleSend(v.id)} style={{ background: '#7c3aed', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Send Notification</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL ACTIONS MODAL INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

function ModalWrapper({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LocalPaymentModal({ customerId, onClose, onSuccess }) {
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminCreditAPI.recordPayment(customerId, { amount: Number(amt), note });
      onSuccess();
    } catch { alert("Failed transaction routing mapping."); }
    finally { setLoading(false); }
  };

  return (
    <ModalWrapper title="Record Remittance Payment" onClose={onClose}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Amount Received</label>
          <input type="number" step="0.01" required value={amt} onChange={e => setAmt(e.target.value)} style={inputStyle} placeholder="0.00" />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Internal Reference Memo</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, resize: 'none' }} placeholder="Transaction receipt metadata details..." />
        </div>
        <button type="submit" disabled={loading} style={{ background: '#10b981', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Processing...' : 'Commit Payment Entry'}
        </button>
      </form>
    </ModalWrapper>
  );
}

function LocalAdjustmentModal({ customerId, onClose, onSuccess }) {
  const [amt, setAmt] = useState('');
  const [dir, setDir] = useState('credit');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminCreditAPI.adjustment(customerId, { amount: Number(amt), direction: dir, note });
      onSuccess();
    } catch { alert("Failed executing balance adjustments adjustment request."); }
    finally { setLoading(false); }
  };

  return (
    <ModalWrapper title="Manual Account Adjustment Balance" onClose={onClose}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Adjustment Direction Vector</label>
          <select value={dir} onChange={e => setDir(e.target.value)} style={inputStyle}>
            <option value="credit">Credit (Decrease Liability Balance)</option>
            <option value="debit">Debit (Increase Liability/Used Line)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Delta Amount Match</label>
          <input type="number" step="0.01" required value={amt} onChange={e => setAmt(e.target.value)} style={inputStyle} placeholder="0.00" />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Reason Note</label>
          <textarea rows={2} required value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, resize: 'none' }} placeholder="Mandatory adjustment logging justification text..." />
        </div>
        <button type="submit" disabled={loading} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Re-aligning...' : 'Execute Operational Adjustment'}
        </button>
      </form>
    </ModalWrapper>
  );
}

function LocalInterestModal({ customerId, summary, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);

  const onAccrue = async () => {
    setLoading(true);
    try {
      await adminCreditAPI.applyInterest(customerId);
      onSuccess();
    } catch { alert("Accrual job execution process failed."); }
    finally { setLoading(false); }
  };

  return (
    <ModalWrapper title="Accrue Periodic Interest Charges" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: '0.82rem', color: '#4b5563', margin: 0 }}>
          This calculates and posts outstanding periodic interest metrics relative to the current strategy rate profile structure setup ({summary?.interest_rate || 0}%).
        </p>
        <button onClick={onAccrue} disabled={loading} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Calculating Matrix...' : 'Post Interest Accruals'}
        </button>
      </div>
    </ModalWrapper>
  );
}

function LocalScheduleModal({ customerId, onClose, onSuccess }) {
  const [amt, setAmt] = useState('');
  const [inst, setInst] = useState('3');
  const [freq, setFreq] = useState('monthly');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminCreditAPI.createSchedule(customerId, { total_amount: Number(amt), installments: Number(inst), frequency: freq });
      onSuccess();
    } catch { alert("Failed generating payment term configuration plan matrices."); }
    finally { setLoading(false); }
  };

  return (
    <ModalWrapper title="Establish Mapped Repayment Terms" onClose={onClose}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Principal Total Matrix Amount</label>
          <input type="number" step="0.01" required value={amt} onChange={e => setAmt(e.target.value)} style={inputStyle} placeholder="0.00" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Installments Count</label>
            <input type="number" required value={inst} onChange={e => setInst(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Frequency Cycle</label>
            <select value={freq} onChange={e => setFreq(e.target.value)} style={inputStyle}>
              <option value="weekly">Weekly Intervals</option>
              <option value="biweekly">Bi-weekly Cycles</option>
              <option value="monthly">Monthly Milestone</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={loading} style={{ background: '#7c3aed', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
          {loading ? 'Structuring Layout...' : 'Generate Term Breakdown Model'}
        </button>
      </form>
    </ModalWrapper>
  );
}

function LocalInvoiceModal({ customerId, onClose, onSuccess }) {
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0 }]);
  const [loading, setLoading] = useState(false);

  const addItemRow = () => setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
  const updateItem = (index, field, value) => {
    const next = [...items];
    next[index][field] = value;
    setItems(next);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!dueDate) return alert("Target expiration deadline parameter required.");
    setLoading(true);
    try {
      await adminCreditAPI.createInvoice(customerId, { due_date: dueDate, items });
      onSuccess();
    } catch { alert("Failed drafting data tracking payload ledger reference."); }
    finally { setLoading(false); }
  };

  return (
    <ModalWrapper title="Initialize Credit Reference Invoice" onClose={onClose}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Maturity Due Date</label>
          <input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed' }}>Line Entry Rows</label>
            <button type="button" onClick={addItemRow} style={{ border: 'none', background: 'none', color: '#7c3aed', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>+ Append Line Item</button>
          </div>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1.2fr', gap: 8, marginBottom: 8 }}>
              <input type="text" placeholder="Description Label" required value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)} style={inputStyle} />
              <input type="number" min="1" placeholder="Qty" required value={it.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} style={inputStyle} />
              <input type="number" step="0.01" placeholder="Unit Price" required value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} style={inputStyle} />
            </div>
          ))}
        </div>
        <button type="submit" disabled={loading} style={{ background: '#111827', color: 'white', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
          {loading ? 'Drafting Ledger Entry...' : 'Post Account Ledger Statement Invoice'}
        </button>
      </form>
    </ModalWrapper>
  );
}