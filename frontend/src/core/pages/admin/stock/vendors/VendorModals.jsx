import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../../components/admin/ui/Form';
import vendorsAPI from '../../../../../_shared/api/vendors';
import { errMsg } from '../../../../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };

export function VendorModal({ vendor, onClose, onDone, groups, canConfirm }) {
  const [f, setF] = useState({ company_name: vendor?.company_name ?? '', contact_name: vendor?.contact_name ?? '', email: vendor?.email ?? '', phone: vendor?.phone ?? '', tax_id: vendor?.tax_id ?? '', registration_number: vendor?.registration_number ?? '', address: vendor?.address ?? '', payment_terms_days: vendor?.payment_terms_days ?? 30, notes: vendor?.notes ?? '', special_group: vendor?.special_group ?? '', special_group_certificate: vendor?.special_group_certificate ?? '', special_group_valid_until: vendor?.special_group_valid_until ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const confirmGroup = async () => {
    try { const res = await vendorsAPI.confirmPeopleCategory(vendor.id, vendor.special_group_status !== 'confirmed'); toast.success(res.message); onDone(); } catch (x) { setErr(errMsg(x, 'Could not change it')); }
  };
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { ...f, registration_number: f.registration_number || null, payment_terms_days: Number(f.payment_terms_days) || 0, special_group: f.special_group || null, special_group_certificate: f.special_group_certificate || null, special_group_valid_until: f.special_group_valid_until || null };
    if (!groups) { delete body.special_group; delete body.special_group_certificate; delete body.special_group_valid_until; }
    try {
      const res = vendor ? await vendorsAPI.update(vendor.id, body) : await vendorsAPI.create(body);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the vendor')); } finally { setBusy(false); }
  };
  return (
    <Modal title={vendor ? 'Edit vendor' : 'Add a vendor'} onClose={onClose} width={620}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Company"><TextInput required value={f.company_name} onChange={set('company_name')} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Contact person"><TextInput value={f.contact_name} onChange={set('contact_name')} /></Field>
            <Field label="Phone"><TextInput value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><TextInput type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Tax ID / PIN"><TextInput value={f.tax_id} onChange={set('tax_id')} /></Field>
            <Field label="Company registration no."><TextInput value={f.registration_number} onChange={set('registration_number')} /></Field>
            <Field label="Payment terms (days)"><NumberInput min="0" value={f.payment_terms_days} onChange={set('payment_terms_days')} /></Field>
            <Field label="Address"><TextInput value={f.address} onChange={set('address')} placeholder="Street, town" /></Field>
          </div>
          <Field label="Notes"><TextInput value={f.notes} onChange={set('notes')} /></Field>
          {groups && vendor?.special_group && (
            <div style={{ fontSize: '0.78rem', color: colors.textBody, display: 'grid', gap: 6 }}>
              <div>People category: <strong>{vendor.special_group}</strong> ({vendor.special_group_status === 'confirmed' ? 'confirmed' : 'not confirmed yet'}). {(vendor.scan_urls || []).length === 0 ? 'No certificate scan uploaded.' : 'Certificate scan:'}</div>
              {(vendor.scan_urls || []).length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {vendor.scan_urls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Certificate page ${i + 1}`} style={{ width: 80, height: 100, objectFit: 'cover', objectPosition: 'top', borderRadius: 6, border: `1px solid ${colors.tint(0.2)}` }} /></a>)}
                </div>
              )}
              {canConfirm && <div><button type="button" style={small} onClick={confirmGroup}>{vendor.special_group_status === 'confirmed' ? 'Take back confirmation' : 'Confirm people category'}</button></div>}
            </div>
          )}
          {groups && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <Field label="People category" hint="Blank = none. For youth, women, disability or SME tenders">
                <SelectInput value={f.special_group} onChange={set('special_group')}>
                  <option value="">None</option><option value="youth">Youth</option><option value="women">Women</option><option value="pwd">Persons with disabilities</option><option value="sme">SMEs</option>
                </SelectInput>
              </Field>
              {f.special_group && <Field label="Certificate no."><TextInput value={f.special_group_certificate} onChange={set('special_group_certificate')} /></Field>}
              {f.special_group && <Field label="Certificate valid until"><TextInput type="date" value={f.special_group_valid_until} onChange={set('special_group_valid_until')} /></Field>}
            </div>
          )}
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>A Sundry Creditors ledger is created for the vendor, so purchases and payments post to it.</p>
          <ModalActions onCancel={onClose} submitLabel={vendor ? 'Save' : 'Add vendor'} busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function newPassword() {
  const sets = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKMNPQRSTUVWXYZ', '23456789'];
  const all = sets.join('');
  const pick = (chars) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
  const out = [...sets.map(pick), ...Array.from({ length: 11 }, () => pick(all))];
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

/** A login to the vendor portal for a vendor we created: the first time it is made, or a new password for one that exists. */
export function PortalLoginModal({ vendor, onClose, onDone }) {
  const reset = Boolean(vendor.has_login);
  const [email, setEmail] = useState(vendor.email ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = reset ? await vendorsAPI.portalPassword(vendor.id, { password: password || undefined }) : await vendorsAPI.portalLogin(vendor.id, { email: email || undefined, password: password || undefined });
      setResult({ message: res.message, email: res.email, password: res.password ?? password, generated: res.generated });
    } catch (x) { setErr(errMsg(x, 'Could not save')); } finally { setBusy(false); }
  };
  const copy = (text) => { try { navigator.clipboard.writeText(text).then(() => toast.success('Copied'), () => toast.error('Could not copy: select it instead')); } catch { toast.error('Could not copy: select it instead'); } };
  const mono = { fontFamily: 'monospace', fontSize: '0.9rem', padding: '8px 10px', borderRadius: 8, background: colors.tint(0.06), wordBreak: 'break-all', userSelect: 'all' };

  return (
    <Modal title={reset ? 'Reset portal password' : 'Create portal login'} subtitle={vendor.company_name} onClose={result ? onDone : onClose} width={520}>
      {result ? (
        <FormStack>
          <p style={{ margin: 0, fontSize: '0.85rem', color: colors.text }}>{result.message}</p>
          <Field label="Sign in with"><div style={mono}>{result.email}</div></Field>
          <Field label="Initial password" hint={result.generated ? 'Shown this once: copy it now and pass it on safely.' : 'The password you entered.'}>
            <div style={{ display: 'flex', gap: 8 }}><div style={{ ...mono, flex: 1 }}>{result.password}</div><button type="button" style={btnGhost} onClick={() => copy(result.password)}>Copy</button></div>
          </Field>
          <ModalActions onCancel={onDone} submitLabel="Done" onSubmit={onDone} />
        </FormStack>
      ) : (
        <form onSubmit={go}>
          <FormStack>
            <FormError message={err} />
            {!reset && (
              <Field label="Email (their username)" hint={vendor.email ? 'Leave as the vendor\'s email, or change it.' : 'This vendor has no email yet: enter one.'}>
                <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            )}
            <Field label="Initial password" hint="Leave blank and one is made for you and shown once. Either way they must choose their own password when they first sign in.">
              <div style={{ display: 'flex', gap: 8 }}>
                <TextInput type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Blank = make one for me" />
                <button type="button" style={btnGhost} onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
                <button type="button" style={btnGhost} onClick={() => { setPassword(newPassword()); setShow(true); }}>Generate</button>
              </div>
            </Field>
            {reset && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Their open sessions end, so they sign in again with the new password.</p>}
            <ModalActions onCancel={onClose} submitLabel={reset ? 'Set password' : 'Create login'} busy={busy} />
          </FormStack>
        </form>
      )}
    </Modal>
  );
}

