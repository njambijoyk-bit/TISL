import { useState } from 'react';
import toast from 'react-hot-toast';
import useTaxStore from '../../../../../_shared/store/taxStore';
import { fieldErrors } from '../../../../../_shared/store/helpers/apiState';
import Modal from '../../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';

/** Create / edit a tax type (e.g. VAT, Excise, WHT). */
export default function TaxTypeForm({ type, onClose }) {
  const { createType, updateType, actionLoading } = useTaxStore();
  const editing = Boolean(type);
  const [form, setForm] = useState({
    name: type?.name ?? '',
    code: type?.code ?? '',
    application_mode: type?.application_mode ?? 'additive',
    is_compound: type?.is_compound ?? false,
    is_active: type?.is_active ?? true,
    kind: type?.kind ?? '',
    opening_balance: '', opening_side: 'C', opening_payable: '', opening_receivable: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    try {
      const payload = { ...form, code: form.code.trim().toUpperCase() };
      if (editing) { delete payload.opening_balance; delete payload.opening_side; delete payload.opening_payable; delete payload.opening_receivable; }
      ['opening_balance', 'opening_payable', 'opening_receivable'].forEach((k) => { if (payload[k] === '') delete payload[k]; });
      if (!payload.kind) delete payload.kind;
      if (editing) await updateType(type.id, payload); else await createType(payload);
      toast.success(editing ? 'Tax type saved' : 'Tax type created');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the tax type');
    }
  };

  return (
    <Modal title={editing ? `Edit ${type.name}` : 'New tax type'} subtitle="A family of taxes, like VAT or excise. Rates and rules hang off it." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid>
            <Field label="Name" htmlFor="tt-name" error={errors.name}>
              <TextInput id="tt-name" required value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Value Added Tax" />
            </Field>
            <Field label="Code" htmlFor="tt-code" error={errors.code} hint="Short and unique, e.g. VAT">
              <TextInput id="tt-code" required maxLength={30} value={form.code} onChange={(e) => set('code')(e.target.value.toUpperCase())} placeholder="VAT" />
            </Field>
          </FormGrid>
          <Field
            label="How it's applied" htmlFor="tt-mode" error={errors.application_mode}
            hint={form.application_mode === 'additive'
              ? 'Added on top of the price the customer pays.'
              : 'Deducted by the customer from what they pay TISL (withholding).'}
          >
            <SelectInput id="tt-mode" value={form.application_mode} onChange={(e) => set('application_mode')(e.target.value)}
              disabled={editing}>
              <option value="additive">Added to the price</option>
              <option value="withheld">Withheld from payment</option>
            </SelectInput>
          </Field>
          {editing && (
            <p style={{ margin: '-6px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>
              The application mode is fixed once created — create a new type to change it.
            </p>
          )}
          <Field label="Kind" htmlFor="tt-kind" hint="For reports and the tax position.">
            <SelectInput id="tt-kind" value={form.kind} onChange={(e) => set('kind')(e.target.value)}>
              <option value="">Choose…</option>
              <option value="vat">VAT</option><option value="excise">Excise duty</option><option value="customs">Customs duty</option>
              <option value="withholding_income">Withholding income tax</option><option value="withholding_vat">Withholding VAT</option><option value="other">Other</option>
            </SelectInput>
          </Field>
          {!editing && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(168,85,247,0.05)' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.5 }}>
                Saving creates this tax under <strong>Duties &amp; Taxes</strong> in the books. Enter what you already owe or hold today — every sale, purchase and payment then moves it.
              </p>
              {form.application_mode === 'additive' ? (
                <FormGrid min={160}>
                  <Field label="Opening balance" htmlFor="tt-ob" error={errors.opening_balance}><NumberInput id="tt-ob" min="0" step="0.01" value={form.opening_balance} onChange={(e) => set('opening_balance')(e.target.value)} placeholder="0.00" /></Field>
                  <Field label="Owed / credit" htmlFor="tt-os"><SelectInput id="tt-os" value={form.opening_side} onChange={(e) => set('opening_side')(e.target.value)}><option value="C">We owe the authority</option><option value="D">Authority owes us</option></SelectInput></Field>
                </FormGrid>
              ) : (
                <FormGrid min={160}>
                  <Field label="Opening payable" htmlFor="tt-op" hint="Withheld from suppliers, not yet remitted" error={errors.opening_payable}><NumberInput id="tt-op" min="0" step="0.01" value={form.opening_payable} onChange={(e) => set('opening_payable')(e.target.value)} placeholder="0.00" /></Field>
                  <Field label="Opening receivable" htmlFor="tt-or" hint="Withheld from us by customers (credit held)" error={errors.opening_receivable}><NumberInput id="tt-or" min="0" step="0.01" value={form.opening_receivable} onChange={(e) => set('opening_receivable')(e.target.value)} placeholder="0.00" /></Field>
                </FormGrid>
              )}
            </div>
          )}
          <CheckboxRow checked={form.is_compound} onChange={set('is_compound')}
            label="Compound tax" description="Informational for now; ordering is set on each rate's calculation sequence." />
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save tax type' : 'Create tax type'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
