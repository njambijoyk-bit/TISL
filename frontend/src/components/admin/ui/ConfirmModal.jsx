import { useState } from 'react';
import Modal from './Modal';
import { Field, TextArea, ModalActions, FormStack } from './Form';
import { colors } from '../../../theme/tokens';

/**
 * Confirmation with an optional free-text reason (revoke, write off…).
 * onConfirm(reason) may return a promise; the modal stays open while it runs.
 */
export default function ConfirmModal({
  title, message, confirmLabel, busyLabel, danger = false,
  withReason = false, reasonLabel = 'Reason (optional)', reasonRequired = false,
  busy = false, onConfirm, onClose,
}) {
  const [reason, setReason] = useState('');
  const disabled = reasonRequired && !reason.trim();

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <ModalActions
          onCancel={onClose}
          onSubmit={() => onConfirm(reason.trim() || null)}
          submitLabel={confirmLabel}
          busyLabel={busyLabel}
          busy={busy}
          danger={danger}
          disabled={disabled}
        />
      }
    >
      <FormStack>
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textBody, lineHeight: 1.6 }}>{message}</p>
        {withReason && (
          <Field label={reasonLabel} htmlFor="confirm-reason">
            <TextArea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
          </Field>
        )}
      </FormStack>
    </Modal>
  );
}
