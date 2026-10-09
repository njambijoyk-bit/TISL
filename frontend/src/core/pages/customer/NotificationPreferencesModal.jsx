import { useEffect, useState } from 'react';
import { X, MessageCircle, Mail, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import notificationPreferencesAPI from '../../../_shared/api/notificationPreferences';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const WAYS = [
  ['default', 'Follow the shop', 'We use the way the shop has chosen.'],
  ['email', 'Email only', 'Never WhatsApp.'],
  ['whatsapp', 'WhatsApp', 'On your WhatsApp number.'],
  ['both', 'Email and WhatsApp', 'Both, so nothing is missed.'],
];
const SHOP_WAY = { email: 'email only', whatsapp: 'WhatsApp only', both: 'email and WhatsApp' };

/** Profile → Notification settings. How the customer wants to be reached, and which WhatsApp number to use. */
export default function NotificationPreferencesModal({ open, onClose }) {
  const [p, setP] = useState(null);
  const [mode, setMode] = useState('default');
  const [essential, setEssential] = useState('default');   // 'default' | 'yes' | 'no'
  const [number, setNumber] = useState('');
  const [remind, setRemind] = useState({ cart: true, price: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});

  useEffect(() => {
    if (!open) return;
    notificationPreferencesAPI.show().then((r) => {
      setP(r); setMode(r.mode ?? 'default'); setNumber(r.whatsapp ?? ''); setRemind({ cart: r.reminders?.cart ?? true, price: r.reminders?.price ?? true });
      setEssential(r.essential_only === null ? 'default' : r.essential_only ? 'yes' : 'no');
    }).catch((e) => toast.error(errMsg(e, 'Could not load your notification settings')));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try {
      const r = await notificationPreferencesAPI.save({ mode, essential_only: essential === 'default' ? null : essential === 'yes', whatsapp: number, ...(p?.reminders ? { remind_cart: remind.cart, remind_price: remind.price } : {}) });
      setP(r.data); toast.success('Saved'); onClose();
    } catch (ex) {
      const v = ex?.response?.data?.errors;
      if (v) setErr(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]]))); else toast.error(errMsg(ex, 'Could not save'));
    } finally { setBusy(false); }
  };

  const wantsWhatsApp = mode === 'whatsapp' || mode === 'both' || (mode === 'default' && p?.company.default_mode !== 'email');
  const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #e5e7eb)', background: 'var(--surface-input, #fff)', fontFamily: 'inherit', fontSize: '0.9rem' };

  return (
    <div role="dialog" aria-modal="true" aria-label="Notification settings" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface-card, #fff)', borderRadius: 16, padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={18} />
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>Notification settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>

        {!p ? <p style={{ margin: 0, color: '#6b7280' }}>Loading…</p> : !p.ready ? <p style={{ margin: 0, color: '#6b7280' }}>Notification settings are not available yet.</p> : (
          <>
            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              <legend style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>How should we reach you about your orders?</legend>
              {WAYS.map(([id, label, text]) => (
                <label key={id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${mode === id ? 'var(--color-primary-500)' : 'var(--line, #e5e7eb)'}` }}>
                  <input type="radio" name="way" checked={mode === id} onChange={() => setMode(id)} style={{ marginTop: 3, accentColor: 'var(--color-primary-500)' }} />
                  <span><strong style={{ fontSize: '0.88rem' }}>{label}</strong>
                    <span style={{ display: 'block', fontSize: '0.76rem', color: '#6b7280' }}>{id === 'default' ? `${text} Right now that is ${SHOP_WAY[p.company.default_mode]}.` : text}</span></span>
                </label>
              ))}
            </fieldset>

            {wantsWhatsApp && (
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', gap: 6, alignItems: 'center' }}><MessageCircle size={14} /> Your WhatsApp number</span>
                <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+254 712 345 678" inputMode="tel" style={field} aria-invalid={!!err.whatsapp} />
                {err.whatsapp ? <span role="alert" style={{ fontSize: '0.76rem', color: '#b91c1c' }}>{err.whatsapp}</span>
                  : <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>With the country code. We use it only to tell you about your orders and to answer you.{!p.company.whatsapp_enabled && ' The shop is not sending WhatsApp messages yet, so you will get email for now.'}</span>}
              </label>
            )}

            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              <legend style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>Which messages?</legend>
              {[['default', `Follow the shop (${p.company.essential_only_default ? 'essential messages only' : 'everything'})`], ['yes', 'Only the essentials: orders, payments, refunds, delays'], ['no', 'Everything, including offers and updates']].map(([id, label]) => (
                <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}>
                  <input type="radio" name="which" checked={essential === id} onChange={() => setEssential(id)} style={{ accentColor: 'var(--color-primary-500)' }} /> {label}
                </label>
              ))}
            </fieldset>

            {p.reminders && (p.reminders.company.cart || p.reminders.company.price) && (
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                <legend style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>Reminders from the shop</legend>
                {p.reminders.company.cart && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={remind.cart} onChange={(e) => setRemind((r) => ({ ...r, cart: e.target.checked }))} style={{ accentColor: 'var(--color-primary-500)' }} /> Remind me about items I left in my cart
                  </label>
                )}
                {p.reminders.company.price && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={remind.price} onChange={(e) => setRemind((r) => ({ ...r, price: e.target.checked }))} style={{ accentColor: 'var(--color-primary-500)' }} /> Tell me when something I saved gets cheaper
                  </label>
                )}
                <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Sent by email. If you chose “only the essentials” above, these stay in your notifications here instead.</span>
              </fieldset>
            )}

            <p style={{ margin: 0, fontSize: '0.78rem', color: '#374151', background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)', padding: '9px 12px', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Mail size={13} /> An order update would reach you by {[p.now.email && 'email', p.now.whatsapp && 'WhatsApp'].filter(Boolean).join(' and ') || 'the bell here only'}
              {p.whatsapp_since && p.whatsapp ? ` (WhatsApp number saved ${p.whatsapp_since.slice(0, 10)})` : ''}.
              <span style={{ color: '#6b7280' }}>This is based on what is saved, so save to update it.</span>
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--line, #e5e7eb)', background: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--color-primary-500)', color: 'white', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
