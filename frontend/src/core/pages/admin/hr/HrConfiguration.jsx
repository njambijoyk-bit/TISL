import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import { CheckboxRow, Field, FormGrid, NumberInput, TextInput } from '../../../components/admin/ui/Form';
import hrAPI from '../../../../_shared/api/hr';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const REQUIRED = [['work_email', 'Work email'], ['department', 'Department'], ['manager', 'Who they report to'], ['hire_date', 'Start date'], ['phone', 'Phone']];
const section = { ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 };
const h2 = { margin: 0, fontSize: '1rem', fontWeight: 700 };
const hint = { margin: 0, fontSize: '0.8rem', color: colors.textFaint };

/**
 * HR configuration (HR stage 1, docs/HR_STAGE1_SPEC.md): employment types, employee numbers, the fields asked for when someone is added, and whether
 * people see their own pay and identity details. Every save is a numbered version that can be brought back.
 */
export default function HrConfiguration() {
  const [d, setD] = useState(null);
  const [g, setG] = useState(null);
  const [newType, setNewType] = useState('');
  const [busy, setBusy] = useState(false);
  const take = (page) => { setD(page); setG(page.general); };
  useEffect(() => { hrAPI.configuration().then(take).catch((e) => toast.error(errMsg(e, 'HR configuration could not be loaded.'))); }, []);
  if (!d || !g) return <AdminLayout><div style={{ padding: 32 }}>Loading…</div></AdminLayout>;
  const preview = `${g.number_prefix.replace('{YYYY}', new Date().getFullYear())}${'1'.padStart(Number(g.number_width) || 1, '0')}`;
  const run = async (fn, ok) => {
    setBusy(true);
    try { take(await fn()); if (ok) toast.success(ok); } catch (e) { toast.error(errMsg(e, 'That could not be saved.')); }
    setBusy(false);
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', gap: 18 }} data-hr-config>
        <HubHeader title="HR configuration" description="Employment types, employee numbers and what is asked when someone is added. Departments are set on the Departments page." />
        {!d.ready && <p role="alert" style={{ ...hint, color: colors.warning ?? hint.color }}>Run database script 271_hr_foundation.sql to save these settings.</p>}

        <section style={section} data-hr-types>
          <h2 style={h2}>Employment types</h2>
          <p style={hint}>The types a record can have. A type that is switched off stays on the people who have it but is no longer offered.</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.types.map((t) => (
              <li key={t.key} data-hr-type={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: `1px solid ${colors.tint(0.06)}` }}>
                <strong style={{ flex: '1 1 160px', fontSize: '0.88rem', opacity: t.is_active ? 1 : 0.55 }}>{t.name}</strong>
                <span style={{ fontSize: '0.76rem', color: colors.textFaint }}>{t.people} {t.people === 1 ? 'person' : 'people'}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={t.paid_by_payroll} disabled={!t.id || busy} onChange={() => run(() => hrAPI.saveType(t.id, { paid_by_payroll: !t.paid_by_payroll }))} /> Paid through payroll
                </label>
                {t.id && <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => hrAPI.saveType(t.id, { is_active: !t.is_active }), t.is_active ? 'Switched off' : 'Switched on')}>{t.is_active ? 'Switch off' : 'Switch on'}</button>}
              </li>
            ))}
          </ul>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (newType.trim()) run(() => hrAPI.saveType(null, { name: newType.trim() }), 'Added').then(() => setNewType('')); }}>
            <div style={{ flex: '1 1 220px' }}><Field label="Add a type" htmlFor="hr-new-type"><TextInput id="hr-new-type" value={newType} maxLength={80} placeholder="Seasonal" onChange={(e) => setNewType(e.target.value)} /></Field></div>
            <button type="submit" style={btnPrimary} disabled={busy || !newType.trim()}>Add</button>
          </form>
        </section>

        <section style={section} data-hr-numbers>
          <h2 style={h2}>Employee numbers</h2>
          <FormGrid min={180}>
            <Field label="Prefix" htmlFor="hr-prefix" hint="{YYYY} becomes the year the record is made."><TextInput id="hr-prefix" value={g.number_prefix} maxLength={20} onChange={(e) => setG({ ...g, number_prefix: e.target.value })} /></Field>
            <Field label="Digits" htmlFor="hr-width"><NumberInput id="hr-width" min="1" max="10" value={g.number_width} onChange={(e) => setG({ ...g, number_width: e.target.value })} /></Field>
          </FormGrid>
          <p style={hint} data-hr-preview>Looks like <strong>{preview}</strong>. Next with the saved settings: <strong>{d.next_number}</strong>. Existing numbers are kept.</p>
        </section>

        <section style={section} data-hr-required>
          <h2 style={h2}>Asked for when someone is added</h2>
          <p style={hint}>Job title and name are always asked for. These are refused by the server too, not only by the form.</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {REQUIRED.map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                <input type="checkbox" checked={!!g.required[k]} onChange={(e) => setG({ ...g, required: { ...g.required, [k]: e.target.checked } })} /> {l}
              </label>
            ))}
          </div>
        </section>

        <section style={section} data-hr-own>
          <h2 style={h2}>People's own details</h2>
          <CheckboxRow checked={!!g.own_details} onChange={(v) => setG({ ...g, own_details: typeof v === 'boolean' ? v : !g.own_details })} label="People see their own pay and identity details"
            description="On their own record, masked until they press Show. Off: only those with the permission for pay, bank and identity details see them." />
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={btnPrimary} disabled={busy || !d.ready} onClick={() => run(() => hrAPI.saveGeneral({ ...g, number_width: Number(g.number_width) }), 'Saved')}>Save the settings</button>
          <button type="button" style={btnGhost} onClick={() => setG(d.general)}>Undo changes</button>
          <span style={hint}>Version {d.version || 'none saved yet'}</span>
          <Link to="/admin/settings/departments" style={{ marginLeft: 'auto', fontSize: '0.82rem' }}>Departments</Link>
        </div>

        {d.versions.length > 0 && (
          <section style={section} data-hr-versions>
            <h2 style={h2}>Earlier versions</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {d.versions.map((v) => (
                <li key={v.version} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderBottom: `1px solid ${colors.tint(0.06)}`, fontSize: '0.82rem' }}>
                  <strong>Version {v.version}</strong>
                  <span style={{ color: colors.textFaint }}>{v.action === 'rolled_back' ? v.note : 'Saved'}{v.by ? ` by ${v.by}` : ''} · {new Date(v.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {v.version !== d.version && <button type="button" style={{ ...btnGhost, marginLeft: 'auto' }} disabled={busy} onClick={() => run(() => hrAPI.rollback(v.version), `Version ${v.version} brought back`)}>Bring back</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
