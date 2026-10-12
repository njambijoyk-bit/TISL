import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Award } from 'lucide-react';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import coursesAPI from '../../_shared/api/courses';
import coursesPublicAPI from '../../_shared/api/coursesPublic';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import Pill from './Pill';
import { openCertificate } from './learnStyle';

const TONE = { valid: 'ok', expired: 'warn', revoked: 'danger' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** An offering's certificates: who has one, give one by exception, give them to students who finished earlier, revoke or renew. */
export default function CertificatesPanel({ offering }) {
  const [d, setD] = useState(null);
  const [giving, setGiving] = useState(false);
  const [f, setF] = useState({ enrolment_id: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => coursesAPI.certificates(offering.id).then(setD).catch((e) => { toast.error(errMsg(e, 'Could not load certificates')); setD({ certificates: [], candidates: [] }); }), [offering.id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok); await load(); return true; } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); return false; } finally { setBusy(false); } };
  const revoke = (c) => { const reason = window.prompt(`Why is certificate ${c.number} taken back?`); if (reason) run(() => coursesAPI.revokeCertificate(offering.id, c.id, reason), 'Revoked.'); };
  const give = async () => { if (await run(() => coursesAPI.issueCertificate(offering.id, { enrolment_id: Number(f.enrolment_id), reason: f.reason }), 'Issued.')) setGiving(false); };
  const open = (c) => coursesPublicAPI.certificatePdf(c.id).then(openCertificate).catch((e) => toast.error(errMsg(e, 'Could not open the certificate')));

  if (!d) return <p>Loading…</p>;
  return (
    <section style={{ ...card, padding: 14, display: 'grid', gap: 8 }} data-testid="certificates-panel">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ flex: 1 }}><Award size={16} aria-hidden="true" /> Certificates</strong>
        <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => coursesAPI.issueMissingCertificates(offering.id), 'Done.')}>Give to everyone who finished</button>
        <button type="button" style={btnPrimary} onClick={() => { setF({ enrolment_id: '', reason: '' }); setGiving(true); }}>Give one</button>
      </div>
      <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>A certificate is given automatically when a student finishes the lessons, meets the attendance and has paid the fees.</p>
      {d.certificates.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>No certificates yet.</p>}
      {d.certificates.map((c) => (
        <div key={c.id} data-certificate={c.number} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
          <span style={{ flex: 1, minWidth: 220 }}><strong>{c.holder_name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{c.number} · issued {fmt(c.issued_at)}{c.expires_at ? ` · until ${fmt(c.expires_at)}` : ''}{c.manual ? ' · by exception' : ''}{c.revoked_reason ? ` · ${c.revoked_reason}` : ''}</span></span>
          <Pill tone={TONE[c.state] ?? 'neutral'}>{c.state === 'valid' ? 'Valid' : c.state === 'expired' ? 'Expired' : 'Revoked'}</Pill>
          <button type="button" style={btnGhost} onClick={() => open(c)}>Open</button>
          {c.state !== 'revoked' && !c.renewed && offering.cert_valid_months && <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => coursesAPI.renewCertificate(offering.id, c.id), 'Renewed.')}>Renew</button>}
          {c.state !== 'revoked' && <button type="button" style={btnGhost} disabled={busy} onClick={() => revoke(c)}>Revoke</button>}
        </div>
      ))}
      {giving && (
        <Modal title="Give a certificate" onClose={() => setGiving(false)} width={520} footer={<ModalActions onCancel={() => setGiving(false)} onSubmit={give} submitLabel="Give certificate" busy={busy} disabled={!f.enrolment_id} />}>
          <FormStack>
            <Field label="Student" htmlFor="ce-student">
              <SelectInput id="ce-student" value={f.enrolment_id} onChange={(e) => setF({ ...f, enrolment_id: e.target.value })}>
                <option value="">Choose a student</option>
                {d.candidates.map((x) => <option key={x.enrolment_id} value={x.enrolment_id}>{x.student}{x.status === 'completed' ? '' : ' (not finished yet)'}</option>)}
              </SelectInput>
            </Field>
            <Field label="Reason" htmlFor="ce-reason" hint="Needed when the student has not finished."><TextInput id="ce-reason" maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          </FormStack>
        </Modal>
      )}
    </section>
  );
}
