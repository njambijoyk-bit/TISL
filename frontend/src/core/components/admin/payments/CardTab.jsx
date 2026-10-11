import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle, Copy, ExternalLink, KeyRound } from 'lucide-react';
import paymentSettingsAPI from '../../../../_shared/api/paymentSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, CheckboxRow } from '../ui/Form';
import SecretField from '../notifications/SecretField';
import usePasswordPrompt from './usePasswordPrompt';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

/**
 * One card provider (Stripe, Paystack, Flutterwave, Pesapal, DPO). The screen is drawn from what the server says the provider needs (`gateway.fields`), so a provider is
 * one backend class and no new screen. Same rules as M-Pesa: owner only, password for every change, the provider checks the key before it is saved, a blank key keeps the
 * saved one, every change is a version that can be rolled back and is emailed to the owners.
 */
export default function CardTab({ data, gateway, onChanged }) {
  const key = gateway.key;
  const saved = data.saved[key];
  const cfg = data.parts[key];
  const version = data.current_version[key];
  const secretKeys = gateway.fields.filter((f) => f.type === 'secret').map((f) => f.key);
  const [f, setF] = useState(() => Object.fromEntries(gateway.fields.filter((x) => x.type !== 'secret').map((x) => [x.key, cfg[x.key] ?? (x.type === 'toggle' ? false : '')])));
  const [secrets, setSecrets] = useState({});
  const [clear, setClear] = useState({});
  const [busy, setBusy] = useState(null);
  const [refused, setRefused] = useState(null);
  const [errors, setErrors] = useState({});
  const [ask, dialog] = usePasswordPrompt(data.confirm_with_password === false);
  const set = (k) => (v) => { setRefused(null); setF((x) => ({ ...x, [k]: v })); };
  const typed = () => Object.fromEntries(Object.entries(secrets).filter(([, v]) => v));
  const body = () => ({ ...f, ...typed(), clear: Object.entries(clear).filter(([, v]) => v).map(([k]) => k) });
  const live = f.env === 'live' || /^(sk|rk)_live_|^FLWSECK-(?!TEST)/.test(typed().secret_key ?? '');
  const needsAccount = f.enabled && !f.ledger_id;

  const save = async (anyway = false) => {
    const password = await ask(`Type your password to save the ${gateway.label} settings. Real customers' card payments will go through them.`);
    if (!password) return;
    setBusy('save'); setErrors({});
    try {
      const r = await paymentSettingsAPI.save(key, { ...body(), anyway, password });
      toast.success(r.message, { duration: 7000 }); setSecrets({}); setClear({}); setRefused(null); onChanged();
    } catch (err) {
      const v = err?.response?.data?.errors;
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, msg]) => [k, msg[0]])));
      if (err?.response?.status === 422 && !v && /Not saved/.test(errMsg(err, ''))) setRefused(errMsg(err, 'Not saved'));
      else toast.error(errMsg(err, 'Could not save'), { duration: 9000 });
    } finally { setBusy(null); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await paymentSettingsAPI.testCard(key, { ...f, ...typed() }); toast.success(r.message, { duration: 8000 }); }
    catch (err) { toast.error(errMsg(err, `${gateway.label} did not accept it`), { duration: 10000 }); } finally { setBusy(null); }
  };
  const reset = async () => {
    if (!window.confirm(`Remove the ${gateway.label} keys and stop offering it at checkout? The old settings stay in the history, so you can undo this.`)) return;
    const password = await ask(`Type your password to remove ${gateway.label}.`);
    if (!password) return;
    setBusy('reset');
    try { const r = await paymentSettingsAPI.reset(key, password); toast.success(r.message, { duration: 9000 }); onChanged(); }
    catch (err) { toast.error(errMsg(err, 'Could not remove')); } finally { setBusy(null); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(gateway.webhook_url); toast.success('Copied'); } catch { toast.error('Could not copy: select it and copy by hand'); } };

  const draw = (fld) => {
    const common = { key: fld.key };
    if (fld.type === 'secret') {
      return <SecretField {...common} label={fld.label} saved={cfg[fld.key]} value={secrets[fld.key] ?? ''} onChange={(v) => { setRefused(null); setSecrets((x) => ({ ...x, [fld.key]: v })); }}
        clearing={!!clear[fld.key]} onClear={(v) => setClear((x) => ({ ...x, [fld.key]: v }))} hint={fld.hint} error={errors[fld.key]} />;
    }
    if (fld.type === 'toggle') return <CheckboxRow {...common} checked={f[fld.key]} onChange={set(fld.key)} label={fld.label} description={fld.hint} />;
    if (fld.type === 'ledger') {
      return (
        <Field {...common} label={fld.label} hint={fld.hint} error={errors[fld.key]}>
          <SelectInput aria-label={fld.label} value={f[fld.key] ?? ''} onChange={(e) => set(fld.key)(e.target.value)}>
            <option value="">Choose an account…</option>
            {data.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectInput>
          {data.ledgers.length === 0 && <div style={{ marginTop: 4, fontSize: '0.7rem', color: colors.danger }}>There is no bank or cash account yet. Add one in Books → Ledgers (for example "{gateway.label} clearing", under Bank Accounts), then come back.</div>}
        </Field>
      );
    }
    if (fld.type === 'select') {
      return (
        <Field {...common} label={fld.label} hint={fld.hint} error={errors[fld.key]}>
          <SelectInput aria-label={fld.label} value={f[fld.key] ?? ''} onChange={(e) => set(fld.key)(e.target.value)}>{fld.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput>
        </Field>
      );
    }
    return <Field {...common} label={fld.label} hint={fld.hint} error={errors[fld.key]}><TextInput aria-label={fld.label} value={f[fld.key] ?? ''} onChange={(e) => set(fld.key)(e.target.value)} placeholder={fld.default ?? ''} /></Field>;
  };

  // the common fields first (offer it, name, account, currency), then the provider's own keys
  const order = ['enabled', 'label', 'ledger_id', 'charge_currency'];
  const common = order.map((k) => gateway.fields.find((x) => x.key === k)).filter(Boolean);
  const own = gateway.fields.filter((x) => !order.includes(x.key) && x.type !== 'toggle');
  const ownToggles = gateway.fields.filter((x) => !order.includes(x.key) && x.type === 'toggle');   // Link and the like: after the account and name, with the other choices

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      {dialog}
      {data.unreadable[key] && <Notice tone="bad">The saved {gateway.label} keys can no longer be read (the server's application key changed). Enter the keys again and save.</Notice>}
      {!saved
        ? <Notice tone="info"><strong>{gateway.label} is not set up.</strong> Follow the steps below, paste the keys, choose the account the money is booked into, switch it on and save.</Notice>
        : <Notice tone={f.enabled && gateway.ready ? 'good' : 'warn'}>
          {f.enabled && gateway.ready ? <>{gateway.label} is <strong>offered at checkout</strong> (version {version?.version_no}{version?.tested_ok === true ? `, ${gateway.label} accepted the key` : version?.tested_ok === false ? `, saved although ${gateway.label} did not accept the key` : ''}).</>
            : <>{gateway.label} is saved (version {version?.version_no}) but <strong>not offered</strong> at checkout{!cfg.enabled ? ': "Offer this at checkout" is off.' : '.'}</>}
        </Notice>}

      <div style={{ ...card, padding: 20, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Set up {gateway.label}</h2>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: colors.textMuted, display: 'grid', gap: 4 }}>{gateway.help.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {gateway.help.docs && <a href={gateway.help.docs} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: colors.primary, display: 'inline-flex', gap: 4, alignItems: 'center' }}>{gateway.label} documentation <ExternalLink size={11} /></a>}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textFaint, marginBottom: 4 }}>THIS SITE'S ADDRESS FOR {gateway.label.toUpperCase()}'S PAYMENT NEWS</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 8, background: colors.tint(0.06), wordBreak: 'break-all' }}>{gateway.webhook_url}</code>
            <button type="button" style={btnGhost} onClick={copy}><Copy size={12} /> Copy</button>
          </div>
          {!gateway.webhook_url.startsWith('https://') && <div style={{ marginTop: 6 }}><Notice tone="warn">This is not an https address. {gateway.label} will not call it for live payments: your site needs https.</Notice></div>}
        </div>
      </div>

      <div style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
        {own.map(draw)}
        {common.map(draw)}
        {ownToggles.map(draw)}
        {needsAccount && <Notice tone="warn">Choose the account the money is booked into before you switch {gateway.label} on. A dedicated account (for example "{gateway.label} clearing") is best: it is also how {gateway.label}'s payouts are matched to your bank later.</Notice>}
        {live && <Notice tone="warn">These look like <strong>live</strong> keys: customers' real card payments go through them.</Notice>}
        {refused && (
          <Notice tone="bad"><strong>{refused}</strong>
            <div style={{ marginTop: 8 }}><button type="button" style={btnGhost} disabled={!!busy} onClick={() => save(true)}>Save anyway, I am sure</button></div>
          </Notice>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnPrimary} disabled={!!busy} onClick={() => save(false)}><KeyRound size={13} /> {busy === 'save' ? 'Testing and saving…' : 'Test and save'}</button>
          <button type="button" style={btnGhost} disabled={!!busy || (!saved && secretKeys.every((k) => !secrets[k]))} onClick={test}>{busy === 'test' ? `Asking ${gateway.label}…` : 'Only test the keys'}</button>
          {saved && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={!!busy} onClick={reset}>Remove {gateway.label}</button>}
        </div>
        <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>
          "Test and save" asks {gateway.label} to check the keys first; if it says no, nothing changes. Keys are saved encrypted and never shown again. A card payment is only counted after we ask {gateway.label} whether it was really paid. Once saved, try one small real payment from the shop to prove the whole chain.
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
