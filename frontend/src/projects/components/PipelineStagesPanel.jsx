import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { td, th } from './uiTokens';

/** The stages of the pipeline (build 3.2): add, rename, reorder, switch off. Won and Lost are the two ends and stay. */
export default function PipelineStagesPanel() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.pipelineStages().then(setData).catch((e) => setFailed(message(e, 'The stages could not be loaded. Try again.'))); }, []);
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setProblem(''); setRenaming(null); if (done) toast.success(done); return true; }
    catch (e) { setProblem(message(e, 'That could not be done. Try again.')); return false; } finally { setBusy(false); }
  };
  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const can = data.can.change && data.ready;
  const open = data.stages.filter((s) => s.kind === 'open');

  return (
    <Panel>
      <PanelTitle hint="The columns of the pipeline, in order. A new stage goes just before Won.">Pipeline stages</PanelTitle>
      {!data.ready && <Notice status="warning" style={{ marginBottom: 12 }}>The pipeline needs database script 259.</Notice>}
      {can && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => projectsAPI.addPipelineStage(name), 'Added')) setName(''); }} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label="New stage" htmlFor="stage-name" style={{ flex: '1 1 220px' }}><TextInput id="stage-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setProblem(''); }} required /></Field>
          <Btn type="submit" variant="primary" small busy={busy}>Add stage</Btn>
        </form>
      )}
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      <DataTable minWidth={520}>
        <thead><tr><th style={th}>Stage</th><th style={th}>Opportunities</th><th style={th}>In use</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {data.stages.map((s) => (
            <tr key={s.id} data-pipeline-stage={s.name}>
              <td style={{ ...td, fontWeight: 600 }}>
                {renaming?.id === s.id
                  ? <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changePipelineStage(s.id, { name: renaming.name }), 'Renamed'); }} style={{ display: 'flex', gap: 6 }}>
                    <TextInput aria-label={`New name for the stage ${s.name}`} value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} required autoFocus />
                    <Btn type="submit" small variant="primary" busy={busy}>Save</Btn><Btn small onClick={() => setRenaming(null)}>Cancel</Btn>
                  </form>
                  : <>{s.name}{s.kind !== 'open' && <Chip status={s.kind === 'won' ? 'good' : 'problem'} style={{ marginLeft: 6 }}>An end</Chip>}</>}
              </td>
              <td style={td}>{s.opportunities}</td>
              <td style={td}><Chip status={s.is_active ? 'good' : 'neutral'}>{s.is_active ? 'Yes' : 'Off'}</Chip></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {can && renaming?.id !== s.id && (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    {s.kind === 'open' && <Btn small disabled={open[0]?.id === s.id} aria-label={`Move the stage ${s.name} up`} onClick={() => run(() => projectsAPI.changePipelineStage(s.id, { move: 'up' }))}>Up</Btn>}
                    {s.kind === 'open' && <Btn small disabled={open.at(-1)?.id === s.id} aria-label={`Move the stage ${s.name} down`} onClick={() => run(() => projectsAPI.changePipelineStage(s.id, { move: 'down' }))}>Down</Btn>}
                    <Btn small aria-label={`Rename the stage ${s.name}`} onClick={() => setRenaming({ id: s.id, name: s.name })}>Rename</Btn>
                    {s.kind === 'open' && <Btn small aria-label={`${s.is_active ? 'Switch off' : 'Switch on'} the stage ${s.name}`} onClick={() => run(() => projectsAPI.changePipelineStage(s.id, { is_active: !s.is_active }), s.is_active ? 'Switched off' : 'Switched on')}>{s.is_active ? 'Switch off' : 'Switch on'}</Btn>}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}
