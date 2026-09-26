import { useState } from 'react';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';
import useTaxStore from '../../../../../_shared/store/taxStore';
import { fieldErrors } from '../../../../../_shared/store/helpers/apiState';
import Modal from '../../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';
import UnitSelect from '../../../../../_shared/components/common/UnitSelect';
import CurrencySelect from '../../../../../_shared/components/common/currency/CurrencySelect';
import { colors } from '../../../../../_shared/theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);

const BASES = [
  { id: 'post_discount', label: 'After discounts', help: 'The usual choice.' },
  { id: 'pre_discount',  label: 'Before discounts', help: 'Tax the full list price.' },
  { id: 'total_payable', label: 'After discounts and earlier taxes', help: 'Tax on tax (compounding), in calculation-sequence order.' },
];

/**
 * Create / edit a tax rate. Once a rate has been charged on an order its
 * money fields are locked server-side; we show that instead of letting the
 * save fail.
 */
export default function TaxRateForm({ rate, defaultTypeId, onClose }) {
  const { types, createRate, updateRate, actionLoading } = useTaxStore();
  const editing = Boolean(rate);
  const [form, setForm] = useState({
    tax_type_id: rate?.tax_type_id ?? defaultTypeId ?? '',
    classification: rate?.classification ?? '',
    rate_type: rate?.rate_type ?? 'percentage',
    rate_value: rate?.rate_value != null ? Number(rate.rate_value) : '',
    unit_of_measure_id: rate?.unit_of_measure_id ?? '',
    currency_id: rate?.currency_id ?? '',
    calculation_base: rate?.calculation_base ?? 'post_discount',
    calculation_sequence: rate?.calculation_sequence ?? 0,
    requires_certificate: rate?.requires_certificate ?? false,
    valid_from: rate?.valid_from?.slice(0, 10) ?? today(),
    valid_until: rate?.valid_until?.slice(0, 10) ?? '',
    is_active: rate?.is_active ?? true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [locked, setLocked] = useState((rate?.applications_count ?? 0) > 0);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const fixed = form.rate_type === 'fixed_amount';

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    const payload = {
      ...form,
      classification: form.classification.trim() || null,
      unit_of_measure_id: fixed ? form.unit_of_measure_id || null : null,
      currency_id: fixed ? form.currency_id || null : null,
      valid_until: form.valid_until || null,
      calculation_sequence: Number(form.calculation_sequence) || 0,
    };
    if (editing) delete payload.tax_type_id; // not updatable
    if (editing && locked) {
      // Only administrative fields are allowed on a used rate
      ['rate_type', 'rate_value', 'classification', 'unit_of_measure_id', 'currency_id', 'calculation_base']
        .forEach((k) => delete payload[k]);
    }
    try {
      if (editing) await updateRate(rate.id, payload); else await createRate(payload);
      toast.success(editing ? 'Tax rate saved' : 'Tax rate created');
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message ?? '';
      if (/locked/i.test(msg)) setLocked(true);
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(msg || 'Could not save the tax rate');
    }
  };

  const moneyDisabled = editing && locked;

  return (
    <Modal title={editing ? 'Edit tax rate' : 'New tax rate'} subtitle="The actual percentage or amount, and the dates it applies." onClose={onClose} width={600}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          {locked && (
            <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem', color: colors.warningText, background: colors.warningBg, padding: '8px 12px', borderRadius: 8 }}>
              <Lock size={13} /> This rate has been charged on orders, so its amount and basis are locked. Change the dates or status, or create a new rate.
            </p>
          )}
          <FormGrid>
            <Field label="Tax type" htmlFor="tr-type" error={errors.tax_type_id}>
              <SelectInput id="tr-type" required value={form.tax_type_id} disabled={editing}
                onChange={(e) => set('tax_type_id')(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose a tax type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </SelectInput>
            </Field>
            <Field label="Classification" htmlFor="tr-class" error={errors.classification} hint="Leave empty for the standard rate, or e.g. zero_rated, reduced">
              <TextInput id="tr-class" value={form.classification} disabled={moneyDisabled} onChange={(e) => set('classification')(e.target.value)} placeholder="standard" />
            </Field>
          </FormGrid>

          <FormGrid>
            <Field label="Rate type" htmlFor="tr-rtype" error={errors.rate_type}>
              <SelectInput id="tr-rtype" value={form.rate_type} disabled={moneyDisabled} onChange={(e) => set('rate_type')(e.target.value)}>
                <option value="percentage">Percentage of the price</option>
                <option value="fixed_amount">Fixed amount per unit</option>
              </SelectInput>
            </Field>
            <Field label={fixed ? 'Amount per unit' : 'Rate (%)'} htmlFor="tr-val" error={errors.rate_value}>
              <NumberInput id="tr-val" required min="0" step="0.0001" value={form.rate_value} disabled={moneyDisabled}
                onChange={(e) => set('rate_value')(e.target.value)} placeholder={fixed ? '50.00' : '16'} />
            </Field>
          </FormGrid>

          {fixed && (
            <FormGrid>
              <Field label="Per unit of" htmlFor="tr-unit" error={errors.unit_of_measure_id} hint="e.g. per litre for fuel excise">
                <UnitSelect id="tr-unit" value={form.unit_of_measure_id} disabled={moneyDisabled} onChange={set('unit_of_measure_id')} />
              </Field>
              <Field label="Currency of the amount" htmlFor="tr-cur" error={errors.currency_id} hint="Converted at checkout if the order is in another currency.">
                <CurrencySelect id="tr-cur" value={form.currency_id} disabled={moneyDisabled} onChange={set('currency_id')} allowEmpty emptyLabel="Base currency" />
              </Field>
            </FormGrid>
          )}

          <Field label="Charged on" error={errors.calculation_base}>
            <div role="radiogroup" style={{ display: 'grid', gap: 6 }}>
              {BASES.map((b) => (
                <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8rem', color: colors.textBody, cursor: moneyDisabled ? 'default' : 'pointer' }}>
                  <input type="radio" name="calculation_base" value={b.id} checked={form.calculation_base === b.id}
                    disabled={moneyDisabled} onChange={() => set('calculation_base')(b.id)} style={{ marginTop: 3, accentColor: colors.primary }} />
                  <span><strong style={{ fontWeight: 600 }}>{b.label}</strong> <span style={{ color: colors.textFaint }}>— {b.help}</span></span>
                </label>
              ))}
            </div>
          </Field>

          <FormGrid min={150}>
            <Field label="Valid from" htmlFor="tr-from" error={errors.valid_from}>
              <TextInput id="tr-from" type="date" required value={form.valid_from} onChange={(e) => set('valid_from')(e.target.value)} />
            </Field>
            <Field label="Valid until" htmlFor="tr-until" error={errors.valid_until} hint="Empty = no end date">
              <TextInput id="tr-until" type="date" min={form.valid_from} value={form.valid_until} onChange={(e) => set('valid_until')(e.target.value)} />
            </Field>
            <Field label="Calculation order" htmlFor="tr-seq" error={errors.calculation_sequence} hint="Lower runs first">
              <NumberInput id="tr-seq" step="1" value={form.calculation_sequence} onChange={(e) => set('calculation_sequence')(e.target.value)} />
            </Field>
          </FormGrid>

          <CheckboxRow checked={form.requires_certificate} onChange={set('requires_certificate')}
            label="Needs a verified exemption certificate"
            description="Only applied when the customer holds a valid exemption certificate for this classification (e.g. a zero-rated supply)." />
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save rate' : 'Create rate'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
