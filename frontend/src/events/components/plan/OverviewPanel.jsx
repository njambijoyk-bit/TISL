import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { eventsPlanAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { Field, FormGrid, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const Stat = ({ label, value, tone }) => <div style={{ ...card, padding: 14 }}><div style={{ fontSize: '1.5rem', fontWeight: 900, color: tone }}>{value}</div><div style={{ fontSize: '0.74rem', color: colors.textMuted }}>{label}</div></div>;

/** The workspace at a glance: tasks, next milestone, money, bookings and guests, and the button that fills an empty plan from a template. */
export default function OverviewPanel({ eventId, canEdit, onChanged }) {
  const [o, setO] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tpl, setTpl] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => eventsPlanAPI.overview(eventId).then(setO).catch((e) => toast.error(errMsg(e, 'Could not load the overview')));
  useEffect(() => { load(); eventsPlanAPI.templates().then(setTemplates).catch(() => {}); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async () => {
    setBusy(true);
    try { const r = await eventsPlanAPI.applyTemplate(eventId, Number(tpl), date); toast.success(`${r.message} (${r.made.tasks} tasks, ${r.made.budget} budget lines)`); load(); onChanged?.(); } catch (e) { toast.error(errMsg(e, 'Could not use the template'), { duration: 8000 }); } finally { setBusy(false); }
  };
  if (!o) return <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>Loading…</p>;
  const t = o.tasks; const b = o.budget;
  const pct = t.total ? Math.round(t.done / t.total * 100) : 0;
  const money = (n) => Number(n).toLocaleString();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Stat label="Tasks done" value={`${t.done} / ${t.total}`} />
        <Stat label="Late tasks" value={t.late} tone={t.late ? colors.danger : undefined} />
        <Stat label="Vendors and venues" value={o.bookings} />
        {o.guests && <Stat label="Guests coming" value={`${o.guests.yes} of ${o.guests.total}`} />}
        <Stat label="Team" value={o.team} />
        {b && <Stat label="Budget left" value={money(b.remaining)} tone={b.warning === 'over' ? colors.danger : b.warning === 'near' ? colors.warningText : undefined} />}
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress" style={{ height: 8, borderRadius: 999, background: colors.tint(0.12), overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#047857' }} /></div>
      {b?.warning && <p role="status" style={{ ...card, padding: 12, margin: 0, fontSize: '0.84rem', background: colors.warningBg, color: colors.warningText }}>{b.warning === 'over' ? 'Spending is over the approved budget.' : 'Spending is within 10% of the approved budget.'}</p>}
      {o.next_milestone && <p style={{ margin: 0, fontSize: '0.86rem' }}>Next milestone: <strong>{o.next_milestone.title}</strong>{o.next_milestone.due_on ? ` · ${o.next_milestone.due_on}` : ''}</p>}
      {o.event.enquiry_id && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>This is a planning project for a client{o.event.initiative_id ? '. Supplier bills posted to its Budgets initiative show against the budget.' : '.'}</p>}
      {canEdit && templates.length > 0 && (
        <div style={{ ...card, padding: 16, display: 'grid', gap: 10 }}>
          <strong>Fill the plan from a template</strong>
          <FormGrid min={220}>
            <Field label="Template" htmlFor="ov-t"><SelectInput id="ov-t" value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">Choose…</option>{templates.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.counts.tasks} tasks)</option>)}</SelectInput></Field>
            <Field label="Event day" htmlFor="ov-d" hint="Task dates count back from this day."><TextInput id="ov-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </FormGrid>
          <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy || !tpl} onClick={apply}>Add the checklist, budget and running order</button></div>
        </div>
      )}
      {o.activity.length > 0 && <div><strong style={{ fontSize: '0.84rem' }}>Recent</strong>{o.activity.map((a) => <div key={a.id} style={{ fontSize: '0.8rem', color: colors.textMuted }}>{a.title} · {a.status} · {String(a.updated_at).slice(0, 10)}</div>)}</div>}
    </div>
  );
}
