import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, FormGrid, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import CurrencySelect from '../../../components/admin/books/CurrencySelect';
import api from '../../../../_shared/api/axios';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';

/** The referral programme: what a referred customer gets and what the referrer earns. */
export default function ReferralSettingsModal({ onClose }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => { api.get('/admin/referrals/programme-settings').then((r) => setF(r.data)).catch((e) => setErr(errMsg(e, 'Could not load the referral settings'))); }, []);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    const blank = (v) => (v === '' || v === undefined ? null : v);
    try {
      await api.put('/admin/referrals/programme-settings', {
        ...f, referral_discount_currency_id: blank(f.referral_discount_currency_id), referral_discount_max: blank(f.referral_discount_max), referral_min_order: blank(f.referral_min_order),
        referral_referrer_gift_amount: f.referral_referrer_gift_amount || 0, referral_referrer_gift_currency_id: blank(f.referral_referrer_gift_currency_id),
      });
      toast.success('Referral programme saved'); onClose();
    } catch (x) { setErrs(fieldErrors(x)); if (!x.response?.data?.errors) setErr(errMsg(x, 'Could not save')); }
    finally { setBusy(false); }
  };

  const pct = f?.referral_discount_type === 'percentage';
  return (
    <Modal title="Referral programme" subtitle="Applies to every customer's personal referral code. Existing codes follow this configuration straight away." onClose={onClose} width={580}>
      {!f ? <p>{err ?? 'Loading…'}</p> : (
        <form onSubmit={submit}>
          <FormStack>
            <FormError message={err} />
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>The new customer gets…</p>
            <FormGrid min={170}>
              <Field label="Discount on their first order" error={errs.referral_discount_type}>
                <SelectInput value={f.referral_discount_type} onChange={(e) => set('referral_discount_type')(e.target.value)}><option value="percentage">A percentage</option><option value="fixed_amount">A fixed amount</option></SelectInput>
              </Field>
              <Field label={pct ? 'Percent off' : 'Amount off'} error={errs.referral_discount_value}>
                <NumberInput required min="0" max={pct ? 100 : undefined} step="0.01" value={f.referral_discount_value} onChange={(e) => set('referral_discount_value')(e.target.value)} />
              </Field>
            </FormGrid>
            <FormGrid min={170}>
              <Field label="Amounts are in" hint="For a fixed amount, the cap and the minimum order.">
                <CurrencySelect value={f.referral_discount_currency_id ?? ''} onChange={set('referral_discount_currency_id')} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1.5px solid var(--line)' }} />
              </Field>
              <Field label="Cap the discount at (optional)" error={errs.referral_discount_max}><NumberInput min="0" step="0.01" value={f.referral_discount_max ?? ''} onChange={(e) => set('referral_discount_max')(e.target.value)} /></Field>
              <Field label="Minimum first order (optional)" error={errs.referral_min_order}><NumberInput min="0" step="0.01" value={f.referral_min_order ?? ''} onChange={(e) => set('referral_min_order')(e.target.value)} /></Field>
            </FormGrid>

            <p style={{ margin: '6px 0 0', fontWeight: 700, fontSize: '0.85rem' }}>The referrer earns… (when the new customer's first sale is paid)</p>
            <FormGrid min={170}>
              <Field label="Loyalty points" hint="They can redeem points into a gift voucher." error={errs.referral_referrer_points}>
                <NumberInput required min="0" step="1" value={f.referral_referrer_points} onChange={(e) => set('referral_referrer_points')(e.target.value)} />
              </Field>
              <Field label="Plus a gift voucher of (optional)" error={errs.referral_referrer_gift_amount}>
                <NumberInput min="0" step="0.01" value={f.referral_referrer_gift_amount} onChange={(e) => set('referral_referrer_gift_amount')(e.target.value)} />
              </Field>
              <Field label="Gift voucher currency">
                <CurrencySelect value={f.referral_referrer_gift_currency_id ?? ''} onChange={set('referral_referrer_gift_currency_id')} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1.5px solid var(--line)' }} />
              </Field>
            </FormGrid>
            <ModalActions onCancel={onClose} submitLabel="Save programme" busy={busy} />
          </FormStack>
        </form>
      )}
    </Modal>
  );
}
