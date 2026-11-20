import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, SelectInput } from './ui';
import WorkPanel from './WorkPanel';
import ScopePanel from './ScopePanel';
import KeyDatesPanel from './KeyDatesPanel';
import ChangesPanel from './ChangesPanel';
import TimePanel from './TimePanel';

/** The Work tab (stage 5): its parts, each in the work's own words. A link can open a part straight away (?part=scope). */
export default function WorkTab({ projectId, word }) {
  const [part, setPart] = useState(() => new URLSearchParams(window.location.search).get('part') || 'tasks');
  const [templates, setTemplates] = useState([]);
  const [pick, setPick] = useState('');
  const [round, setRound] = useState(0);   // a template applied: the parts load again
  useEffect(() => { projectsAPI.startingTemplates(projectId).then((d) => setTemplates(d.templates ?? [])).catch(() => setTemplates([])); }, [projectId]);
  const apply = async () => {
    try {
      const { made } = await projectsAPI.applyWorkTemplate(projectId, Number(pick));
      toast.success(made.phases + made.tasks + made.dates === 0 ? 'Everything in it is here already' : `Added ${made.phases} phases, ${made.tasks} tasks and ${made.dates} key dates`);
      setPick(''); setRound((n) => n + 1);
    } catch (e) { toast.error(message(e, 'The template could not be applied.')); }
  };
  const parts = [['tasks', word ? word('task', true) : 'Tasks'], ['scope', word ? word('scope_line', true) : 'Scope'], ['dates', word ? word('key_date', true) : 'Key dates'], ['changes', word ? word('change', true) : 'Changes'], ['time', 'Time']];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="group" aria-label="Parts of the work" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-work-parts>
        {parts.map(([k, l]) => <Btn key={k} small variant={part === k ? 'primary' : 'plain'} aria-pressed={part === k} onClick={() => setPart(k)}>{l}</Btn>)}
        {templates.length > 0 && (
          <span style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }} data-apply-template>
            <SelectInput aria-label="A work template" value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}>
              <option value="">Add from a template…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectInput>
            {pick && <Btn small onClick={apply}>Add what is missing</Btn>}
          </span>
        )}
      </div>
      {part === 'tasks' && <WorkPanel key={round} projectId={projectId} word={word} />}
      {part === 'scope' && <ScopePanel projectId={projectId} word={word} />}
      {part === 'dates' && <KeyDatesPanel key={round} projectId={projectId} word={word} />}
      {part === 'changes' && <ChangesPanel projectId={projectId} word={word} />}
      {part === 'time' && <TimePanel projectId={projectId} />}
    </div>
  );
}
