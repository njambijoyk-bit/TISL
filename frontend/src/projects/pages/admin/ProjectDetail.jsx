import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, extraValue, message, PRIORITY, STATE } from '../../lib/format';
import { Btn, Chip, Notice, Panel, PanelTitle, Tabs } from '../../components/ui';
import PhasesPanel from '../../components/PhasesPanel';
import PeoplePanel from '../../components/PeoplePanel';
import AccessPanel from '../../components/AccessPanel';
import UnlockPanel from '../../components/UnlockPanel';
import PartiesPanel from '../../components/PartiesPanel';
import MoneyPanel from '../../components/MoneyPanel';
import WorkTab from '../../components/WorkTab';
import MessagesPanel from '../../components/MessagesPanel';
import MeetingsPanel from '../../components/MeetingsPanel';
import FilesPanel from '../../components/FilesPanel';
import ActivityPanel from '../../components/ActivityPanel';
import LinksPanel from '../../components/LinksPanel';
import { hasPermission } from '../../../_shared/lib/roles';
import { useAuthStore } from '../../../_shared/store/index';
import { STATUS_TOKEN, tint } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * One piece of work, open (docs/PROJECTS_STAGE1_SPEC.md, builds 1.3 and 1.4): where it is in its stages, its details, its cost centre in the books, and its
 * phases, the people on it, what is linked to it from other modules, and its activity log. Every button is there only when the server says this person
 * may do it on this project (`can`); the words are the ones the server sends for this piece of work (`words`).
 */
function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--text-secondary)', flex: 'none' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

function StageBar({ project, onMove, busy }) {
  const current = project.stages.findIndex((s) => s.id === project.stage?.id);
  const still = project.state === 'on_hold' || project.state === 'cancelled';
  return (
    <ol aria-label="Stages" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
      {project.stages.map((s, i) => {
        const here = i === current;
        const token = STATUS_TOKEN[still && here ? STATE[project.state].status : s.status] || STATUS_TOKEN.info;
        const base = { padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', border: `1px solid ${here ? `var(${token})` : 'var(--line)'}`,
          background: here ? `var(${token})` : i < current ? tint(token, 12) : 'var(--surface-card)', color: here ? 'var(--surface-card)' : i < current ? `var(${token})` : 'var(--text-secondary)' };
        const can = project.can.stage && !still && !here && (s.state !== 'closed' && project.state !== 'closed' ? true : project.can.close);
        return (
          <li key={s.id}>
            {can
              ? <button type="button" disabled={busy} onClick={() => onMove(s)} aria-label={`Move to ${s.name}`} style={{ ...base, cursor: 'pointer' }}>{s.name}</button>
              : <span aria-current={here ? 'step' : undefined} style={{ ...base, display: 'inline-block' }}>{s.name}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [failed, setFailed] = useState(null);
  const [unlockSensitive, setUnlockSensitive] = useState(false);
  const [closed, setClosed] = useState(null);   // outside its hours: { message, opens_words, can_ask, asked, lead }
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(null);   // an action waiting for "are you sure": { label, run }
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'overview');   // a message can link straight to a tab
  const user = useAuthStore((s) => s.user);
  const [meetPrefill, setMeetPrefill] = useState(null);   // /meet in a conversation opens the meeting form with its people
  const fetchLog = useCallback((params) => projectsAPI.log(id, params), [id]);

  const load = useCallback(async () => {
    try {
      setProject(await projectsAPI.get(id));
      setFailed(null);
    } catch (e) {
      setClosed(e?.response?.data?.closed ? { ...e.response.data.closed, message: e.response.data.message } : null);
      setFailed(e?.response?.status === 404 ? 'notfound' : message(e, 'This could not be loaded. Check your connection and try again.'));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (run, done) => {
    setBusy(true);
    setAsking(null);
    try {
      setProject(await run());
      toast.success(done);
    } catch (e) {
      toast.error(message(e, 'That could not be done. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (failed && closed) {
    const ask = async () => {
      setBusy(true);
      try { await projectsAPI.askPass(id, null); toast.success('Asked. You will be told when it is answered.'); setClosed({ ...closed, can_ask: false, asked: true }); }
      catch (e) { toast.error(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
    };
    return (
      <AdminLayout><ProjectKeys />
        <PageHeader title="Closed for now" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
        <Panel style={{ maxWidth: 560 }}>
          <p style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.5 }}>{closed.message}</p>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--text-secondary)' }}>
            {closed.asked ? 'You have asked to be let in. You will be told when it is answered.' : closed.lead ? `Need it now? ${closed.lead} leads it and can let you in.` : 'Need it now? Someone who sets its hours can let you in.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {closed.can_ask && <Btn variant="primary" busy={busy} onClick={ask}>Ask to be let in</Btn>}
            <Btn onClick={load}>Try again</Btn>
          </div>
        </Panel>
      </AdminLayout>
    );
  }
  if (failed) {
    return (
      <AdminLayout><ProjectKeys />
        <PageHeader title="Not found" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
        <Notice status={failed === 'notfound' ? 'info' : 'problem'}>
          {failed === 'notfound' ? 'There is nothing here that you can open. It may have been removed, or you may not be on it.' : failed}
        </Notice>
      </AdminLayout>
    );
  }
  if (!project) {
    return <AdminLayout><ProjectKeys /><PageHeader title="Loading…" /><Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel></AdminLayout>;
  }

  const p = project;
  const word = (key, plural = false, lower = false) => { const n = p.words[key]; const text = n ? (plural ? n.plural : n.name) : key; return lower ? text.charAt(0).toLowerCase() + text.slice(1) : text; };
  const w = (key, lower = false) => word(key, false, lower);
  const can = p.can;
  const locks = p.locks || {};
  const areaOfTab = { phases: 'phases', people: 'people', links: 'links', activity: 'activity' }[tab];
  const lockedTab = areaOfTab && locks[areaOfTab]?.locked && !locks[areaOfTab].open ? areaOfTab : null;   // behind a password this person has not entered
  const openTab = areaOfTab && locks[areaOfTab]?.locked && locks[areaOfTab].open ? areaOfTab : null;
  const next = p.stages[p.stages.findIndex((s) => s.id === p.stage?.id) + 1];
  const mayMoveNext = next && can.stage && p.state === 'open' && (next.state !== 'closed' || can.close);
  const removeIt = async () => {
    setBusy(true);
    setAsking(null);
    try { await projectsAPI.remove(p.id); toast.success('In the trash'); navigate('/admin/projects'); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); setBusy(false); }
  };
  const move = (s) => act(() => projectsAPI.moveStage(p.id, s.id), s.state === 'closed' ? 'Closed' : `Moved to ${s.name}`);

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader
        title={`${p.number} · ${p.title}`}
        subtitle={`${p.type.name}${p.industry.name ? ` · ${p.industry.name}` : ''}`}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {can.edit && <Btn data-project-key="edit" onClick={() => navigate(`/admin/projects/${p.id}/edit`)}>Edit</Btn>}
            {can.stage && p.state === 'open' && <Btn data-project-key="hold" busy={busy} onClick={() => act(() => projectsAPI.setState(p.id, 'hold'), 'Put on hold')}>Put on hold</Btn>}
            {can.stage && p.state === 'on_hold' && <Btn data-project-key="hold" busy={busy} onClick={() => act(() => projectsAPI.setState(p.id, 'resume'), 'Resumed')}>Resume</Btn>}
            {can.close && (p.state === 'open' || p.state === 'on_hold') && <Btn variant="danger" busy={busy} onClick={() => setAsking({ label: `Cancel this ${w('project', true)}? It can be reopened later.`, yes: 'Yes, cancel it', run: () => act(() => projectsAPI.setState(p.id, 'cancel'), 'Cancelled') })}>Cancel it</Btn>}
            {can.close && p.state === 'cancelled' && <Btn busy={busy} onClick={() => act(() => projectsAPI.setState(p.id, 'reopen'), 'Reopened')}>Reopen</Btn>}
            {can.freeze && !p.frozen && (p.state === 'closed' || p.state === 'cancelled') && <Btn busy={busy} onClick={() => setAsking({ label: 'Freeze it? Nothing on it can be changed until it is unfrozen.', yes: 'Yes, freeze it', run: () => act(() => projectsAPI.freeze(p.id, true), 'Frozen') })}>Freeze</Btn>}
            {can.freeze && p.frozen && <Btn busy={busy} onClick={() => act(() => projectsAPI.freeze(p.id, false), 'Unfrozen')}>Unfreeze</Btn>}
            {can.edit && hasPermission(user, 'projects.delete') && <Btn data-project-key="delete" variant="danger" busy={busy} onClick={() => setAsking({ label: 'Put it in the trash? It can be taken back out.', yes: 'Yes, put it in the trash', run: removeIt })}>Delete</Btn>}
            {mayMoveNext && <Btn data-project-key="next" variant="primary" busy={busy} onClick={() => move(next)}>{next.state === 'closed' ? 'Close it' : `Move to ${next.name}`}</Btn>}
            <Btn onClick={() => navigate('/admin/projects')}>Close</Btn>
          </div>
        )}
      />

      {asking && (
        <Notice status="warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>{asking.label}</span>
          <span style={{ display: 'flex', gap: 8 }}><Btn small variant="danger" onClick={asking.run}>{asking.yes}</Btn><Btn small onClick={() => setAsking(null)}>Keep it as it is</Btn></span>
        </Notice>
      )}
      {p.frozen && <Notice status="info" style={{ marginBottom: 16 }}>This is frozen. It can be read, and nothing on it can be changed until it is unfrozen.</Notice>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(p.state === 'on_hold' || p.state === 'cancelled') && <Chip status={STATE[p.state].status}>{STATE[p.state].label}</Chip>}
        {p.confidential && <Chip status="problem">Confidential</Chip>}
        {p.frozen && <Chip>Frozen</Chip>}
        {PRIORITY[p.priority] && p.priority !== 'medium' && <Chip status={PRIORITY[p.priority].status}>{PRIORITY[p.priority].label} priority</Chip>}
      </div>
      <StageBar project={p} onMove={move} busy={busy} />
      <Tabs tabs={[{ key: 'overview', label: 'Overview' }, { key: 'phases', label: word('phase', true) }, { key: 'work', label: 'Work' }, ...(hasPermission(user, 'projects.messages.internal') || hasPermission(user, 'projects.messages.client') ? [{ key: 'messages', label: 'Messages' }] : []), ...(hasPermission(user, 'projects.files.view') ? [{ key: 'files', label: 'Files' }] : []), ...(hasPermission(user, 'projects.meetings') || hasPermission(user, 'projects.messages.internal') || hasPermission(user, 'projects.messages.client') ? [{ key: 'meetings', label: 'Meetings' }] : []), ...(can.members_view ? [{ key: 'people', label: 'People' }, { key: 'access', label: 'Access' }] : []), { key: 'parties', label: 'Parties' }, ...(can.money ? [{ key: 'money', label: 'Money' }] : []), { key: 'links', label: 'Links' }, ...(can.log ? [{ key: 'activity', label: 'Activity' }] : [])]} value={tab} onChange={setTab} label="Parts of this page" mark="project-key" />

      {lockedTab && <UnlockPanel key={lockedTab} projectId={p.id} area={lockedTab} label={locks[lockedTab].label} onOpened={load} />}
      {openTab && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 12.5, color: 'var(--text-secondary)' }} data-open-area={openTab}>
          <Chip status="info">Unlocked for you until {locks[openTab].until.slice(11, 16)}</Chip>
          <Btn small variant="quiet" onClick={async () => { await projectsAPI.lockAgain(p.id, openTab); load(); }}>Lock it again</Btn>
        </div>
      )}
      {!lockedTab && tab === 'phases' && <PhasesPanel key={`${p.id}-${p.frozen}`} projectId={p.id} word={word} />}
      {!lockedTab && tab === 'work' && <WorkTab key={`${p.id}-${p.frozen}`} projectId={p.id} word={word} />}
      {!lockedTab && tab === 'messages' && <MessagesPanel key={`${p.id}-${p.frozen}`} projectId={p.id} onMeet={(pre) => { setMeetPrefill(pre); setTab('meetings'); }} />}
      {!lockedTab && tab === 'files' && <FilesPanel key={`${p.id}-${p.frozen}`} projectId={p.id} />}
      {!lockedTab && tab === 'meetings' && <MeetingsPanel key={`${p.id}-${p.frozen}`} projectId={p.id} prefill={meetPrefill} onPrefillUsed={() => setMeetPrefill(null)} />}
      {tab === 'money' && <MoneyPanel key={p.id} projectId={p.id} />}
      {tab === 'parties' && <PartiesPanel key={`${p.id}-${p.frozen}`} projectId={p.id} word={word} />}
      {!lockedTab && tab === 'links' && <LinksPanel key={`${p.id}-${p.frozen}`} projectId={p.id} />}
      {!lockedTab && tab === 'activity' && <ActivityPanel fetch={fetchLog} describe={(what) => what.replace(/^Project\b/, word('project')).replace(/^Phase\b/, word('phase'))} />}
      {tab === 'access' && <AccessPanel key={`${p.id}-${p.frozen}`} projectId={p.id} word={word} onLocksChanged={load} />}
      {!lockedTab && tab === 'people' && <PeoplePanel key={`${p.id}-${p.frozen}`} projectId={p.id} word={word} onTransferred={setProject} />}
      {tab === 'overview' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Panel>
          <PanelTitle>Details</PanelTitle>
          <Row label={w('client')}>{p.customer?.name}</Row>
          <Row label={w('lead')}>{p.lead.name}</Row>
          <Row label="Kind of work">{p.type.name}</Row>
          <Row label="Branch">{p.branch?.name}</Row>
          <Row label={w('reference')}>{p.reference}</Row>
          <Row label={w('authority')}>{p.authority}</Row>
          <Row label={w('place')}>{p.place}</Row>
          <Row label="Start">{day(p.start_date)}</Row>
          <Row label="Expected end">{day(p.due_date)}</Row>
          <Row label={`${w('closing_period')} ends`}>{day(p.closing_period_ends)}</Row>
          {(p.fields || []).map((f) => <Row key={f.key} label={<>{f.label}{f.sensitive && <Chip status="problem" style={{ marginLeft: 6 }}>Sensitive</Chip>}</>}>{extraValue(f)}</Row>)}
          {locks.sensitive_fields?.locked && !locks.sensitive_fields.open && hasPermission(user, 'projects.fields.sensitive') && (
            unlockSensitive
              ? <UnlockPanel compact projectId={p.id} area="sensitive_fields" label="Sensitive fields" onOpened={() => { setUnlockSensitive(false); load(); }} />
              : <Row label="Sensitive fields"><Btn small onClick={() => setUnlockSensitive(true)}>Locked. Unlock to see them</Btn></Row>
          )}
          {p.description && <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.description}</p>}
        </Panel>

        <Panel>
          <PanelTitle hint="Everything this costs and earns is a voucher in the books that carries this cost centre. Nothing about money is kept here.">In the books</PanelTitle>
          {p.cost_centre_path
            ? <Row label="Cost centre">{p.cost_centre_path}</Row>
            : <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>It has no cost centre: the books had none when it was started.</p>}
          {p.links_count != null && <Row label="Linked records"><Btn small variant="quiet" style={{ padding: 0 }} data-overview-links onClick={() => setTab('links')}>{p.links_count === 0 ? 'None yet' : `${p.links_count} from other modules`}</Btn></Row>}
        </Panel>
      </div>
      )}
    </AdminLayout>
  );
}
