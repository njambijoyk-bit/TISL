import { useState } from 'react';
import { Btn } from './ui';
import MaterialsPanel from './MaterialsPanel';
import PlantPanel from './PlantPanel';

/**
 * The Site tab (docs/PROJECTS_STAGE10_SPEC.md): what is used on site and what happens there. Each part is named in the industry's words.
 * Parts are added build by build: materials (10.1), plant (10.2), subcontracts (10.3), the daily record (10.5), inspections (10.6), snags (10.7).
 */
export default function SitePanel({ projectId, word }) {
  const parts = [['materials', word('material', true)], ['plant', 'Plant']];
  const [view, setView] = useState(parts[0][0]);

  return (
    <div data-site>
      <div role="tablist" aria-label="Parts of the site" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {parts.map(([k, l]) => <Btn key={k} small role="tab" aria-selected={view === k} variant={view === k ? 'primary' : 'plain'} onClick={() => setView(k)}>{l}</Btn>)}
      </div>
      {view === 'materials' && <MaterialsPanel projectId={projectId} word={word} />}
      {view === 'plant' && <PlantPanel projectId={projectId} />}
    </div>
  );
}
