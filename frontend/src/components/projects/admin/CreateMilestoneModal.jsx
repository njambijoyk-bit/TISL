import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';
import currencyAPI from '../../../api/currency';

const STATUS_OPTIONS = ['pending', 'ready_for_review', 'approved', 'completed', 'rejected'];

const statusLabel = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money       = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

// ─── Modal ────────────────────────────────────────────────────────────────────
const CreateMilestoneModal = ({ project, onClose, editMilestone = null }) => {
  const { createMilestone, updateMilestone, loading } = useProjectStore();
  const isEditMode = !!editMilestone;

  const [currencies,  setCurrencies]  = useState([{ code: project.base_currency || 'KES' }]);
  const [currencyMap, setCurrencyMap] = useState({});

  const [form, setForm] = useState(() => ({
    title:       editMilestone?.title       || '',
    description: editMilestone?.description || '',
    due_date:    editMilestone?.due_date    ? editMilestone.due_date.slice(0, 10) : '',
    status:      editMilestone?.status      || 'pending',
    currency:    editMilestone?.currency    || project.base_currency || 'KES',
    amount:      editMilestone?.amount      ?? '',
  }));

  useEffect(() => {
    currencyAPI.getCurrencies()
      .then((res) => {
        const active = (res.data || res || []).filter(c => c.is_active);
        if (active.length > 0) {
          setCurrencies(active);
          setCurrencyMap(Object.fromEntries(active.map(c => [c.code, c])));
        }
      })
      .catch(() => {});
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // KES conversion
  const cur       = currencyMap[form.currency];
  const rate      = cur ? parseFloat(cur.exchange_rate_to_kes || cur.rate || cur.conversion_rate || 1) : null;
  const showKes   = form.currency !== 'KES' && !!rate;
  const noRate    = form.currency !== 'KES' && !rate;
  const amountKes = showKes && form.amount ? parseFloat((parseFloat(form.amount) * rate).toFixed(2)) : null;

  const buildPayload = () => {
    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || undefined,
      due_date:    form.due_date           || undefined,
      status:      form.status,
      currency:    form.currency,
    };
    const amt = parseFloat(form.amount);
    if (!isNaN(amt) && amt > 0) {
      payload.amount = amt;
      if (showKes && rate) {
        payload.exchange_rate_to_kes  = rate;
        payload.amount_kes            = parseFloat((amt * rate).toFixed(2));
        payload.converted_currency_at = new Date().toISOString();
      }
    }
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required.'); return; }
    if (isEditMode) {
      const res = await updateMilestone(project.id, editMilestone.id, buildPayload());
      if (res.success) { toast.success('Milestone updated.'); onClose(); }
      else toast.error(res.error || 'Failed to update milestone.');
    } else {
      const res = await createMilestone(project.id, buildPayload());
      if (res.success) { toast.success('Milestone created.'); onClose(); }
      else toast.error(res.error || 'Failed to create milestone.');
    }
  };

  const isBusy = loading.submitting;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 460, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 18, overflow: 'hidden',
        background: 'white',
        border: '1px solid rgba(168,85,247,0.3)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>

        {/* Accent strip */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7', margin: 0 }}>
              {isEditMode ? 'Edit Milestone' : 'Create Milestone'}
            </p>
            {isEditMode && (
              <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                {editMilestone.title}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', display: 'flex', padding: 4, borderRadius: 6,
            transition: 'color 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <div>
            <span style={labelStyle}>Title *</span>
            <input type="text" required value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Design approval"
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Description */}
          <div>
            <span style={labelStyle}>Description</span>
            <textarea rows={3} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What needs to happen for this milestone?"
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Due Date + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Due Date</span>
              <input type="date" value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
            </div>
            <div>
              <span style={labelStyle}>Status</span>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Currency + Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Currency</span>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Amount</span>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="Optional"
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
            </div>
          </div>

          {/* KES conversion panel */}
          {showKes && form.amount > 0 && (
            <div style={{
              borderRadius: 10, padding: '10px 14px',
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.2)',
            }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#2563eb', margin: '0 0 4px' }}>
                KES Equivalent · 1 {form.currency} = {rate.toFixed(4)} KES
              </p>
              <p style={{ fontSize: '0.72rem', color: '#3b82f6', margin: 0 }}>
                Amount: <strong>KES {money(amountKes)}</strong>
              </p>
            </div>
          )}

          {noRate && (
            <p style={{ fontSize: '0.72rem', color: '#d97706', margin: 0 }}>
              ⚠ No exchange rate for {form.currency} — KES fields will be skipped.
            </p>
          )}

          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
            Amount is optional — only needed for milestone billing. Visible only to participants with finance access.
          </p>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px 14px',
          borderTop: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
            background: 'transparent', color: '#9ca3af',
            border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer',
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isBusy} style={{
            padding: '6px 18px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
            border: 'none', cursor: isBusy ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            opacity: isBusy ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'box-shadow 150ms, opacity 150ms',
          }}
            onMouseEnter={e => { if (!isBusy) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
            {isBusy && <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />}
            {isBusy ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create Milestone'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateMilestoneModal;