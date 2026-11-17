import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useProjectNames } from '../../lib/names';
import { day, message, money } from '../../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';
import HealthDot from '../../components/HealthDot';
import ContactsPanel from '../../components/ContactsPanel';
import HistoryPanel from '../../components/HistoryPanel';
import OpportunityForm from '../../components/OpportunityForm';
import OpportunityPanel from '../../components/OpportunityPanel';

/**
 * One client (docs/PROJECTS_STAGE3_SPEC.md, build 3.5). The customer record stays the account and the Books ledger; this is what Projects
 * knows about it: the account manager, its people, its work, opportunities, history and next action, its flags, what it owes (from the books)
 * and its health, which always says why.
 */
const Row = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
    <span style={{ color: 'var(--text-secondary)' }}>{label}</span><span style={{ textAlign: 'right', minWidth: 0 }}>{children || <span style={{ color: 'var(--text-secondary)' }}>·</span>}</span>
  </div>
);
const STATE = { open: 'info', on_hold: 'warning', closed: 'good', cancelled: 'neutral' };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useProjectNames();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);   // null | 'manager' | 'flag' | { unflag } | 'opportunity'
  const [form, setForm] = useState({});
  const [openId, setOpenId] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.client(id)); setFailed(''); } catch (e) { setFailed(e?.response?.status === 404 ? 'There is no client here.' : message(e, 'This could not be loaded. Try again.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setMode(null); setProblem(''); toast.success(done); } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };

  if (failed) return <AdminLayout><ProjectKeys /><PageHeader title="Client" actions={<Btn onClick={() => navigate('/admin/projects/clients')}>Close</Btn>} /><Notice status="info">{failed}</Notice></AdminLayout>;
  if (!data) return <AdminLayout><ProjectKeys /><PageHeader title="Loading…" /></AdminLayout>;
  const c = data.client;
  const can = c.can;
  const opened = openId && c.opportunities.find((o) => o.id === openId);

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title={c.name} subtitle={[c.number, c.since ? `Client since ${day(c.since)}` : null].filter(Boolean).join(' · ')} actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects/clients')}>Close</Btn>
          {can.flags && !mode && <Btn onClick={() => { setMode('flag'); setForm({ flag_id: '', reason: '' }); setProblem(''); }}>Add a flag</Btn>}
          {can.pipeline && !mode && <Btn variant="primary" onClick={() => { setMode('opportunity'); setOpenId(null); }}>New opportunity</Btn>}
        </div>
      )} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-start' }}>
        <HealthDot health={c.health} withReasons />
        {c.flags.map((f) => (
          <span key={f.id} data-flag={f.name} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <Chip status={f.status}>{f.name}</Chip>
            {can.flags && !mode && <Btn small variant="quiet" aria-label={`Take the flag ${f.name} off`} onClick={() => { setMode({ unflag: f }); setForm({ note: '' }); setProblem(''); }}>Take off</Btn>}
          </span>
        ))}
      </div>
      {c.flags.length > 0 && <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>{c.flags.map((f) => <span key={f.id} style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{f.name}: {f.reason} ({f.set_by}, {day(f.set_at)})</span>)}</div>}

      {mode === 'flag' && (
        <Panel as="form" onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.addClientFlag(id, { flag_id: Number(form.flag_id), reason: form.reason }), 'Flag added'); }} style={{ marginBottom: 16 }}>
          <PanelTitle hint="It shows wherever this client is picked, and is logged.">Add a flag</PanelTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
            <Field label="Flag" htmlFor="flag-which"><SelectInput id="flag-which" value={form.flag_id} onChange={(e) => setForm({ ...form, flag_id: e.target.value })} required><option value="">Choose…</option>{data.flag_choices.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</SelectInput></Field>
            <Field label="Why" htmlFor="flag-why"><TextInput id="flag-why" value={form.reason} maxLength={300} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></Field>
            <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Add the flag</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
          </div>
          {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
        </Panel>
      )}
      {mode?.unflag && (
        <Panel as="form" onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.removeClientFlag(id, mode.unflag.id, form.note), 'Flag taken off'); }} style={{ marginBottom: 16 }}>
          <PanelTitle hint="The flag is kept in the record, with why it came off.">Take off: {mode.unflag.name}</PanelTitle>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <Field label="Why it is coming off" htmlFor="unflag-why" style={{ flex: '1 1 240px' }}><TextInput id="unflag-why" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} required /></Field>
            <Btn type="submit" variant="primary" small busy={busy}>Take it off</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
          </div>
          {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
        </Panel>
      )}
      {mode === 'opportunity' && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelTitle>New opportunity for {c.name}</PanelTitle>
          <OpportunityForm forWhom={{ type: 'client', id: c.id, name: c.name }} onSaved={(o) => { setMode(null); setOpenId(o.id); load(); }} onCancel={() => setMode(null)} />
        </Panel>
      )}
      {opened && <OpportunityPanel opportunity={opened} can={{ change: can.pipeline, start: can.create, make_client: true }} word={t} onChanged={load} onClose={() => setOpenId(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div>
          <Panel style={{ marginBottom: 16 }}>
            <PanelTitle>Relationship</PanelTitle>
            <Row label="Account manager">
              {mode === 'manager'
                ? <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeClient(id, { manager_id: form.manager_id ? Number(form.manager_id) : null }), 'Saved'); }} style={{ display: 'flex', gap: 6 }}>
                  <SelectInput aria-label="Account manager" value={form.manager_id} onChange={(e) => setForm({ manager_id: e.target.value })}><option value="">None</option>{data.managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput>
                  <Btn type="submit" small variant="primary" busy={busy}>Save</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
                </form>
                : <>{c.manager?.name || 'None'}{can.manage && !mode && <Btn small variant="quiet" style={{ marginLeft: 6 }} onClick={() => { setMode('manager'); setForm({ manager_id: c.manager?.id || '' }); }}>Change</Btn>}</>}
            </Row>
            <Row label="Came from">{c.source}</Row>
            <Row label="Email">{c.email}</Row>
            <Row label="Phone">{c.phone}</Row>
            <Row label="Last contact">{c.last_contact ? day(c.last_contact) : 'Never'}</Row>
            {c.money && <Row label="Owes (from the books)"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(c.money.owed, c.money.currency)}{c.money.overdue > 0 && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--status-error)' }}>{money(c.money.overdue, c.money.currency)} overdue, oldest {c.money.days_late} days</span>}</span></Row>}
          </Panel>
          <ContactsPanel type="customer" id={c.id} />
          <Panel style={{ marginBottom: 16 }}>
            <PanelTitle>Work</PanelTitle>
            {c.projects.length === 0 && c.opportunities.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No work or opportunities yet.</p>}
            {c.projects.map((p) => (
              <div key={p.id} data-work={p.number} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
                <Link to={`/admin/projects/${p.id}`} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{p.number} · {p.title}</Link>
                <Chip status={p.state === 'open' ? (p.status || 'info') : STATE[p.state]}>{p.state === 'open' ? p.stage : p.state.replace('_', ' ')}</Chip>
              </div>
            ))}
            {c.opportunities.filter((o) => !o.project).map((o) => (
              <div key={`o${o.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
                <button type="button" onClick={() => { setOpenId(o.id); setMode(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary-500)', fontWeight: 600, fontFamily: 'var(--font-body)', fontSize: 13.5, textAlign: 'left' }}>{o.title}</button>
                <Chip status={o.stage.kind === 'lost' ? 'problem' : o.stage.kind === 'won' ? 'good' : 'neutral'}>Opportunity · {o.stage.name}</Chip>
              </div>
            ))}
          </Panel>
        </div>
        <HistoryPanel type="customer" id={c.id} onChanged={load} />
      </div>
    </AdminLayout>
  );
}
