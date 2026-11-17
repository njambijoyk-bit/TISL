import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { check } from './uiTokens';
import OpportunityForm from './OpportunityForm';
import HistoryPanel from './HistoryPanel';

/**
 * One opportunity, opened from the board or from a lead or client (build 3.2): where it stands, what it is worth, and what can be done with it.
 * Moving it, losing it (with a reason), winning it (which makes the lead a client and can start the work), and starting the work later.
 * `can` is { change, start, make_client }; `onChanged()` tells the page to load again; `onClose()` puts it away.
 */
export default function OpportunityPanel({ opportunity: o, can, word, onChanged, onClose }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);   // null | 'edit' | 'lose' | 'win' | 'start'
  const [options, setOptions] = useState(null);
  const [reason, setReason] = useState('');
  const [win, setWin] = useState({ start: false, title: o.title, type_id: o.kind?.id || '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.pipelineOptions().then(setOptions).catch(() => setOptions({ stages: [], lost_reasons: [], types: [] })); }, []);
  useEffect(() => { setMode(null); setProblem(''); setWin({ start: false, title: o.title, type_id: o.kind?.id || '' }); }, [o.id, o.title, o.kind?.id]);

  const thing = word('project', false, true);
  const run = async (call, done, after) => {
    setBusy(true);
    try { const r = await call(); toast.success(done); setMode(null); setProblem(''); onChanged(); after?.(r); }
    catch (e) { setProblem(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const open = o.stage.kind === 'open' || o.stage.kind === 'lost';
  const stages = (options?.stages || []).filter((s) => s.kind === 'open');
  const forLead = o.for.type === 'lead';
  const needsClient = forLead && !can.make_client;

  return (
    <Panel style={{ marginBottom: 16 }} data-opportunity={o.id}>
      <PanelTitle
        hint={<>For <Link to={forLead ? `/admin/projects/leads/${o.for.id}` : `/admin/projects/clients/${o.for.id}`} style={{ color: 'var(--color-primary-500)' }}>{o.for.name}</Link>, {forLead ? 'a lead' : 'a client'} · owned by {o.owner.name}</>}
        right={<Btn small onClick={onClose}>Put away</Btn>}
      >
        {o.title}
      </PanelTitle>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <Chip status={o.stage.kind === 'won' ? 'good' : o.stage.kind === 'lost' ? 'problem' : 'info'}>{o.stage.name}{o.lost_reason ? `: ${o.lost_reason}` : ''}</Chip>
        {o.kind && <Chip>{o.kind.name}</Chip>}
        {o.expected_on && <Chip>Expected by {day(o.expected_on)}</Chip>}
        {o.value && (o.value.amount !== null
          ? <Chip status={o.value.from === 'quotation' ? 'good' : 'neutral'}>{o.value.from === 'quotation' ? `${o.value.title} · ` : 'Estimate: '}{money(o.value.amount, o.value.currency)}</Chip>
          : <Chip>{o.value.title}</Chip>)}
        {o.project && <Link to={`/admin/projects/${o.project.id}`} style={{ color: 'var(--color-primary-500)', fontSize: 13, fontWeight: 600 }}>Now {o.project.number}</Link>}
      </div>
      {o.notes && !mode && <p style={{ margin: '0 0 12px', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{o.notes}</p>}

      {mode === 'edit' && <OpportunityForm opportunity={o} onSaved={() => { toast.success('Saved'); setMode(null); onChanged(); }} onCancel={() => setMode(null)} />}

      {mode === 'lose' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeOpportunity(o.id, { stage_id: options.stages.find((s) => s.kind === 'lost').id, lost_reason_id: Number(reason) }), 'Marked as lost'); }} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Why was it lost?" htmlFor="opp-lost"><SelectInput id="opp-lost" value={reason} onChange={(e) => setReason(e.target.value)} required><option value="">Choose…</option>{(options?.lost_reasons || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>
          <Btn type="submit" variant="danger" small busy={busy}>Mark as lost</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
        </form>
      )}

      {(mode === 'win' || mode === 'start') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = { title: win.title, type_id: win.type_id ? Number(win.type_id) : null };
            if (mode === 'start') run(() => projectsAPI.startOpportunityProject(o.id, data), 'Started', (r) => navigate(`/admin/projects/${r.project_id}`));
            else run(() => projectsAPI.winOpportunity(o.id, { ...data, start_project: win.start }), 'Won', (r) => { if (r.project_id) navigate(`/admin/projects/${r.project_id}`); });
          }}
          style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)' }}
        >
          {mode === 'win' && <p style={{ margin: 0, fontSize: 13.5 }}>{forLead ? <><strong>{o.for.name}</strong> becomes a client: a customer record with its account in the books. What is known about the lead moves with it.</> : <>This is marked as won for <strong>{o.for.name}</strong>.</>}</p>}
          {mode === 'win' && can.start && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={win.start} onChange={(e) => setWin({ ...win, start: e.target.checked })} />Start the {thing} now</label>}
          {(mode === 'start' || win.start) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <Field label={`Title of the ${thing}`} htmlFor="win-title"><TextInput id="win-title" value={win.title} maxLength={160} onChange={(e) => setWin({ ...win, title: e.target.value })} required /></Field>
              <Field label="Kind of work" htmlFor="win-type"><SelectInput id="win-type" value={win.type_id} onChange={(e) => setWin({ ...win, type_id: e.target.value })} required><option value="">Choose…</option>{(options?.types || []).map((t) => <option key={t.id} value={t.id}>{t.industry}: {t.name}</option>)}</SelectInput></Field>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>{mode === 'start' ? `Start the ${thing}` : win.start ? `Win it and start the ${thing}` : 'Win it'}</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
        </form>
      )}
      {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}

      {!mode && can.change && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {open && (
            <SelectInput aria-label="Move to stage" value={o.stage.kind === 'open' ? o.stage.id : ''} disabled={busy} onChange={(e) => e.target.value && run(() => projectsAPI.changeOpportunity(o.id, { stage_id: Number(e.target.value) }), 'Moved')} style={{ width: 'auto' }}>
              {o.stage.kind !== 'open' && <option value="">Bring it back to…</option>}
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectInput>
          )}
          {o.stage.kind === 'open' && <Btn small variant="primary" disabled={needsClient} onClick={() => setMode('win')}>Win it</Btn>}
          {o.stage.kind === 'open' && <Btn small variant="danger" onClick={() => { setReason(''); setMode('lose'); }}>Lost</Btn>}
          {open && <Btn small onClick={() => setMode('edit')}>Edit</Btn>}
          {o.stage.kind === 'won' && !o.project && can.start && <Btn small variant="primary" onClick={() => setMode('start')}>Start the {thing}</Btn>}
          {o.stage.kind === 'open' && needsClient && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Winning makes this lead a client, which needs someone who manages clients.</span>}
        </div>
      )}
      {!mode && <div style={{ marginTop: 14 }}><HistoryPanel key={o.id} type="opportunity" id={o.id} onChanged={onChanged} /></div>}
    </Panel>
  );
}
