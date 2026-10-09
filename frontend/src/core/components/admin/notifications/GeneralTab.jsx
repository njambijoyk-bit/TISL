import { useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { CheckboxRow } from '../ui/Form';
import { btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/** The switches that apply to every message. Each change is a version in the history and can be rolled back. */
export default function GeneralTab({ data, canEdit, onChanged }) {
  const g = data.parts.general;
  const [f, setF] = useState({ email_enabled: !!g.email_enabled, essential_only_default: !!g.essential_only_default });
  const [busy, setBusy] = useState(false);
  const dirty = f.email_enabled !== !!g.email_enabled || f.essential_only_default !== !!g.essential_only_default;

  const save = async () => {
    setBusy(true);
    try { const r = await notificationSettingsAPI.save('general', f); toast.success(r.message); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, padding: 20, display: 'grid', gap: 16, maxWidth: 640 }}>
      <CheckboxRow checked={f.email_enabled} disabled={!canEdit} onChange={(v) => setF((x) => ({ ...x, email_enabled: v }))}
        label="Send emails" description="Switch off to stop every email from the notification system. In-app notifications (the bell) keep working." />
      <CheckboxRow checked={f.essential_only_default} disabled={!canEdit} onChange={(v) => setF((x) => ({ ...x, essential_only_default: v }))}
        label="Customers get essential messages only, unless they choose otherwise"
        description="Essential: orders, payments, refunds, cancellations and delays. Offers and updates stay in the bell. A customer can change this in their profile." />
      {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: dirty ? 1 : 0.5 }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
      <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>WhatsApp and the default way to reach customers (email, WhatsApp or both) come with the next part of the notification system.</p>
    </div>
  );
}
