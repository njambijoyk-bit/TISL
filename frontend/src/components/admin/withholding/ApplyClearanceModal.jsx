import { useState } from 'react';
import toast from 'react-hot-toast';
import useWithholdingStore from '../../../store/withholdingStore';
import { fieldErrors } from '../../../store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, TextArea, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import { colors } from '../../../theme/tokens';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Record (part of) a withholding credit as cleared — e.g. KRA has confirmed
 * the agent remitted it and it's been offset against TISL's tax liability.
 */
export default function ApplyClearanceModal({ credit, onClose }) {
  const { applyClearance, actionLoading } = useWithholdingStore();
  const remaining = Math.max(0, Number(credit.amount) - Number(credit.cleared_amount ?? 0));
  const [form, setForm] = useState({
    amount: remaining.toFixed(2),
    cleared_on: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const over = Number(form.amount) > remaining + 0.0001;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (over) { setErrors({ amount: `At most ${money(remaining)} is left on this credit.` }); return; }
    try {
      await applyClearance(credit.id, {
        amount: Number(form.amount),
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
