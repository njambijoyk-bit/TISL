import { useState } from 'react';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, TextInput } from './ui';

/**
 * A locked area that this person has not opened (docs/PROJECTS_STAGE2_SPEC.md, build 2.3): it asks for the area's password. The server
 * counts wrong tries and says how many are left. `onOpened()` tells the page the area is open now.
 */
export default function UnlockPanel({ projectId, area, label, onOpened, compact = false }) {
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await projectsAPI.unlock(projectId, area, password); setPassword(''); onOpened(); }
    catch (err) { setProblem(message(err, 'That could not be checked. Try again.')); setPassword(''); } finally { setBusy(false); }
  };

  return (
    <Panel as="form" onSubmit={submit} style={{ maxWidth: compact ? undefined : 480 }} data-locked-area={area}>
      <PanelTitle hint="It has its own password here. Once entered, it stays open for you for a few minutes.">{label} is locked</PanelTitle>
      <Field label={`Password for ${label}`} htmlFor={`unlock-${area}`}>
        <TextInput id={`unlock-${area}`} type="password" autoComplete="off" value={password} onChange={(e) => { setPassword(e.target.value); setProblem(''); }} required />
      </Field>
      {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn type="submit" variant="primary" busy={busy}>Unlock</Btn>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Do not have it? Ask whoever leads this, or see its Access tab for a reset.</span>
      </div>
    </Panel>
  );
}
