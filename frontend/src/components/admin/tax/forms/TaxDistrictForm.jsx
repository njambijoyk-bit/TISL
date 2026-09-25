import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useTaxStore from '../../../../store/taxStore';
import { fieldErrors } from '../../../../store/helpers/apiState';
import Modal from '../../ui/Modal';
import { Field, TextInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';

const LEVELS = [
  ['country', 'Country'], ['state', 'State / region'], ['county', 'County'],
  ['city', 'City / town'], ['zip', 'Postal code'], ['special_district', 'Special zone (e.g. EPZ)'],
];

/** Create / edit a tax district. The parent list excludes this district and its descendants, so a loop can't be created. */
export default function TaxDistrictForm({ district, defaultParentId, onClose }) {
  const { districts, createDistrict, updateDistrict, actionLoading } = useTaxStore();
  const editing = Boolean(district);
  const [form, setForm] = useState({
    locale: district?.locale ?? 'KE',
    level: district?.level ?? 'county',
    parent_id: district?.parent_id ?? defaultParentId ?? '',
    name: district?.name ?? '',
    code: district?.code ?? '',
    is_active: district?.is_active ?? true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // This district + everything under it can't be its parent
  const blocked = useMemo(() => {
    if (!district) return new Set();
    const out = new Set([district.id]);
    let grew = true;
    while (grew) {
      grew = false;
      districts.forEach((d) => { if (d.parent_id && out.has(d.parent_id) && !out.has(d.id)) { out.add(d.id); grew = true; } });
    }
    return out;
  }, [district, districts]);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    const payload = {
      ...form,
      locale: form.locale.trim().toUpperCase(),
      parent_id: form.parent_id || null,
      code: form.code.trim() || null,
    };
    if (editing) delete payload.locale; // not updatable
    try {
      if (editing) await updateDistrict(district.id, payload); else await createDistrict(payload);
      toast.success(editing ? 'District saved' : 'District created');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the district');
    }
  };

  return (
    <Modal title={editing ? `Edit ${district.name}` : 'New tax district'} subtitle="A place that tax rules can be limited to." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid>
            <Field label="Name" htmlFor="td-name" error={errors.name}>
              <TextInput id="td-name" required maxLength={150} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Nairobi County" />
            </Field>
            <Field label="Code" htmlFor="td-code" error={errors.code} hint="Optional, e.g. 047">
              <TextInput id="td-code" maxLength={20} value={form.code} onChange={(e) => set('code')(e.target.value)} />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Level" htmlFor="td-level" error={errors.level}>
              <SelectInput id="td-level" value={form.level} onChange={(e) => set('level')(e.target.value)}>
                {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectInput>
            </Field>
            <Field label="Country code" htmlFor="td-locale" error={errors.locale} hint={editing ? 'Fixed once created' : 'Two letters, e.g. KE'}>
              <TextInput id="td-locale" required maxLength={2} disabled={editing} value={form.locale} onChange={(e) => set('locale')(e.target.value.toUpperCase())} />
            </Field>
          </FormGrid>
          <Field label="Inside" htmlFor="td-parent" error={errors.parent_id} hint="The larger district this one sits in, if any.">
            <SelectInput id="td-parent" value={form.parent_id} onChange={(e) => set('parent_id')(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Nothing — top level</option>
              {districts.filter((d) => !blocked.has(d.id)).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.level})</option>
              ))}
            </SelectInput>
          </Field>
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save district' : 'Create district'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
