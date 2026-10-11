import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, KeyRound, ShieldAlert } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../components/admin/ui/HubHeader';
import securityAPI from '../../../_shared/api/security';
import { useAuthStore } from '../../../_shared/store/index';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const MODES = [
  { value: 'off', title: 'Off' },
  { value: 'log', title: 'Test' },
  { value: 'enforce', title: 'On' },
];

const MODE_TEXT = {
  off: 'Nothing is asked.',
  log: 'Nobody is stopped. Each time it would have been asked is written to the sign-in log, so you can see how often before you switch it on.',
  enforce: 'The person is asked for one more step before it goes through.',
};

const SIGNALS = {
  new_device: 'A kind of browser they have not used lately',
  new_network: 'A part of the internet they have not used lately',
  odd_hour: 'A time of day they almost never sign in at',
  new_country: 'A country they have not signed in from lately',
  many_failures: 'Wrong passwords just before the right one',
};

const CLASSES = [
  { key: 'critical', title: 'Serious', text: 'Can move money or change who may do what. Each one is confirmed on its own, with a reason written in the log.' },
  { key: 'elevated', title: 'Everyday', text: 'Sensitive, but done more often. One confirmation covers a short run of the same kind of action.' },
];

/** Off / Test / On for one thing. `blocked` greys out On with the reason shown beside it. */
function ModePicker({ name, label, value, onChange, disabled, blockOn }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', border: '1.5px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      {MODES.map((m) => {
        const off = disabled || (m.value === 'enforce' && blockOn);
        const on = value === m.value;

        return (
          <label key={m.value} style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: off ? 'default' : 'pointer', opacity: off && !on ? 0.45 : 1, background: on ? colors.tint(0.12) : 'transparent', color: colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="radio" name={name} value={m.value} checked={on} disabled={off} onChange={() => onChange(m.value)} style={{ accentColor: colors.primary }} />
            {m.title}
          </label>
        );
      })}
    </div>
  );
}

const times = (n) => (n === 1 ? 'once' : `${n} times`);

function statsLine(s) {
  const parts = [];
  if (s.would_ask) parts.push(`would have asked ${times(s.would_ask)}`);
  if (s.asked) parts.push(`asked ${times(s.asked)}`);
  if (s.approved) parts.push(`${s.approved} confirmed`);
  if (s.failed) parts.push(`${s.failed} refused`);

  return parts.length ? `Last 7 days: ${parts.join(', ')}.` : 'Not used in the last 7 days.';
}

function Rule({ rule, value, onChange, canChange }) {
  const line = statsLine(rule.stats);
  const blockOn = !rule.you_could_answer && rule.mode !== 'enforce';

  return (
    <div data-rule={rule.key} style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{rule.label}</div>
          <div style={{ fontSize: '0.74rem', color: colors.textMuted, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{rule.strength >= 2 ? 'Needs a passkey (the password only until they have one)' : 'A passkey or the password'}</span>
            {rule.reason && <span>They say why</span>}
            {rule.window && <span>One confirmation covers {rule.fresh} minutes</span>}
            {rule.two && <span>A second person will also be needed once that is switched on</span>}
          </div>
        </div>
        <ModePicker name={`rule-${rule.key}`} label={`${rule.label}: how it is set`} value={value} onChange={onChange} disabled={!canChange} blockOn={blockOn} />
      </div>
      <div style={{ fontSize: '0.76rem', color: colors.textMuted }} data-line="stats">{line}</div>
      {rule.mode !== rule.in_force && <div style={{ fontSize: '0.74rem', color: colors.warningText }}>Chosen: {rule.mode}, but it is not in force: {rule.in_force === 'off' ? 'it is asleep (the emergency switch, or its database script has not been run)' : rule.in_force}.</div>}
      {blockOn && canChange && <div role="note" style={{ fontSize: '0.74rem', color: colors.warningText }}>You could not answer this yourself yet, so it can not be switched on. Add a passkey first{rule.class === 'critical' ? ' (for serious actions it must be a day old)' : ''}.</div>}
    </div>
  );
}

/** Admin → Security → Sensitive actions: which actions ask for one more step, how often they would have, and the unusual-sign-in check. */
export default function SensitiveActions() {
  const canChange = useAuthStore((s) => (s.access?.permissions ?? []).includes('security.manage'));
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);     // { rules: { key: mode }, risk: mode }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const adopt = (r) => { setData(r); setForm({ rules: Object.fromEntries(r.rules.map((x) => [x.key, x.mode])), risk: r.risk.mode }); };
  const load = useCallback(() => securityAPI.actions().then(adopt).catch((e) => toast.error(errMsg(e, 'Could not load the page'))), []);
  useEffect(() => { load(); }, [load]);

  const changes = useMemo(() => {
    if (!data || !form) return {};
    const rules = Object.fromEntries(data.rules.filter((r) => form.rules[r.key] !== r.mode).map((r) => [r.key, form.rules[r.key]]));

    return { ...(Object.keys(rules).length ? { rules } : {}), ...(form.risk !== data.risk.mode ? { risk_mode: form.risk } : {}) };
  }, [data, form]);
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await securityAPI.saveActions(changes);
      toast.success(r.message ?? 'Saved');
      adopt(r);
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 422 && d?.reason) setProblem(d.message);
      else if (e.response?.status !== 403 || !d?.step_up) toast.error(errMsg(e, 'Could not save'));   // a "one more step" question is answered in its own window
    } finally {
      setBusy(false);
    }
  };

  const tally = data ? data.rules.reduce((a, r) => ({ ...a, [r.mode]: (a[r.mode] ?? 0) + 1 }), {}) : {};
  const risk = data?.risk;
  const rs = risk?.stats;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="sensitive-actions">
        <HubHeader title="Sensitive actions" description="For the things that can move money or change who may do what, ask the person for one more step: their passkey (fingerprint, face or screen PIN), or their password until they have a passkey. Start every one in Test, look at how often it would have asked, then switch it on." />

        {data && !data.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.84rem' }}>{data.message}</p>}
        {data?.kill_switch && (
          <p role="alert" style={{ ...card, padding: 14, fontSize: '0.84rem', borderColor: colors.warning, display: 'flex', gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, color: colors.warning }} /> The emergency switch is on in the server's settings, so none of these ask anything whatever is chosen here. Take SECURITY_POLICY_OFF out of the settings to wake them.
          </p>
        )}

        {data && form && (
          <>
            <div style={{ fontSize: '0.78rem', color: colors.textMuted, marginBottom: 14 }} data-testid="tally">
              {tally.enforce ?? 0} on · {tally.log ?? 0} in test · {tally.off ?? 0} off
              {!canChange && ' · You can see these but not change them. Changing them needs the "change the sign-in rules" permission.'}
            </div>

            {CLASSES.map((c) => (
              <section key={c.key} style={{ marginBottom: 22 }} aria-label={c.title}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><KeyRound size={15} aria-hidden="true" /><strong style={{ fontSize: '0.9rem' }}>{c.title}</strong></div>
                <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: colors.textMuted }}>{c.text}</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {data.rules.filter((r) => r.class === c.key).map((r) => (
                    <Rule key={r.key} rule={r} value={form.rules[r.key]} canChange={canChange && data.ready} onChange={(v) => setForm({ ...form, rules: { ...form.rules, [r.key]: v } })} />
                  ))}
                </div>
              </section>
            ))}

            <section style={{ marginBottom: 22 }} aria-label="Unusual sign-ins" data-rule="risk">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><ShieldAlert size={15} aria-hidden="true" /><strong style={{ fontSize: '0.9rem' }}>Unusual sign-ins</strong></div>
              <div style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
                <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
                  Each sign-in with a password is compared with that person's own last 90 days. Signs that add up: {risk.signals.map((s) => `${SIGNALS[s.key] ?? s.key} (${s.weight})`).join('; ')}.
                  From {risk.notice_at} the person is told by email; from {risk.stronger_at}, someone who has a passkey must also confirm with it before going on. A passkey sign-in is never held.
                </p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ModePicker name="rule-risk" label="Unusual sign-ins: how it is set" value={form.risk} onChange={(v) => setForm({ ...form, risk: v })} disabled={!canChange || !risk.ready} />
                  <span style={{ fontSize: '0.76rem', color: colors.textMuted }}>{MODE_TEXT[form.risk]}</span>
                </div>
                {!risk.ready && <div role="note" style={{ fontSize: '0.74rem', color: colors.warningText }}>The sign-in history is not set up yet, so this can not be switched on.</div>}
                {risk.mode !== risk.in_force && <div style={{ fontSize: '0.74rem', color: colors.warningText }}>Chosen: {risk.mode}, but it is not in force.</div>}
                <div style={{ fontSize: '0.76rem', color: colors.textMuted }} data-line="stats">
                  Last 7 days: {rs.sign_ins} {rs.sign_ins === 1 ? 'sign-in' : 'sign-ins'}{rs.would_ask ? `, ${rs.would_ask} would have been flagged` : ''}{rs.told ? `, ${rs.told} told` : ''}{rs.held ? `, ${rs.held} held for a passkey` : ''}.
                  {Object.keys(rs.by_signal).length > 0 && ` Most often: ${Object.entries(rs.by_signal).slice(0, 3).map(([k, n]) => `${SIGNALS[k] ?? k} (${n})`).join('; ')}.`}
                </div>
              </div>
            </section>

            {problem && <div role="alert" style={{ border: `1.5px solid ${colors.danger}`, borderRadius: 10, padding: 12, fontSize: '0.82rem', marginBottom: 14 }}>{problem}</div>}

            {canChange && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btnPrimary} disabled={busy || !dirty} onClick={save} data-testid="actions-save">{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" style={btnGhost} disabled={busy || !dirty} onClick={() => { adopt(data); setProblem(null); }}>Undo changes</button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
