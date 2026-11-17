import { useState } from 'react';
import { Btn } from './ui';
import WorkPanel from './WorkPanel';
import ScopePanel from './ScopePanel';

/** The Work tab (stage 5): its parts, each in the work's own words. A link can open a part straight away (?part=scope). */
export default function WorkTab({ projectId, word }) {
  const [part, setPart] = useState(() => new URLSearchParams(window.location.search).get('part') || 'tasks');
  const parts = [['tasks', word ? word('task', true) : 'Tasks'], ['scope', word ? word('scope_line', true) : 'Scope']];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="group" aria-label="Parts of the work" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-work-parts>
        {parts.map(([k, l]) => <Btn key={k} small variant={part === k ? 'primary' : 'plain'} aria-pressed={part === k} onClick={() => setPart(k)}>{l}</Btn>)}
      </div>
      {part === 'tasks' && <WorkPanel projectId={projectId} word={word} />}
      {part === 'scope' && <ScopePanel projectId={projectId} word={word} />}
    </div>
  );
}
