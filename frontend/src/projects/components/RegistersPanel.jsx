import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, DataTable, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const blank = { number: '', title: '', revision: '', status: '', file_id: '' };

/**
 * Registers on a piece of work (docs/PROJECTS_STAGE9_SPEC.md, build 9.4): numbered lines with a title, revision, status and file. A new version
 * of a line's file moves its revision on by itself.
 */
export default function RegistersPanel({ projectId, files = [] }) {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);   // { register, line }
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.registers(projectId)); } catch (e) { setProblem(message(e, 'The registers could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data?.registers) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async () => {
    try { setData(await projectsAPI.saveRegisterLine(projectId, edit.register, edit.line.id ?? null, { ...edit.line, file_id: edit.line.file_id || null })); setEdit(null); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'The line could not be saved.')); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }} data-registers>
      {problem && <Notice status="problem">{problem}</Notice>}
      {data.can.change && data.kinds.length > 0 && (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          Start a register:
          {data.kinds.map((k) => <Btn key={k.id} small onClick={async () => { try { setData(await projectsAPI.addRegister(projectId, k.id)); toast.success('Register started'); } catch (e) { setProblem(message(e, 'It could not be started.')); } }}>{k.name}</Btn>)}
        </span>
      )}
      {data.registers.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No registers on this work yet.</p>}
      {data.registers.map((r) => (
        <Panel key={r.id} data-register={r.name}>
          <PanelTitle hint={r.kind} right={data.can.change && edit?.register !== r.id ? <Btn small onClick={() => setEdit({ register: r.id, line: { ...blank } })}>Add a line</Btn> : null}>{r.name}</PanelTitle>
          <DataTable minWidth={640}>
            <thead><tr><th style={th}>Number</th><th style={th}>Title</th><th style={th}>Revision</th><th style={th}>Status</th><th style={th}>File</th>{data.can.change && <th style={th} />}</tr></thead>
            <tbody>
              {r.lines.map((l) => (edit?.line?.id === l.id ? null : (
                <tr key={l.id} data-line={l.number}>
                  <td style={td}>{l.number}</td><td style={td}>{l.title}</td><td style={td}>{l.revision ?? '—'}</td><td style={td}>{l.status ?? '—'}</td><td style={td}>{l.file?.name ?? '—'}</td>
                  {data.can.change && <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn small variant="quiet" onClick={() => setEdit({ register: r.id, line: { ...l, file_id: l.file?.id ?? '' } })}>Change</Btn>
                    <Btn small variant="quiet" onClick={async () => { try { setData(await projectsAPI.removeRegisterLine(projectId, r.id, l.id)); } catch (e) { setProblem(message(e, 'It could not be removed.')); } }}>Remove</Btn>
                  </td>}
                </tr>
              )))}
              {edit?.register === r.id && (
                <tr data-line-editor>
                  <td style={td}><TextInput aria-label="Number" value={edit.line.number} onChange={(e) => setEdit({ ...edit, line: { ...edit.line, number: e.target.value } })} /></td>
                  <td style={td}><TextInput aria-label="Title" value={edit.line.title} onChange={(e) => setEdit({ ...edit, line: { ...edit.line, title: e.target.value } })} /></td>
                  <td style={td}><TextInput aria-label="Revision" value={edit.line.revision ?? ''} onChange={(e) => setEdit({ ...edit, line: { ...edit.line, revision: e.target.value } })} /></td>
                  <td style={td}><SelectInput aria-label="Status" value={edit.line.status ?? ''} onChange={(e) => setEdit({ ...edit, line: { ...edit.line, status: e.target.value } })}><option value="">None</option>{r.statuses.map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput></td>
                  <td style={td}><SelectInput aria-label="File" value={edit.line.file_id ?? ''} onChange={(e) => setEdit({ ...edit, line: { ...edit.line, file_id: e.target.value ? Number(e.target.value) : '' } })}><option value="">None</option>{files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</SelectInput></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}><Btn small variant="primary" onClick={save}>Save</Btn> <Btn small onClick={() => setEdit(null)}>Cancel</Btn></td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </Panel>
      ))}
    </div>
  );
}
