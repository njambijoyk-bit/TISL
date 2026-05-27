import { useState, useEffect } from 'react';
import SettingsLayout from '../../../../components/layout/SettingsLayout';
import policyAPI from '../../../../api/policy';
import { useAuthStore } from '../../../../store';
import {
  Shield, Edit2, X, ChevronDown, ChevronUp,
  FileText, Users, BarChart2, History, AlertTriangle,
  CheckCircle, XCircle, Eye, Save, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Shared styles ─────────────────────────────────────────────────────────────

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
};

const TH_LABEL = ({ children, right }) => (
  <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', display: 'block', textAlign: right ? 'right' : 'left' }}>
    {children}
  </span>
);

function Field({ label, children, hint }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

// ── Sensitivity badge ─────────────────────────────────────────────────────────

function SensitivityBadge({ sensitivity }) {
  const map = {
    critical: { bg: 'rgba(239,68,68,0.1)',   color: '#dc2626', label: 'Critical' },
    standard: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', label: 'Standard' },
    soft:     { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: 'Soft'     },
  };
  const s = map[sensitivity] || map.standard;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Edit Policy Modal ─────────────────────────────────────────────────────────

function EditPolicyModal({ policy, onClose, onSave }) {
  const [form, setForm] = useState({
    title:                     policy.title || '',
    content:                   policy.content || '',
    disagree_consequence_text: policy.disagree_consequence_text || '',
    sensitivity:               policy.sensitivity || 'standard',
    requires_acceptance:       !!policy.requires_acceptance,
    is_active:                 !!policy.is_active,
    is_major_bump:             false,
    major_bump_note:           '',
  });
  const [preview, setPreview] = useState(false);
  const set    = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setBool = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }));

  const contentChanged = form.content !== policy.content;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.is_major_bump && !form.major_bump_note.trim()) {
      toast.error('Please provide a note explaining the major version change');
      return;
    }
    onSave(policy.id, form);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 720, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
              Edit policy — {policy.title}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
              Current version: <strong style={{ color: '#7c3aed' }}>v{policy.major_version}.{policy.minor_version}</strong>
              &nbsp;·&nbsp;key: <code style={{ fontSize: '0.68rem', background: 'rgba(168,85,247,0.08)', padding: '1px 5px', borderRadius: 4 }}>{policy.key}</code>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title + sensitivity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <Field label="Title">
              <input type="text" required value={form.title} onChange={set('title')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
            </Field>
            <Field label="Sensitivity">
              <select value={form.sensitivity} onChange={set('sensitivity')} style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
                <option value="critical">Critical</option>
                <option value="standard">Standard</option>
                <option value="soft">Soft</option>
              </select>
            </Field>
          </div>

          {/* Content */}
          <Field label="Policy content" hint="Use {{cancellation_fee}}, {{cancellation_window_hours}} for booking policy placeholders.">
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <button type="button" onClick={() => setPreview(false)} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: `1.5px solid ${!preview ? '#a855f7' : 'rgba(168,85,247,0.18)'}`, background: !preview ? 'rgba(168,85,247,0.08)' : 'white', color: !preview ? '#7c3aed' : '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
              <button type="button" onClick={() => setPreview(true)}  style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: `1.5px solid ${preview ? '#a855f7' : 'rgba(168,85,247,0.18)'}`, background: preview ? 'rgba(168,85,247,0.08)' : 'white', color: preview ? '#7c3aed' : '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Eye size={11} style={{ display: 'inline', marginRight: 4 }} />Preview
              </button>
            </div>
            {preview ? (
              <div style={{ ...inputStyle, minHeight: 200, padding: '12px', background: 'rgba(168,85,247,0.02)', whiteSpace: 'pre-wrap', fontSize: '0.82rem', lineHeight: 1.7 }}>
                {form.content || <span style={{ color: '#9ca3af' }}>Nothing to preview</span>}
              </div>
            ) : (
              <textarea
                required value={form.content} onChange={set('content')} rows={10}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                onFocus={inputFocus} onBlur={inputBlur}
              />
            )}
          </Field>

          {/* Disagree consequence */}
          <Field label="Disagree consequence text" hint="Shown when customer clicks disagree on this policy.">
            <textarea value={form.disagree_consequence_text} onChange={set('disagree_consequence_text')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} onFocus={inputFocus} onBlur={inputBlur} />
          </Field>

          {/* Toggles */}
          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.requires_acceptance} onChange={setBool('requires_acceptance')} />
              Requires acceptance
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={setBool('is_active')} />
              Active
            </label>
          </div>

          {/* Major bump — only shown when content changed */}
          {contentChanged && (
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: '#b45309', cursor: 'pointer', marginBottom: form.is_major_bump ? 10 : 0 }}>
                <input type="checkbox" checked={form.is_major_bump} onChange={setBool('is_major_bump')} />
                This is a major version update — require all customers to re-accept
              </label>
              {form.is_major_bump && (
                <Field label="What do customers need to do?">
                  <input
                    type="text" required={form.is_major_bump}
                    value={form.major_bump_note} onChange={set('major_bump_note')}
                    placeholder="e.g. New cancellation fee terms — all customers must re-accept before next checkout"
                    style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
                  />
                </Field>
              )}
              {!form.is_major_bump && (
                <p style={{ fontSize: '0.7rem', color: '#92400e', margin: '6px 0 0' }}>
                  Minor update — version will bump automatically (v{policy.major_version}.{policy.minor_version} → v{policy.major_version}.{policy.minor_version + 1}). Existing customers do not need to re-accept.
                </p>
              )}
              {form.is_major_bump && (
                <p style={{ fontSize: '0.7rem', color: '#92400e', margin: '6px 0 0' }}>
                  Major update — version will bump to v{policy.major_version + 1}.0. All customers must re-accept before their next login or checkout.
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Save size={13} /> Save policy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Acceptances Panel ─────────────────────────────────────────────────────────

function AcceptancesPanel({ policyId }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all'); // all | accepted | disagreed

  useEffect(() => {
    policyAPI.getAcceptances(policyId, { response: filter === 'all' ? undefined : filter, per_page: 50 })
      .then(res => setData(res.data ?? res))
      .catch(() => toast.error('Failed to load acceptances'))
      .finally(() => setLoading(false));
  }, [policyId, filter]);

  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['all', 'accepted', 'disagreed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
            border: `1.5px solid ${filter === f ? '#a855f7' : 'rgba(168,85,247,0.18)'}`,
            background: filter === f ? 'rgba(168,85,247,0.08)' : 'white',
            color: filter === f ? '#7c3aed' : '#9ca3af',
            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
          }}>{f}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 0' }}>Loading...</p>
      ) : !data.length ? (
        <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 0' }}>No records found</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid rgba(168,85,247,0.1)', borderRadius: 10, overflow: 'hidden' }}>
          {data.map((row, i) => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: i < data.length - 1 ? '1px solid rgba(168,85,247,0.06)' : 'none', background: row.response === 'disagreed' ? 'rgba(239,68,68,0.02)' : 'white' }}>
              <div style={{ marginTop: 2, flexShrink: 0 }}>
                {row.response === 'accepted'
                  ? <CheckCircle size={14} style={{ color: '#16a34a' }} />
                  : <XCircle    size={14} style={{ color: '#dc2626' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                    {row.customer ? `${row.customer.first_name} ${row.customer.last_name}` : row.customer_number || 'Unknown'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{row.customer?.email}</span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(168,85,247,0.08)', color: '#7c3aed' }}>
                    v{row.policy_version}
                  </span>
                  <span style={{ fontSize: '0.62rem', color: '#9ca3af', background: 'rgba(107,114,128,0.08)', padding: '1px 6px', borderRadius: 99 }}>
                    {row.action_context?.replace(/_/g, ' ')}
                  </span>
                  {row.flagged && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                      Flagged
                    </span>
                  )}
                </div>
                {row.disagree_reason && (
                  <p style={{ fontSize: '0.72rem', color: '#b45309', margin: '3px 0 0', fontStyle: 'italic' }}>
                    Reason: "{row.disagree_reason}"
                  </p>
                )}
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>
                  {row.accepted_at ? format(new Date(row.accepted_at), 'dd MMM yyyy, HH:mm') : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Change Log Panel ──────────────────────────────────────────────────────────

function ChangeLogPanel({ policyId }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    policyAPI.getChangeLogs(policyId)
      .then(setLogs)
      .catch(() => toast.error('Failed to load change logs'))
      .finally(() => setLoading(false));
  }, [policyId]);

  if (loading) return <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 0' }}>Loading...</p>;
  if (!logs.length) return <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '16px 0' }}>No changes recorded yet</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {logs.map(log => (
        <div key={log.id} style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${log.is_major_bump ? 'rgba(245,158,11,0.3)' : 'rgba(168,85,247,0.1)'}`, background: log.is_major_bump ? 'rgba(245,158,11,0.04)' : 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>
              v{log.previous_version} → v{log.new_version}
            </span>
            {log.is_major_bump && (
              <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#b45309' }}>
                Major
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: '#6b7280', marginLeft: 'auto' }}>
              {log.changed_by_name} · {log.changed_at ? format(new Date(log.changed_at), 'dd MMM yyyy, HH:mm') : '—'}
            </span>
          </div>
          {log.major_bump_note && (
            <p style={{ fontSize: '0.75rem', color: '#92400e', margin: '4px 0 0', padding: '6px 10px', borderRadius: 6, background: 'rgba(245,158,11,0.08)' }}>
              📋 {log.major_bump_note}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

function ReportsTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    policyAPI.getReports()
      .then(setData)
      .catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Total acceptances',   value: data.totals.total_acceptances,   color: '#16a34a' },
          { label: 'Total disagreements', value: data.totals.total_disagreements, color: '#dc2626' },
          { label: 'Flagged customers',   value: data.totals.flagged_customers,   color: '#b45309' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...card, padding: '16px 20px' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 6px' }}>{label}</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 900, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Outdated acceptances */}
      {data.outdated_acceptances?.length > 0 && (
        <div style={{ ...card, padding: 20 }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b' }} /> Customers on outdated major version
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.outdated_acceptances.map(row => (
              <div key={row.policy_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{row.policy_key.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 8 }}>current: v{row.current_version}</span>
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#b45309' }}>{row.outdated_count} customers</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disagreements by policy */}
      {data.disagreements?.length > 0 && (
        <div style={{ ...card, padding: 20 }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <XCircle size={14} style={{ color: '#dc2626' }} /> Disagreements by policy
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.disagreements.map(row => (
              <div key={row.policy_key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.08)', background: 'white' }}>
                <span style={{ fontSize: '0.82rem', color: '#374151' }}>{row.policy_key.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>{row.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged customers */}
      {data.flagged_customers?.length > 0 && (
        <div style={{ ...card, padding: 20 }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={14} style={{ color: '#ef4444' }} /> Flagged customers
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid rgba(168,85,247,0.1)', borderRadius: 10, overflow: 'hidden' }}>
            {data.flagged_customers.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < data.flagged_customers.length - 1 ? '1px solid rgba(168,85,247,0.06)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{c.first_name} {c.last_name}</span>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', marginLeft: 8 }}>{c.customer_number}</span>
                  <p style={{ fontSize: '0.72rem', color: '#dc2626', margin: '2px 0 0' }}>
                    Disagreed with {c.policy_flagged_policy_key?.replace(/_/g, ' ')} v{c.policy_flagged_version}
                  </p>
                </div>
                <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                  {c.policy_flagged_at ? format(new Date(c.policy_flagged_at), 'dd MMM yyyy') : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Policy Row (expandable) ───────────────────────────────────────────────────

function PolicyRow({ policy, onEdit, index }) {
  const [expanded,    setExpanded]    = useState(false);
  const [activePanel, setActivePanel] = useState('acceptances'); // acceptances | changelog

  return (
    <>
      <tr style={{ borderTop: index ? '1px solid rgba(168,85,247,0.07)' : 'none' }}>
        <td style={{ padding: '12px 16px' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>{policy.title}</p>
          <code style={{ fontSize: '0.65rem', color: '#9ca3af', background: 'rgba(168,85,247,0.06)', padding: '1px 5px', borderRadius: 4 }}>{policy.key}</code>
        </td>
        <td style={{ padding: '12px 16px' }}>
          <SensitivityBadge sensitivity={policy.sensitivity} />
        </td>
        <td style={{ padding: '12px 16px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>
            v{policy.major_version}.{policy.minor_version}
          </span>
        </td>
        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#374151' }}>
          <span style={{ fontWeight: 700, color: '#16a34a' }}>{policy.total_acceptances ?? 0}</span>
          {' / '}
          <span style={{ fontWeight: 700, color: '#dc2626' }}>{policy.total_disagreements ?? 0}</span>
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: policy.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: policy.is_active ? '#16a34a' : '#dc2626' }}>
            {policy.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              onClick={() => { setExpanded(e => !e); }}
              style={{ background: 'rgba(168,85,247,0.08)', color: '#7c3aed', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex' }}
              title="View acceptances & history"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              onClick={() => onEdit(policy)}
              style={{ background: 'rgba(99,102,241,0.08)', color: '#4f46e5', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex' }}
              title="Edit policy"
            >
              <Edit2 size={13} />
            </button>
          </div>
        </td>
      </tr>

      {/* Expandable panel */}
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', background: 'rgba(168,85,247,0.02)', borderTop: '1px solid rgba(168,85,247,0.08)' }}>

              {/* Sub-tab switcher */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {[
                  { key: 'acceptances', label: 'Acceptances', icon: <Users size={11} /> },
                  { key: 'changelog',   label: 'Change Log',  icon: <History size={11} /> },
                ].map(t => (
                  <button key={t.key} onClick={() => setActivePanel(t.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                    border: `1.5px solid ${activePanel === t.key ? '#a855f7' : 'rgba(168,85,247,0.18)'}`,
                    background: activePanel === t.key ? 'rgba(168,85,247,0.08)' : 'white',
                    color: activePanel === t.key ? '#7c3aed' : '#9ca3af',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {activePanel === 'acceptances' && <AcceptancesPanel policyId={policy.id} />}
              {activePanel === 'changelog'   && <ChangeLogPanel   policyId={policy.id} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { key: 'policies', label: 'Policies',  icon: <FileText size={13} /> },
  { key: 'reports',  label: 'Reports',   icon: <BarChart2 size={13} /> },
];

export default function PolicySettings() {
  const [policies,     setPolicies]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState('policies');
  const [editingPolicy,setEditingPolicy]= useState(null);

  const { user: authUser } = useAuthStore();

  useEffect(() => { loadPolicies(); }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await policyAPI.adminGetAll();
      setPolicies(data);
    } catch {
      toast.error('Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (id, form) => {
    try {
      const res = await policyAPI.update(id, form);
      toast.success('Policy updated successfully');
      setPolicies(prev => prev.map(p => p.id === id ? res.policy : p));
      setEditingPolicy(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update policy');
    }
  };

  return (
    <SettingsLayout>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: '#a855f7' }} /> Policy Management
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            Manage platform policies, track customer acceptances and disagreements
          </p>
        </div>
        <button onClick={loadPolicies} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#7c3aed', cursor: 'pointer', fontFamily: 'inherit' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(168,85,247,0.1)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700,
            border: 'none', borderBottom: `2px solid ${tab === t.key ? '#a855f7' : 'transparent'}`,
            background: 'none', color: tab === t.key ? '#7c3aed' : '#9ca3af',
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1,
            transition: 'color 150ms',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Policies tab ── */}
      {tab === 'policies' && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 28, height: 28, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(168,85,247,0.04)' }}>
                    {['Policy', 'Sensitivity', 'Version', 'Accepted / Disagreed', 'Status', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 16px', textAlign: i >= 4 ? 'center' : 'left' }}>
                        <TH_LABEL right={i >= 4}>{h}</TH_LABEL>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy, i) => (
                    <PolicyRow
                      key={policy.id}
                      policy={policy}
                      index={i}
                      onEdit={setEditingPolicy}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* ── Reports tab ── */}
      {tab === 'reports' && <ReportsTab />}

      {/* ── Edit modal ── */}
      {editingPolicy && (
        <EditPolicyModal
          policy={editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSave={handleSave}
        />
      )}
    </SettingsLayout>
  );
}