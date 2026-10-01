import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useWithholdingStore from '../../../../_shared/store/withholdingStore';
import useTaxStore from '../../../../_shared/store/taxStore';
import taxAPI from '../../../../_shared/api/tax';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';
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
  // enter the rate right here: a withholding tax type (created if you have none), and the rate as a percentage
  const [nr, setNr] = useState({ type_id: '', type_name: 'Withholding tax', type_code: 'WHT', rate: '', valid_from: new Date().toLocaleDateString('en-CA') });
  const setN = (k) => (v) => setNr((x) => ({ ...x, [k]: v }));
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

  const withheldTypes = types.filter((t) => t.application_mode === 'withheld');
  const makingRate = form.default_tax_rate_id === 'new' || (!editing && withheldRates.length === 0 && !form.default_tax_rate_id);
  const newTypeNeeded = makingRate && (nr.type_id === '' || nr.type_id === 'new');

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    let rateId = form.default_tax_rate_id === 'new' ? '' : form.default_tax_rate_id;
    try {
      if (makingRate && nr.rate !== '') {
        let typeId = nr.type_id;
        if (newTypeNeeded) {
          const t = await taxAPI.createType({ name: nr.type_name.trim(), code: nr.type_code.trim(), application_mode: 'withheld', kind: 'withholding_income', is_active: true });
          typeId = t.tax_type.id;
        }
        const r = await taxAPI.createRate({ tax_type_id: Number(typeId), classification: form.code.trim(), rate_type: 'percentage', rate_value: Number(nr.rate), valid_from: nr.valid_from, is_active: true });
        rateId = r.tax_rate.id;
        fetchTypes().catch(() => {}); fetchRates().catch(() => {});
      }
    } catch (err) {
      setFormError(errMsg(err, 'Could not create the withholding rate'));
      return;
    }
    const payload = { ...form, code: form.code.trim(), default_tax_rate_id: rateId || null };
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
            hint={withheldRates.length ? 'The rate an agent in this classification deducts.' : 'You have no withholding rate yet — enter it below.'}>
            <SelectInput id="wc-rate" value={makingRate ? 'new' : form.default_tax_rate_id} onChange={(e) => set('default_tax_rate_id')(e.target.value === 'new' ? 'new' : e.target.value ? Number(e.target.value) : '')}>
              <option value="">No rate yet</option>
              <option value="new">＋ Enter a new rate…</option>
              {withheldRates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.tax_type?.code} {r.classification ?? 'standard'} — {r.rate_type === 'percentage' ? `${Number(r.rate_value)}%` : Number(r.rate_value)}
                  {!r.is_active ? ' (inactive)' : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          {makingRate && (
            <>
              <FormGrid>
                <Field label="Rate withheld (%)" htmlFor="wc-pct" hint="e.g. 5 for 5 %"><TextInput id="wc-pct" type="number" min="0" max="100" step="0.01" required value={nr.rate} onChange={(e) => setN('rate')(e.target.value)} /></Field>
                <Field label="Valid from" htmlFor="wc-from"><TextInput id="wc-from" type="date" required value={nr.valid_from} onChange={(e) => setN('valid_from')(e.target.value)} /></Field>
              </FormGrid>
              <Field label="Under the withholding tax type" htmlFor="wc-type" hint="A withholding tax type holds the balances (tax receivable / payable). One is created for you if you have none.">
                <SelectInput id="wc-type" value={nr.type_id} onChange={(e) => setN('type_id')(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">＋ Create a new withholding tax type</option>
                  {withheldTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </SelectInput>
              </Field>
              {newTypeNeeded && (
                <FormGrid>
                  <Field label="New type name" htmlFor="wc-tname"><TextInput id="wc-tname" required value={nr.type_name} onChange={(e) => setN('type_name')(e.target.value)} /></Field>
                  <Field label="New type code" htmlFor="wc-tcode"><TextInput id="wc-tcode" required maxLength={30} value={nr.type_code} onChange={(e) => setN('type_code')(e.target.value)} /></Field>
                </FormGrid>
              )}
            </>
          )}
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save classification' : 'Create classification'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
