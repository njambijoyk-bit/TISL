import { useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { CheckboxRow, Field, NumberInput, SelectInput } from '../ui/Form';
import { btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const FIELDS = ['email_enabled', 'whatsapp_enabled', 'essential_only_default', 'default_mode', 'whatsapp_number_sources', 'back_in_stock_enabled', 'back_in_stock_mode', 'back_in_stock_hold_hours'];

/** The company's defaults: how customers are reached unless they choose otherwise, the switches, and which WhatsApp numbers count. Each change is a version in the history. */
export default function GeneralTab({ data, canEdit, onChanged }) {
  const g = data.parts.general;
  const start = { email_enabled: !!g.email_enabled, whatsapp_enabled: !!g.whatsapp_enabled, essential_only_default: !!g.essential_only_default, default_mode: g.default_mode, whatsapp_number_sources: g.whatsapp_number_sources,
    back_in_stock_enabled: !!g.back_in_stock_enabled, back_in_stock_mode: g.back_in_stock_mode, back_in_stock_hold_hours: Number(g.back_in_stock_hold_hours) || 24 };
  const [f, setF] = useState(start);
  const [busy, setBusy] = useState(false);
  const dirty = FIELDS.some((k) => f[k] !== start[k]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try { const r = await notificationSettingsAPI.save('general', f); toast.success(r.message); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 680 }}>
      <div style={{ ...card, padding: 20, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Channels</h2>
        <CheckboxRow checked={f.email_enabled} disabled={!canEdit} onChange={set('email_enabled')}
          label="Send emails" description="Switch off to stop every email from the notification system. The bell keeps working." />
        <CheckboxRow checked={f.whatsapp_enabled} disabled={!canEdit} onChange={set('whatsapp_enabled')}
          label="Use WhatsApp" description="Messages for WhatsApp wait in the “WhatsApp to send” list for staff to send in one tap. Automatic sending comes with the WhatsApp API settings." />
      </div>

      <div style={{ ...card, padding: 20, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>How customers are reached</h2>
        <Field label="Default way" hint="Customers can choose their own in Profile → Notification settings. “Both” sends the email and the WhatsApp message.">
          <SelectInput value={f.default_mode} onChange={(e) => set('default_mode')(e.target.value)} disabled={!canEdit}>
            <option value="both">Email and WhatsApp</option><option value="email">Email only</option><option value="whatsapp">WhatsApp only</option>
          </SelectInput>
        </Field>
        <Field label="Which WhatsApp numbers count" hint="A number from a source that counts is taken as willingness to get updates on WhatsApp. A customer who chooses “email only” is never sent WhatsApp.">
          <SelectInput value={f.whatsapp_number_sources} onChange={(e) => set('whatsapp_number_sources')(e.target.value)} disabled={!canEdit}>
            <option value="both">The profile number and the number given at checkout</option><option value="profile">Only the number on their profile</option><option value="checkout">Only the number given at checkout</option>
          </SelectInput>
        </Field>
        <CheckboxRow checked={f.essential_only_default} disabled={!canEdit} onChange={set('essential_only_default')}
          label="Customers get essential messages only, unless they choose otherwise"
          description="Essential: orders, payments, refunds, cancellations and delays. Offers and updates stay in the bell." />
      </div>

      <div style={{ ...card, padding: 20, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Back-in-stock alerts</h2>
        <CheckboxRow checked={f.back_in_stock_enabled} disabled={!canEdit} onChange={set('back_in_stock_enabled')}
          label="Let customers ask to be told when a product is back"
          description="Shows “Email me when it is back in stock” on an out-of-stock product. Anyone with an email address can ask; they reach people the same way as every other message." />
        <Field label="When stock arrives" hint="Staff can always tell people by hand, for one product at a time, under Stock alerts.">
          <SelectInput value={f.back_in_stock_mode} onChange={(e) => set('back_in_stock_mode')(e.target.value)} disabled={!canEdit}>
            <option value="stock">Tell as many people as there is stock, first come first served</option>
            <option value="all">Tell everyone who is waiting</option>
            <option value="manual">Do not tell anyone on its own: staff do it</option>
          </SelectInput>
        </Field>
        {f.back_in_stock_mode === 'stock' && (
          <Field label="Hours people told count against the stock" hint="Someone told this recently is assumed to be about to buy, so a stray return or a small top-up does not tell another batch while the first is still deciding.">
            <NumberInput min={1} max={168} value={f.back_in_stock_hold_hours} onChange={(e) => set('back_in_stock_hold_hours')(Math.max(1, Math.min(168, Number(e.target.value) || 24)))} disabled={!canEdit} style={{ width: 120 }} />
          </Field>
        )}
      </div>
      {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: dirty ? 1 : 0.5 }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
      {!f.whatsapp_enabled && f.default_mode !== 'email' && <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>WhatsApp is switched off, so customers are reached by email for now.</p>}
    </div>
  );
}
