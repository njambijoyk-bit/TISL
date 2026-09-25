import { useState } from 'react';
import toast from 'react-hot-toast';
import useUomStore from '../../../store/uomStore';
import { fieldErrors } from '../../../store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import { colors } from '../../../theme/tokens';

const SUGGESTED = ['volume', 'mass', 'length', 'area', 'count', 'packaging', 'time'];
const NEW = '__new__';

/**
 * Create / edit a unit. Once a unit is used (variants, tax rates…) the server
 * refuses changes to its dimension and conversion factor — we say so up front.
 */
export default function UnitForm({ unit, defaultDimension, onClose }) {
  const { units, createUnit, updateUnit, actionLoading, baseUnitFor } = useUomStore();
  const editing = Boolean(unit);
  const known = [...new Set([...SUGGESTED, ...units.map((u) => u.dimension)])].sort();

  const [form, setForm] = useState({
    code: unit?.code ?? '',
    name: unit?.name ?? '',
    dimension: unit?.dimension ?? defaultDimension ?? 'volume',
    unit_system: unit?.unit_system ?? 'metric',
    to_base_factor: unit?.to_base_factor != null ? Number(unit.to_base_factor) : '',
    is_active: unit?.is_active ?? true,
  });
  const [customDim, setCustomDim] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const dimension = form.dimension === NEW ? customDim.trim().toLowerCase().replace(/\s+/g, '_') : form.dimension;
  const base = baseUnitFor(dimension);
  const isFirstInDimension = !units.some((u) => u.dimension === dimension && u.id !== unit?.id);
  const factorHint = isFirstInDimension
    ? `The first unit of "${dimension || 'this dimension'}" is its base — use 1.`
    : base && base.id !== unit?.id
      ? `How many ${base.name} (${base.code}) are in 1 of this unit. e.g. mL = 0.001 when the base is L.`
      : 'How many base units are in 1 of this unit.';

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (!dimension) { setErrors({ dimension: 'Name the new dimension.' }); return; }
    const payload = { ...form, dimension, code: form.code.trim(), unit_system: form.unit_system || null };
    try {
      if (editing) await updateUnit(unit.id, payload); else await createUnit(payload);
      toast.success(editing ? 'Unit saved' : 'Unit created');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the unit');
    }
  };

  return (
    <Modal title={editing ? `Edit ${unit.name}` : 'New unit'} subtitle="Units products are sold, stocked and taxed in." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid>
            <Field label="Name" htmlFor="u-name" error={errors.name}>
              <TextInput id="u-name" required maxLength={100} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Litre" />
            </Field>
            <Field label="Code" htmlFor="u-code" error={errors.code} hint="Short, shown next to quantities">
              <TextInput id="u-code" required maxLength={20} value={form.code} onChange={(e) => set('code')(e.target.value)} placeholder="L" />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Measures" htmlFor="u-dim" error={errors.dimension} hint="Units only convert within the same dimension.">
              <SelectInput id="u-dim" value={form.dimension} onChange={(e) => set('dimension')(e.target.value)}>
                {known.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
                <option value={NEW}>Something else…</option>
              </SelectInput>
            </Field>
            <Field label="System" htmlFor="u-sys" error={errors.unit_system}>
              <SelectInput id="u-sys" value={form.unit_system} onChange={(e) => set('unit_system')(e.target.value)}>
                <option value="metric">Metric</option>
                <option value="imperial">Imperial / US</option>
                <option value="">Neither (e.g. piece, carton)</option>
              </SelectInput>
            </Field>
          </FormGrid>
          {form.dimension === NEW && (
            <Field label="New dimension" htmlFor="u-newdim">
              <TextInput id="u-newdim" required value={customDim} onChange={(e) => setCustomDim(e.target.value)} placeholder="e.g. electrical_current" />
            </Field>
          )}
          <Field label="Conversion factor" htmlFor="u-factor" error={errors.to_base_factor} hint={factorHint}>
            <NumberInput id="u-factor" required min="0" step="any" value={form.to_base_factor}
              onChange={(e) => set('to_base_factor')(e.target.value)} placeholder={isFirstInDimension ? '1' : '0.001'} />
          </Field>
          {editing && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>
              If this unit is already used by products or tax rates, its dimension and factor can't change — deactivate it and create a new one.
            </p>
          )}
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" description="Inactive units stay on existing records but can't be picked for new ones." />
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save unit' : 'Create unit'} busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}
