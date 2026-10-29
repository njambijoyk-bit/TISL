import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useTaxStore from '../../../../../_shared/store/taxStore';
import taxAPI from '../../../../../_shared/api/tax';
import { fieldErrors } from '../../../../../_shared/store/helpers/apiState';
import Modal from '../../ui/Modal';
import LedgerSelect from '../../../../../menus/components/LedgerSelect';
import { Field, TextInput, NumberInput, SelectInput, CheckboxRow, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';

// what a tax type made before categories existed is called now (its old kind and mode)
const CATEGORY_OF_KIND = { vat: 'vat_gst', excise: 'excise', customs: 'customs', withholding_income: 'withholding_income', withholding_vat: 'withholding_vat', other: 'other' };
const METHOD_OF_MODE = { additive: 'added', withheld: 'withheld' };

/**
 * Create / edit a tax type (e.g. VAT, Excise, WHT): what kind of tax it is (the category), how it is applied (the method), and where it applies. The
 * categories and methods offered are the ones Tax control allows; how a tax is applied is fixed once the type exists, because it decides what is posted.
 */
export default function TaxTypeForm({ type, onClose }) {
  const { createType, updateType, actionLoading } = useTaxStore();
  const editing = Boolean(type);
  const [form, setForm] = useState({
    name: type?.name ?? '',
    code: type?.code ?? '',
    tax_category: type?.tax_category ?? CATEGORY_OF_KIND[type?.kind] ?? 'vat_gst',
    application_method: type?.application_method ?? METHOD_OF_MODE[type?.application_mode] ?? 'added',
    jurisdiction_id: type?.jurisdiction_id ?? '',
    input_ledger_id: type?.input_ledger_id ?? null,
    cost_ledger_id: type?.cost_ledger_id ?? null,
    is_compound: type?.is_compound ?? false,
    is_active: type?.is_active ?? true,
    opening_balance: '', opening_side: 'C', opening_payable: '', opening_receivable: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [options, setOptions] = useState(null);
  useEffect(() => { taxAPI.getTypeOptions().then(setOptions).catch(() => setOptions({ categories: [], methods: {}, postable_methods: ['added', 'withheld'], areas: [] })); }, []);

  const categories = options?.categories ?? [];
  const categoryRow = categories.find((c) => c.key === form.tax_category);
  const postable = new Set(options?.postable_methods ?? []);
  const methodsHere = Object.entries(options?.methods ?? {}).filter(([m]) => (categoryRow?.methods ?? []).includes(m) || m === form.application_method);
  const withheld = form.application_method === 'withheld';
  const pickCategory = (key) => setForm((f) => {
    const row = categories.find((c) => c.key === key);
    const keep = editing || (row?.methods ?? []).includes(f.application_method);
    const first = (row?.methods ?? []).find((m) => postable.has(m)) ?? (row?.methods ?? [])[0] ?? f.application_method;
    return { ...f, tax_category: key, application_method: keep ? f.application_method : first };
  });

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    try {
      const payload = { ...form, code: form.code.trim().toUpperCase(), jurisdiction_id: form.jurisdiction_id || null };
      if (editing) { delete payload.opening_balance; delete payload.opening_side; delete payload.opening_payable; delete payload.opening_receivable; }
      ['opening_balance', 'opening_payable', 'opening_receivable'].forEach((k) => { if (payload[k] === '') delete payload[k]; });
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
          <Field label="Category" htmlFor="tt-category" error={errors.tax_category} hint="What kind of tax it is. The list is set in Books, Configuration, Tax control.">
            <SelectInput id="tt-category" value={form.tax_category} onChange={(e) => pickCategory(e.target.value)}>
              {!categoryRow && <option value={form.tax_category}>{form.tax_category}</option>}
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="How it's applied" htmlFor="tt-method" error={errors.application_method} hint={editing ? 'Fixed once the tax type exists, because it decides what is posted. Create a new tax type to change it.' : 'Only the ways Tax control allows for this category are offered.'}>
            <SelectInput id="tt-method" value={form.application_method} disabled={editing} onChange={(e) => set('application_method')(e.target.value)}>
              {methodsHere.map(([m, label]) => <option key={m} value={m} disabled={!postable.has(m) && m !== form.application_method}>{label}{postable.has(m) || m === form.application_method ? '' : ' (not available yet)'}</option>)}
            </SelectInput>
          </Field>
          <Field label="Where it applies" htmlFor="tt-area" error={errors.jurisdiction_id} hint="The whole country, or one area of it (a county, a state).">
            <SelectInput id="tt-area" value={form.jurisdiction_id} onChange={(e) => set('jurisdiction_id')(e.target.value ? Number(e.target.value) : '')}>
              <option value="">The whole country</option>
              {(options?.areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}{a.level ? ` (${a.level})` : ''}</option>)}
            </SelectInput>
          </Field>
          {form.application_method === 'reverse_charge' && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(168,85,247,0.05)' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.5 }}>
                With a reverse charge you owe the tax and, if you can claim it back, claim it in the same entry. Choose where the claim goes: an asset account such as "Input VAT". Give this tax its own account, because the tax return reads that account as the claim.
              </p>
              <FormGrid min={220}>
                <LedgerSelect id="tt-input" label="Input tax you can claim back" hint="An asset account of its own for this tax." value={form.input_ledger_id} onChange={set('input_ledger_id')} />
                <LedgerSelect id="tt-cost" label="Or: tax you cannot claim back" hint="An expense account. Used when no input account is chosen." value={form.cost_ledger_id} onChange={set('cost_ledger_id')} />
              </FormGrid>
              {(errors.input_ledger_id || errors.cost_ledger_id) && <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#dc2626' }}>{errors.input_ledger_id || errors.cost_ledger_id}</p>}
            </div>
          )}
          <p style={{ margin: '-4px 0 0', fontSize: '0.72rem', color: '#6b7280' }} aria-live="polite">
            {categoryRow?.label ?? form.tax_category} · {(options?.areas ?? []).find((a) => a.id === form.jurisdiction_id)?.name ?? 'The whole country'} · {options?.methods?.[form.application_method] ?? form.application_method}
          </p>
          {!editing && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(168,85,247,0.05)' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.5 }}>
                Saving creates this tax under <strong>Duties &amp; Taxes</strong> in the books. Enter what you already owe or hold today — every sale, purchase and payment then moves it.
              </p>
              {!withheld ? (
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
