import { useState } from 'react';
import toast from 'react-hot-toast';
import { Coins, History, ArrowRight } from 'lucide-react';
import customersAPI from '../../../api/customers';
import useAuthStore from '../../../store/authStore';
import { canReadFinance, canWriteFinance } from '../../../lib/roles';
import { fieldErrors } from '../../../store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextArea, FormStack, ModalActions, FormError } from '../ui/Form';
import CurrencySelect from '../../common/currency/CurrencySelect';
import { colors, card, radius, btnGhost } from '../../../theme/tokens';

const EVENT_LABEL = {
  currency_assigned: 'Currency assigned',
  currency_changed: 'Currency changed',
};

const fmtWhen = (d) => (d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * The customer's pinned account currency — their wallet, credit account and
 * checkout run in it. Finance can change it (refused while a balance exists)
 * and see the full history of who changed it, when and why.
 */
export default function AccountCurrencyCard({ customer, onChanged }) {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user);

  const [changing, setChanging] = useState(false);
  const [history, setHistory] = useState(null);     // { blocker, logs } once loaded
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ currency_id: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const currency = customer?.currency;

  const loadHistory = async () => {
    try {
      const data = await customersAPI.getCurrencyLog(customer.id);
      setHistory(data);
      return data;
    } catch {
      toast.error('Could not load the currency history');
      return null;
    }
  };

  const openChange = async () => {
    setForm({ currency_id: customer.currency_id ?? '', reason: '' });
    setErrors({}); setFormError(null);
    const data = history ?? await loadHistory();
    if (data?.blocker) setFormError(`Can't change it yet: ${data.blocker}`);
    setChanging(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (String(form.currency_id) === String(customer.currency_id)) { setErrors({ currency_id: 'Pick a different currency.' }); return; }
    setSaving(true);
    try {
      const res = await customersAPI.updateCurrency(customer.id, form.currency_id, form.reason.trim());
      onChanged?.({ currency_id: res.customer.currency_id, currency: res.customer.currency });
      setHistory(null); // stale now
      toast.success(`Account currency is now ${res.customer.currency?.code}`);
      setChanging(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not change the currency');
    } finally {
      setSaving(false);
    }
  };

  const toggleHistory = async () => {
    if (!showHistory && !history) await loadHistory();
    setShowHistory((v) => !v);
  };

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: colors.primaryDeep, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Coins size={14} /> Account currency
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {canRead && (
            <button type="button" onClick={toggleHistory} aria-expanded={showHistory}
              style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem', border: 'none' }}>
              <History size={12} /> History
            </button>
          )}
          {canWrite && (
            <button type="button" onClick={openChange}
              style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem' }}>
              Change
            </button>
          )}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.text }}>
        {currency ? <>{currency.code} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: colors.textMuted }}>{currency.name}</span></> : '—'}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: colors.textFaint }}>
        Store credit, the credit account and checkout are in this currency.
      </p>

      {showHistory && history && (
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.logs.length === 0 && <li style={{ fontSize: '0.75rem', color: colors.textFaint }}>No history yet.</li>}
          {history.logs.map((l) => (
            <li key={l.id} style={{ padding: '8px 10px', borderRadius: radius.md, border: `1px solid ${colors.tint(0.08)}`, fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ color: colors.text }}>
                  {EVENT_LABEL[l.event] ?? l.event}
                  {l.old_values?.currency && <> · {l.old_values.currency} <ArrowRight size={10} style={{ verticalAlign: 'middle' }} /></>}
                  {l.new_values?.currency && <> {l.new_values.currency}</>}
                </strong>
                <span style={{ color: colors.textFaint, whiteSpace: 'nowrap' }}>{fmtWhen(l.created_at)}</span>
              </div>
              <p style={{ margin: '3px 0 0', color: colors.textMuted }}>
                {l.user?.name ?? (l.context?.source === 'backfill' || l.context?.source === 'account_created' ? 'System' : '—')}
                {l.context?.reason && <> — {l.context.reason}</>}
              </p>
            </li>
          ))}
        </ul>
      )}

      {changing && (
        <Modal title="Change account currency" subtitle={`${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || undefined} onClose={() => setChanging(false)} width={460}>
          <form onSubmit={submit}>
            <FormStack>
              <FormError message={formError} />
              <Field label="New currency" htmlFor="acct-cur" error={errors.currency_id}
                hint="Only possible with no store credit, no credit balance and no unpaid invoices — balances are never converted.">
                <CurrencySelect id="acct-cur" value={form.currency_id} onChange={(v) => setForm((f) => ({ ...f, currency_id: v }))}
                  disabled={Boolean(history?.blocker)} />
              </Field>
              <Field label="Reason" htmlFor="acct-reason" error={errors.reason} hint="Kept in the currency history.">
                <TextArea id="acct-reason" required minLength={3} maxLength={255} value={form.reason}
                  disabled={Boolean(history?.blocker)}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Customer relocated to Uganda and pays in UGX" />
              </Field>
              <ModalActions onCancel={() => setChanging(false)} submitLabel="Change currency" busyLabel="Changing…"
                busy={saving} disabled={Boolean(history?.blocker)} />
            </FormStack>
          </form>
        </Modal>
      )}
    </div>
  );
}
