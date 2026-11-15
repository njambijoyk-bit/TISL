import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * The parts of a piece of work, as a tree (docs/PROJECTS_STAGE1_SPEC.md, build 1.4). Each part has a cost centre of its own in the books or
 * uses the one above it. `word(key, plural, lower)` gives the industry's word for a phase (Section, Design stage, Episode of care…).
 */
const BLANK = { code: '', name: '', parent_id: '', own_cost_centre: false, start_date: '', due_date: '' };

function PhaseForm({ initial, phases, word, onSave, onCancel, adding }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSave(f);
    setBusy(false);
  };
  const one = word('phase', false, true);
  return (
    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)' }}>
      <Field label="Code" htmlFor="phase-code"><TextInput id="phase-code" value={f.code} maxLength={30} placeholder="1.2" onChange={(e) => set({ code: e.target.value })} /></Field>
      <Field label="Name" htmlFor="phase-name" style={{ gridColumn: 'span 2' }}><TextInput id="phase-name" value={f.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} required autoFocus /></Field>
      {adding && (
        <Field label="Under" htmlFor="phase-parent">
          <SelectInput id="phase-parent" value={f.parent_id} onChange={(e) => set({ parent_id: e.target.value })}>
            <option value="">Nothing: a top-level {one}</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{`${'— '.repeat(p.depth)}${p.code ? `${p.code} ` : ''}${p.name}`}</option>)}
          </SelectInput>
        </Field>
      )}
      <Field label="Start" htmlFor="phase-start"><TextInput id="phase-start" type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
      <Field label="End" htmlFor="phase-due"><TextInput id="phase-due" type="date" value={f.due_date} min={f.start_date || undefined} onChange={(e) => set({ due_date: e.target.value })} /></Field>
      {adding && (
        <label htmlFor="phase-own-cc" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <input id="phase-own-cc" type="checkbox" checked={f.own_cost_centre} onChange={(e) => set({ own_cost_centre: e.target.checked })} />
          <span>Give it a cost centre of its own in the books, so its costs can be seen apart. Otherwise it uses the one above it.</span>
        </label>
      )}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
        <Btn type="submit" variant="primary" small busy={busy}>{adding ? `Add ${one}` : 'Save changes'}</Btn>
        <Btn small onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

export default function PhasesPanel({ projectId, word }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);       // null | { add: parentId } | { edit: phase } | { remove: phase }

  const load = useCallback(async () => {
    try { setData(await projectsAPI.phases(projectId)); setFailed(''); } catch (e) { setFailed(message(e, 'The list could not be loaded. Try again.')); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const run = async (call, done) => {
    try { setData(await call()); setMode(null); toast.success(done); return true; } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); return false; }
  };
  const one = word('phase', false, true);
  const many = word('phase', true);
  const can = data?.can?.phases;
  const label = (p) => `${p.code ? `${p.code} ` : ''}${p.name}`;
  const clean = (f) => ({ code: f.code, name: f.name, start_date: f.start_date || null, due_date: f.due_date || null });

  return (
    <Panel>
      <PanelTitle
        hint={`Break the work into ${word('phase', true, true)}, to any depth. Each one has a cost centre of its own in the books or uses the one above it.`}
        right={can && !mode ? <Btn small variant="primary" onClick={() => setMode({ add: '' })}>New {one}</Btn> : null}
      >
        {many}
      </PanelTitle>

      {failed && <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {mode && 'add' in mode && (
        <div style={{ marginBottom: 12 }}>
          <PhaseForm adding initial={{ ...BLANK, parent_id: mode.add }} phases={data.phases} word={word} onCancel={() => setMode(null)}
            onSave={(f) => run(() => projectsAPI.addPhase(projectId, { ...clean(f), parent_id: f.parent_id ? Number(f.parent_id) : null, own_cost_centre: f.own_cost_centre }), 'Added')} />
        </div>
      )}
      {mode?.remove && (
        <Notice status="warning" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Put <b>{label(mode.remove)}</b>{mode.remove.children ? ' and everything under it' : ''} in the trash? It can be taken back out.</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="danger" onClick={() => run(() => projectsAPI.removePhase(projectId, mode.remove.id), 'Put in the trash')}>Yes, put it in the trash</Btn>
            <Btn small onClick={() => setMode(null)}>Keep it</Btn>
          </span>
        </Notice>
      )}

      {data && data.phases.length === 0 && !mode && (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No {word('phase', true, true)} yet. {can ? `Add the first with New ${one}.` : ''}</p>
      )}
      {data && data.phases.length > 0 && (
        <DataTable minWidth={720}>
          <thead><tr><th style={th}>{word('phase')}</th><th style={th}>Dates</th><th style={th}>Costs land in</th>{can && <th style={th}><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th>}</tr></thead>
          <tbody>
            {data.phases.map((p) => (mode?.edit?.id === p.id ? (
              <tr key={p.id}><td style={td} colSpan={can ? 4 : 3}>
                <PhaseForm initial={{ ...BLANK, code: p.code || '', name: p.name, start_date: p.start_date || '', due_date: p.due_date || '' }} phases={data.phases} word={word} onCancel={() => setMode(null)}
                  onSave={(f) => run(() => projectsAPI.changePhase(projectId, p.id, clean(f)), 'Saved')} />
              </td></tr>
            ) : (
              <tr key={p.id} data-phase={p.name}>
                <td style={{ ...td, paddingLeft: 10 + p.depth * 22 }}>
                  {p.code && <span style={{ color: 'var(--text-secondary)', marginRight: 6, fontVariantNumeric: 'tabular-nums' }}>{p.code}</span>}
                  <span style={{ fontWeight: p.depth === 0 ? 600 : 400 }}>{p.name}</span>
                  {p.state === 'done' && <Chip status="good" style={{ marginLeft: 8 }}>Done</Chip>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.start_date || p.due_date ? `${day(p.start_date) || '…'} to ${day(p.due_date) || '…'}` : '—'}</td>
                <td style={td}>
                  {p.has_own_cost_centre ? <Chip status="brand">Its own</Chip> : <span style={{ color: 'var(--text-secondary)' }}>{p.cost_centre_id ? 'The one above' : 'None'}</span>}
                  {p.has_own_cost_centre && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{p.cost_centre_path}</div>}
                </td>
                {can && (
                  <td style={{ ...td, width: 250 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
                    <Btn small variant="quiet" aria-label={`Add under ${label(p)}`} onClick={() => setMode({ add: String(p.id) })}>Add under</Btn>
                    <Btn small variant="quiet" aria-label={`Change ${label(p)}`} onClick={() => setMode({ edit: p })}>Change</Btn>
                    <Btn small variant="quiet" aria-label={`Mark ${label(p)} ${p.state === 'done' ? 'open' : 'done'}`} onClick={() => run(() => projectsAPI.changePhase(projectId, p.id, { state: p.state === 'done' ? 'open' : 'done' }), p.state === 'done' ? 'Open again' : 'Marked done')}>{p.state === 'done' ? 'Reopen' : 'Done'}</Btn>
                    <Btn small variant="quiet" aria-label={`Move ${label(p)} up`} onClick={() => run(() => projectsAPI.changePhase(projectId, p.id, { move: 'up' }), 'Moved')}>↑</Btn>
                    <Btn small variant="quiet" aria-label={`Move ${label(p)} down`} onClick={() => run(() => projectsAPI.changePhase(projectId, p.id, { move: 'down' }), 'Moved')}>↓</Btn>
                    {!p.has_own_cost_centre && p.cost_centre_id && <Btn small variant="quiet" aria-label={`Give ${label(p)} its own cost centre`} onClick={() => run(() => projectsAPI.changePhase(projectId, p.id, { own_cost_centre: true }), 'Cost centre made in the books')}>Own cost centre</Btn>}
                    {data.can.delete && <Btn small variant="quiet" aria-label={`Delete ${label(p)}`} onClick={() => setMode({ remove: p })}>Delete</Btn>}
                    </div>
                  </td>
                )}
              </tr>
            )))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}
