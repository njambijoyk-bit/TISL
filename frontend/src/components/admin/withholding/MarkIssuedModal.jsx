import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload } from 'lucide-react';
import useWithholdingStore from '../../../store/withholdingStore';
import Modal from '../ui/Modal';
import { Field, FormStack, ModalActions } from '../ui/Form';
import { colors, radius } from '../../../theme/tokens';

/** The customer has issued their withholding certificate for a deduction — optionally attach the scan. */
export default function MarkIssuedModal({ certificate, onClose }) {
  const { markIssued, actionLoading } = useWithholdingStore();
  const [document, setDocument] = useState(null);

  const submit = async () => {
    try {
      await markIssued(certificate.id, document);
      toast.success('Marked as issued');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Could not update the certificate');
    }
  };

  return (
    <Modal title="Mark certificate issued" subtitle={`${certificate.certificate_number} — the customer has generated their withholding certificate.`} onClose={onClose} width={460}
      footer={<ModalActions onCancel={onClose} onSubmit={submit} submitLabel="Mark issued" busyLabel="Saving…" busy={actionLoading} />}>
      <FormStack>
        <Field label="Certificate copy (optional)" hint="PDF, JPG or PNG, up to 5 MB. You can mark it received once the original is in hand.">
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
            borderRadius: radius.lg, border: `1.5px dashed ${colors.tint(0.25)}`, background: colors.tint(0.02),
            fontSize: '0.8rem', color: colors.textMuted,
          }}>
            <Upload size={15} style={{ color: colors.primary }} />
            <span style={{ flex: 1 }}>{document ? document.name : 'Upload the certificate'}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => setDocument(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
      </FormStack>
    </Modal>
  );
}
