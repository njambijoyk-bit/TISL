import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, UserRound } from 'lucide-react';
import useTaxCertificateStore from '../../../../../_shared/store/taxCertificateStore';
import { fieldErrors } from '../../../../../_shared/store/helpers/apiState';
import Modal from '../../ui/Modal';
import { Field, TextInput, FormGrid, FormStack, ModalActions, FormError } from '../../ui/Form';
import CustomerSelectorModal from '../../../../pages/admin/CustomerSelectorModal';
import { customerName } from './customerName';
import { colors, radius, btnGhost } from '../../../../../_shared/theme/tokens';

const TYPE_COPY = {
  exemption: {
    title: 'Tax exemption certificate',
    blurb: 'Proof that a customer is exempt from a tax (e.g. a KRA VAT exemption).',
    numberPh: 'KRA/VAT/EXM/2026/0001',
  },
  withholding_agent: {
    title: 'Withholding agent certificate',
    blurb: 'Proof that a customer is appointed to withhold tax when paying suppliers.',
    numberPh: 'KRA/WHT/AGT/0001',
  },
};

/**
 * Create or edit a tax legitimacy certificate. New certificates start as
 * "pending verification"; the number, type, holder and issue date are its
 * identity and can't change after creation.
 *
 * @param {'exemption'|'withholding_agent'} certificateType  used on create
 * @param {object} certificate   when editing
 * @param {object} holder        preselected customer (e.g. from CustomerDetail)
 */
export default function TaxCertificateForm({ certificateType = 'exemption', certificate, holder, onClose, onSaved }) {
  const { createCertificate, updateCertificate, actionLoading } = useTaxCertificateStore();
  const editing = Boolean(certificate);
  const type = certificate?.certificate_type ?? certificateType;
  const copy = TYPE_COPY[type];

  const [customer, setCustomer] = useState(certificate?.holder ?? holder ?? null);
  const [picking, setPicking] = useState(false);
  const [form, setForm] = useState({
    certificate_number: certificate?.certificate_number ?? '',
    issuing_authority: certificate?.issuing_authority ?? 'Kenya Revenue Authority',
    classification: certificate?.classification ?? '',
    issued_at: certificate?.issued_at?.slice(0, 10) ?? '',
    valid_until: certificate?.valid_until?.slice(0, 10) ?? '',
  });
  const [document, setDocument] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(null);
    if (!editing && !customer) { setErrors({ holder_id: 'Choose the customer this certificate belongs to.' }); return; }
    try {
      let saved;
      if (editing) {
        saved = await updateCertificate(certificate.id, {
          issuing_authority: form.issuing_authority || null,
          classification: form.classification.trim() || null,
          valid_until: form.valid_until || null,
          document,
        });
      } else {
        saved = await createCertificate({
          holder_type: 'customer',
          holder_id: customer.id,
          certificate_type: type,
          certificate_number: form.certificate_number.trim(),
          issuing_authority: form.issuing_authority || null,
          classification: form.classification.trim() || null,
          issued_at: form.issued_at,
          valid_until: form.valid_until || null,
          document,
        });
      }
      toast.success(editing ? 'Certificate saved' : 'Certificate added — verify it to put it in effect');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      if (!err.response?.data?.errors) setFormError(err.response?.data?.message ?? 'Could not save the certificate');
    }
  };

  return (
    <>
      <Modal
        title={editing ? `Edit ${certificate.certificate_number}` : `New ${copy.title.toLowerCase()}`}
        subtitle={copy.blurb}
        onClose={picking ? () => {} : onClose}
        width={580}
      >
        <form onSubmit={submit}>
          <FormStack>
            <FormError message={formError} />

            <Field label="Customer" error={errors.holder_id}>
              {editing || holder ? (
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>{customerName(customer)}</p>
              ) : (
                <button type="button" onClick={() => setPicking(true)} style={{
                  ...btnGhost, width: '100%', justifyContent: 'flex-start',
                  color: customer ? colors.text : colors.textMuted, borderColor: errors.holder_id ? colors.danger : colors.tint(0.18),
                }}>
                  <UserRound size={14} /> {customer ? customerName(customer) : 'Choose a customer'}
                </button>
              )}
            </Field>

            <FormGrid>
              <Field label="Certificate number" htmlFor="tc-num" error={errors.certificate_number} hint={editing ? 'Fixed once created' : undefined}>
                <TextInput id="tc-num" required disabled={editing} maxLength={100} value={form.certificate_number}
                  onChange={(e) => set('certificate_number')(e.target.value)} placeholder={copy.numberPh} />
              </Field>
              <Field label="Issued by" htmlFor="tc-auth" error={errors.issuing_authority}>
                <TextInput id="tc-auth" maxLength={150} value={form.issuing_authority} onChange={(e) => set('issuing_authority')(e.target.value)} />
              </Field>
            </FormGrid>

            <FormGrid min={150}>
              <Field label="Issued on" htmlFor="tc-issued" error={errors.issued_at} hint={editing ? 'Fixed once created' : undefined}>
                <TextInput id="tc-issued" type="date" required disabled={editing} value={form.issued_at} onChange={(e) => set('issued_at')(e.target.value)} />
              </Field>
              <Field label="Valid until" htmlFor="tc-until" error={errors.valid_until} hint="Empty = no expiry">
                <TextInput id="tc-until" type="date" min={form.issued_at || undefined} value={form.valid_until} onChange={(e) => set('valid_until')(e.target.value)} />
              </Field>
              <Field label="Classification" htmlFor="tc-class" error={errors.classification}
                hint={type === 'exemption' ? 'Limit to one rate classification; empty = all' : 'Optional'}>
                <TextInput id="tc-class" maxLength={50} value={form.classification} onChange={(e) => set('classification')(e.target.value)} />
              </Field>
            </FormGrid>

            <Field label="Scanned copy" error={errors.document} hint="PDF, JPG or PNG, up to 5 MB">
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
                borderRadius: radius.lg, border: `1.5px dashed ${colors.tint(0.25)}`, background: colors.tint(0.02),
                fontSize: '0.8rem', color: colors.textMuted,
              }}>
                <Upload size={15} style={{ color: colors.primary }} />
                <span style={{ flex: 1 }}>
                  {document ? document.name : certificate?.document_path ? 'Replace the uploaded document' : 'Upload the certificate'}
                </span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={(e) => setDocument(e.target.files?.[0] ?? null)} />
              </label>
            </Field>

            <ModalActions onCancel={onClose} submitLabel={editing ? 'Save certificate' : 'Add certificate'} busy={actionLoading} />
          </FormStack>
        </form>
      </Modal>

      {picking && (
        <CustomerSelectorModal
          title="Certificate holder"
          onSelect={(c) => { setCustomer(c); setPicking(false); setErrors((e) => ({ ...e, holder_id: undefined })); }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
