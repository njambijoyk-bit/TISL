import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, LEAD_STATUS, message } from '../../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';
import LeadForm from '../../components/LeadForm';
import OpportunityForm from '../../components/OpportunityForm';
import OpportunityPanel from '../../components/OpportunityPanel';
import ContactsPanel from '../../components/ContactsPanel';
import HistoryPanel from '../../components/HistoryPanel';
import { useProjectNames } from '../../lib/names';
import { hasPermission } from '../../../_shared/lib/roles';
import { useAuthStore } from '../../../_shared/store/index';

/** One lead (build 3.1): who they are, where they came from, where it stands. Later builds add its contacts, history and next action. */
const Row = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
    <span style={{ color: 'var(--text-secondary)' }}>{label}</span><span style={{ textAlign: 'right', minWidth: 0 }}>{children || <span style={{ color: 'var(--text-secondary)' }}>·</span>}</span>
  </div>
);

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);   // null | 'edit' | 'lost'
  const [reasons, setReasons] = useState([]);
  const [lost, setLost] = useState({ lost_reason_id: '', lost_note: '' });
  const [busy, setBusy] = useState(false);
  const [opps, setOpps] = useState([]);
  const [openId, setOpenId] = useState(null);
  const { t } = useProjectNames();
  const user = useAuthStore((s) => s.user);
  const mayPipeline = hasPermission(user, 'projects.pipeline');
  const canOpp = { change: mayPipeline, start: hasPermission(user, 'projects.create'), make_client: hasPermission(user, 'projects.clients.manage') };

  const load = useCallback(async () => {
    try { setLead(await projectsAPI.lead(id)); setFailed(''); if (hasPermission(useAuthStore.getState().user, 'projects.pipeline') || hasPermission(useAuthStore.getState().user, 'projects.leads.view')) projectsAPI.opportunitiesOf('lead', id).then(setOpps).catch(() => setOpps([])); } catch (e) { setFailed(e?.response?.status === 404 ? 'There is no lead here that you can see.' : message(e, 'This could not be loaded. Try again.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const status = async (data, done) => {
    setBusy(true);
    try { setLead(await projectsAPI.changeLead(id, data)); setMode(null); toast.success(done); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const openLost = async () => { setMode('lost'); setLost({ lost_reason_id: '', lost_note: '' }); if (!reasons.length) { try { setReasons((await projectsAPI.leadOptions()).lost_reasons); } catch { setReasons([]); } } };

  if (failed) return <AdminLayout><ProjectKeys /><PageHeader title="Lead" actions={<Btn onClick={() => navigate('/admin/projects/leads')}>Close</Btn>} /><Notice status="info">{failed}</Notice></AdminLayout>;
  if (!lead) return <AdminLayout><ProjectKeys /><PageHeader title="Loading…" /></AdminLayout>;
  const can = lead.can.change && lead.status !== 'won';

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title={lead.name} subtitle={`A lead, owned by ${lead.owner.name}`} actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects/leads')}>Close</Btn>
          {can && !mode && <Btn onClick={() => setMode('edit')}>Edit</Btn>}
          {can && !mode && lead.status === 'new' && <Btn busy={busy} onClick={() => status({ status: 'working' }, 'Marked as being worked')}>Start working it</Btn>}
          {can && !mode && lead.status === 'lost' && <Btn busy={busy} onClick={() => status({ status: 'working' }, 'Brought back')}>Bring it back</Btn>}
          {can && !mode && lead.status !== 'lost' && canOpp.make_client && <Btn busy={busy} onClick={async () => { setBusy(true); try { const r = await projectsAPI.makeLeadClient(id); setLead(r.lead); toast.success('Now a client'); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); } }}>Make it a client</Btn>}
          {can && !mode && lead.status !== 'lost' && <Btn variant="danger" onClick={openLost}>Mark as lost</Btn>}
        </div>
      )} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Chip status={LEAD_STATUS[lead.status][1]}>{LEAD_STATUS[lead.status][0]}</Chip>
        {lead.lost && <Chip status="neutral">{lead.lost.reason}{lead.lost.note ? `: ${lead.lost.note}` : ''}</Chip>}
        {lead.customer_id && <Link to={`/admin/projects/clients/${lead.customer_id}`} style={{ color: 'var(--color-primary-500)', fontSize: 13 }}>Now a client</Link>}
      </div>

      {mode === 'lost' && (
        <Panel as="form" onSubmit={(e) => { e.preventDefault(); status({ status: 'lost', lost_reason_id: Number(lost.lost_reason_id), lost_note: lost.lost_note }, 'Marked as lost'); }} style={{ marginBottom: 16 }}>
          <PanelTitle hint="It stays findable, so the same name is recognised if it comes back.">Why was it lost?</PanelTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
            <Field label="Reason" htmlFor="lost-reason"><SelectInput id="lost-reason" value={lost.lost_reason_id} onChange={(e) => setLost({ ...lost, lost_reason_id: e.target.value })} required><option value="">Choose…</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>
            <Field label="A few words (optional)" htmlFor="lost-note"><TextInput id="lost-note" value={lost.lost_note} maxLength={200} onChange={(e) => setLost({ ...lost, lost_note: e.target.value })} /></Field>
            <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="danger" busy={busy}>Mark as lost</Btn><Btn onClick={() => setMode(null)}>Cancel</Btn></div>
          </div>
        </Panel>
      )}

      {openId && opps.find((x) => x.id === openId) && <OpportunityPanel opportunity={opps.find((x) => x.id === openId)} can={canOpp} word={t} onChanged={load} onClose={() => setOpenId(null)} />}
      {mode === 'opportunity' && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelTitle>New opportunity for {lead.name}</PanelTitle>
          <OpportunityForm forWhom={{ type: 'lead', id: lead.id, name: lead.name }} onSaved={(o) => { setMode(null); setOpenId(o.id); load(); }} onCancel={() => setMode(null)} />
        </Panel>
      )}
      {lead.status !== 'won' && <div style={{ maxWidth: 760 }}><HistoryPanel type="lead" id={lead.id} onChanged={load} /></div>}
      {lead.status !== 'won' && <div style={{ maxWidth: 640 }}><ContactsPanel type="lead" id={lead.id} /></div>}
      {(opps.length > 0 || (mayPipeline && lead.status !== 'lost')) && (
        <Panel style={{ marginBottom: 16, maxWidth: 640 }}>
          <PanelTitle right={mayPipeline && lead.status !== 'lost' && !mode && <Btn small variant="primary" onClick={() => { setMode('opportunity'); setOpenId(null); }}>New opportunity</Btn>}>Opportunities</PanelTitle>
          {opps.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None yet.</p>}
          {opps.map((x) => (
            <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
              <button type="button" onClick={() => { setOpenId(x.id); setMode(null); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary-500)', fontWeight: 600, fontFamily: 'var(--font-body)', fontSize: 13.5, textAlign: 'left' }}>{x.title}</button>
              <Chip status={x.stage.kind === 'won' ? 'good' : x.stage.kind === 'lost' ? 'problem' : 'info'}>{x.stage.name}</Chip>
            </div>
          ))}
        </Panel>
      )}

      <Panel style={{ maxWidth: mode === 'edit' ? undefined : 640 }}>
        {mode === 'edit'
          ? <><PanelTitle>Change the lead</PanelTitle><LeadForm lead={lead} onSaved={(l) => { setLead(l); setMode(null); toast.success('Saved'); }} onCancel={() => setMode(null)} /></>
          : <>
            <PanelTitle>Details</PanelTitle>
            <Row label="Who to talk to">{lead.contact_name}</Row>
            <Row label="Email">{lead.email}</Row>
            <Row label="Phone">{lead.phone}</Row>
            <Row label="Came from">{lead.referred_by?.name ? `${lead.source?.name || 'Referral'}: ${lead.referred_by.name}` : lead.source?.name}</Row>
            <Row label="Owner">{lead.owner.name}</Row>
            <Row label="Added">{day(lead.created_at)}</Row>
            {lead.notes && <p style={{ margin: '12px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{lead.notes}</p>}
          </>}
      </Panel>
    </AdminLayout>
  );
}
