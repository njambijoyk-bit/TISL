import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Fingerprint, ShieldCheck } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../components/admin/ui/HubHeader';
import SimpleTable from '../../components/admin/ui/SimpleTable';
import { CheckboxRow, Field, SelectInput, TextInput } from '../../components/admin/ui/Form';
import securityAPI from '../../../_shared/api/security';
import { useAuthStore } from '../../../_shared/store/index';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const MODES = [
  { value: 'off', title: 'Off', text: 'Nothing changes. Staff sign in as before.' },
  { value: 'log', title: 'Test', text: 'Nobody is stopped. Each sign-in that would have been held is written to the sign-in log, so you can see who would be affected first.' },
  { value: 'enforce', title: 'On', text: 'From the date below, a person the rule is for who has not added what it asks can only add a passkey (or use theirs) until they do.' },
];

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Stat({ label, value, tone }) {
  return (
    <div data-stat={label} style={{ ...card, padding: '14px 16px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tone ?? colors.text, lineHeight: 1.1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: '0.74rem', color: colors.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** A list of keys shown as removable chips with a box to add another. */
function Chips({ value, onChange, options, label, disabled }) {
  const names = useMemo(() => Object.fromEntries(options.map((o) => [o.key, o.name ?? o.label])), [options]);
  const free = options.filter((o) => !value.includes(o.key));

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {value.length === 0 && <span style={{ fontSize: '0.76rem', color: colors.textFaint }}>None</span>}
        {value.map((k) => (
          <span key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 10px', borderRadius: 999, background: colors.tint(0.1), fontSize: '0.74rem', fontWeight: 600, maxWidth: '100%' }}>
            {names[k] ?? k}
            {!disabled && <button type="button" aria-label={`Remove ${names[k] ?? k}`} onClick={() => onChange(value.filter((x) => x !== k))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>×</button>}
          </span>
        ))}
      </div>
      {!disabled && (
        <SelectInput aria-label={label} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} style={{ width: 'auto', maxWidth: '100%' }}>
          <option value="">Add…</option>
          {free.map((o) => <option key={o.key} value={o.key}>{o.name ?? `${o.group}: ${o.label}`}</option>)}
        </SelectInput>
      )}
    </div>
  );
}

/** Admin → Security → Passkey rule: the switch, the date, who it is for, and where each member of staff stands. */
export default function PasskeyRule() {
  const canChange = useAuthStore((s) => (s.access?.permissions ?? []).includes('security.manage'));
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);       // a refusal the owner has to read: { message, reason }
  const [show, setShow] = useState('todo');

  const load = useCallback(() => securityAPI.policy().then((r) => { setData(r); setForm(r.settings); }).catch((e) => toast.error(errMsg(e, 'Could not load the rule'))), []);
  useEffect(() => { load(); }, [load]);

  const save = async (confirm = false) => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await securityAPI.savePolicy({ ...form, enforce_from: form.enforce_from || null, ...(confirm ? { confirm: true } : {}) });
      toast.success(r.message ?? 'Saved');
      setData(r);
      setForm(r.settings);
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 422 && d?.reason) setProblem({ message: d.message, reason: d.reason });
      else toast.error(errMsg(e, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  const dirty = data && form && JSON.stringify(form) !== JSON.stringify(data.settings);
  const sum = data?.roster?.summary;
  const people = (data?.roster?.people ?? []).filter((p) => (show === 'todo' ? p.applies && !p.met : show === 'applies' ? p.applies : true));

  const columns = [
    { key: 'name', label: 'Who', render: (p) => <span><span style={{ fontWeight: 600, display: 'block' }}>{p.name}{p.suspended && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: colors.textFaint }}>suspended</span>}</span><span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{p.email}</span></span> },
    { key: 'role', label: 'Role' },
    { key: 'passkeys', label: 'Passkeys', render: (p) => <span style={{ fontWeight: 700 }}>{p.passkeys}{p.applies && ` of ${p.needs}`}</span> },
    { key: 'status', label: 'Rule', render: (p) => (!p.applies
      ? <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>Not for this role</span>
      : p.met ? <span style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.successText }}>Done</span> : <span style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.warningText }}>Still to add</span>) },
    { key: 'used', label: 'Last used a passkey', render: (p) => <span style={{ fontSize: '0.76rem', color: colors.textMuted }}>{p.last_passkey_used_at ? day(p.last_passkey_used_at) : '—'}</span> },
    { key: 'in', label: 'Last signed in', render: (p) => <span style={{ fontSize: '0.76rem', color: colors.textMuted }}>{p.last_sign_in_at ? day(p.last_sign_in_at) : '—'}</span> },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="passkey-rule">
        <HubHeader title="Who must use a passkey" description="A passkey is a fingerprint, face or screen PIN on a device the person holds. Staff who can move money or change who may do what can be asked to sign in with one, so a stolen password alone is not enough." />

        {data && !data.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.84rem' }}>{data.message}</p>}
        {data?.kill_switch && (
          <p role="alert" style={{ ...card, padding: 14, fontSize: '0.84rem', borderColor: colors.warning, display: 'flex', gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, color: colors.warning }} /> The emergency switch is on in the server's settings, so the rule is asleep whatever is chosen here. Take SECURITY_POLICY_OFF out of the settings to wake it.
          </p>
        )}

        {sum && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Staff accounts" value={sum.staff} />
            <Stat label="The rule is for" value={sum.applies} />
            <Stat label="Have what it asks" value={sum.met} tone={sum.met ? colors.successText : undefined} />
            <Stat label="Still to add a passkey" value={sum.missing} tone={sum.missing ? colors.warningText : undefined} />
            <Stat label="Staff with any passkey" value={sum.with_passkey} />
          </div>
        )}

        {form && (
          <div style={{ ...card, padding: 18, marginBottom: 20, display: 'grid', gap: 16 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, display: 'flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={15} /> The rule</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }} role="radiogroup" aria-label="Mode">
              {MODES.map((m) => (
                <label key={m.value} style={{ border: `1.5px solid ${form.mode === m.value ? colors.primary : 'var(--line)'}`, borderRadius: 10, padding: 12, cursor: canChange ? 'pointer' : 'default', display: 'grid', gap: 4, background: form.mode === m.value ? colors.tint(0.06) : 'transparent' }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: '0.86rem' }}>
                    <input type="radio" name="mode" value={m.value} checked={form.mode === m.value} disabled={!canChange} onChange={() => setForm({ ...form, mode: m.value })} style={{ accentColor: colors.primary }} /> {m.title}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{m.text}</span>
                </label>
              ))}
            </div>

            <Field label="Applies from" htmlFor="enforce_from" hint={form.mode === 'enforce' ? 'Required. Until this day people are only reminded; from this day they can only add a passkey.' : 'Optional while testing. People are reminded until this day.'}>
              <TextInput id="enforce_from" type="date" value={form.enforce_from ?? ''} disabled={!canChange} onChange={(e) => setForm({ ...form, enforce_from: e.target.value || null })} style={{ width: 'auto' }} />
            </Field>
            <Field label="For people who hold one of these roles"><Chips label="Add a role" value={form.roles} onChange={(v) => setForm({ ...form, roles: v })} options={data.choices.roles} disabled={!canChange} /></Field>
            <Field label="…or can do any of these" hint="Whoever holds the permission is included, whatever their role is called."><Chips label="Add a permission" value={form.permissions} onChange={(v) => setForm({ ...form, permissions: v })} options={data.choices.permissions} disabled={!canChange} /></Field>
            <Field label="These roles need two passkeys" hint="So losing one device never locks the owner out."><Chips label="Add a role that needs two" value={form.owner_roles} onChange={(v) => setForm({ ...form, owner_roles: v })} options={data.choices.roles} disabled={!canChange} /></Field>
            <CheckboxRow checked={form.owner_device_bound} disabled={!canChange} onChange={(v) => setForm({ ...form, owner_device_bound: v })} label="Their two must stay on the device" description="A security key, or the computer's own sign-in. A passkey that is copied to a Google or Apple account does not count." />

            {problem && (
              <div role="alert" style={{ border: `1.5px solid ${problem.reason === 'confirm_needed' ? colors.warning : colors.danger}`, borderRadius: 10, padding: 12, fontSize: '0.82rem', display: 'grid', gap: 8 }}>
                <span>{problem.message}</span>
                {problem.reason === 'confirm_needed' && <button type="button" style={{ ...btnPrimary, justifySelf: 'start' }} disabled={busy} onClick={() => save(true)}>Yes, switch it on</button>}
              </div>
            )}

            {canChange ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btnPrimary} disabled={busy || !dirty} onClick={() => save(false)} data-testid="rule-save">{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" style={btnGhost} disabled={busy || !dirty} onClick={() => { setForm(data.settings); setProblem(null); }}>Undo changes</button>
              </div>
            ) : <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textFaint }}>You can see the rule but not change it. Changing it needs the "change the sign-in rules" permission.</p>}
          </div>
        )}

        {data?.roster && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <Fingerprint size={16} aria-hidden="true" />
              <strong style={{ fontSize: '0.86rem' }}>Staff</strong>
              <SelectInput value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show" style={{ width: 'auto' }}>
                <option value="todo">Still to add a passkey</option>
                <option value="applies">Everyone the rule is for</option>
                <option value="all">All staff</option>
              </SelectInput>
            </div>
            <SimpleTable columns={columns} rows={people} loading={false} empty={show === 'todo' ? 'Everyone the rule is for has what it asks.' : 'Nobody to show.'} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
