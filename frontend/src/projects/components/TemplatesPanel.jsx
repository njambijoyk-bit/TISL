import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };

/**
 * Document templates in Configuration (docs/PROJECTS_STAGE9_SPEC.md, build 9.2): text with fill-in fields in double braces. Pressing a field puts
 * it where the cursor is. An unknown field is refused on saving, so a letter never goes out with a hole nobody noticed.
 */
export default function TemplatesPanel() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);
  const [problem, setProblem] = useState('');
  const box = useRef(null);
  useEffect(() => { projectsAPI.docTemplates().then(setData).catch((e) => setProblem(message(e, 'The templates could not be loaded.'))); }, []);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const save = async () => { try { setData(await projectsAPI.saveDocTemplate(edit.id ?? null, edit)); setEdit(null); setProblem(''); toast.success('Saved'); } catch (e) { setProblem(message(e, 'It could not be saved.')); } };
  const put = (key) => {
    const el = box.current; const tag = `{{${key === 'field.KEY' ? 'field.' : key}}}`;
    const at = el ? el.selectionStart : edit.body.length;
    setEdit({ ...edit, body: edit.body.slice(0, at) + tag + edit.body.slice(at) });
  };

  return (
    <Panel data-templates>
      <PanelTitle hint="Letters, contracts and certificates, filled from the work when they are made." right={data.can.change && !edit ? <Btn small onClick={() => setEdit({ name: '', industry_key: '', body: '' })}>New template</Btn> : null}>Templates</PanelTitle>
      {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
      {edit ? (
        <div style={{ display: 'grid', gap: 8 }} data-template-form>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Name" htmlFor="dt-name"><TextInput id="dt-name" value={edit.name} maxLength={120} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="For" htmlFor="dt-ind"><SelectInput id="dt-ind" value={edit.industry_key ?? ''} onChange={(e) => setEdit({ ...edit, industry_key: e.target.value })}><option value="">Every industry</option>{data.industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}</SelectInput></Field>
          </div>
          <textarea ref={box} aria-label="The template" rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} style={area} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} aria-label="Fields to put in">
            {Object.entries(data.fields).map(([k, l]) => <button key={k} type="button" title={l} onClick={() => put(k)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}><Chip>{`{{${k}}}`}</Chip></button>)}
          </div>
          <span style={{ display: 'flex', gap: 6 }}><Btn small variant="primary" onClick={save}>Save</Btn><Btn small onClick={() => setEdit(null)}>Cancel</Btn></span>
        </div>
      ) : (
        <>
          {data.templates.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No templates yet.</p>}
          {data.templates.map((t) => (
            <div key={t.id} data-template={t.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
              <span><strong>{t.name}</strong> <span style={{ color: 'var(--text-secondary)' }}>· {t.industry_key ? data.industries.find((i) => i.key === t.industry_key)?.name ?? t.industry_key : 'every industry'}{t.is_active ? '' : ' · switched off'}</span></span>
              {data.can.change && <span style={{ display: 'flex', gap: 4 }}><Btn small variant="quiet" onClick={() => setEdit({ ...t })}>Change</Btn><Btn small variant="quiet" onClick={async () => { try { setData(await projectsAPI.saveDocTemplate(t.id, { ...t, is_active: !t.is_active })); } catch (e) { setProblem(message(e, 'It could not be saved.')); } }}>{t.is_active ? 'Switch off' : 'Switch on'}</Btn></span>}
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
