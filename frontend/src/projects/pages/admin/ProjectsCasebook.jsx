import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message } from '../../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

const TONE = { new: 'info', looking: 'warning', action: 'good', closed: 'neutral' };
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };

/**
 * The casebook (docs/PROJECTS_STAGE8_SPEC.md, build 8.5): a safe way to raise a problem. Report something (and hide your name if you wish); it goes
 * where the company has set for its kind, never to anyone it is about. Your own reports, and the ones you handle, are listed here.
 */
export default function ProjectsCasebook() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.casebook()); setProblem(''); } catch (e) { setProblem(message(e, 'The casebook could not be loaded.')); } }, []);
  useEffect(() => { load(); }, [load]);
  const startReport = () => setForm({ kind_id: data.kinds[0]?.id ?? '', what: '', happened_on: '', about_people: [], about_clients: [], hide_name: false });
  const people = data?.people ?? [];
  const clients = data?.clients ?? [];
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await projectsAPI.reportCase(form); toast.success('Reported. You can follow it here.'); navigate(`/admin/projects/casebook/${r.case.id}`); } catch (err) { setProblem(message(err, 'It could not be sent. Try again.')); } finally { setBusy(false); }
  };

  const header = <PageHeader title="Casebook" subtitle="Raise a problem safely: harassment, a difficult client, safety, pay, or anything else" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />;
  if (!data) return <AdminLayout><ProjectKeys />{header}{problem && <Notice status="problem">{problem}</Notice>}</AdminLayout>;
  const row = (c) => (
    <Link key={c.id} to={`/admin/projects/casebook/${c.id}`} data-case={c.number} style={{ display: 'grid', gap: 3, padding: '10px 0', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'inherit' }}>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><strong style={{ fontSize: 13.5 }}>{c.number}</strong><Chip>{c.kind}</Chip><Chip status={TONE[c.state]}>{c.state_name}</Chip><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{day(c.reported_at?.slice(0, 10))} · {c.reporter}</span></span>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.what}</span>
    </Link>
  );

  return (
    <AdminLayout><ProjectKeys />
      {header}
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        {data.can.report && (
          <Panel data-report>
            <PanelTitle hint="It goes only to the people set to receive this kind of report, never to anyone it is about." right={!form ? <Btn small variant="primary" onClick={startReport}>Report something</Btn> : null}>Your reports</PanelTitle>
            {form && (
              <form onSubmit={send} style={{ display: 'grid', gap: 10, marginBottom: 12 }} data-report-form>
                <Field label="What kind of thing is it" htmlFor="cb-kind"><SelectInput id="cb-kind" value={form.kind_id} onChange={(e) => setForm({ ...form, kind_id: Number(e.target.value) })}>{data.kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</SelectInput></Field>
                <Field label="What happened" htmlFor="cb-what"><textarea id="cb-what" rows={5} value={form.what} onChange={(e) => setForm({ ...form, what: e.target.value })} style={area} required /></Field>
                <Field label="When (optional)" htmlFor="cb-when"><TextInput id="cb-when" type="date" value={form.happened_on} onChange={(e) => setForm({ ...form, happened_on: e.target.value })} /></Field>
                {people.length > 0 && (
                  <Field label="Who it is about (optional; they never see it)" htmlFor="cb-about">
                    <SelectInput id="cb-about" multiple value={form.about_people.map(String)} onChange={(e) => setForm({ ...form, about_people: [...e.target.selectedOptions].map((o) => Number(o.value)) })} style={{ minHeight: 90 }}>
                      {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </SelectInput>
                  </Field>
                )}
                {clients.length > 0 && (
                  <Field label="A client it is about (optional)" htmlFor="cb-client">
                    <SelectInput id="cb-client" value={form.about_clients[0] ?? ''} onChange={(e) => setForm({ ...form, about_clients: e.target.value ? [Number(e.target.value)] : [] })}>
                      <option value="">None</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </SelectInput>
                  </Field>
                )}
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}><input type="checkbox" checked={form.hide_name} onChange={(e) => setForm({ ...form, hide_name: e.target.checked })} /> Hide my name from whoever handles it</label>
                {form.hide_name && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>They can still write to you here. Only someone with the right permission can reveal your name, and you are told if they do.</p>}
                <span style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Send the report</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
              </form>
            )}
            {data.mine.length === 0 && !form && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>You have reported nothing.</p>}
            {data.mine.map(row)}
          </Panel>
        )}
        {data.can.handle && (
          <Panel data-handling>
            <PanelTitle hint="Reports sent to you. Closed ones are kept.">To handle</PanelTitle>
            {data.handling.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing open.</p>}
            {data.handling.map(row)}
          </Panel>
        )}
      </div>
    </AdminLayout>
  );
}
