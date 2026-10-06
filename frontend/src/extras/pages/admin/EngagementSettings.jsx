import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import { Field, TextInput, TextArea, SelectInput, CheckboxRow } from '../../../core/components/admin/ui/Form';
import engagementAPI from '../../../_shared/api/engagement';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';

const label = { fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' };
const NEEDS = { ecommerce: 'E-commerce', campaigns: 'Campaigns' };
const NOTIFY = { daily: 'One task a day while anything is waiting', each: 'One task for every held post or report', none: 'No tasks (just the count in the queue)' };

function Rule({ meta, rule, commerce, who, hold, onChange }) {
  const has = (f) => meta.fields.includes(f);
  const set = (k) => (v) => onChange({ ...rule, [k]: v?.target ? v.target.value : v });
  const num = (k) => (e) => onChange({ ...rule, [k]: e.target.value === '' ? 0 : Number(e.target.value) });

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <CheckboxRow checked={rule.enabled} onChange={set('enabled')} label={<strong>{meta.label}</strong>} />
      {rule.enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, margin: '10px 0 0 26px' }}>
          {has('who') && <Field label="Who can"><SelectInput value={rule.who} onChange={set('who')} disabled={rule.must_have_bought}>{Object.entries(who).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>}
          {has('hold') && <Field label="Approval"><SelectInput value={rule.hold} onChange={set('hold')}>{Object.entries(hold).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>}
          {has('min_words') && <Field label="Fewest words"><TextInput type="number" min={0} max={500} value={rule.min_words} onChange={num('min_words')} /></Field>}
          {has('edit_minutes') && <Field label="Can edit for (minutes)" hint="0 = no editing"><TextInput type="number" min={0} max={10080} value={rule.edit_minutes} onChange={num('edit_minutes')} /></Field>}
          {has('daily_limit') && <Field label="Most per person per day" hint="0 = no limit"><TextInput type="number" min={0} max={500} value={rule.daily_limit} onChange={num('daily_limit')} /></Field>}
          {has('must_have_bought') && commerce && <div style={{ alignSelf: 'end' }}><CheckboxRow checked={rule.must_have_bought} onChange={(v) => onChange({ ...rule, must_have_bought: v, who: v ? 'customers' : rule.who })} label="Must have bought it" description="Checked from the invoices (and bookings, for services)" /></div>}
          {has('one_per_person') && <div style={{ alignSelf: 'end' }}><CheckboxRow checked={rule.one_per_person} onChange={set('one_per_person')} label="One per person" /></div>}
          {has('photos') && <div style={{ alignSelf: 'end' }}><CheckboxRow checked={rule.photos} onChange={set('photos')} label="Allow photos" /></div>}
        </div>
      )}
      {rule.enabled && rule.who === 'everyone' && <p style={{ margin: '8px 0 0 26px', fontSize: '0.74rem', color: colors.textMuted }}>Guests are asked for a name only. Choose "Hold guests only" or "Hold every one" so a guest's post is checked first.</p>}
    </div>
  );
}

/** Settings > Engagement: switch the engine on, start from a preset, say what counts as "bought", and set who can review, comment, like, mark helpful and report on each kind of thing. */
export default function EngagementSettings() {
  const [d, setD] = useState(null);
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState(null);
  const [reasons, setReasons] = useState('');
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const take = useCallback((r) => {
    setD(r); setSettings(r.settings); setRules(r.rules); setReasons(r.reasons.join('\n')); setWords((r.settings.blocked_words ?? []).join(', '));
  }, []);
  useEffect(() => { engagementAPI.settings().then(take).catch((e) => setError(errMsg(e, 'Could not load the settings'))); }, [take]);

  const dirty = useMemo(() => d && (JSON.stringify(settings) !== JSON.stringify(d.settings) || JSON.stringify(rules) !== JSON.stringify(d.rules) || reasons !== d.reasons.join('\n') || words !== (d.settings.blocked_words ?? []).join(', ')), [d, settings, rules, reasons, words]);
  const sw = (k) => (v) => setSettings((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await engagementAPI.save({ settings: { ...settings, blocked_words: words }, rules, reasons: reasons.split('\n').map((x) => x.trim()).filter(Boolean) });
      take(r); toast.success(r.message);
    } catch (e) { setError(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };
  const preset = async (p) => {
    if (!window.confirm(`Apply "${p.label}"? This replaces every rule below${dirty ? ' and drops the changes you have not saved' : ''}.`)) return;
    try { const r = await engagementAPI.applyPreset(p.key); take(r); toast.success(r.message); } catch (e) { toast.error(errMsg(e, 'Could not apply it')); }
  };

  if (!d) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>{error ?? 'Loading…'}</div></AdminLayout>;
  const current = d.presets.find((p) => p.key === d.settings.preset);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px 90px', maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        <HubHeader title="Engagement" description="Who can review, comment, like, mark helpful and report, on products, services, pins, boards and campaigns." />
        {!d.ready && <p role="alert" style={{ ...card, padding: 14, margin: 0, borderColor: 'var(--status-warning, #b45309)', fontSize: '0.86rem' }}>The Engagement tables are not set up yet. Ask an admin to run script 86, then reload this page. You can look around, but nothing can be saved yet.</p>}
        {error && <p role="alert" style={{ color: colors.dangerText, margin: 0, fontSize: '0.86rem' }}>{error}</p>}

        <section style={{ ...card, padding: 18, display: 'grid', gap: 12 }}>
          <CheckboxRow checked={settings.enabled} onChange={sw('enabled')} label={<strong>Engagement is on</strong>} description="Off: no review, comment, like, helpful or report control shows anywhere on the site. It is also off whenever the Extras module is off." />
          <div>
            <p style={label}>Start from a preset {current ? `· now: ${current.label}` : '· now: custom (changed by hand)'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
              {d.presets.map((p) => (
                <div key={p.key} style={{ border: `1.5px solid ${d.settings.preset === p.key ? 'var(--color-primary-500)' : 'var(--line)'}`, borderRadius: 12, padding: 12, display: 'grid', gap: 6, alignContent: 'start' }}>
                  <strong style={{ fontSize: '0.88rem' }}>{p.label}</strong>
                  <span style={{ fontSize: '0.74rem', color: colors.textMuted, lineHeight: 1.45 }}>{p.about}</span>
                  <button type="button" style={{ ...btnGhost, justifySelf: 'start' }} disabled={!d.ready} onClick={() => preset(p)}>{d.settings.preset === p.key ? 'Apply again' : 'Apply'}</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 10 }}>
          <p style={label}>What counts as "bought"</p>
          <p style={{ margin: '0 0 4px', fontSize: '0.78rem', color: colors.textMuted }}>Used wherever a rule below says "Must have bought it". It is read from the customer's whole history of posted invoices and cash sales, less credit notes, and from bookings for services. They only need to have bought it once.</p>
          <CheckboxRow checked={settings.paid_required} onChange={sw('paid_required')} label="At least one invoice with this item must be paid" description="Over everything they have bought. A pending invoice today does not matter if an earlier one was paid." />
          <CheckboxRow checked={settings.delivered_required} onChange={sw('delivered_required')} label="The item must have been delivered at least once" description="Not every time: one delivery, on any of their purchases, is enough. Products only." />
          <p style={{ ...label, margin: '8px 0 0' }}>Services</p>
          <CheckboxRow checked={settings.service_completed_counts} onChange={sw('service_completed_counts')} label="A completed booking counts" />
          <CheckboxRow checked={settings.service_late_fee_counts} onChange={sw('service_late_fee_counts')} label="A late cancellation counts when its cancellation fee was invoiced (and paid, if the first switch is on)" />
          <CheckboxRow checked={settings.service_noshow_counts} onChange={sw('service_noshow_counts')} label="A no-show counts when its fee was invoiced" />
          <CheckboxRow checked={settings.service_free_cancel_counts} onChange={sw('service_free_cancel_counts')} label="A booking cancelled in time (nothing charged) counts" />
        </section>

        {d.targets.map((t) => (
          <section key={t.key} style={{ ...card, padding: 18, opacity: t.available ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ ...label, margin: 0, fontSize: '0.78rem', color: colors.text }}>{t.label}</p>
              {!t.available && <span style={{ fontSize: '0.72rem', color: 'var(--status-warning, #b45309)' }}>Needs {NEEDS[t.module] ?? t.module}, which is off. These rules apply once it is on.</span>}
            </div>
            {t.actions.map((a) => (
              <Rule key={a} meta={d.actions.find((x) => x.key === a)} rule={rules[t.key][a]} commerce={t.commerce} who={d.who} hold={d.hold}
                onChange={(r) => setRules((all) => ({ ...all, [t.key]: { ...all[t.key], [a]: r } }))} />
            ))}
          </section>
        ))}

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <p style={label}>Reports and held posts</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <Field label="Reasons people can pick" hint="One per line."><TextArea rows={6} value={reasons} onChange={(e) => setReasons(e.target.value)} /></Field>
            <Field label="Blocked words" hint="Separate with commas. A post with one of these is always held for approval."><TextArea rows={6} value={words} onChange={(e) => setWords(e.target.value)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <Field label="Hide a post while staff look, after this many reports" hint="0 = never hide it automatically. Staff still decide: keep it, pull it down, or flag it."><TextInput type="number" min={0} max={100} value={settings.auto_hide_reports} onChange={(e) => sw('auto_hide_reports')(Number(e.target.value || 0))} /></Field>
            <Field label="Calendar tasks for the people who approve" hint="When a post is held, or something is reported, the people who can decide get a task on their calendar."><SelectInput value={settings.notify_approvers} onChange={sw('notify_approvers')}>{Object.entries(NOTIFY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          </div>
          <CheckboxRow checked={settings.notify_author} onChange={sw('notify_author')} label="Tell a person when their post is pulled down" />
        </section>
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 24px', background: 'var(--surface-card)', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', zIndex: 20 }}>
        <span style={{ fontSize: '0.78rem', color: dirty ? 'var(--status-warning, #b45309)' : colors.textFaint }}>{dirty ? 'You have unsaved changes' : 'Everything is saved'}</span>
        <button type="button" style={{ ...btnPrimary, opacity: dirty && d.ready ? 1 : 0.5 }} disabled={!dirty || !d.ready || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </AdminLayout>
  );
}
