import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import eventsAPI from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { Field, NumberInput, TextInput, FormGrid, FormStack } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';

/** Events → Settings: how long seats are kept for someone who has not paid, the reminder time, the income account tickets are booked to when an event names none, and a line for every ticket. */
export default function EventSettingsTab({ canEdit }) {
  const [s, setS] = useState(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { eventsAPI.settings().then((r) => { setS(r.settings); setReady(r.ready); }).catch((e) => toast.error(errMsg(e, 'Could not load the settings'))); }, []);
  if (!s) return <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p>;

  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try { const r = await eventsAPI.saveSettings({ hold_minutes: Number(s.hold_minutes), reminder_hours: Number(s.reminder_hours), sales_ledger_id: s.sales_ledger_id || null, ticket_note: s.ticket_note ?? '' }); setS(r.settings); toast.success('Saved'); }
    catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, padding: 20, maxWidth: 760 }}>
      {!ready && <p role="status" style={{ margin: '0 0 14px', fontSize: '0.8rem', color: colors.textMuted }}>Run database script 120_events.sql first: until then these settings can be read but not saved.</p>}
      <FormStack gap={18}>
        <FormGrid min={220}>
          <Field label="Keep seats for an unpaid buyer (minutes)" htmlFor="ev-hold" hint="5 to 120. After this the seats go back on sale.">
            <NumberInput id="ev-hold" min={5} max={120} value={s.hold_minutes} onChange={set('hold_minutes')} disabled={!canEdit} />
          </Field>
          <Field label="Reminder goes this many hours before" htmlFor="ev-rem" hint="1 to 168. The reminder is emailed to every ticket holder.">
            <NumberInput id="ev-rem" min={1} max={168} value={s.reminder_hours} onChange={set('reminder_hours')} disabled={!canEdit} />
          </Field>
        </FormGrid>
        <SalesAccountSelect kind="sales" scope="service" label="Income account for ticket sales" value={s.sales_ledger_id} disabled={!canEdit}
          onChange={(v) => setS((x) => ({ ...x, sales_ledger_id: v }))}
          hint="Used for every event that does not name its own. The account decides the tax on tickets." />
        <Field label="A line printed on every ticket" htmlFor="ev-note" hint="For example: Doors open one hour before. Bring a photo ID.">
          <TextInput id="ev-note" maxLength={300} value={s.ticket_note ?? ''} onChange={set('ticket_note')} disabled={!canEdit} />
        </Field>
        {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>}
      </FormStack>
    </div>
  );
}
