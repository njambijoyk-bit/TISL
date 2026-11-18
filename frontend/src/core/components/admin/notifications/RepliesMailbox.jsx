import { useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, FormGrid, SelectInput, TextInput } from '../ui/Form';
import SecretField from './SecretField';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * The replies mailbox (docs/PROJECTS_STAGE6_SPEC.md, build 6.5; owner's choice 1). Answerable messages (a Projects conversation, to begin with)
 * go out with a reply address made from this mailbox (replies+code@yourdomain); the mailbox is read every five minutes over IMAP and each reply is
 * filed into what it answers. Most mail hosts deliver replies+anything@ to replies@ without any setting.
 */
export default function RepliesMailbox({ data, canEdit, onChanged }) {
  const e = data.parts.email;
  const [f, setF] = useState({ replies_address: e.replies_address ?? '', imap_host: e.imap_host ?? '', imap_port: e.imap_port ?? 993, imap_encryption: e.imap_encryption ?? 'ssl', imap_username: e.imap_username ?? '' });
  const [password, setPassword] = useState('');
  const [clearPw, setClearPw] = useState(false);
  const [busy, setBusy] = useState('');
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const last = data.replies?.last;
  const ro = !canEdit;

  const save = async () => {
    setBusy('save');
    try { const r = await notificationSettingsAPI.save('email', { ...f, imap_port: Number(f.imap_port) || 993, ...(password ? { imap_password: password } : {}), clear: clearPw ? ['imap_password'] : [] }); toast.success(r.message); setPassword(''); onChanged(); } catch (err) { toast.error(errMsg(err, 'Could not save'), { duration: 8000 }); } finally { setBusy(''); }
  };
  const readNow = async () => {
    setBusy('read');
    try { const r = await notificationSettingsAPI.readReplies(); toast.success(r.message); onChanged(); } catch (err) { toast.error(errMsg(err, 'The mailbox could not be read'), { duration: 8000 }); onChanged(); } finally { setBusy(''); }
  };

  return (
    <div style={{ ...card, padding: 18, display: 'grid', gap: 12, marginTop: 16 }} data-replies-mailbox>
      <div>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Replies mailbox</h3>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: colors.textMuted }}>
          Messages people can answer (Projects conversations, to begin with) go out with a reply address made from this mailbox, like replies+4f9c…@yourdomain. We read it every five minutes and file each reply into what it answers; anything we cannot match waits for a person.
        </p>
      </div>
      {!data.replies?.ready && <p role="status" style={{ margin: 0, fontSize: '0.78rem' }}>This needs database script 262.</p>}
      <FormGrid>
        <Field label="Replies mailbox address" hint="A mailbox the company has, for example replies@yourdomain. Blank = replies go to the usual reply-to."><TextInput aria-label="Replies mailbox address" type="email" value={f.replies_address} onChange={set('replies_address')} disabled={ro} placeholder="replies@yourdomain" /></Field>
        <Field label="Mailbox server (IMAP)"><TextInput aria-label="Mailbox server (IMAP)" value={f.imap_host} onChange={set('imap_host')} disabled={ro} placeholder="imap.example.com" /></Field>
        <Field label="Mailbox port"><TextInput aria-label="Mailbox port" type="number" value={f.imap_port} onChange={set('imap_port')} disabled={ro} /></Field>
        <Field label="Mailbox security"><SelectInput aria-label="Mailbox security" value={f.imap_encryption} onChange={set('imap_encryption')} disabled={ro}><option value="ssl">SSL (port 993)</option><option value="tls">STARTTLS (port 143)</option><option value="none">None</option></SelectInput></Field>
        <Field label="Mailbox user name"><TextInput aria-label="Mailbox user name" value={f.imap_username} onChange={set('imap_username')} disabled={ro} autoComplete="off" /></Field>
      </FormGrid>
      <SecretField label="Mailbox password" saved={e.imap_password} value={password} onChange={setPassword} clearing={clearPw} onClear={setClearPw} hint="Saved encrypted. It is never shown again." />
      {last && (
        <p role="status" style={{ margin: 0, fontSize: '0.78rem', color: last.error ? colors.danger : colors.textMuted }} data-replies-last>
          Last read {new Date(last.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: {last.error ? `could not be read: ${last.error}` : `${last.read} read, ${last.filed} filed, ${last.waiting} waiting.`}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canEdit && <button type="button" style={btnPrimary} disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save the mailbox'}</button>}
        {canEdit && data.replies?.configured && <button type="button" style={btnGhost} disabled={!!busy} onClick={readNow}>{busy === 'read' ? 'Reading…' : 'Read it now'}</button>}
      </div>
    </div>
  );
}
