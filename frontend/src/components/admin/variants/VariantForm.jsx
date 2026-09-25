import { useState } from 'react';
import toast from 'react-hot-toast';
import useProductVariantStore from '../../../store/productVariantStore';
import { fieldErrors } from '../../../store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import UnitSelect from '../../common/UnitSelect';
import { colors } from '../../../theme/tokens';

/** Current option → value selection of a variant, as { [option_id]: value_id }. */
const selectionOf = (variant) => Object.fromEntries(
  (variant?.option_values ?? []).map((v) => [v.pivot?.option_id ?? v.option_id, v.id])
);

/**
 * Create / edit one variant. On create you can set its base selling unit and
 * price in the same step (prices are in the product's currency).
 */
export default function VariantForm({ variant, currencyCode, onClose }) {
  const { options, variants, createVariant, updateVariant, variantByCombination, actionLoading } = useProductVariantStore();
  const editing = Boolean(variant);
  const [selection, setSelection] = useState(selectionOf(variant));
  const [form, setForm] = useState({
    name: variant?.name ?? '',
    sku: variant?.sku ?? '',
    barcode: variant?.barcode ?? '',
    net_content_qty: variant?.net_content_qty != null ? Number(variant.net_content_qty) : '',
    net_content_unit_id: variant?.net_content_unit_id ?? '',
    stock_quantity: variant?.stock_quantity != null ? Number(variant.stock_quantity) : 0,
    status: variant?.status ?? 'active',
    is_default: variant?.is_default ?? variants.length === 0,
  });
  const [baseUnit, setBaseUnit] = useState({ unit_id: '', price: '', compare_at_price: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const optionsWithValues = options.filter((o) => o.values?.length);
  const complete = optionsWithValues.every((o) => selection[o.id]);
  const clash = complete && optionsWithValues.length > 0 && (() => {
    const existing = variantByCombination(selection);
    return existing && existing.id !== variant?.id ? existing : null;
  })();

  // Suggest a name from the chosen values
  const autoName = optionsWithValues
    .map((o) => o.values.find((v) => v.id === selection[o.id])?.value)
    .filter(Boolean).join(' / ');

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (!complete) { setFormError('Pick a value for every option.'); return; }
    if (clash) { setFormError(`That combination already exists (${clash.name || clash.sku || 'another variant'}).`); return; }

    const payload = {
      name: form.name.trim() || autoName || null,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      net_content_qty: form.net_content_qty === '' ? null : Number(form.net_content_qty),
      net_content_unit_id: form.net_content_unit_id || null,
      stock_quantity: Number(form.stock_quantity) || 0,
      status: form.status,
      ...(optionsWithValues.length ? { option_value_ids: selection } : {}),
    };
    if (!editing) {
      payload.is_default = form.is_default;
      if (baseUnit.unit_id) {
        payload.base_unit = {
          unit_id: baseUnit.unit_id,
          price: baseUnit.price === '' ? null : Number(baseUnit.price),
          compare_at_price: baseUnit.compare_at_price === '' ? null : Number(baseUnit.compare_at_price),
          is_default_sale: true,
        };
      }
    }
    try {
      if (editing) await updateVariant(variant.id, payload); else await createVariant(payload);
      toast.success(editing ? 'Variant saved' : 'Variant created');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the variant');
    }
  };

  return (
    <Modal title={editing ? `Edit ${variant.name || 'variant'}` : 'New variant'} subtitle="One sellable version of this product." onClose={onClose} width={620}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />

          {optionsWithValues.length > 0 && (
            <FormGrid min={160}>
              {optionsWithValues.map((o) => (
                <Field key={o.id} label={o.name} htmlFor={`vo-${o.id}`}>
                  <SelectInput id={`vo-${o.id}`} value={selection[o.id] ?? ''}
                    onChange={(e) => setSelection((s) => ({ ...s, [o.id]: e.target.value ? Number(e.target.value) : undefined }))}>
                    <option value="">Choose…</option>
                    {o.values.map((v) => <option key={v.id} value={v.id}>{v.value}</option>)}
                  </SelectInput>
                </Field>
              ))}
            </FormGrid>
          )}
          {clash && <p style={{ margin: 0, fontSize: '0.75rem', color: colors.danger }}>A variant with these options already exists.</p>}

          <FormGrid>
            <Field label="Name" htmlFor="v-name" error={errors.name} hint={autoName ? `Leave empty to use "${autoName}"` : undefined}>
              <TextInput id="v-name" maxLength={255} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder={autoName || 'Standard'} />
            </Field>
            <Field label="SKU" htmlFor="v-sku" error={errors.sku}>
              <TextInput id="v-sku" value={form.sku} onChange={(e) => set('sku')(e.target.value)} />
            </Field>
          </FormGrid>

          <FormGrid min={150}>
            <Field label="Contents" htmlFor="v-qty" error={errors.net_content_qty} hint="e.g. 0.5 for a 500 mL bottle in litres">
              <NumberInput id="v-qty" min="0" step="any" value={form.net_content_qty} onChange={(e) => set('net_content_qty')(e.target.value)} />
            </Field>
            <Field label="Contents unit" htmlFor="v-cunit" error={errors.net_content_unit_id}>
              <UnitSelect id="v-cunit" value={form.net_content_unit_id} onChange={set('net_content_unit_id')} emptyLabel="None" />
            </Field>
            <Field label="Barcode" htmlFor="v-bar" error={errors.barcode}>
              <TextInput id="v-bar" maxLength={64} value={form.barcode} onChange={(e) => set('barcode')(e.target.value)} />
            </Field>
          </FormGrid>

          <FormGrid min={150}>
            <Field label="Stock (base units)" htmlFor="v-stock" error={errors.stock_quantity}>
              <NumberInput id="v-stock" min="0" step="any" value={form.stock_quantity} onChange={(e) => set('stock_quantity')(e.target.value)} />
            </Field>
            <Field label="Status" htmlFor="v-status" error={errors.status}>
              <SelectInput id="v-status" value={form.status} onChange={(e) => set('status')(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="discontinued">Discontinued</option>
              </SelectInput>
            </Field>
          </FormGrid>

          {!editing && (
            <div style={{ padding: 14, borderRadius: 10, border: `1.5px solid ${colors.tint(0.15)}`, background: colors.tint(0.02) }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 700, color: colors.primaryDeep }}>How it's sold</p>
              <FormGrid min={150}>
                <Field label="Base unit" htmlFor="v-bunit" error={errors['base_unit.unit_id']} hint="The smallest unit you sell and count stock in">
                  <UnitSelect id="v-bunit" value={baseUnit.unit_id} onChange={(v) => setBaseUnit((b) => ({ ...b, unit_id: v }))} emptyLabel="Set later" />
                </Field>
                <Field label={`Price (${currencyCode})`} htmlFor="v-price" error={errors['base_unit.price']}>
                  <NumberInput id="v-price" min="0" step="0.01" disabled={!baseUnit.unit_id} value={baseUnit.price} onChange={(e) => setBaseUnit((b) => ({ ...b, price: e.target.value }))} />
                </Field>
                <Field label={`Was (${currencyCode})`} htmlFor="v-was" error={errors['base_unit.compare_at_price']} hint="Optional, shows a discount">
                  <NumberInput id="v-was" min="0" step="0.01" disabled={!baseUnit.unit_id} value={baseUnit.compare_at_price} onChange={(e) => setBaseUnit((b) => ({ ...b, compare_at_price: e.target.value }))} />
                </Field>
              </FormGrid>
            </div>
          )}

          {!editing && <CheckboxRow checked={form.is_default} onChange={set('is_default')} label="Default variant" description="Pre-selected when a shopper opens the product." />}
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save variant' : 'Create variant'} busy={actionLoading} disabled={Boolean(clash)} />
        </FormStack>
      </form>
    </Modal>
  );
}
