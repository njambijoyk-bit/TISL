import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useProductVariantStore from '../../../../_shared/store/productVariantStore';
import useUomStore from '../../../../_shared/store/uomStore';
import { fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import UnitSelect from '../../../../_shared/components/common/UnitSelect';
import { colors, radius } from '../../../../_shared/theme/tokens';

const fmt = (n, dp = 4) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp }));

const ROLE_HELP = {
  base: 'The unit stock is counted in. Every variant has exactly one.',
  compound: 'A pack of another unit — e.g. a carton of 12 bottles.',
  alternate: 'Another way to sell the same stock — e.g. by kg as well as by piece.',
};

/**
 * Add a selling unit to a variant, or edit its price/flags. Structure
 * (role, unit, pack size, factor) is fixed once created — delete and re-add
 * to change it, so stock and price maths never go stale.
 */
export default function VariantUnitForm({ variant, unit, currencyCode, onClose }) {
  const { createUnit, updateUnit, effectiveUnitPrice, actionLoading } = useProductVariantStore();
  const { unitById } = useUomStore();
  const editing = Boolean(unit);
  const units = variant.units ?? [];
  const base = units.find((u) => u.role === 'base');

  const [form, setForm] = useState({
    role: unit?.role ?? (base ? 'compound' : 'base'),
    unit_id: unit?.unit_id ?? '',
    contains_variant_unit_id: unit?.contains_variant_unit_id ?? base?.id ?? '',
    contains_qty: unit?.contains_qty != null ? Number(unit.contains_qty) : '',
    base_factor: unit?.base_factor != null ? Number(unit.base_factor) : '',
    price: unit?.price != null ? Number(unit.price) : '',
    compare_at_price: unit?.compare_at_price != null ? Number(unit.compare_at_price) : '',
    is_sellable: unit?.is_sellable ?? true,
    is_purchasable: unit?.is_purchasable ?? true,
    is_default_sale: unit?.is_default_sale ?? false,
    is_active: unit?.is_active ?? true,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const unitName = (vu) => { const u = unitById(vu?.unit_id) ?? vu?.unit; return u ? `${u.name} (${u.code})` : `Unit #${vu?.id}`; };

  // Factor preview: compound = qty × contained factor; alternate = typed, or
  // suggested from the UoM table when it shares a dimension with the base.
  const contained = units.find((u) => u.id === Number(form.contains_variant_unit_id));
  const baseUom = unitById(base?.unit_id);
  const thisUom = unitById(form.unit_id);
  const suggestedAltFactor = useMemo(() => (
    form.role === 'alternate' && baseUom && thisUom && baseUom.dimension === thisUom.dimension
      ? Number(thisUom.to_base_factor) / Number(baseUom.to_base_factor) : null
  ), [form.role, baseUom, thisUom]);

  const factor = form.role === 'base' ? 1
    : form.role === 'compound' ? (contained && form.contains_qty ? Number(form.contains_qty) * Number(contained.base_factor) : null)
    : (form.base_factor !== '' ? Number(form.base_factor) : suggestedAltFactor);

  const derivedPrice = !editing && form.price === '' && base?.price != null && factor
    ? Math.round(Number(base.price) * factor * 100) / 100 : null;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    const money = (v) => (v === '' ? null : Number(v));
    try {
      if (editing) {
        await updateUnit(variant.id, unit.id, {
          price: money(form.price), compare_at_price: money(form.compare_at_price),
          is_sellable: form.is_sellable, is_purchasable: form.is_purchasable,
          is_default_sale: form.is_default_sale, is_active: form.is_active,
        });
      } else {
        await createUnit(variant.id, {
          unit_id: form.unit_id,
          role: form.role,
          contains_variant_unit_id: form.role === 'compound' ? Number(form.contains_variant_unit_id) : null,
          contains_qty: form.role === 'compound' ? Number(form.contains_qty) : null,
          base_factor: form.role === 'alternate' ? (form.base_factor !== '' ? Number(form.base_factor) : suggestedAltFactor) : null,
          price: money(form.price), compare_at_price: money(form.compare_at_price),
          is_sellable: form.is_sellable, is_purchasable: form.is_purchasable,
          is_default_sale: form.is_default_sale, is_active: form.is_active,
          position: units.length,
        });
      }
      toast.success(editing ? 'Unit saved' : 'Unit added');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the unit');
    }
  };

  return (
    <Modal title={editing ? `Edit ${unitName(unit)}` : 'Add a selling unit'} subtitle={variant.name || 'Variant'} onClose={onClose} width={560}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />

          {!editing && (
            <>
              <Field label="Kind" htmlFor="vu-role" error={errors.role} hint={ROLE_HELP[form.role]}>
                <SelectInput id="vu-role" value={form.role} onChange={(e) => set('role')(e.target.value)}>
                  {!base && <option value="base">Base unit</option>}
                  <option value="compound" disabled={!base}>Pack of another unit</option>
                  <option value="alternate" disabled={!base}>Alternate unit</option>
                </SelectInput>
              </Field>
              <Field label="Unit" htmlFor="vu-unit" error={errors.unit_id}>
                <UnitSelect id="vu-unit" value={form.unit_id} onChange={set('unit_id')} />
              </Field>
              {form.role === 'compound' && (
                <FormGrid>
                  <Field label="Contains" htmlFor="vu-qty" error={errors.contains_qty}>
                    <NumberInput id="vu-qty" required min="0.0001" step="any" value={form.contains_qty} onChange={(e) => set('contains_qty')(e.target.value)} placeholder="12" />
                  </Field>
                  <Field label="Of" htmlFor="vu-of" error={errors.contains_variant_unit_id}>
                    <SelectInput id="vu-of" value={form.contains_variant_unit_id} onChange={(e) => set('contains_variant_unit_id')(e.target.value)}>
                      {units.map((u) => <option key={u.id} value={u.id}>{unitName(u)}</option>)}
                    </SelectInput>
                  </Field>
                </FormGrid>
              )}
              {form.role === 'alternate' && (
                <Field label={`How many ${baseUom?.code ?? 'base units'} in one`} htmlFor="vu-factor" error={errors.base_factor}
                  hint={suggestedAltFactor != null ? `Worked out from the unit table: ${fmt(suggestedAltFactor, 6)}. Leave empty to use it.` : 'Different kinds of measure — enter it yourself (e.g. average kg per piece).'}>
                  <NumberInput id="vu-factor" min="0" step="any" value={form.base_factor} onChange={(e) => set('base_factor')(e.target.value)}
                    placeholder={suggestedAltFactor != null ? String(fmt(suggestedAltFactor, 6)) : ''} />
                </Field>
              )}
              {factor != null && form.role !== 'base' && (
                <p style={{ margin: 0, padding: '8px 12px', borderRadius: radius.md, background: colors.tint(0.05), fontSize: '0.78rem', color: colors.textBody }}>
                  1 {thisUom?.code ?? 'of this'} = <strong>{fmt(factor, 6)}</strong> {baseUom?.code ?? 'base units'} of stock
                </p>
              )}
            </>
          )}

          <FormGrid>
            <Field label={`Price (${currencyCode})`} htmlFor="vu-price" error={errors.price}
              hint={form.role === 'base' ? undefined : derivedPrice != null ? `Empty = ${currencyCode} ${fmt(derivedPrice, 2)} (base price × ${fmt(factor, 4)})` : 'Empty = base price × factor'}>
              <NumberInput id="vu-price" min="0" step="0.01" value={form.price} onChange={(e) => set('price')(e.target.value)} />
            </Field>
            <Field label={`Was (${currencyCode})`} htmlFor="vu-was" error={errors.compare_at_price}>
              <NumberInput id="vu-was" min="0" step="0.01" value={form.compare_at_price} onChange={(e) => set('compare_at_price')(e.target.value)} />
            </Field>
          </FormGrid>
          {editing && unit.price == null && form.price === '' && (
            <p style={{ margin: '-6px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>
              Currently {currencyCode} {fmt(effectiveUnitPrice(variant, unit), 2)}, worked out from the base price.
            </p>
          )}

          <FormGrid min={180}>
            <CheckboxRow checked={form.is_sellable} onChange={set('is_sellable')} label="Customers can buy it" />
            <CheckboxRow checked={form.is_purchasable} onChange={set('is_purchasable')} label="We buy stock in it" />
            <CheckboxRow checked={form.is_default_sale} onChange={set('is_default_sale')} label="Default on the product page" />
            <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="Active" />
          </FormGrid>

          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save unit' : 'Add unit'} busy={actionLoading} disabled={!editing && !form.unit_id} />
        </FormStack>
      </form>
    </Modal>
  );
}
