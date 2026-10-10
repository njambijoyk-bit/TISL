import { useState } from 'react';
import toast from 'react-hot-toast';
import eventsAPI from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormGrid, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, colors } from '../../../_shared/theme/tokens';
import { whenText } from '../../lib/eventFormat';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every Saturday at 10 for 8 weeks": makes the dates, shows them, and adds them to the event only when the staff member says so. */
export default function RepeatDialog({ start, minutes, taken = [], onAdd, onClose }) {
  const [rule, setRule] = useState({ start: start || '', minutes: minutes || '', repeat: 'weekly', every: 1, weekdays: [], stop: 'count', until: '', count: 8 });
  const [dates, setDates] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setRule((r) => ({ ...r, [k]: e.target.value })); setDates(null); };
  const toggleDay = (d) => { setRule((r) => ({ ...r, weekdays: r.weekdays.includes(d) ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d] })); setDates(null); };

  const preview = async () => {
    setBusy(true);
    try {
      const body = { start: rule.start, repeat: rule.repeat, every: Number(rule.every) || 1 };
      if (rule.minutes !== '') body.minutes = Number(rule.minutes);
      if (rule.repeat === 'weekly' && rule.weekdays.length) body.weekdays = rule.weekdays;
      if (rule.stop === 'count') body.count = Number(rule.count); else body.until = rule.until;
      setDates((await eventsAPI.recurrence(body)).dates);
    } catch (e) { toast.error(errMsg(e, 'Could not make the dates'), { duration: 8000 }); } finally { setBusy(false); }
  };

  // a date the event already has (the first one, usually) is not added twice
  const fresh = dates ? dates.filter((d) => !taken.includes(d.starts_at.slice(0, 16).replace(' ', 'T'))) : [];
  const unit = { daily: 'days', weekly: 'weeks', monthly: 'months' }[rule.repeat];

  return (
    <Modal title="Repeat" subtitle="Make many dates at once. You can still change or remove any of them afterwards." width={560} onClose={onClose}
      footer={<ModalActions onCancel={onClose} submitLabel={dates ? `Add ${fresh.length} date${fresh.length === 1 ? '' : 's'}` : 'Show the dates'} busy={busy} disabled={!rule.start || (dates && !fresh.length)}
        onSubmit={dates ? () => onAdd(fresh) : preview} busyLabel="Working…" />}>
      <FormStack>
        <FormGrid min={200}>
          <Field label="First date and time" htmlFor="rp-start"><TextInput id="rp-start" type="datetime-local" value={rule.start} onChange={set('start')} /></Field>
          <Field label="Each lasts (minutes)" htmlFor="rp-min" hint="Leave empty if there is no end time."><NumberInput id="rp-min" min={1} value={rule.minutes} onChange={set('minutes')} /></Field>
        </FormGrid>
        <FormGrid min={200}>
          <Field label="Repeat" htmlFor="rp-rep">
            <SelectInput id="rp-rep" value={rule.repeat} onChange={set('repeat')}><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></SelectInput>
          </Field>
          <Field label={`Every how many ${unit}`} htmlFor="rp-every"><NumberInput id="rp-every" min={1} max={12} value={rule.every} onChange={set('every')} /></Field>
        </FormGrid>
        {rule.repeat === 'weekly' && (
          <Field label="On these days" hint="Leave all off to use the day of the first date.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map((n, d) => (
                <button key={n} type="button" aria-pressed={rule.weekdays.includes(d)} onClick={() => toggleDay(d)}
                  style={{ ...btnGhost, padding: '5px 11px', fontSize: '0.76rem', ...(rule.weekdays.includes(d) ? { background: colors.tint(0.14), border: `1.5px solid ${colors.primary}`, color: colors.primaryDeep } : {}) }}>{n}</button>
              ))}
            </div>
          </Field>
        )}
        <FormGrid min={200}>
          <Field label="It stops" htmlFor="rp-stop"><SelectInput id="rp-stop" value={rule.stop} onChange={set('stop')}><option value="count">After a number of dates</option><option value="until">On a last date</option></SelectInput></Field>
          {rule.stop === 'count'
            ? <Field label="How many dates" htmlFor="rp-count" hint="Up to 100."><NumberInput id="rp-count" min={1} max={100} value={rule.count} onChange={set('count')} /></Field>
            : <Field label="Last date" htmlFor="rp-until"><TextInput id="rp-until" type="date" value={rule.until} onChange={set('until')} /></Field>}
        </FormGrid>
        {dates && (
          <div style={{ borderTop: `1px solid ${colors.tint(0.1)}`, paddingTop: 12 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700 }}>{dates.length} date{dates.length === 1 ? '' : 's'}</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: colors.textBody, maxHeight: 180, overflowY: 'auto' }}>
              {dates.map((d) => <li key={d.starts_at}>{whenText(d.starts_at)}{d.ends_at ? ` – ${d.ends_at.slice(11, 16)}` : ''}{fresh.includes(d) ? '' : ' (already in the list)'}</li>)}
            </ul>
          </div>
        )}
      </FormStack>
    </Modal>
  );
}
