import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useWithholdingStore from '../../../../_shared/store/withholdingStore';
import { fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, TextArea, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import booksAPI from '../../../../_shared/api/books';
import { colors } from '../../../../_shared/theme/tokens';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Record (part of) a withholding credit as cleared — e.g. KRA has confirmed
 * the agent remitted it and it has been offset against our own tax, or refunded.
 * It posts a Journal voucher: Dr the ledger chosen, Cr the withholding tax receivable.
 */
export default function ApplyClearanceModal({ credit, onClose }) {
  const { applyClearance, actionLoading } = useWithholdingStore();
  const remaining = Math.max(0, Number(credit.amount) - Number(credit.cleared_amount ?? 0));
  const [form, setForm] = useState({
    amount: remaining.toFixed(2),
    against_ledger_id: '',
    cleared_on: new Date().toLocaleDateString('en-CA'),
    reference: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const [targets, setTargets] = useState([]);
  useEffect(() => {
    const collect = (nodes, names, out = []) => { nodes.forEach((g) => { if (names.includes(g.name)) out.push(g.id); collect(g.children ?? [], names, out); }); return out; };
    booksAPI.groups().then(async (tree) => {
      const rows = [];
      for (const [label, name] of [['Set against tax we owe', 'Duties & Taxes'], ['Refunded into', 'Bank Accounts']]) {
        const ids = collect(tree, [name]);
        for (const id of ids) {
          const res = await booksAPI.ledgers({ all: 1, group_id: id });
          (Array.isArray(res) ? res : res.data ?? []).filter((l) => l.is_active).forEach((l) => rows.push({ id: l.id, name: l.name, label }));
        }
      }
      setTargets(rows);
    }).catch(() => {});
  }, []);

  const over = Number(form.amount) > remaining + 0.0001;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (over) { setErrors({ amount: `At most ${money(remaining)} is left on this credit.` }); return; }
    try {
      await applyClearance(credit.id, {
        amount: Number(form.amount),
        against_ledger_id: Number(form.against_ledger_id),
        cleared_on: form.cleared_on || null,
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      });
      toast.success(Number(form.amount) >= remaining ? 'Credit fully cleared' : 'Clearance recorded');
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not record the clearance');
    }
  };

  return (
    <Modal title="Record clearance" subtitle={`${money(remaining)} of ${money(credit.amount)} still to clear`} onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={formError} />
          <FormGrid>
            <Field label="Amount cleared" htmlFor="cl-amount" error={errors.amount}>
              <NumberInput id="cl-amount" required min="0.01" max={remaining} step="0.01" value={form.amount}
                error={over ? 'over' : undefined} onChange={(e) => set('amount')(e.target.value)} />
            </Field>
            <Field label="Cleared on" htmlFor="cl-date" error={errors.cleared_on}>
              <TextInput id="cl-date" type="date" value={form.cleared_on} onChange={(e) => set('cleared_on')(e.target.value)} />
            </Field>
          </FormGrid>
          <Field label="Set against" htmlFor="cl-against" error={errors.against_ledger_id} hint="The tax ledger it is offset against, or the bank ledger a refund landed in">
            <SelectInput id="cl-against" required value={form.against_ledger_id} onChange={(e) => set('against_ledger_id')(e.target.value)}>
              <option value="">Choose…</option>
              {['Set against tax we owe', 'Refunded into'].map((label) => (
                <optgroup key={label} label={label}>
                  {targets.filter((t) => t.label === label).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </SelectInput>
          </Field>
          <Field label="Reference" htmlFor="cl-ref" error={errors.reference} hint="e.g. the KRA acknowledgement or iTax slip number">
            <TextInput id="cl-ref" maxLength={100} value={form.reference} onChange={(e) => set('reference')(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="cl-notes" error={errors.notes}>
            <TextArea id="cl-notes" maxLength={255} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
          </Field>
          {over && <p style={{ margin: 0, fontSize: '0.75rem', color: colors.danger }}>That's more than what's left on the credit.</p>}
          <ModalActions onCancel={onClose} submitLabel="Record clearance" busyLabel="Recording…" busy={actionLoading} disabled={over} />
        </FormStack>
      </form>
    </Modal>
  );
}
