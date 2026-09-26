import { useState } from 'react';
import toast from 'react-hot-toast';
import useTaxStore from '../../../../../_shared/store/taxStore';
import { fieldErrors } from '../../../../../_shared/store/helpers/apiState';
import Modal from '../../ui/Modal';
import { Field, TextInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';

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
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    try {
      const payload = { ...form, code: form.code.trim().toUpperCase() };
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
          <CheckboxRow checked={form.is_compound} onChange={set('is_compound')}
            label="Compound tax" description="Informational for now; ordering is set on each rate's calculation sequence." />
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save tax type' : 'Create tax type'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
