import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, Notice, Panel, SelectInput, TextInput } from './ui';
import MakeDocument from './MakeDocument';

const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

/**
 * The Files tab (docs/PROJECTS_STAGE9_SPEC.md, build 9.1): folders on the work, files with their versions, team-only or shared with the client.
 * The bytes live in the Core vault; this tab shows what Projects says about each file. Downloads go through the signed-in session.
 */
export default function FilesPanel({ projectId }) {
  const [data, setData] = useState(null);
  const [folder, setFolder] = useState(null);
  const [removed, setRemoved] = useState(false);
  const [open, setOpen] = useState(null);   // a file's details: { id, versions }
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  const [making, setMaking] = useState(false);
  const picker = useRef(null);
  const versionPicker = useRef(null);
  const load = useCallback(async () => { try { setData(await projectsAPI.files(projectId, { removed: removed ? 1 : 0 })); setProblem(''); } catch (e) { setProblem(message(e, 'The files could not be loaded.')); } }, [projectId, removed]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice status="warning">Files need database script 266.</Notice>;
  const run = async (call, done) => { try { setData(await call()); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const send = async (list) => {
    setBusy('upload');
    for (const f of list) {
      if (f.size > data.max_kb * 1024) { setProblem(`${f.name} is over 50 MB.`); continue; }
      await run(() => projectsAPI.uploadFile(projectId, f, folder), `${f.name} added`);
    }
    setBusy('');
  };
  const fetchFile = async (f, version = null, inline = false) => {
    try {
      const blob = await projectsAPI.downloadFile(projectId, f.id, version, inline);
      const url = URL.createObjectURL(blob);
      if (inline) window.open(url, '_blank', 'noopener'); else { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setProblem(message(e, 'The file could not be opened.')); }
  };
  const showVersions = async (f) => { try { setOpen({ id: f.id, versions: (await projectsAPI.fileVersions(projectId, f.id)).versions }); } catch (e) { setProblem(message(e, 'The versions could not be loaded.')); } };
  const path = [];
  for (let id = folder; id;) { const f = data.folders.find((x) => x.id === id); if (!f) break; path.unshift(f); id = f.parent_id; }
  const subfolders = data.folders.filter((f) => (f.parent_id ?? null) === folder);
  const files = removed ? data.files : data.files.filter((f) => (f.folder_id ?? null) === folder);

  return (
    <Panel data-files onDragOver={(e) => { if (data.can.manage && !removed) e.preventDefault(); }} onDrop={(e) => { if (!data.can.manage || removed) return; e.preventDefault(); send([...e.dataTransfer.files]); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <nav aria-label="Folders" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setFolder(null); setRemoved(false); }} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--color-primary-500)', fontWeight: 600 }}>All files</button>
          {path.map((f) => <span key={f.id}> / <button type="button" onClick={() => setFolder(f.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--color-primary-500)', fontWeight: 600 }}>{f.name}</button></span>)}
          {removed && <span> / Removed</span>}
        </nav>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {data.can.manage && !removed && <>
            <Btn small variant="primary" busy={busy === 'upload'} onClick={() => picker.current?.click()}>Add files</Btn>
            <Btn small onClick={() => { const n = window.prompt('Folder name'); if (n) run(() => projectsAPI.addFolder(projectId, n, folder), 'Folder added'); }}>New folder</Btn>
            <Btn small onClick={() => setMaking(true)}>Make a document</Btn>
          </>}
          {data.can.manage && <Btn small variant="quiet" aria-pressed={removed} onClick={() => setRemoved(!removed)}>{removed ? 'Back to the files' : 'Removed files'}</Btn>}
        </span>
        <input ref={picker} type="file" multiple hidden aria-label="Choose files" onChange={(e) => { send([...e.target.files]); e.target.value = ''; }} />
        <input ref={versionPicker} type="file" hidden aria-label="Choose the new version" onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && open) { const note = window.prompt('What changed? (optional)') ?? ''; if (await run(() => projectsAPI.fileVersion(projectId, open.id, f, note), 'New version added')) showVersions({ id: open.id }); } }} />
      </div>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {making && <MakeDocument projectId={projectId} folderId={folder} onClose={() => setMaking(false)} onMade={(r) => { setData(r); setMaking(false); }} />}
      {!removed && subfolders.map((f) => (
        <div key={f.id} data-folder={f.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <button type="button" onClick={() => setFolder(f.id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--text-primary)', fontWeight: 600 }}>▸ {f.name}</button>
          {data.can.manage && <span style={{ display: 'flex', gap: 4 }}>
            <Btn small variant="quiet" onClick={() => { const n = window.prompt('New name', f.name); if (n) run(() => projectsAPI.renameFolder(projectId, f.id, n), 'Renamed'); }}>Rename</Btn>
            <Btn small variant="quiet" onClick={() => run(() => projectsAPI.removeFolder(projectId, f.id), 'Folder removed')}>Remove</Btn>
          </span>}
        </div>
      ))}
      {files.length === 0 && subfolders.length === 0 && <p style={{ margin: '8px 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>{removed ? 'Nothing removed.' : data.can.manage ? 'No files here yet. Add some, or drop them here.' : 'No files here yet.'}</p>}
      {files.map((f) => (
        <div key={f.id} data-file={f.name} style={{ display: 'grid', gap: 6, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
              <button type="button" onClick={() => fetchFile(f, null, true)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--color-primary-500)', fontWeight: 600 }}>{f.name}</button>
              {f.shared ? <Chip status="info">Shared with the client</Chip> : <Chip>Team only</Chip>}
              {f.versions > 1 && <Chip>{f.versions} versions</Chip>}
              {f.expired && <Chip status="problem">Ran out {day(f.expires_on)}</Chip>}
              {f.expiring && <Chip status="warning">Runs out {day(f.expires_on)}</Chip>}
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{size(f.size)} · {f.uploaded_by ?? ''}{f.source === 'template' ? ' · made from a template' : ''}</span>
            </span>
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {removed ? data.can.manage && <Btn small onClick={() => run(() => projectsAPI.restoreFile(projectId, f.id), 'Put back')}>Put it back</Btn> : <>
                <Btn small variant="quiet" onClick={() => fetchFile(f)}>Download</Btn>
                <Btn small variant="quiet" aria-expanded={open?.id === f.id} onClick={() => (open?.id === f.id ? setOpen(null) : showVersions(f))}>More</Btn>
              </>}
            </span>
          </div>
          {open?.id === f.id && !removed && (
            <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 9, background: 'var(--surface-hover)' }} data-file-more>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {data.can.share && <Btn small variant={f.shared ? 'plain' : 'primary'} onClick={() => run(() => projectsAPI.changeFile(projectId, f.id, { shared: !f.shared }), f.shared ? 'Now team only' : 'Shared with the client')}>{f.shared ? 'Stop sharing' : 'Share with the client'}</Btn>}
                {data.can.manage && <>
                  <Btn small onClick={() => versionPicker.current?.click()}>Add a new version</Btn>
                  <Btn small variant="quiet" onClick={() => { const n = window.prompt('New name', f.name); if (n) run(() => projectsAPI.changeFile(projectId, f.id, { name: n }), 'Renamed'); }}>Rename</Btn>
                  <SelectInput aria-label={`Move ${f.name}`} value={f.folder_id ?? ''} onChange={(e) => run(() => projectsAPI.changeFile(projectId, f.id, { folder_id: e.target.value ? Number(e.target.value) : null }), 'Moved')} style={{ width: 'auto', fontSize: 12.5, padding: '3px 6px' }}>
                    <option value="">At the top</option>{data.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </SelectInput>
                  <label style={{ fontSize: 12.5, display: 'inline-flex', gap: 4, alignItems: 'center' }}>Runs out <TextInput aria-label={`${f.name} runs out on`} type="date" value={f.expires_on ?? ''} onChange={(e) => run(() => projectsAPI.changeFile(projectId, f.id, { expires_on: e.target.value || null }), 'Saved')} style={{ width: 'auto', padding: '3px 6px' }} /></label>
                  <Btn small variant="quiet" onClick={() => run(() => projectsAPI.removeFile(projectId, f.id), 'Removed. It can be put back.')}>Remove</Btn>
                </>}
              </div>
              <div style={{ display: 'grid', gap: 4 }} data-versions>
                {open.versions.map((v) => (
                  <div key={v.number} style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>Version {v.number}</strong><span style={{ color: 'var(--text-secondary)' }}>{v.by ?? ''} · {v.at?.slice(0, 16)}{v.note ? ` · ${v.note}` : ''}</span>
                    <Btn small variant="quiet" onClick={() => fetchFile(f, v.number)}>Download</Btn>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </Panel>
  );
}
