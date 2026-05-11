import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, Check, X,
  AlertCircle, Loader2, ToggleLeft, ToggleRight, Settings2,
} from 'lucide-react';
import { loyaltyAPI } from '../../api';

// ── Tokens ────────────────────────────────────────────────────────────────────

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const btn = (variant = 'primary', size = 'md') => {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: 600, transition: 'all 150ms',
    padding: size === 'sm' ? '5px 12px' : '8px 16px',
    fontSize: size === 'sm' ? '0.75rem' : '0.82rem',
  };
  const variants = {
    primary: { background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white' },
    danger:  { background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1.5px solid rgba(239,68,68,0.2)' },
    ghost:   { background: 'rgba(168,85,247,0.06)', color: '#7c3aed', border: '1.5px solid rgba(168,85,247,0.18)' },
  };
  return { ...base, ...variants[variant] };
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.15)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const label = {
  display: 'block', fontSize: '0.7rem', fontWeight: 700,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
};

const RULE_TYPE_COLORS = {
  cashback: { bg: 'rgba(5,150,105,0.08)',   color: '#059669' },
  voucher:  { bg: 'rgba(168,85,247,0.08)',  color: '#7c3aed' },
  gift:     { bg: 'rgba(245,158,11,0.08)',  color: '#d97706' },
};

const fmtKes = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

// ── Rule modal ────────────────────────────────────────────────────────────────

const EMPTY_RULE = { name: '', type: 'cashback', points_required: '', value_kes: '', active: true, valid_from: '', valid_until: '' };

function RuleModal({ rule, onClose, onSave }) {
  const [form,    setForm]    = useState(rule ? {
    ...rule,
    valid_from:  rule.valid_from  ? rule.valid_from.slice(0, 10)  : '',
    valid_until: rule.valid_until ? rule.valid_until.slice(0, 10) : '',
  } : EMPTY_RULE);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim())          return setError('Name is required.');
    if (!form.points_required || isNaN(Number(form.points_required))) return setError('Points required must be a number.');
    if (!form.value_kes      || isNaN(Number(form.value_kes)))        return setError('KES value must be a number.');
    setLoading(true); setError('');
    try {
      const payload = {
        ...(rule?.id ? { id: rule.id } : {}),
        name:             form.name,
        type:             form.type,
        points_required:  Number(form.points_required),
        value_kes:        Number(form.value_kes),
        active:           form.active,
        valid_from:       form.valid_from  || null,
        valid_until:      form.valid_until || null,
      };
      const res = await loyaltyAPI.upsertRule(payload);
      onSave(res.rule);
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ ...card, width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827', margin: 0 }}>
            {rule ? 'Edit Rule' : 'New Redemption Rule'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div>
            <p style={label}>Rule name <span style={{ color: '#dc2626' }}>*</span></p>
            <input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} placeholder="e.g. Christmas Cashback 2025" />
          </div>

          {/* Type */}
          <div>
            <p style={label}>Type <span style={{ color: '#dc2626' }}>*</span></p>
            <div style={{ display: 'flex', gap: 8 }}>
              {['cashback', 'voucher', 'gift'].map(t => {
                const active = form.type === t;
                const tc = RULE_TYPE_COLORS[t];
                return (
                  <button key={t} onClick={() => set('type', t)} style={{
                    flex: 1, padding: '7px', borderRadius: 8, fontSize: '0.78rem',
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textTransform: 'capitalize',
                    background: active ? tc.bg : 'rgba(168,85,247,0.03)',
                    color: active ? tc.color : '#9ca3af',
                    border: `1.5px solid ${active ? tc.color + '40' : 'rgba(168,85,247,0.1)'}`,
                  }}>{t}</button>
                );
              })}
            </div>
            {form.type === 'gift' && (
              <p style={{ fontSize: '0.7rem', color: '#d97706', margin: '5px 0 0' }}>
                Gift redemptions don't grant store credit — handle fulfilment manually.
              </p>
            )}
          </div>

          {/* Points + value */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={label}>Points required <span style={{ color: '#dc2626' }}>*</span></p>
              <input type="number" min="1" value={form.points_required} onChange={e => set('points_required', e.target.value)} style={inputStyle} placeholder="500" />
            </div>
            <div>
              <p style={label}>Value (KES) <span style={{ color: '#dc2626' }}>*</span></p>
              <input type="number" min="0" value={form.value_kes} onChange={e => set('value_kes', e.target.value)} style={inputStyle} placeholder="250" />
            </div>
          </div>

          {/* Validity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={label}>Valid from</p>
              <input type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <p style={label}>Valid until</p>
              <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Active toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.1)' }}>
            <div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', margin: '0 0 2px' }}>Active</p>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>Customers can see and redeem this rule</p>
            </div>
            <button onClick={() => set('active', !form.active)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {form.active
                ? <ToggleRight size={28} style={{ color: '#a855f7' }} />
                : <ToggleLeft  size={28} style={{ color: '#d1d5db' }} />}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              <AlertCircle size={13} />{error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
            <button onClick={submit} disabled={loading} style={btn('primary', 'sm')}>
              {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Check size={13} />}
              {rule ? 'Save changes' : 'Create rule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ rule, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const confirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ ...card, maxWidth: 360, width: '100%', padding: 24 }}>
        <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Delete rule?</p>
        <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 20px' }}>
          <strong>{rule.name}</strong> will be permanently removed. This can't be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
          <button onClick={confirm} disabled={loading} style={btn('danger', 'sm')}>
            {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LoyaltySettings() {
  const navigate = useNavigate();

  const [settings,   setSettings]   = useState(null);
  const [rules,      setRules]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [form,       setForm]       = useState(null);
  const [toast,      setToast]      = useState(null);
  const [ruleModal,  setRuleModal]  = useState(null); // null | 'new' | rule object
  const [deleteRule, setDeleteRule] = useState(null);

  useEffect(() => {
    loyaltyAPI.getSettings().then(res => {
      setSettings(res.settings);
      setRules(res.redemption_rules ?? []);
      setForm({
        points_per_100_kes:     res.settings.points_per_100_kes     ?? 1,
        referral_credit_amount: res.settings.referral_credit_amount ?? 500,
        min_redemption_points:  res.settings.min_redemption_points  ?? 500,
        points_expiry_months:   res.settings.points_expiry_months   ?? '',
      });
    }).finally(() => setLoading(false));
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        points_per_100_kes:     Number(form.points_per_100_kes),
        referral_credit_amount: Number(form.referral_credit_amount),
        min_redemption_points:  Number(form.min_redemption_points),
        points_expiry_months:   form.points_expiry_months ? Number(form.points_expiry_months) : null,
      };
      const res = await loyaltyAPI.updateSettings(payload);
      setSettings(res.settings);
      showToast('Settings saved.');
    } catch {
      showToast('Failed to save settings.', 'error');
    } finally { setSaving(false); }
  };

  const onRuleSaved = (rule) => {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === rule.id);
      return idx >= 0 ? prev.map(r => r.id === rule.id ? rule : r) : [...prev, rule];
    });
    setRuleModal(null);
    showToast('Rule saved.');
  };

  const onRuleDeleted = async () => {
    try {
      await loyaltyAPI.deleteRule(deleteRule.id);
      setRules(prev => prev.filter(r => r.id !== deleteRule.id));
      setDeleteRule(null);
      showToast('Rule deleted.');
    } catch {
      showToast('Failed to delete rule.', 'error');
    }
  };

  if (loading || !form) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader2 size={26} style={{ color: '#c4b5fd', animation: 'spin 700ms linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          background: toast.type === 'success' ? '#059669' : '#dc2626',
          color: 'white', padding: '10px 18px', borderRadius: 10,
          fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          animation: 'fadeUp 200ms ease',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <button onClick={() => navigate('/admin/loyalty')} style={{ ...btn('ghost', 'sm'), marginBottom: 20 }}>
        <ArrowLeft size={13} /> Back to Ledger
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Settings2 size={18} style={{ color: '#a855f7' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: '0 0 2px', letterSpacing: '-0.02em' }}>Loyalty Settings</h1>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Configure earning rules, redemption thresholds and rewards</p>
        </div>
      </div>

      {/* ── Global settings ── */}
      <div style={{ ...card, padding: '20px 24px', marginBottom: 20 }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
          Global Settings
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { key: 'points_per_100_kes',     label: 'Points per KES 100 spent',  type: 'number', min: 1,   placeholder: '1',   hint: 'Applied on order payment. Multiplied by tier.' },
            { key: 'referral_credit_amount',  label: 'Referral reward (KES)',      type: 'number', min: 0,   placeholder: '500', hint: 'Store credit granted to referrer when referred customer pays first order.' },
            { key: 'min_redemption_points',   label: 'Min redemption threshold',   type: 'number', min: 1,   placeholder: '500', hint: 'Customer must have at least this many points to redeem.' },
            { key: 'points_expiry_months',    label: 'Points expiry (months)',      type: 'number', min: 1,   placeholder: 'Never', hint: 'Leave blank for no expiry. Expiry runs monthly via scheduler.' },
          ].map(({ key, label: lbl, type, min, placeholder, hint }) => (
            <div key={key}>
              <p style={label}>{lbl}</p>
              <input
                type={type} min={min}
                value={form[key] ?? ''}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(168,85,247,0.15)'; e.target.style.boxShadow = 'none'; }}
              />
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '4px 0 0' }}>{hint}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={saveSettings} disabled={saving} style={btn('primary')}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 700ms linear infinite' }} /> : <Check size={14} />}
            Save settings
          </button>
        </div>
      </div>

      {/* ── Redemption rules ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
          <div>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Redemption Rules</p>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{rules.length} rule{rules.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setRuleModal('new')} style={btn('primary', 'sm')}>
            <Plus size={13} /> New rule
          </button>
        </div>

        {rules.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No redemption rules yet. Create one to let customers redeem points.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(168,85,247,0.02)', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
                {['Rule', 'Type', 'Points', 'Value', 'Validity', 'Status', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '9px 16px', fontSize: '0.63rem', fontWeight: 700,
                    color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em',
                    textAlign: i >= 2 && i <= 3 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => {
                const tc = RULE_TYPE_COLORS[r.type] ?? RULE_TYPE_COLORS.cashback;
                const isLast = i === rules.length - 1;
                return (
                  <tr key={r.id} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)' }}>
                    {/* Name */}
                    <td style={{ padding: '11px 16px' }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: 0 }}>{r.name}</p>
                    </td>

                    {/* Type */}
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, textTransform: 'capitalize', background: tc.bg, color: tc.color }}>
                        {r.type}
                      </span>
                    </td>

                    {/* Points */}
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(r.points_required).toLocaleString()} pts
                      </span>
                    </td>

                    {/* Value */}
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                        {r.value_kes > 0 ? fmtKes(r.value_kes) : '—'}
                      </span>
                    </td>

                    {/* Validity */}
                    <td style={{ padding: '11px 16px' }}>
                      <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap' }}>
                        {r.valid_from || r.valid_until
                          ? `${r.valid_from ? new Date(r.valid_from).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '∞'} → ${r.valid_until ? new Date(r.valid_until).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '∞'}`
                          : 'Always active'}
                      </p>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 20,
                        fontSize: '0.65rem', fontWeight: 700,
                        background: r.active ? 'rgba(5,150,105,0.08)' : 'rgba(107,114,128,0.08)',
                        color: r.active ? '#059669' : '#6b7280',
                      }}>
                        {r.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => setRuleModal(r)} style={{ ...btn('ghost', 'sm'), padding: '4px 8px' }}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => setDeleteRule(r)} style={{ ...btn('danger', 'sm'), padding: '4px 8px' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {ruleModal && (
        <RuleModal
          rule={ruleModal === 'new' ? null : ruleModal}
          onClose={() => setRuleModal(null)}
          onSave={onRuleSaved}
        />
      )}
      {deleteRule && (
        <DeleteConfirm
          rule={deleteRule}
          onClose={() => setDeleteRule(null)}
          onConfirm={onRuleDeleted}
        />
      )}
    </div>
  );
}