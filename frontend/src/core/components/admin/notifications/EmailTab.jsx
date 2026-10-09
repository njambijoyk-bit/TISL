import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle, Send } from 'lucide-react';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, FormGrid } from '../ui/Form';
import SecretField from './SecretField';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const PRESETS = [
  ['', 'Choose a common provider…'],
  ['smtp.gmail.com|587|tls', 'Gmail / Google Workspace (needs an app password)'],
  ['smtp.office365.com|587|tls', 'Microsoft 365'],
  ['smtp.mailgun.org|587|tls', 'Mailgun'],
  ['smtp.sendgrid.net|587|tls', 'SendGrid (username "apikey")'],
  ['email-smtp.eu-west-1.amazonaws.com|587|tls', 'Amazon SES (check your region)'],
];

/**
 * The mail server, set up here instead of in .env. Saving first sends a real test email to you through the new settings; if that fails nothing is changed
 * (you can still choose "Save anyway"). Every save is a version in the history and can be rolled back.
 */
export default function EmailTab({ data, canEdit, canSend, onChanged }) {
  const e = data.parts.email;
  const saved = data.saved.email;
  const [f, setF] = useState({ host: e.host, port: e.port, encryption: e.encryption, username: e.username, from_name: e.from_name, from_address: e.from_address, reply_to: e.reply_to, copy_to: e.copy_to });
  const [password, setPassword] = useState('');
  const [clearPw, setClearPw] = useState(false);
  const [busy, setBusy] = useState(null);
  const [refused, setRefused] = useState(null);   // the reason a save was refused, so "Save anyway" can be offered
  const [fieldErrors, setFieldErrors] = useState({});
  const set = (k) => (ev) => { setRefused(null); setF((x) => ({ ...x, [k]: ev.target.value })); };

  const body = () => ({ ...f, port: Number(f.port) || 587, ...(password ? { password } : {}), clear: clearPw ? ['password'] : [] });

  const save = async (anyway = false) => {
    setBusy('save'); setFieldErrors({});
    try {
      const r = await notificationSettingsAPI.save('email', { ...body(), anyway });
      toast.success(r.message, { duration: 7000 }); setPassword(''); setClearPw(false); setRefused(null); onChanged();
    } catch (err) {
      const v = err?.response?.data?.errors;
      if (v) setFieldErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]])));
      if (err?.response?.status === 422 && !v) setRefused(errMsg(err, 'Not saved'));
      else toast.error(errMsg(err, 'Could not save'), { duration: 8000 });
    } finally { setBusy(null); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await notificationSettingsAPI.testEmail(); toast.success(r.message, { duration: 8000 }); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'The test email failed'), { duration: 10000 }); } finally { setBusy(null); }
  };
  const reset = async () => {
    if (!window.confirm('Go back to the mail settings the server already has? You can undo this from the history.')) return;
    setBusy('reset');
    try { const r = await notificationSettingsAPI.reset('email'); toast.success(r.message); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'Could not clear')); } finally { setBusy(null); }
  };
  const preset = (v) => { if (!v) return; const [host, port, encryption] = v.split('|'); setRefused(null); setF((x) => ({ ...x, host, port, encryption })); };

  const v = data.current_version.email;
  const serverIsLog = !saved && ['log', 'array'].includes(data.server.mailer);
  const ro = !canEdit;

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      {data.unreadable.email && (
        <Notice tone="bad">The saved mail settings can no longer be read (the server's application key changed). Enter the mail password again and save.</Notice>
      )}
      {!saved ? (
        <Notice tone={serverIsLog ? 'warn' : 'info'}>
          {serverIsLog
            ? <>Emails are <strong>not being delivered</strong>: the server is set to write them to a log file ("{data.server.mailer}"). Fill in your mail server below to start sending.</>
            : <>Nothing is saved here yet, so the server's own mail settings are used ("{data.server.mailer}"). Saving below replaces them.</>}
        </Notice>
      ) : v && (
        <Notice tone={v.tested_ok === false ? 'warn' : 'good'}>
          Version {v.version_no} is in use{v.tested_ok === true ? ' and passed a test email.' : v.tested_ok === false ? ', saved without a passing test.' : '.'}
        </Notice>
      )}

      <div style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
        {canEdit && (
          <Field label="Start from"><SelectInput aria-label="Start from" value="" onChange={(ev) => preset(ev.target.value)}>{PRESETS.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}</SelectInput></Field>
        )}
        <FormGrid min={220}>
          <Field label="Mail server (host)" error={fieldErrors.host}><TextInput aria-label="Mail server (host)" value={f.host} onChange={set('host')} disabled={ro} placeholder="smtp.example.com" /></Field>
          <Field label="Port" error={fieldErrors.port}><TextInput aria-label="Port" type="number" value={f.port} onChange={set('port')} disabled={ro} /></Field>
          <Field label="Security"><SelectInput aria-label="Security" value={f.encryption} onChange={set('encryption')} disabled={ro}>
            <option value="tls">STARTTLS (usually port 587)</option><option value="ssl">SSL/TLS (usually port 465)</option><option value="none">None (not recommended)</option></SelectInput></Field>
          <Field label="Username" error={fieldErrors.username}><TextInput aria-label="Username" value={f.username} onChange={set('username')} disabled={ro} autoComplete="off" /></Field>
        </FormGrid>
        <SecretField label="Password" saved={e.password} value={password} onChange={(val) => { setRefused(null); setPassword(val); }} clearing={clearPw} onClear={setClearPw}
          hint="Saved encrypted. It is never shown again, not even to you." />
        <FormGrid min={220}>
          <Field label="Sent from (name)" hint="Blank = the company name." error={fieldErrors.from_name}><TextInput aria-label="Sent from (name)" value={f.from_name} onChange={set('from_name')} disabled={ro} /></Field>
          <Field label="Sent from (address)" hint="Blank = the company's default email (Books → Settings → Company)." error={fieldErrors.from_address}><TextInput aria-label="Sent from (address)" type="email" value={f.from_address} onChange={set('from_address')} disabled={ro} /></Field>
          <Field label="Replies go to" error={fieldErrors.reply_to}><TextInput aria-label="Replies go to" type="email" value={f.reply_to} onChange={set('reply_to')} disabled={ro} /></Field>
          <Field label="Copy every email to" hint="Optional. Use it only if you need a record." error={fieldErrors.copy_to}><TextInput aria-label="Copy every email to" type="email" value={f.copy_to} onChange={set('copy_to')} disabled={ro} /></Field>
        </FormGrid>

        {refused && (
          <Notice tone="bad">
            <strong>Not saved.</strong> {refused}
            {canEdit && <div style={{ marginTop: 8 }}><button type="button" style={btnGhost} disabled={!!busy} onClick={() => save(true)}>Save anyway, I am sure</button></div>}
          </Notice>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && <button type="button" style={btnPrimary} disabled={!!busy || !f.host} onClick={() => save(false)}>{busy === 'save' ? 'Testing and saving…' : 'Test and save'}</button>}
          {canSend && saved && <button type="button" style={btnGhost} disabled={!!busy} onClick={test}><Send size={13} /> {busy === 'test' ? 'Sending…' : 'Send a test to me'}</button>}
          {canEdit && saved && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={!!busy} onClick={reset}>Go back to the server's settings</button>}
        </div>
        <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>
          "Test and save" sends a real email to {`you`} through these settings first. If it fails, nothing changes. Messages are {data.server.queue === 'sync' ? 'sent straight away' : 'queued and sent by the background worker'}.
        </p>
      </div>
    </div>
  );
}

function Notice({ tone = 'info', children }) {
  const c = { info: colors.primary, warn: '#b45309', bad: colors.danger, good: '#047857' }[tone];
  const Icon = tone === 'good' ? CheckCircle : AlertCircle;
  return (
    <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, fontSize: '0.78rem', lineHeight: 1.5, color: colors.text,
      background: `color-mix(in srgb, ${c} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 35%, transparent)` }}>
      <Icon size={14} style={{ color: c, flexShrink: 0, marginTop: 2 }} /><div>{children}</div>
    </div>
  );
}
