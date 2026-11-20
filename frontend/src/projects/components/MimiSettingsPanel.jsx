import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Notice, Panel, PanelTitle } from './ui';
import { check } from './uiTokens';

const ROWS = [
  ['weekly_updates', 'Draft a weekly update for each open work on Fridays', 'The lead sends it or throws it away; nothing is sent by itself.'],
  ['ai_drafts', 'Let the AI write the drafts', 'With the company\'s AI keys for analytics (AI → Keys). Without, the draft is written from the week\'s facts.'],
  ['ai_confidential', 'Confidential work may go to the AI', 'Off: drafts for confidential work are written from the facts only.'],
  ['ai_sensitive_fields', 'Sensitive fields may go to the AI', 'Off: fields marked sensitive are never in what the AI is given.'],
];

/** Mimi's part of Projects (build 12.6): weekly drafts, and what the AI may see. */
export default function MimiSettingsPanel() {
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.rules().then(setD).catch((e) => setProblem(message(e, 'The settings could not be loaded.'))); }, []);
  if (!d?.settings) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const flip = async (k) => {
    try { setD(await projectsAPI.saveInsightSettings({ ...d.settings, [k]: !d.settings[k] })); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'That could not be saved.')); }
  };

  return (
    <Panel data-mimi-settings>
      <PanelTitle hint="Mimi answers questions on Projects from what each person may open, and drafts the weekly client updates.">Mimi</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      <div style={{ display: 'grid', gap: 10 }}>
        {ROWS.map(([k, label, hint]) => (
          <label key={k} data-mimi-setting={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
            <input type="checkbox" style={{ ...check, marginTop: 3 }} checked={!!d.settings[k]} disabled={!d.can.settings} onChange={() => flip(k)} />
            <span><strong>{label}</strong><br /><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{hint}</span></span>
          </label>
        ))}
      </div>
    </Panel>
  );
}
