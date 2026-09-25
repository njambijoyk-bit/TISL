import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useTaxStore from '../../../../store/taxStore';
import useCurrencyStore from '../../../../store/currencyStore';
import customerTiersAPI from '../../../../api/customerTiers';
import { fieldErrors } from '../../../../store/helpers/apiState';
import Modal from '../../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';
import DistrictPicker from '../DistrictPicker';
import { colors, radius } from '../../../../theme/tokens';

/** Must match the modules the checkout passes to TaxService (null = all). */
export const TAX_MODULES = [
  { id: '',        label: 'Everything' },
  { id: 'product', label: 'Products' },
  { id: 'service', label: 'Services' },
  { id: 'booking', label: 'Bookings' },
  { id: 'hamper',  label: 'Hampers' },
  { id: 'auction', label: 'Auctions' },
];

const FALLBACK_TYPES = [
  { slug: 'individual', name: 'Individual' }, { slug: 'business', name: 'Business' },
  { slug: 'wholesale', name: 'Wholesale' },   { slug: 'contractor', name: 'Contractor' },
];

/** Create / edit a tax rule — decides *when* a tax type's rate applies. */
export default function TaxRuleForm({ rule, defaultTypeId, onClose }) {
  const { types, districts, fetchDistricts, createRule, updateRule, syncRuleDistricts, actionLoading } = useTaxStore();
  const baseCode = useCurrencyStore((s) => s.adminCurrencies.find((c) => c.is_base)?.code ?? 'base currency');
  const editing = Boolean(rule);
  const initialDistricts = (rule?.districts ?? []).map((d) => d.id);

  const [form, setForm] = useState({
    tax_type_id: rule?.tax_type_id ?? defaultTypeId ?? '',
    name: rule?.name ?? '',
    classification: rule?.classification ?? '',
    applicable_module: rule?.applicable_module ?? '',
    applicable_customer_types: rule?.applicable_customer_types ?? [],
    min_order_value: rule?.min_order_value ?? '',
    max_order_value: rule?.max_order_value ?? '',
    priority: rule?.priority ?? 0,
    is_active: rule?.is_active ?? true,
  });
  const [districtIds, setDistrictIds] = useState(initialDistricts);
  const [customerTypes, setCustomerTypes] = useState(FALLBACK_TYPES);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!districts.length) fetchDistricts().catch(() => {});
    customerTiersAPI.getActiveTypes()
      .then((t) => { const list = t?.data ?? t; if (Array.isArray(list) && list.length) setCustomerTypes(list); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleType = (slug) => set('applicable_customer_types')(
    form.applicable_customer_types.includes(slug)
      ? form.applicable_customer_types.filter((s) => s !== slug)
      : [...form.applicable_customer_types, slug]
  );

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    const payload = {
      ...form,
      classification: form.classification.trim() || null,
      applicable_module: form.applicable_module || null,
      applicable_customer_types: form.applicable_customer_types.length ? form.applicable_customer_types : null,
      min_order_value: form.min_order_value === '' ? null : Number(form.min_order_value),
      max_order_value: form.max_order_value === '' ? null : Number(form.max_order_value),
      priority: Number(form.priority) || 0,
    };
    try {
      if (editing) {
        delete payload.tax_type_id;
        await updateRule(rule.id, payload);
        const changed = districtIds.length !== initialDistricts.length || districtIds.some((d) => !initialDistricts.includes(d));
        if (changed) await syncRuleDistricts(rule.id, districtIds);
      } else {
        await createRule({ ...payload, district_ids: districtIds });
      }
      toast.success(editing ? 'Tax rule saved' : 'Tax rule created');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the tax rule');
    }
  };

  return (
    <Modal title={editing ? `Edit ${rule.name}` : 'New tax rule'} subtitle="When this tax applies: which items, customers, order sizes and places." onClose={onClose} width={640}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid>
            <Field label="Rule name" htmlFor="rl-name" error={errors.name}>
              <TextInput id="rl-name" required maxLength={150} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Standard VAT on products" />
            </Field>
            <Field label="Tax type" htmlFor="rl-type" error={errors.tax_type_id}>
              <SelectInput id="rl-type" required disabled={editing} value={form.tax_type_id}
                onChange={(e) => set('tax_type_id')(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose a tax type</option>
                {types.filter((t) => t.application_mode === 'additive').map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                ))}
              </SelectInput>
            </Field>
          </FormGrid>

          <FormGrid>
            <Field label="Applies to" htmlFor="rl-mod" error={errors.applicable_module}>
              <SelectInput id="rl-mod" value={form.applicable_module} onChange={(e) => set('applicable_module')(e.target.value)}>
                {TAX_MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Rate classification" htmlFor="rl-class" error={errors.classification} hint="Picks which of the type's rates to use. Empty = standard.">
              <TextInput id="rl-class" value={form.classification} onChange={(e) => set('classification')(e.target.value)} placeholder="standard" />
            </Field>
          </FormGrid>

          <Field label="Customer types" error={errors.applicable_customer_types} hint={form.applicable_customer_types.length ? undefined : 'None selected = all customer types.'}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {customerTypes.map((t) => {
                const on = form.applicable_customer_types.includes(t.slug);
                return (
                  <button key={t.slug} type="button" aria-pressed={on} onClick={() => toggleType(t.slug)} style={{
                    padding: '5px 12px', borderRadius: radius.pill, fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    border: `1.5px solid ${on ? colors.primary : colors.tint(0.18)}`,
                    background: on ? colors.tint(0.1) : 'transparent', color: on ? colors.primaryDeep : colors.textMuted,
                  }}>{t.name}</button>
                );
              })}
            </div>
          </Field>

          <FormGrid min={150}>
            <Field label={`Min order value (${baseCode})`} htmlFor="rl-min" error={errors.min_order_value}>
              <NumberInput id="rl-min" min="0" step="0.01" value={form.min_order_value} onChange={(e) => set('min_order_value')(e.target.value)} placeholder="No minimum" />
            </Field>
            <Field label={`Max order value (${baseCode})`} htmlFor="rl-max" error={errors.max_order_value}>
              <NumberInput id="rl-max" min={form.min_order_value || 0} step="0.01" value={form.max_order_value} onChange={(e) => set('max_order_value')(e.target.value)} placeholder="No maximum" />
            </Field>
            <Field label="Priority" htmlFor="rl-pri" error={errors.priority} hint="Higher is checked first">
              <NumberInput id="rl-pri" step="1" value={form.priority} onChange={(e) => set('priority')(e.target.value)} />
            </Field>
          </FormGrid>

          <Field label="Where it applies" error={errors.district_ids} hint={districtIds.length ? undefined : 'None selected = everywhere.'}>
            <DistrictPicker districts={districts} value={districtIds} onChange={setDistrictIds} />
          </Field>

          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save rule' : 'Create rule'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
