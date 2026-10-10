import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle, Copy, KeyRound, Send } from 'lucide-react';
import paymentSettingsAPI from '../../../../_shared/api/paymentSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, FormGrid } from '../ui/Form';
import SecretField from '../notifications/SecretField';
import usePasswordPrompt from './usePasswordPrompt';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const FROM = { screen: ['saved here', '#047857'], server: ["server's own (.env)", '#b45309'], none: ['not set', '#b91c1c'] };
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

function From({ source }) {
  const [label, color] = FROM[source] ?? FROM.none;
  return <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, color }}>{label}</span>;
}

/**
 * M-Pesa (Daraja) keys, set here instead of in .env. Owner only. Saving first asks Safaricom whether the key and secret are good; if not, nothing changes (you can still
 * "save anyway"). Every change asks for your password, is emailed to the owners, is a version in the history and can be rolled back. A blank key keeps the saved one; a field
 * left empty falls back to the server's own setting.
 */
export default function MpesaTab({ data, onChanged }) {
  const m = data.parts.mpesa;
  const saved = data.saved.mpesa;
  const [f, setF] = useState({ env: m.env, shortcode: m.shortcode, account_reference: m.account_reference, transaction_desc: m.transaction_desc, callback_url: m.callback_url, ledger_id: m.ledger_id ?? '' });
  const [secrets, setSecrets] = useState({ consumer_key: '', consumer_secret: '', passkey: '' });
  const [clear, setClear] = useState({ consumer_key: false, consumer_secret: false, passkey: false });
  const [busy, setBusy] = useState(null);
  const [refused, setRefused] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [phone, setPhone] = useState('');
  const [ask, dialog] = usePasswordPrompt();
  const set = (k) => (ev) => { setRefused(null); setF((x) => ({ ...x, [k]: ev.target.value })); };
  const setSecret = (k) => (v) => { setRefused(null); setSecrets((x) => ({ ...x, [k]: v })); };
  const setClr = (k) => (v) => setClear((x) => ({ ...x, [k]: v }));

  const body = () => ({ ...f, ...Object.fromEntries(Object.entries(secrets).filter(([, v]) => v)), clear: Object.entries(clear).filter(([, v]) => v).map(([k]) => k) });
  const live = f.env === 'production';

  const save = async (anyway = false) => {
    const password = await ask(live ? 'These are LIVE payment keys: money will move through them. Type your password to save.' : 'Type your password to save these payment keys.');
    if (!password) return;
    setBusy('save'); setFieldErrors({});
    try {
      const r = await paymentSettingsAPI.save('mpesa', { ...body(), anyway, password });
      toast.success(r.message, { duration: 7000 }); setSecrets({ consumer_key: '', consumer_secret: '', passkey: '' }); setClear({ consumer_key: false, consumer_secret: false, passkey: false }); setRefused(null); onChanged();
    } catch (err) {
      const v = err?.response?.data?.errors;
      if (v) setFieldErrors(Object.fromEntries(Object.entries(v).map(([k, msg]) => [k, msg[0]])));
      if (err?.response?.status === 422 && !v && /Not saved/.test(errMsg(err, ''))) setRefused(errMsg(err, 'Not saved'));
      else toast.error(errMsg(err, 'Could not save'), { duration: 9000 });
    } finally { setBusy(null); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await paymentSettingsAPI.test({ env: f.env, consumer_key: secrets.consumer_key, consumer_secret: secrets.consumer_secret }); toast.success(r.message, { duration: 8000 }); }
    catch (err) { toast.error(errMsg(err, 'Safaricom did not accept it'), { duration: 10000 }); } finally { setBusy(null); }
  };
  const prompt = async () => {
    const password = await ask('A real KES 1 prompt will be sent to this phone through the keys that are live now. Type your password to send it.');
    if (!password) return;
    setBusy('prompt');
    try { const r = await paymentSettingsAPI.testPrompt(phone, password); toast.success(r.message, { duration: 12000 }); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'The prompt was not sent'), { duration: 10000 }); } finally { setBusy(null); }
  };
  const rotate = async () => {
    const password = await ask('A new callback token will be made. The old one keeps working for 2 hours so payments already waiting are not lost. Type your password.');
    if (!password) return;
    setBusy('rotate');
    try { const r = await paymentSettingsAPI.rotateToken('mpesa', password); toast.success(r.message, { duration: 8000 }); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'Could not make a new token')); } finally { setBusy(null); }
  };
  const reset = async () => {
    if (!window.confirm("Go back to the M-Pesa keys the server already has (.env)? What is saved here stays in the history, so you can undo this.")) return;
    const password = await ask('Type your password to clear the saved keys.');
    if (!password) return;
    setBusy('reset');
    try { const r = await paymentSettingsAPI.reset('mpesa', password); toast.success(r.message, { duration: 9000 }); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'Could not clear')); } finally { setBusy(null); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(data.callback.url); toast.success('Copied'); } catch { toast.error('Could not copy: select it and copy by hand'); } };

  const v = data.current_version.mpesa;
  const cb = data.callback;
  const noKeys = data.in_use.consumer_key === 'none' || data.in_use.consumer_secret === 'none';

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      {dialog}
      {data.unreadable.mpesa && <Notice tone="bad">The saved M-Pesa keys can no longer be read (the server's application key changed). Enter the keys again and save.</Notice>}
      {!saved ? (
        <Notice tone={noKeys ? 'bad' : 'info'}>
          {noKeys ? <>M-Pesa is <strong>not set up</strong>: there is no consumer key or secret here or on the server. Enter them below.</>
            : <>Nothing is saved here yet, so the server's own M-Pesa keys (.env, {data.server_env === 'production' ? 'live' : 'sandbox'}) are used. Saving below replaces them.</>}
        </Notice>
      ) : v && <Notice tone={v.tested_ok === false ? 'warn' : 'good'}>Version {v.version_no} is in use{v.tested_ok === true ? ' and Safaricom accepted its key.' : v.tested_ok === false ? ', saved although Safaricom did not accept the key.' : '.'}</Notice>}

      <div style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
        <Field label={<>Environment <From source={data.in_use.env} /></>} hint="Sandbox is for practice with Safaricom's test numbers: no real money moves. Live is real.">
          <SelectInput aria-label="Environment" value={f.env} onChange={set('env')}><option value="sandbox">Sandbox (test)</option><option value="production">Live (real money)</option></SelectInput>
        </Field>
        {live && <Notice tone="warn">Live: customers' real M-Pesa payments go through these keys. Use the live keys from your Safaricom Daraja app, not the sandbox ones.</Notice>}
        <SecretField label="Consumer key" saved={m.consumer_key} value={secrets.consumer_key} onChange={setSecret('consumer_key')} clearing={clear.consumer_key} onClear={setClr('consumer_key')} hint={<>From your Daraja app. Saved encrypted, never shown again. <From source={data.in_use.consumer_key} /></>} error={fieldErrors.consumer_key} />
        <SecretField label="Consumer secret" saved={m.consumer_secret} value={secrets.consumer_secret} onChange={setSecret('consumer_secret')} clearing={clear.consumer_secret} onClear={setClr('consumer_secret')} hint={<>Saved encrypted, never shown again. <From source={data.in_use.consumer_secret} /></>} error={fieldErrors.consumer_secret} />
        <FormGrid min={220}>
          <Field label={<>Shortcode (Paybill or Till) <From source={data.in_use.shortcode} /></>} error={fieldErrors.shortcode}><TextInput aria-label="Shortcode" inputMode="numeric" value={f.shortcode} onChange={set('shortcode')} placeholder="e.g. 174379" /></Field>
        </FormGrid>
        <SecretField label="Passkey" saved={m.passkey} value={secrets.passkey} onChange={setSecret('passkey')} clearing={clear.passkey} onClear={setClr('passkey')} hint={<>The "Lipa na M-Pesa Online" passkey. Saved encrypted. <From source={data.in_use.passkey} /></>} error={fieldErrors.passkey} />
        <FormGrid min={220}>
          <Field label="Account reference" hint="Up to 12 characters, shown on the customer's M-Pesa message." error={fieldErrors.account_reference}><TextInput aria-label="Account reference" maxLength={12} value={f.account_reference} onChange={set('account_reference')} /></Field>
          <Field label="Description" hint="Up to 13 characters." error={fieldErrors.transaction_desc}><TextInput aria-label="Description" maxLength={13} value={f.transaction_desc} onChange={set('transaction_desc')} /></Field>
        </FormGrid>
        <Field label="Money is booked into" hint="The bank, till or cash account every M-Pesa payment is booked to (and the account your M-Pesa statement is matched against). A dedicated account such as “M-Pesa till” is best." error={fieldErrors.ledger_id}>
          <SelectInput aria-label="Money is booked into" value={f.ledger_id ?? ''} onChange={set('ledger_id')}>
            <option value="">Choose an account…</option>
            {(data.ledgers ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectInput>
          {!f.ledger_id && <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#b45309' }}>No account chosen yet: pick the one M-Pesa money should be booked to.</div>}
        </Field>
        <Field label="Callback address (leave empty to use this site's own)" hint="Only change this if you reach the site through a tunnel or another address. Live payments need https." error={fieldErrors.callback_url}>
          <TextInput aria-label="Callback address" value={f.callback_url} onChange={set('callback_url')} placeholder="https://…" />
        </Field>

        {refused && (
          <Notice tone="bad"><strong>{refused}</strong>
            <div style={{ marginTop: 8 }}><button type="button" style={btnGhost} disabled={!!busy} onClick={() => save(true)}>Save anyway, I am sure</button></div>
          </Notice>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => save(false)}><KeyRound size={13} /> {busy === 'save' ? 'Testing and saving…' : 'Test and save'}</button>
          <button type="button" style={btnGhost} disabled={!!busy || (!secrets.consumer_key && !saved && noKeys)} onClick={test}>{busy === 'test' ? 'Asking Safaricom…' : 'Only test the key'}</button>
          {saved && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={!!busy} onClick={reset}>Go back to the server's keys</button>}
        </div>
        <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>
          "Test and save" asks Safaricom for an access token with the key and secret first; if it says no, nothing changes. This proves the key, secret and environment. The shortcode and passkey can only be proved by a real payment: use the KES 1 test below.
        </p>
      </div>

      <div style={{ ...card, padding: 20, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Where Safaricom reports payments</h2>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>This address is sent to Safaricom with every payment prompt; you do not register it anywhere. A secret token is added to it so only Safaricom's own call is believed.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 8, background: colors.tint(0.06), wordBreak: 'break-all' }}>{cb.url}</code>
          <button type="button" style={btnGhost} onClick={copy}><Copy size={12} /> Copy</button>
        </div>
        {!cb.https && <Notice tone={live ? 'bad' : 'warn'}>{live ? 'Live payments need an https address: Safaricom will not call back to http.' : 'This is not an https address; fine for the sandbox, not for live.'}</Notice>}
        {cb.local && <Notice tone="warn">This looks like a private or local address. Safaricom can not reach it from the internet: use a public address (or a tunnel) for payments to be confirmed.</Notice>}
        {!cb.token_set
          ? <Notice tone="warn">No callback token is set, so anyone could send a fake "paid" call to this address. (The system still asks Safaricom to confirm each payment before it counts, but save the keys here to make a token.)</Notice>
          : <p style={{ margin: 0, fontSize: '0.78rem' }}><CheckCircle size={13} style={{ verticalAlign: -2, color: '#047857' }} /> A callback token is set. {cb.previous_valid_until && <>The previous one still works until {when(cb.previous_valid_until)}.</>}</p>}
        {saved && <div><button type="button" style={btnGhost} disabled={!!busy} onClick={rotate}>{busy === 'rotate' ? 'Making…' : 'Make a new callback token'}</button></div>}
      </div>

      {(saved || !noKeys) && (
        <div style={{ ...card, padding: 20, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Prove it with a real KES 1 payment</h2>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Sends a payment prompt for KES 1 to your phone through the keys that are live now. If you can pay it, the shortcode, passkey and keys all work. The KES 1 is real money (it is paid to your shortcode).</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <TextInput aria-label="Your M-Pesa number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" style={{ maxWidth: 220 }} />
            <button type="button" style={btnGhost} disabled={!!busy || !phone.trim()} onClick={prompt}><Send size={13} /> {busy === 'prompt' ? 'Sending…' : 'Send the KES 1 prompt'}</button>
          </div>
        </div>
      )}
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
