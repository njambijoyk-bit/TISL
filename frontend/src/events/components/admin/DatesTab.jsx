import { useState } from 'react';
import { Plus, Repeat, Trash2 } from 'lucide-react';
import { CheckboxRow, Field, FormGrid, NumberInput, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { blankSession } from '../../lib/eventForm';
import { toInput } from '../../lib/eventFormat';
import RepeatDialog from './RepeatDialog';

const minutesBetween = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : 0);

/** The dates of the event: one for a single date, many for a multi-day or repeating event. */
export default function DatesTab({ sessions, onChange, locked = false, readOnly = false }) {
  const [repeat, setRepeat] = useState(false);
  const first = sessions[0];
  const edit = (key, patch) => onChange(sessions.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  // an empty first row (a new event starts with one) makes way for the dates the repeat makes
  const addMany = (dates) => {
    onChange([...sessions.filter((s) => s.starts_at || s.id), ...dates.map((d) => blankSession({ starts_at: toInput(d.starts_at), ends_at: toInput(d.ends_at) }))]);
    setRepeat(false);
  };
  // the next date starts a day after the last one, at the same time
  const addOne = () => {
    const last = sessions[sessions.length - 1];
    const day = (v) => (v ? toInput(new Date(new Date(v).getTime() + 86400000)) : '');
    onChange([...sessions, blankSession(last?.starts_at ? { starts_at: day(last.starts_at), ends_at: day(last.ends_at) } : {})]);
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>
        One date for a single event. Add more for a festival or a course, or use "Repeat" for "every Saturday". A date can have its own limit on how many people it holds.
        {locked && ' Dates that people already have tickets for can be changed but not deleted: mark them cancelled instead.'}
      </p>
      {sessions.length === 0 && <p style={{ ...card, padding: 16, margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No dates yet.</p>}
      {sessions.map((s, i) => (
        <div key={s.key} style={{ ...card, padding: 14, display: 'grid', gap: 10, opacity: s.is_cancelled ? 0.7 : 1 }}>
          <FormGrid min={170}>
            <Field label={sessions.length > 1 ? `Date ${i + 1} starts` : 'Starts'} htmlFor={`s-st-${s.key}`}><TextInput id={`s-st-${s.key}`} type="datetime-local" value={s.starts_at} disabled={readOnly} onChange={(e) => edit(s.key, { starts_at: e.target.value })} /></Field>
            <Field label="Ends" htmlFor={`s-en-${s.key}`}><TextInput id={`s-en-${s.key}`} type="datetime-local" value={s.ends_at} disabled={readOnly} onChange={(e) => edit(s.key, { ends_at: e.target.value })} /></Field>
            <Field label="Name (optional)" htmlFor={`s-la-${s.key}`}><TextInput id={`s-la-${s.key}`} value={s.label} maxLength={120} placeholder="Day 1, Saturday show…" disabled={readOnly} onChange={(e) => edit(s.key, { label: e.target.value })} /></Field>
            <Field label="Holds at most" htmlFor={`s-ca-${s.key}`}><NumberInput id={`s-ca-${s.key}`} min={1} value={s.capacity} placeholder="No limit" disabled={readOnly} onChange={(e) => edit(s.key, { capacity: e.target.value })} /></Field>
          </FormGrid>
          {!readOnly && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <CheckboxRow checked={s.is_cancelled} onChange={(v) => edit(s.key, { is_cancelled: v })} label="This date is cancelled" description="Nobody can buy it, and its tickets are not valid." />
              <button type="button" style={{ ...btnGhost, color: colors.danger, padding: '5px 10px', fontSize: '0.76rem' }} onClick={() => onChange(sessions.filter((x) => x.key !== s.key))} aria-label={`Remove date ${i + 1}`}><Trash2 size={13} /> Remove</button>
            </div>
          )}
        </div>
      ))}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnGhost} onClick={addOne}><Plus size={14} /> Add a date</button>
          <button type="button" style={btnGhost} onClick={() => setRepeat(true)}><Repeat size={14} /> Repeat…</button>
        </div>
      )}
      {repeat && <RepeatDialog taken={sessions.map((s) => s.starts_at)} start={first?.starts_at ?? ''} minutes={first ? minutesBetween(first.starts_at, first.ends_at) || '' : ''} onAdd={addMany} onClose={() => setRepeat(false)} />}
    </div>
  );
}
