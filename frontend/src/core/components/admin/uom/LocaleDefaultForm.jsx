import { useState } from 'react';
import toast from 'react-hot-toast';
import useUomStore from '../../../../_shared/store/uomStore';
import { fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, SelectInput, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import UnitSelect from '../../../../_shared/components/common/UnitSelect';

/** Which unit a country uses by default for a dimension (e.g. KE + length → mm). Saving replaces any existing default. */
export default function LocaleDefaultForm({ onClose }) {
  const { dimensions, setLocaleDefault, actionLoading } = useUomStore();
  const dims = dimensions();
  const [form, setForm] = useState({ locale: 'KE', dimension: dims[0] ?? '', unit_id: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    try {
      await setLocaleDefault({ ...form, locale: form.locale.trim().toUpperCase() });
      toast.success('Default saved');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the default');
    }
  };

  return (
    <Modal title="Set a default unit" subtitle="Used to pre-select units in forms for that country." onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid min={140}>
            <Field label="Country code" htmlFor="ld-locale" error={errors.locale}>
              <TextInput id="ld-locale" required maxLength={2} value={form.locale} onChange={(e) => set('locale')(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Measures" htmlFor="ld-dim" error={errors.dimension}>
              <SelectInput id="ld-dim" required value={form.dimension} onChange={(e) => setForm((f) => ({ ...f, dimension: e.target.value, unit_id: '' }))}>
                {dims.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
              </SelectInput>
            </Field>
          </FormGrid>
          <Field label="Default unit" htmlFor="ld-unit" error={errors.unit_id}>
            <UnitSelect id="ld-unit" dimension={form.dimension} value={form.unit_id} onChange={set('unit_id')} />
          </Field>
          <ModalActions onCancel={onClose} submitLabel="Save default" busy={actionLoading} disabled={!form.unit_id} />
        </FormStack>
      </form>
    </Modal>
  );
}
