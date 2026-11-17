import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Notice, Panel, PanelTitle } from './ui';
import { check } from './uiTokens';

/** Which visibility levels the directory may use (build 3.6). Staff only is always there; the other two can be switched off. */
export default function DirectorySettingsPanel() {
  const [data, setData] = useState(null);
  const [levels, setLevels] = useState([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.directorySettings().then((d) => { setData(d); setLevels(d.directory.levels); }).catch((e) => setProblem(message(e, 'This could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async () => {
    setBusy(true);
    try { const d = await projectsAPI.saveDirectorySettings(levels); setData(d); setLevels(d.directory.levels); toast.success('Saved'); } catch (e) { setProblem(message(e, 'That could not be saved.')); } finally { setBusy(false); }
  };

  return (
    <Panel>
      <PanelTitle hint="An entry already at a level that is switched off keeps it until someone changes it.">Directory: who an entry can be shown to</PanelTitle>
      <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-secondary)' }}><input type="checkbox" style={check} checked disabled />{data.levels.staff} (always)</label>
        {['clients', 'public'].map((l) => (
          <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" style={check} disabled={!data.can.change} checked={levels.includes(l)} onChange={(e) => setLevels(e.target.checked ? [...levels, l] : levels.filter((x) => x !== l))} />{data.levels[l]}
          </label>
        ))}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-secondary)' }}>Clients see the directory through their portal, and the public through a page of its own. Both arrive later; the level is recorded now.</p>
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      {data.can.change && <Btn variant="primary" busy={busy} onClick={save}>Save</Btn>}
    </Panel>
  );
}
