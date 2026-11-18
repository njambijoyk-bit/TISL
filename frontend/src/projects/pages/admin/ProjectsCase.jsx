import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message } from '../../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

const TONE = { new: 'info', looking: 'warning', action: 'good', closed: 'neutral' };
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };
const when = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * One casebook report (docs/PROJECTS_STAGE8_SPEC.md, build 8.5). The reporter follows it and writes to whoever handles it. A handler takes it,
 * moves it through its states, writes the outcome, messages the reporter or leaves a note only handlers see, and (with the permission) reveals a
 * hidden name, which may need a supervisor first and always tells the reporter. Every view and change is in the case's own log.
 */
export default function ProjectsCase() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [flag, setFlag] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setC((await projectsAPI.case(id)).case); setProblem(''); } catch (e) { setProblem(message(e, 'This report could not be opened.')); } }, [id]);
  useEffect(() => { load(); }, [load]);
  const act = async (call, done) => { try { setC((await call()).case); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const header = <PageHeader title={c ? `${c.number} · ${c.kind.name}` : 'Report'} subtitle={c ? `Reported ${when(c.reported_at)} · ${c.reporter}` : ''} actions={<Btn onClick={() => navigate('/admin/projects/casebook')}>Casebook</Btn>} />;
  if (!c) return <AdminLayout><ProjectKeys />{header}{problem && <Notice status="problem">{problem}</Notice>}</AdminLayout>;

  return (
    <AdminLayout><ProjectKeys />
      {header}
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, alignItems: 'start' }} data-case-page>
        <div style={{ display: 'grid', gap: 16 }}>
          <Panel data-case-report>
            <PanelTitle right={<Chip status={TONE[c.state]}>{c.states[c.state]}</Chip>}>What happened</PanelTitle>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{c.what}</div>
            <div style={{ display: 'grid', gap: 4, marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              {c.happened_on && <span>When: {day(c.happened_on)}</span>}
              {c.about.length > 0 && <span>About: {c.about.map((a) => `${a.name}${a.type === 'client' ? ' (client)' : ''}`).join(', ')}</span>}
              {c.project && <span>On: {c.project.number} {c.project.title}</span>}
              {c.can.handle && <span>Sent to: {c.routed_to}{c.handler ? ` · taken by ${c.handler}` : ''}</span>}
              {c.hidden && c.can.handle && <span>The reporter asked for their name to be hidden.</span>}
              {c.revealed && <span>Name revealed by {c.revealed.by}, {when(c.revealed.at)}.</span>}
            </div>
            {c.outcome && <div style={{ marginTop: 10, fontSize: 13.5, padding: 10, borderRadius: 8, background: 'var(--surface-hover)' }}><strong>Outcome:</strong> {c.outcome}</div>}
          </Panel>
          <Panel data-case-messages>
            <PanelTitle hint={c.can.handle ? 'Messages go to the reporter; a note stays with those handling it.' : 'Write to whoever handles your report.'}>Messages</PanelTitle>
            {c.messages.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No messages yet.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              {c.messages.map((m) => (
                <div key={m.id} data-case-message={m.id} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: m.internal ? 'var(--surface-hover)' : 'var(--surface-card)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{m.from} · {when(m.at)}{m.internal ? ' · note for handlers only' : ''}</div>
                  <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                </div>
              ))}
            </div>
            {c.can.message && (
              <form onSubmit={async (e) => { e.preventDefault(); if (draft.trim() && await act(() => projectsAPI.caseMessage(c.id, draft, internal), internal ? 'Note saved' : 'Sent')) { setDraft(''); setInternal(false); } }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <textarea aria-label="Your message" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} style={area} />
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Btn type="submit" small variant="primary" disabled={!draft.trim()}>{internal ? 'Save the note' : 'Send'}</Btn>
                  {c.can.handle && <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> A note for handlers only</label>}
                </span>
              </form>
            )}
          </Panel>
        </div>
        {c.can.handle && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Panel data-case-handle>
              <PanelTitle>Handling</PanelTitle>
              <div style={{ display: 'grid', gap: 8 }}>
                {!c.handler && <Btn small onClick={() => act(() => projectsAPI.changeCase(c.id, { take: true }), 'It is yours')}>Take it</Btn>}
                <Field label="State" htmlFor="case-state"><SelectInput id="case-state" value={c.state} onChange={(e) => act(() => projectsAPI.changeCase(c.id, { state: e.target.value }), 'Changed. The reporter is told.')}>{Object.entries(c.states).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
                {outcome === null ? <Btn small onClick={() => setOutcome(c.outcome ?? '')}>{c.outcome ? 'Change the outcome' : 'Write the outcome'}</Btn> : (
                  <>
                    <textarea aria-label="Outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} style={area} />
                    <span style={{ display: 'flex', gap: 6 }}><Btn small variant="primary" onClick={async () => { if (await act(() => projectsAPI.changeCase(c.id, { outcome }), 'Saved')) setOutcome(null); }}>Save</Btn><Btn small onClick={() => setOutcome(null)}>Cancel</Btn></span>
                  </>
                )}
                {c.can.reveal && <Btn small variant="danger" onClick={() => { const why = window.prompt('Reveal the reporter\'s name? They will be told. Say why:'); if (why) act(() => projectsAPI.revealCase(c.id, why), 'Revealed. The reporter is told.'); }}>Reveal the name</Btn>}
                {c.flags.length > 0 && c.about.some((a) => a.type === 'client') && (flag === null ? <Btn small onClick={() => setFlag({ client_id: c.about.find((a) => a.type === 'client').id, flag_id: c.flags[0].id, reason: '' })}>Raise a client flag</Btn> : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <SelectInput aria-label="Which client" value={flag.client_id} onChange={(e) => setFlag({ ...flag, client_id: Number(e.target.value) })}>{c.about.filter((a) => a.type === 'client').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput>
                    <SelectInput aria-label="Which flag" value={flag.flag_id} onChange={(e) => setFlag({ ...flag, flag_id: Number(e.target.value) })}>{c.flags.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</SelectInput>
                    <TextInput aria-label="Why" value={flag.reason} placeholder="Why" onChange={(e) => setFlag({ ...flag, reason: e.target.value })} />
                    <span style={{ display: 'flex', gap: 6 }}><Btn small variant="primary" onClick={async () => { if (await act(() => projectsAPI.flagCaseClient(c.id, flag), 'Flag raised')) setFlag(null); }}>Raise it</Btn><Btn small onClick={() => setFlag(null)}>Cancel</Btn></span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel data-case-log>
              <PanelTitle hint="Every view and change, kept">Log</PanelTitle>
              <div style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                {c.log.map((l, i) => <div key={i}><span style={{ color: 'var(--text-secondary)' }}>{when(l.at)}</span> · {l.who ?? 'Projects'} · {l.action}{l.detail ? `: ${l.detail}` : ''}</div>)}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
