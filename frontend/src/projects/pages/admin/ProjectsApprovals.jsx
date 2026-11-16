import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { message } from '../../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, TextInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * Approvals (docs/PROJECTS_STAGE2_SPEC.md, builds 2.3 and 2.4): what is waiting for me as the second person, and what I have asked for.
 * Approving changes nothing by itself: the person who asked then carries it out. Nobody answers their own request.
 */
const STATUS = { waiting: ['Waiting', 'warning'], approved: ['Approved, not done yet', 'good'], declined: ['Declined', 'problem'], withdrawn: ['Withdrawn', 'neutral'], used: ['Done', 'neutral'], lapsed: ['Lapsed', 'neutral'] };
const when = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '');

export default function ProjectsApprovals() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [declining, setDeclining] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.approvals()); setFailed(''); } catch (e) { setFailed(message(e, 'Approvals could not be loaded. Try again.')); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setDeclining(null); setNote(''); toast.success(done); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Approvals" subtitle="Things that need a second person before they can happen" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
      {failed && <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {data && (
        <div style={{ display: 'grid', gap: 16 }}>
          {data.can.answer && (
            <Panel>
              <PanelTitle hint="Approving does not carry it out. The person who asked does that, and it is checked again then.">Waiting for me</PanelTitle>
              {data.waiting.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13.5 }}>Nothing is waiting for you.</p>}
              <div style={{ display: 'grid', gap: 10 }}>
                {data.waiting.map((a) => (
                  <div key={a.id} data-approval={a.id} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14 }}><strong>{a.asked_by}</strong> asks to: {a.summary}</span>
                      <Chip status="warning">{a.hours_left < 1 ? 'Under an hour left' : `${a.hours_left} h left`}</Chip>
                    </div>
                    {a.reason && <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>They say: {a.reason}</p>}
                    {declining === a.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.answerApproval(a.id, false, note), 'Declined'); }} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 10 }}>
                        <Field label="Why you are declining" htmlFor={`decline-${a.id}`} style={{ flex: '1 1 240px' }}><TextInput id={`decline-${a.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} required /></Field>
                        <Btn type="submit" variant="danger" small busy={busy}>Decline it</Btn>
                        <Btn small onClick={() => setDeclining(null)}>Cancel</Btn>
                      </form>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <Btn small variant="primary" busy={busy} onClick={() => run(() => projectsAPI.answerApproval(a.id, true, null), 'Approved')}>Approve</Btn>
                        <Btn small onClick={() => { setDeclining(a.id); setNote(''); }}>Decline</Btn>
                        {a.project_id && <Btn small variant="quiet" onClick={() => navigate(`/admin/projects/${a.project_id}`)}>Open {a.project}</Btn>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
          <Panel>
            <PanelTitle hint="The last two weeks. Once one is approved, go back to where you asked and carry it out.">What I asked for</PanelTitle>
            {data.mine.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13.5 }}>You have not asked for anything.</p>}
            <div style={{ display: 'grid', gap: 8 }}>
              {data.mine.map((a) => (
                <div key={a.id} data-mine={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 13.5, minWidth: 0 }}>
                    {a.summary} <span style={{ color: 'var(--text-secondary)' }}>· asked {when(a.asked_at)}</span>
                    {a.answered_by && <span style={{ color: 'var(--text-secondary)' }}> · {a.answered_by}{a.answer_note ? `: ${a.answer_note}` : ''}</span>}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <Chip status={STATUS[a.status]?.[1]}>{STATUS[a.status]?.[0] || a.status}</Chip>
                    {a.status === 'approved' && a.project_id && <Btn small variant="primary" onClick={() => navigate(`/admin/projects/${a.project_id}?tab=access`)}>Go and do it</Btn>}
                    {['waiting', 'approved'].includes(a.status) && <Btn small busy={busy} onClick={() => run(() => projectsAPI.withdrawApproval(a.id), 'Withdrawn')}>Withdraw</Btn>}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </AdminLayout>
  );
}
