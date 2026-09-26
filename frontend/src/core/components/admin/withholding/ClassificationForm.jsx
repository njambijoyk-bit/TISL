import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useWithholdingStore from '../../../../_shared/store/withholdingStore';
import useTaxStore from '../../../../_shared/store/taxStore';
import { fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';

/**
 * A withholding classification (e.g. "Professional fees 5%") and the
 * withheld-mode tax rate it uses by default.
 */
export default function ClassificationForm({ classification, onClose }) {
  const { createClassification, updateClassification, actionLoading } = useWithholdingStore();
  const { types, rates, fetchTypes, fetchRates } = useTaxStore();
  const editing = Boolean(classification);
  const [form, setForm] = useState({
    code: classification?.code ?? '',
    label: classification?.label ?? '',
    default_tax_rate_id: classification?.default_tax_rate_id ?? '',
    is_active: classification?.is_active ?? true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!types.length) fetchTypes().catch(() => {});
    if (!rates.length) fetchRates().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only rates of a withheld-mode tax type make sense here
  const withheldTypeIds = new Set(types.filter((t) => t.application_mode === 'withheld').map((t) => t.id));
  const withheldRates = rates.filter((r) => withheldTypeIds.has(r.tax_type_id));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    const payload = { ...form, code: form.code.trim(), default_tax_rate_id: form.default_tax_rate_id || null };
    try {
      if (editing) await updateClassification(classification.id, payload); else await createClassification(payload);
      toast.success(editing ? 'Classification saved' : 'Classification created');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the classification');
    }
  };

  return (
    <Modal title={editing ? `Edit ${classification.label}` : 'New withholding classification'}
      subtitle="Groups withholding agents by the rate they deduct." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid>
            <Field label="Name" htmlFor="wc-label" error={errors.label}>
              <TextInput id="wc-label" required maxLength={150} value={form.label} onChange={(e) => set('label')(e.target.value)} placeholder="Professional fees" />
            </Field>
            <Field label="Code" htmlFor="wc-code" error={errors.code} hint="Short and unique">
              <TextInput id="wc-code" required maxLength={50} value={form.code} onChange={(e) => set('code')(e.target.value)} placeholder="wht_professional" />
            </Field>
          </FormGrid>
          <Field label="Rate withheld" htmlFor="wc-rate" error={errors.default_tax_rate_id}
            hint={withheldRates.length ? 'The rate an agent in this classification deducts.' : 'Add a rate under a "Withheld from payment" tax type in Tax & Compliance first.'}>
            <SelectInput id="wc-rate" value={form.default_tax_rate_id} onChange={(e) => set('default_tax_rate_id')(e.target.value ? Number(e.target.value) : '')}>
              <option value="">No rate yet</option>
              {withheldRates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.tax_type?.code} {r.classification ?? 'standard'} — {r.rate_type === 'percentage' ? `${Number(r.rate_value)}%` : Number(r.rate_value)}
                  {!r.is_active ? ' (inactive)' : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save classification' : 'Create classification'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
