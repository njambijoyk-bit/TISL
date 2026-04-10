import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Loader2 } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';

const STATUS_OPTIONS   = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

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

const PRIORITY_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', urgent: '#ef4444' };

// ── Modal ─────────────────────────────────────────────────────────────────────

const EditProjectModal = ({ project, onClose }) => {
  const { updateProject, loading } = useProjectStore();

  const [form, setForm] = useState({
    title:                    project.title                    || '',
    description:              project.description              || '',
    status:                   project.status                   || 'planning',
    priority:                 project.priority                 || 'medium',
    delivery_location:        project.delivery_location        || '',
    default_shipping_address: project.default_shipping_address || '',
    default_billing_address:  project.default_billing_address  || '',
    billing_same_as_shipping: project.billing_same_as_shipping ?? true,
    start_date:               project.start_date      ? project.start_date.slice(0, 10)      : '',
    target_end_date:          project.target_end_date ? project.target_end_date.slice(0, 10) : '',
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const res = await updateProject(project.id, form);
    if (res.success) { toast.success('Project updated successfully.'); onClose(); }
    else toast.error(res.error || 'Failed to update project.');
  };

  const isBusy = loading.submitting;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 480, maxHeight: '90vh',
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
              Edit Project
            </p>
            <p style={{
              fontSize: '0.72rem', color: '#6b7280', margin: '2px 0 0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320,
            }}>
              {project.title}
            </p>
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
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Description */}
          <div>
            <span style={labelStyle}>Description</span>
            <textarea rows={3} value={form.description}
              onChange={e => set('description', e.target.value)}
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Status + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Status</span>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Priority</span>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: `${PRIORITY_COLOR[form.priority]}55`,
                  color: PRIORITY_COLOR[form.priority],
                  fontWeight: 600,
                }}
                onFocus={inputFocus} onBlur={inputBlur}>
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start + End Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Start Date</span>
              <input type="date" value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
            </div>
            <div>
              <span style={labelStyle}>Target End Date</span>
              <input type="date" value={form.target_end_date}
                onChange={e => set('target_end_date', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
            </div>
          </div>

          {/* Delivery Location */}
          <div>
            <span style={labelStyle}>Delivery Location</span>
            <input type="text" value={form.delivery_location}
              onChange={e => set('delivery_location', e.target.value)}
              placeholder="e.g. Nairobi Warehouse"
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Shipping Address */}
          <div>
            <span style={labelStyle}>Default Shipping Address</span>
            <textarea rows={2} value={form.default_shipping_address}
              onChange={e => set('default_shipping_address', e.target.value)}
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Billing same as shipping toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => set('billing_same_as_shipping', !form.billing_same_as_shipping)}
              style={{
                width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: form.billing_same_as_shipping
                  ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
                  : 'rgba(168,85,247,0.15)',
                position: 'relative', flexShrink: 0,
                transition: 'background 200ms',
              }}
            >
              <span style={{
                position: 'absolute', top: 3,
                left: form.billing_same_as_shipping ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%',
                background: form.billing_same_as_shipping ? 'white' : '#c4b5fd',
                transition: 'left 200ms',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', userSelect: 'none' }}>
              Billing address same as shipping
            </span>
          </div>

          {/* Billing Address — only shown when not same as shipping */}
          {!form.billing_same_as_shipping && (
            <div>
              <span style={labelStyle}>Default Billing Address</span>
              <textarea rows={2} value={form.default_billing_address}
                onChange={e => set('default_billing_address', e.target.value)}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={inputFocus} onBlur={inputBlur} />
            </div>
          )}
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
            {isBusy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditProjectModal;