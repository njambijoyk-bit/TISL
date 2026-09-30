import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { Field, NumberInput, SelectInput, TextArea, FormStack, ModalActions, FormError } from '../ui/Form';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';

/**
 * Write off what a customer will not pay: one invoice (amount editable) or a customer's whole open balance.
 * `bill` = the invoice, or `party` = { ledgerId, name, owed } for the whole balance.
 */
export default function WriteOffModal({ bill, party, onClose, onDone }) {
  const max = bill ? Number(bill.outstanding) : Number(party.owed);
  const [amount, setAmount] = useState(String(max));
  const [kind, setKind] = useState('bad_debt');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = bill
        ? await booksAPI.writeOff(bill.id, { amount: Number(amount), kind, reason })
        : await booksAPI.writeOffParty(party.ledgerId, { kind, reason });
      toast.success(res.message); onDone(res);
    } catch (x) { setErr(errMsg(x, 'Could not write it off')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={bill ? `Write off ${bill.voucher_number}` : `Write off ${party.name}'s balance`} subtitle="Finance and super-admin only. This posts a journal and settles the invoice(s); cancel the journal to undo it." onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {bill
            ? <Field label={`Amount (up to ${money(max)})`}><NumberInput required min="0.01" step="0.01" max={max} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            : <p style={{ margin: 0, fontSize: '0.85rem' }}>Every open invoice of {party.name}: <strong>{money(max)}</strong></p>}
          <Field label="Kind">
            <SelectInput value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="bad_debt">Bad debt — they will not pay</option>
              <option value="small_balance">Small balance — forgiven (discount allowed)</option>
            </SelectInput>
          </Field>
          <Field label="Reason (required)"><TextArea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer closed down; 3 reminders sent" /></Field>
          <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textMuted }}>Loyalty points and promo use on the original sale are kept (the goods were delivered). Tax is not adjusted — check bad-debt VAT relief with your accountant.</p>
          <ModalActions onCancel={onClose} submitLabel="Write off" busyLabel="Writing off…" busy={busy} danger />
        </FormStack>
      </form>
    </Modal>
  );
}
