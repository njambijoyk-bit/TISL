import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Coins, CreditCard, Plus, Minus, Gift,
  ChevronLeft, ChevronRight, Loader2, X, Check, AlertCircle,
} from 'lucide-react';
import loyaltyAPI from '../../api/loyalty';
import customerTiersAPI from '../../api/customerTiers';
import { useAuthStore } from '../../store';

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
    danger:  { background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1.5px solid rgba(239,68,68,0.18)' },
    ghost:   { background: 'rgba(168,85,247,0.06)', color: '#7c3aed', border: '1.5px solid rgba(168,85,247,0.18)' },
    success: { background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1.5px solid rgba(5,150,105,0.18)' },
  };
  return { ...base, ...variants[variant] };
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.15)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const TIER_STYLES_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.25)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.2)'  },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.25)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.25)'  },
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) {
    return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  }
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}

const TYPE_COLORS = {
  order_earn: '#059669', admin_grant: '#7c3aed', admin_deduct: '#dc2626',
  referral_bonus: '#a855f7', birthday_bonus: '#ec4899', review_bonus: '#0891b2',
  redemption: '#d97706', expiry: '#6b7280', adjustment: '#ca8a04',
  referral_reward: '#a855f7', points_redemption: '#059669',
  order_refund: '#0891b2', order_spend: '#d97706',
};

const fmtKes  = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtPts  = (n) => Number(n ?? 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, width = 420 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ ...card, width: '100%', maxWidth: width, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Action modals ─────────────────────────────────────────────────────────────

function GrantPointsModal({ customerId, onClose, onSuccess }) {
  const [form, setForm] = useState({ points: '', note: '', point_type: 'permanent', expires_at: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.points || isNaN(Number(form.points))) return setError('Enter a valid number of points.');
    setLoading(true); setError('');
    try {
      const res = await loyaltyAPI.grantPoints(customerId, {
        points: Number(form.points), note: form.note,
        point_type: form.point_type,
        expires_at: form.point_type === 'expiring' ? form.expires_at : undefined,
      });
      onSuccess(res.new_balance, 'points');
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Grant Loyalty Points" onClose={onClose}>
      <Field label="Points" required>
        <input type="number" min="1" value={form.points} onChange={e => setForm(p => ({ ...p, points: e.target.value }))} style={inputStyle} placeholder="e.g. 500" />
      </Field>
      <Field label="Point type">
        <div style={{ display: 'flex', gap: 8 }}>
          {['permanent', 'expiring'].map(t => (
            <button key={t} onClick={() => setForm(p => ({ ...p, point_type: t }))} style={{
              flex: 1, padding: '7px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              background: form.point_type === t ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.05)',
              color: form.point_type === t ? 'white' : '#7c3aed',
              border: form.point_type === t ? 'none' : '1.5px solid rgba(168,85,247,0.15)',
            }}>{t}</button>
          ))}
        </div>
      </Field>
      {form.point_type === 'expiring' && (
        <Field label="Expires at">
          <input type="date" value={form.expires_at} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} style={inputStyle} />
        </Field>
      )}
      <Field label="Note">
        <textarea rows={2} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Reason for granting…" />
      </Field>
      {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
        <button onClick={submit} disabled={loading} style={btn('primary', 'sm')}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Check size={13} />}
          Grant Points
        </button>
      </div>
    </Modal>
  );
}

function DeductPointsModal({ customerId, currentPoints, onClose, onSuccess }) {
  const [form, setForm] = useState({ points: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.points || isNaN(Number(form.points))) return setError('Enter a valid number.');
    if (Number(form.points) > currentPoints) return setError(`Customer only has ${fmtPts(currentPoints)} points.`);
    setLoading(true); setError('');
    try {
      const res = await loyaltyAPI.deductPoints(customerId, { points: Number(form.points), note: form.note });
      onSuccess(res.new_balance, 'points');
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Deduct Loyalty Points" onClose={onClose}>
      <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 14px' }}>Current balance: <strong style={{ color: '#7c3aed' }}>{fmtPts(currentPoints)} pts</strong></p>
      <Field label="Points to deduct" required>
        <input type="number" min="1" max={currentPoints} value={form.points} onChange={e => setForm(p => ({ ...p, points: e.target.value }))} style={inputStyle} />
      </Field>
      <Field label="Reason" required>
        <textarea rows={2} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Required — explain the deduction…" />
      </Field>
      {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
        <button onClick={submit} disabled={loading} style={btn('danger', 'sm')}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Minus size={13} />}
          Deduct Points
        </button>
      </div>
    </Modal>
  );
}

function GrantCreditModal({ customerId, onClose, onSuccess }) {
  const [form, setForm] = useState({ amount: '', note: '', expires_at: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.amount || isNaN(Number(form.amount))) return setError('Enter a valid amount.');
    setLoading(true); setError('');
    try {
      const res = await loyaltyAPI.grantCredit(customerId, { amount: Number(form.amount), note: form.note, expires_at: form.expires_at || undefined });
      onSuccess(res.new_balance, 'credit');
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Grant Store Credit" onClose={onClose}>
      <Field label="Amount (KES)" required>
        <input type="number" min="1" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={inputStyle} placeholder="e.g. 500" />
      </Field>
      <Field label="Expires at (optional)">
        <input type="date" value={form.expires_at} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} style={inputStyle} />
      </Field>
      <Field label="Note">
        <textarea rows={2} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Reason for granting…" />
      </Field>
      {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
        <button onClick={submit} disabled={loading} style={btn('success', 'sm')}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Plus size={13} />}
          Grant Credit
        </button>
      </div>
    </Modal>
  );
}

function DeductCreditModal({ customerId, currentCredit, onClose, onSuccess }) {
  const [form, setForm] = useState({ amount: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.amount || isNaN(Number(form.amount))) return setError('Enter a valid amount.');
    if (Number(form.amount) > currentCredit) return setError(`Customer only has ${fmtKes(currentCredit)} credit.`);
    setLoading(true); setError('');
    try {
      const res = await loyaltyAPI.deductCredit(customerId, { amount: Number(form.amount), note: form.note });
      onSuccess(res.new_balance, 'credit');
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Deduct Store Credit" onClose={onClose}>
      <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 14px' }}>Current balance: <strong style={{ color: '#059669' }}>{fmtKes(currentCredit)}</strong></p>
      <Field label="Amount (KES)" required>
        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={inputStyle} />
      </Field>
      <Field label="Reason" required>
        <textarea rows={2} value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Required — explain the deduction…" />
      </Field>
      {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
        <button onClick={submit} disabled={loading} style={btn('danger', 'sm')}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Minus size={13} />}
          Deduct Credit
        </button>
      </div>
    </Modal>
  );
}

function RedeemModal({ customerId, rules, onClose, onSuccess }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const submit = async () => {
    if (!selected) return setError('Select a redemption option.');
    setLoading(true); setError('');
    try {
      const res = await loyaltyAPI.redeem(customerId, { rule_id: selected });
      onSuccess(res);
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Redeem Points" onClose={onClose} width={500}>
      {rules.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No active redemption rules at the moment.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {rules.map(r => (
            <div key={r.id}
              onClick={() => setSelected(r.id)}
              style={{
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${selected === r.id ? '#a855f7' : 'rgba(168,85,247,0.1)'}`,
                background: selected === r.id ? 'rgba(168,85,247,0.04)' : 'white',
                transition: 'all 150ms',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>{r.name}</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, textTransform: 'capitalize' }}>{r.type}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 2px' }}>{fmtPts(r.points_required)} pts</p>
                  {r.value_kes > 0 && <p style={{ fontSize: '0.7rem', color: '#059669', margin: 0 }}>{fmtKes(r.value_kes)}</p>}
                </div>
              </div>
              {(r.valid_from || r.valid_until) && (
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '6px 0 0' }}>
                  {r.valid_from && `From ${new Date(r.valid_from).toLocaleDateString('en-KE')} `}
                  {r.valid_until && `· Until ${new Date(r.valid_until).toLocaleDateString('en-KE')}`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={13} />{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn('ghost', 'sm')}>Cancel</button>
        <button onClick={submit} disabled={loading || rules.length === 0} style={btn('primary', 'sm')}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 700ms linear infinite' }} /> : <Gift size={13} />}
          Redeem
        </button>
      </div>
    </Modal>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────

function TxRow({ tx, ledger }) {
  const isCredit = ledger === 'credit';
  const value    = isCredit ? tx.amount : tx.points;
  const balance  = isCredit ? fmtKes(tx.balance_after) : `${fmtPts(tx.balance_after)} pts`;
  const typeColor = TYPE_COLORS[tx.type] ?? '#6b7280';
  const positive = Number(value) > 0;

  return (
    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.05)', transition: 'background 100ms' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.02)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {/* Type */}
      <td style={{ padding: '10px 16px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 9px', borderRadius: 20,
          fontSize: '0.65rem', fontWeight: 700, background: `${typeColor}15`, color: typeColor,
          whiteSpace: 'nowrap',
        }}>
          {tx.type_label ?? tx.type.replace(/_/g, ' ')}
        </span>
      </td>

      {/* Amount */}
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: positive ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
          {positive ? '+' : ''}{isCredit ? fmtKes(value) : `${fmtPts(value)} pts`}
        </span>
      </td>

      {/* Balance after */}
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
        <span style={{ fontSize: '0.78rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{balance}</span>
      </td>

      {/* Note */}
      <td style={{ padding: '10px 16px', maxWidth: 220 }}>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.note ?? '—'}
        </p>
      </td>

      {/* Who */}
      <td style={{ padding: '10px 16px' }}>
        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
          {tx.created_by ? tx.created_by.name : 'System'}
        </span>
      </td>

      {/* When */}
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
        <span style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDate(tx.created_at)}</span>
      </td>
    </tr>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LoyaltyLedgerDetail() {
  const { customerId }  = useParams();
  const navigate        = useNavigate();
  const { user }        = useAuthStore();

  const [customer,  setCustomer]  = useState(null);
  const [txData,    setTxData]    = useState(null);
  const [settings,  setSettings]  = useState(null);
  const [ledger,    setLedger]    = useState('points');
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [modal,     setModal]     = useState(null); // 'grant-points'|'deduct-points'|'grant-credit'|'deduct-credit'|'redeem'
  const [toast,     setToast]     = useState(null);

  const [tierOptions, setTierOptions] = useState([]);
  useEffect(() => { customerTiersAPI.getActiveTiers().then(setTierOptions).catch(() => {}); }, []);

  const role = user?.role;
  const canGrantPoints  = ['super_admin','admin','manager','finance','sales_rep'].includes(role);
  const canDeductPoints = ['super_admin','admin','manager','finance'].includes(role);
  const canGrantCredit  = ['super_admin','admin','manager','finance'].includes(role);
  const canDeductCredit = ['super_admin','admin','manager','finance'].includes(role);
  const canRedeem       = ['super_admin','admin','manager','finance','sales_rep'].includes(role);

  // Load customer + settings once
  useEffect(() => {
    Promise.all([
      loyaltyAPI.show(customerId),
      loyaltyAPI.getSettings(),
    ]).then(([cRes, sRes]) => {
      setCustomer(cRes.customer);
      setSettings(sRes);
    }).finally(() => setLoading(false));
  }, [customerId]);

  // Load transactions when ledger or page changes
  const loadTx = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await loyaltyAPI.transactions(customerId, { ledger, page, per_page: 20 });
      setTxData(res);
    } finally { setTxLoading(false); }
  }, [customerId, ledger, page]);

  useEffect(() => { loadTx(); }, [loadTx]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const onActionSuccess = (newBalance, type) => {
    setModal(null);
    setCustomer(prev => ({
      ...prev,
      ...(type === 'points' ? { loyalty_points: newBalance } : { store_credit: newBalance }),
    }));
    loadTx();
    showToast(type === 'points' ? `Points updated. New balance: ${fmtPts(newBalance)} pts` : `Credit updated. New balance: ${fmtKes(newBalance)}`);
  };

  const onRedeemSuccess = (res) => {
    setModal(null);
    // Refresh both
    loyaltyAPI.show(customerId).then(r => setCustomer(r.customer));
    loadTx();
    showToast(res.message ?? 'Redemption successful.');
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader2 size={28} style={{ color: '#c4b5fd', animation: 'spin 700ms linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!customer) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: '#9ca3af' }}>Customer not found.</p>
    </div>
  );

  const transactions = txData?.data ?? [];
  const meta = {
    current_page: txData?.current_page ?? 1,
    last_page:    txData?.last_page    ?? 1,
    total:        txData?.total        ?? 0,
    };
  const initials     = `${customer.first_name?.[0] ?? ''}${customer.last_name?.[0] ?? ''}`.toUpperCase();
  const tierSt       = tierStyle(customer.tier, tierOptions);
  const activeRules  = (settings?.redemption_rules ?? []).filter(r => r.active);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
          background: toast.type === 'success' ? '#059669' : '#dc2626',
          color: 'white', padding: '10px 18px', borderRadius: 10,
          fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          animation: 'fadeUp 200ms ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Back */}
      <button onClick={() => navigate('/admin/loyalty')} style={{ ...btn('ghost', 'sm'), marginBottom: 18 }}>
        <ArrowLeft size={13} /> Back to Ledger
      </button>

      {/* Customer card */}
      <div style={{ ...card, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 220px' }}>
          {customer.profile_image_url ? (
            <img src={customer.profile_image_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(168,85,247,0.2)', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.95rem', fontWeight: 800, color: 'white',
            }}>{initials}</div>
          )}
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827', margin: '0 0 3px', letterSpacing: '-0.01em' }}>
              {customer.full_name}
            </h2>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 5px', fontFamily: 'monospace' }}>{customer.customer_number}</p>
            <span style={{
              display: 'inline-block', padding: '2px 9px', borderRadius: 20,
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'capitalize',
              background: tierSt.bg, color: tierSt.color,
            }}>{customer.tier}</span>
          </div>
        </div>

        {/* Balances */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: '1 1 300px' }}>
          <div style={{
            flex: 1, minWidth: 130, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Coins size={14} style={{ color: '#a855f7' }} />
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Points</p>
            </div>
            <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#7c3aed', margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPts(customer.loyalty_points)}
            </p>
          </div>
          <div style={{
            flex: 1, minWidth: 130, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(5,150,105,0.04)', border: '1.5px solid rgba(5,150,105,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <CreditCard size={14} style={{ color: '#059669' }} />
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Store Credit</p>
            </div>
            <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#059669', margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtKes(customer.store_credit)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {canGrantPoints  && <button onClick={() => setModal('grant-points')}  style={btn('primary', 'sm')}><Plus  size={12} />Grant Points</button>}
          {canDeductPoints && <button onClick={() => setModal('deduct-points')} style={btn('danger', 'sm')}>  <Minus size={12} />Deduct Points</button>}
          {canGrantCredit  && <button onClick={() => setModal('grant-credit')}  style={btn('success', 'sm')}><Plus  size={12} />Grant Credit</button>}
          {canDeductCredit && <button onClick={() => setModal('deduct-credit')} style={btn('danger', 'sm')}>  <Minus size={12} />Deduct Credit</button>}
          {canRedeem && activeRules.length > 0 && (
            <button onClick={() => setModal('redeem')} style={btn('ghost', 'sm')}><Gift size={12} />Redeem</button>
          )}
        </div>
      </div>

      {/* Ledger tabs + table */}
      <div style={card}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
          {[
            { key: 'points', label: 'Loyalty Points', icon: <Coins size={14} /> },
            { key: 'credit', label: 'Store Credit',   icon: <CreditCard size={14} /> },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setLedger(tab.key); setPage(1); }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '12px 20px', fontSize: '0.82rem', fontWeight: 700,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: ledger === tab.key ? '#7c3aed' : '#9ca3af',
              borderBottom: `2.5px solid ${ledger === tab.key ? '#a855f7' : 'transparent'}`,
              marginBottom: -1, transition: 'all 150ms',
            }}>
              {tab.icon}{tab.label}
              <span style={{
                fontSize: '0.65rem', fontWeight: 700,
                background: ledger === tab.key ? 'rgba(168,85,247,0.1)' : 'transparent',
                color: ledger === tab.key ? '#7c3aed' : '#d1d5db',
                padding: '1px 7px', borderRadius: 20,
              }}>
                {ledger === tab.key && txData ? meta.total : ''}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(168,85,247,0.02)' }}>
                {['Type','Amount','Balance After','Note','By','When'].map((h, i) => (
                  <th key={h} style={{
                    padding: '9px 16px', fontSize: '0.63rem', fontWeight: 700,
                    color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em',
                    textAlign: i >= 1 && i <= 2 ? 'right' : i === 5 ? 'right' : 'left',
                    borderBottom: '1px solid rgba(168,85,247,0.08)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txLoading ? (
                <tr><td colSpan={6} style={{ padding: '40px 0', textAlign: 'center' }}>
                  <Loader2 size={20} style={{ color: '#c4b5fd', animation: 'spin 700ms linear infinite', display: 'inline-block' }} />
                </td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No {ledger === 'points' ? 'point' : 'credit'} transactions yet.</p>
                </td></tr>
              ) : transactions.map(tx => (
                <TxRow key={tx.id} tx={tx} ledger={ledger} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!txLoading && transactions.length > 0 && meta.last_page > 1 && (
          <div style={{
            padding: '12px 16px', borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(168,85,247,0.02)', gap: 4,
        }}>
            {/* Prev */}
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.current_page <= 1} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
            color: '#a855f7', cursor: meta.current_page <= 1 ? 'not-allowed' : 'pointer',
            opacity: meta.current_page <= 1 ? 0.3 : 1,
            }}>
            <ChevronLeft size={13} />
            </button>

            {/* Page numbers */}
            {Array.from({ length: meta.last_page }, (_, i) => i + 1)
            .filter(p => p === 1 || p === meta.last_page || Math.abs(p - meta.current_page) <= 1)
            .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                acc.push(p);
                return acc;
            }, [])
            .map((p, i) => p === '...' ? (
                <span key={`ellipsis-${i}`} style={{ width: 30, textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af' }}>…</span>
            ) : (
                <button key={p} onClick={() => setPage(p)} style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', border: 'none',
                background: meta.current_page === p ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.06)',
                color: meta.current_page === p ? 'white' : '#7c3aed',
                }}>
                {p}
                </button>
            ))
            }

            {/* Next */}
            <button onClick={() => setPage(p => Math.min(meta.last_page, p + 1))} disabled={meta.current_page >= meta.last_page} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
            color: '#a855f7', cursor: meta.current_page >= meta.last_page ? 'not-allowed' : 'pointer',
            opacity: meta.current_page >= meta.last_page ? 0.3 : 1,
            }}>
            <ChevronRight size={13} />
            </button>
        </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'grant-points'  && <GrantPointsModal  customerId={customerId} onClose={() => setModal(null)} onSuccess={onActionSuccess} />}
      {modal === 'deduct-points' && <DeductPointsModal customerId={customerId} currentPoints={customer.loyalty_points} onClose={() => setModal(null)} onSuccess={onActionSuccess} />}
      {modal === 'grant-credit'  && <GrantCreditModal  customerId={customerId} onClose={() => setModal(null)} onSuccess={onActionSuccess} />}
      {modal === 'deduct-credit' && <DeductCreditModal customerId={customerId} currentCredit={customer.store_credit} onClose={() => setModal(null)} onSuccess={onActionSuccess} />}
      {modal === 'redeem'        && <RedeemModal       customerId={customerId} rules={activeRules} onClose={() => setModal(null)} onSuccess={onRedeemSuccess} />}
    </div>
  );
}