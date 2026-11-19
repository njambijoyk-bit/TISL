import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

/**
 * Make a document from a template (docs/PROJECTS_STAGE9_SPEC.md, build 9.2): choose one, see it filled from the work, and keep it on the work's
 * files as a PDF. Fields with nothing in them on this work are named before it is made.
 */
export default function MakeDocument({ projectId, folderId, onMade, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [chosen, setChosen] = useState('');
  const [doc, setDoc] = useState(null);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { projectsAPI.workTemplates(projectId).then((r) => { setTemplates(r.templates); if (r.templates[0]) setChosen(r.templates[0].id); }).catch((e) => setProblem(message(e, 'The templates could not be loaded.'))); }, [projectId]);
  useEffect(() => {
    if (!chosen) return;
    projectsAPI.previewDocument(projectId, chosen).then((r) => { setDoc(r); setName(r.name); setProblem(''); }).catch((e) => setProblem(message(e, 'It could not be filled in.')));
  }, [projectId, chosen]);
  const make = async () => {
    setBusy(true);
    try { const r = await projectsAPI.makeDocument(projectId, chosen, { folder_id: folderId, name }); toast.success('Made and kept on the files'); onMade(r); } catch (e) { setProblem(message(e, 'It could not be made.')); } finally { setBusy(false); }
  };

  return (
    <Panel data-make-document style={{ marginBottom: 14 }}>
      <PanelTitle hint="Filled from this work. Kept on its files as a PDF." right={<Btn small onClick={onClose}>Close</Btn>}>Make a document</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {templates && templates.length === 0 && <Notice status="info">There are no templates yet. They are written in Configuration → Templates.</Notice>}
      {templates?.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <Field label="Template" htmlFor="md-tpl"><SelectInput id="md-tpl" value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput></Field>
            <Field label="Name of the file" htmlFor="md-name"><TextInput id="md-name" value={name} maxLength={190} onChange={(e) => setName(e.target.value)} /></Field>
            <Btn variant="primary" small busy={busy} disabled={!doc} onClick={make}>Make it</Btn>
          </div>
          {doc?.missing.length > 0 && <Notice status="warning">Nothing on this work for: {doc.missing.join(', ')}. Those places are left empty.</Notice>}
          {doc && <iframe title="The document" sandbox="" srcDoc={doc.html} style={{ width: '100%', height: 420, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface-card)' }} />}
        </div>
      )}
    </Panel>
  );
}
