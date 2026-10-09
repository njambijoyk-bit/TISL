import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle, Copy, Send } from 'lucide-react';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, FormGrid, CheckboxRow } from '../ui/Form';
import SecretField from './SecretField';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Copied')).catch(() => toast.error('Could not copy'));

/**
 * Automatic WhatsApp sending through Meta's Cloud API or Twilio. The keys are entered here, saved encrypted and never shown again. Saving first asks the provider
 * whether the keys work; if not, nothing changes (unless "Save anyway"). A message type goes out automatically only when it has an approved template (Messages tab);
 * everything else, and anything the API fails to send, waits in "WhatsApp to send" for a person.
 */
export default function WhatsAppApiTab({ data, canEdit, canSend, onChanged }) {
  const w = data.parts.whatsapp;
  const info = data.whatsapp_api;
  const saved = data.saved.whatsapp;
  const [f, setF] = useState({ provider: w.provider ?? '', auto: !!w.auto, language: w.language || 'en',
    meta: { phone_number_id: w.meta.phone_number_id, business_account_id: w.meta.business_account_id },
    twilio: { account_sid: w.twilio.account_sid, from: w.twilio.from, messaging_service_sid: w.twilio.messaging_service_sid } });
  const [secrets, setSecrets] = useState({ 'meta.access_token': '', 'meta.app_secret': '', 'meta.verify_token': '', 'twilio.auth_token': '' });
  const [clearing, setClearing] = useState({});
  const [busy, setBusy] = useState(null);
  const [refused, setRefused] = useState(null);
  const [test, setTest] = useState({ to: '', template: '' });
  const [testResult, setTestResult] = useState(null);

  const setTop = (k, v) => { setRefused(null); setF((x) => ({ ...x, [k]: v })); };
  const setSub = (p, k, v) => { setRefused(null); setF((x) => ({ ...x, [p]: { ...x[p], [k]: v } })); };
  const secret = (path) => ({ value: secrets[path], onChange: (v) => { setRefused(null); setSecrets((s) => ({ ...s, [path]: v })); }, clearing: !!clearing[path], onClear: (v) => setClearing((c) => ({ ...c, [path]: v })) });

  const body = () => {
    const out = { provider: f.provider || null, auto: f.auto, language: f.language, meta: { ...f.meta }, twilio: { ...f.twilio }, clear: Object.keys(clearing).filter((k) => clearing[k]) };
    Object.entries(secrets).forEach(([path, val]) => { if (val) { const [a, b] = path.split('.'); out[a][b] = val; } });
    return out;
  };
  const save = async (anyway = false) => {
    setBusy('save');
    try {
      const r = await notificationSettingsAPI.save('whatsapp', { ...body(), anyway });
      toast.success(r.message, { duration: 7000 }); setSecrets({ 'meta.access_token': '', 'meta.app_secret': '', 'meta.verify_token': '', 'twilio.auth_token': '' }); setClearing({}); setRefused(null); onChanged();
    } catch (err) {
      if (err?.response?.status === 422 && !err.response.data.errors) setRefused(errMsg(err, 'Not saved')); else toast.error(errMsg(err, 'Could not save'), { duration: 8000 });
    } finally { setBusy(null); }
  };
  const sendTest = async () => {
    setBusy('test'); setTestResult(null);
    try { const r = await notificationSettingsAPI.testWhatsApp(test); setTestResult({ ok: true, text: r.message }); onChanged(); }
    catch (err) { setTestResult({ ok: false, text: errMsg(err, 'The test message failed') }); } finally { setBusy(null); }
  };
  const reset = async () => {
    if (!window.confirm('Remove the WhatsApp provider settings? Messages will wait in the "WhatsApp to send" list again. You can undo this from the history.')) return;
    setBusy('reset');
    try { const r = await notificationSettingsAPI.reset('whatsapp'); toast.success(r.message); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'Could not clear')); } finally { setBusy(null); }
  };

  const ro = !canEdit;
  const v = data.current_version.whatsapp;
  const generalOn = data.parts.general.whatsapp_enabled;

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 780 }}>
      {data.unreadable.whatsapp && <Notice tone="bad">The saved WhatsApp keys can no longer be read (the server's application key changed). Enter the keys again and save.</Notice>}
      {!saved ? <Notice tone="info">No provider is set up, so WhatsApp messages wait in the <strong>WhatsApp to send</strong> list for staff to send in one tap. Set one up below to send them automatically.</Notice>
        : info.automatic ? <Notice tone="good">Automatic sending is <strong>on</strong>{v ? ` (version ${v.version_no})` : ''}. {info.types_ready > 0 ? `${info.types_ready} message type${info.types_ready === 1 ? ' has' : 's have'} an approved template and goes out by itself; the rest wait for a person.` : 'No message type has a template yet, so nothing goes out automatically: add templates in the Messages tab.'}</Notice>
          : <Notice tone="warn">Keys are saved but automatic sending is <strong>off</strong>{!generalOn ? ' (WhatsApp is switched off in General)' : !f.auto ? ' (the switch below is off)' : ''}. Messages wait in the “WhatsApp to send” list.</Notice>}

      <div style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
        <FormGrid min={240}>
          <Field label="Provider"><SelectInput aria-label="Provider" value={f.provider} onChange={(e) => setTop('provider', e.target.value)} disabled={ro}>
            <option value="">None (staff send by hand)</option>{Object.entries(info.providers).map(([k, name]) => <option key={k} value={k}>{name}</option>)}</SelectInput></Field>
          <Field label="Template language" hint="The language code your templates were approved in, for example en, en_US or sw."><TextInput aria-label="Template language" value={f.language} onChange={(e) => setTop('language', e.target.value)} disabled={ro} /></Field>
        </FormGrid>
        <CheckboxRow checked={f.auto} disabled={ro} onChange={(val) => setTop('auto', val)} label="Send automatically" description="Off keeps everything in the “WhatsApp to send” list, even with keys saved. It also needs “Use WhatsApp” on in General." />

        {f.provider === 'meta' && (
          <>
            <FormGrid min={240}>
              <Field label="Phone number ID"><TextInput aria-label="Phone number ID" value={f.meta.phone_number_id} onChange={(e) => setSub('meta', 'phone_number_id', e.target.value)} disabled={ro} autoComplete="off" /></Field>
              <Field label="WhatsApp business account ID"><TextInput aria-label="WhatsApp business account ID" value={f.meta.business_account_id} onChange={(e) => setSub('meta', 'business_account_id', e.target.value)} disabled={ro} autoComplete="off" /></Field>
            </FormGrid>
            <SecretField label="Access token" saved={w.meta.access_token} {...secret('meta.access_token')} hint="A permanent token from a Meta system user with the whatsapp_business_messaging permission." />
            <SecretField label="App secret" saved={w.meta.app_secret} {...secret('meta.app_secret')} hint="Used to check that delivery reports really come from Meta." />
            <SecretField label="Webhook verify token" saved={w.meta.verify_token} {...secret('meta.verify_token')} hint="Make one up (any long random text). Paste the same text into Meta's webhook setup." />
            <Webhook label="Callback URL to paste into Meta (WhatsApp → Configuration → Webhook)" url={info.webhooks.meta} />
          </>
        )}
        {f.provider === 'twilio' && (
          <>
            <FormGrid min={240}>
              <Field label="Account SID"><TextInput aria-label="Account SID" value={f.twilio.account_sid} onChange={(e) => setSub('twilio', 'account_sid', e.target.value)} disabled={ro} autoComplete="off" placeholder="AC…" /></Field>
              <Field label="WhatsApp sender" hint="Your approved number, with the plus, for example +14155238886."><TextInput aria-label="WhatsApp sender" value={f.twilio.from} onChange={(e) => setSub('twilio', 'from', e.target.value)} disabled={ro} /></Field>
              <Field label="Messaging service SID (optional)" hint="If you use one, it is used instead of the sender."><TextInput aria-label="Messaging service SID (optional)" value={f.twilio.messaging_service_sid} onChange={(e) => setSub('twilio', 'messaging_service_sid', e.target.value)} disabled={ro} placeholder="MG…" /></Field>
            </FormGrid>
            <SecretField label="Auth token" saved={w.twilio.auth_token} {...secret('twilio.auth_token')} hint="Also used to check that delivery reports really come from Twilio. For templates, put the Content SID (HX…) in the Messages tab." />
            <Webhook label="Status callback URL (sent with every message automatically; nothing to paste)" url={info.webhooks.twilio} />
          </>
        )}

        {refused && (
          <Notice tone="bad"><strong>Not saved.</strong> {refused}
            {canEdit && <div style={{ marginTop: 8 }}><button type="button" style={btnGhost} disabled={!!busy} onClick={() => save(true)}>Save anyway, I am sure</button></div>}
          </Notice>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'Checking and saving…' : f.provider ? 'Check keys and save' : 'Save'}</button>}
          {canEdit && saved && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={!!busy} onClick={reset}>Remove provider settings</button>}
        </div>
        <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>“Check keys and save” asks {f.provider ? (info.providers[f.provider] ?? 'the provider') : 'the provider'} whether the keys work. If it says no, nothing changes. Every save is a version you can roll back from the history; old keys are kept there and only the owner can delete them.</p>
      </div>

      {saved && canSend && (
        <div style={{ ...card, padding: 20, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Send a test message</h2>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Sends one real approved template through the saved keys to a number you type. {f.provider === 'meta' ? 'Meta gives every account a template called hello_world.' : 'For Twilio use a Content SID (HX…).'} It is recorded in the history.</p>
          <FormGrid min={220}>
            <Field label="Number"><TextInput aria-label="Number" value={test.to} onChange={(e) => setTest((t) => ({ ...t, to: e.target.value }))} placeholder="+254 712 345 678" /></Field>
            <Field label="Template"><TextInput aria-label="Template" value={test.template} onChange={(e) => setTest((t) => ({ ...t, template: e.target.value }))} placeholder={f.provider === 'twilio' ? 'HX…' : 'hello_world'} /></Field>
          </FormGrid>
          <div><button type="button" style={btnGhost} disabled={!!busy || !test.to || !test.template} onClick={sendTest}><Send size={13} /> {busy === 'test' ? 'Sending…' : 'Send test'}</button></div>
          {testResult && <Notice tone={testResult.ok ? 'good' : 'bad'}>{testResult.text}</Notice>}
        </div>
      )}
    </div>
  );
}

function Webhook({ label, url }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: colors.tint(0.05), fontSize: '0.76rem', overflowWrap: 'anywhere' }}>{url}</code>
        <button type="button" style={btnGhost} onClick={() => copy(url)} aria-label="Copy the address"><Copy size={13} /></button>
      </div>
    </Field>
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
