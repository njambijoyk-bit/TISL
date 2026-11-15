import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { check, td, th } from './uiTokens';

/**
 * Configuration of the shape of the work (docs/PROJECTS_STAGE1_SPEC.md, build 1.8). `part` is 'stages' (kinds of work and their stages) or
 * 'fields' (extra fields). Both look at one industry at a time. What may be changed comes from the server (`can`).
 */
const SCOPE = { all: 'Every piece of work', industry: 'All in this industry', type: 'One kind of work' };

function TypeCard({ type, shape, industry, apply, canEdit, words }) {
  const [mode, setMode] = useState(null);     // null | 'rename' | 'stage' | { stage } | { asks: stage }
  const [text, setText] = useState('');
  const [stage, setStage] = useState({ name: '', state: 'open', status: 'info' });
  const requirable = [...shape.requirable.map((k) => [k, words[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())]),
    ...shape.fields.filter((f) => f.is_active && (f.scope !== 'type' || f.type_id === type.id)).map((f) => [`field:${f.key}`, f.label])];
  const nameOf = (k) => (requirable.find(([key]) => key === k) || [k, k])[1];
  const run = async (call, done) => { if (await apply(call, done)) setMode(null); };

  return (
    <Panel data-type={type.name}>
      <PanelTitle
        hint={`Numbers run ${type.prefix}-${String(type.next_number).padStart(4, '0')} next · ${type.projects} started`}
        right={canEdit && !mode ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn small onClick={() => { setText(type.name); setMode('rename'); }} aria-label={`Rename ${type.name}`}>Rename</Btn>
            <Btn small onClick={() => run(() => projectsAPI.changeType(industry, type.id, { is_active: !type.is_active }), type.is_active ? 'Switched off' : 'Switched on')} aria-label={`${type.is_active ? 'Switch off' : 'Switch on'} ${type.name}`}>{type.is_active ? 'Switch off' : 'Switch on'}</Btn>
            <Btn small variant="primary" onClick={() => { setStage({ name: '', state: 'open', status: 'info' }); setMode('stage'); }} aria-label={`New stage for ${type.name}`}>New stage</Btn>
          </div>
        ) : null}
      >
        {type.name} <Chip status="brand" style={{ marginLeft: 6 }}>{type.prefix}-</Chip>{!type.is_active && <Chip style={{ marginLeft: 6 }}>Off</Chip>}
      </PanelTitle>

      {mode === 'rename' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeType(industry, type.id, { name: text }), 'Renamed'); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <Field label="Name of the kind of work" htmlFor={`type-name-${type.id}`}><TextInput id={`type-name-${type.id}`} value={text} maxLength={80} onChange={(e) => setText(e.target.value)} required autoFocus /></Field>
          <Btn type="submit" variant="primary" small>Save name</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
        </form>
      )}
      {mode === 'stage' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.addStage(industry, type.id, stage), 'Stage added'); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <Field label="Name of the stage" htmlFor={`stage-name-${type.id}`}><TextInput id={`stage-name-${type.id}`} value={stage.name} maxLength={80} onChange={(e) => setStage({ ...stage, name: e.target.value })} required autoFocus /></Field>
          <Field label="Work at this stage is" htmlFor={`stage-state-${type.id}`}>
            <SelectInput id={`stage-state-${type.id}`} value={stage.state} onChange={(e) => setStage({ ...stage, state: e.target.value, status: e.target.value === 'closed' ? 'good' : 'info' })}>
              {Object.entries(shape.stage_states).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
          <Field label="Shown as" htmlFor={`stage-status-${type.id}`}>
            <SelectInput id={`stage-status-${type.id}`} value={stage.status} onChange={(e) => setStage({ ...stage, status: e.target.value })}>
              {Object.entries(shape.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
          <Btn type="submit" variant="primary" small>Add stage</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
        </form>
      )}

      <DataTable minWidth={620}>
        <thead><tr><th style={th}>Stage</th><th style={th}>Work is</th><th style={th}>Shown as</th><th style={th}>Must be filled to enter</th>{canEdit && <th style={th}><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th>}</tr></thead>
        <tbody>
          {type.stages.map((s) => (
            <tr key={s.id} data-stage={s.name}>
              <td style={{ ...td, fontWeight: 600 }}>
                {mode?.stage?.id === s.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeStage(industry, s.id, { name: text }), 'Renamed'); }} style={{ display: 'flex', gap: 6 }}>
                    <TextInput aria-label={`New name for ${s.name}`} value={text} maxLength={80} onChange={(e) => setText(e.target.value)} required autoFocus />
                    <Btn type="submit" variant="primary" small>Save</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn>
                  </form>
                ) : <>{s.name}{s.projects > 0 && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> · {s.projects} here</span>}</>}
              </td>
              <td style={td}>{shape.stage_states[s.state] || s.state}</td>
              <td style={td}>
                {canEdit ? (
                  <SelectInput aria-label={`How ${s.name} is shown`} value={s.status} onChange={(e) => run(() => projectsAPI.changeStage(industry, s.id, { status: e.target.value }), 'Saved')} style={{ width: 'auto' }}>
                    {Object.entries(shape.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectInput>
                ) : <Chip status={s.status}>{shape.statuses[s.status]}</Chip>}
              </td>
              <td style={td}>
                {mode?.asks?.id === s.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {requirable.map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" style={check} checked={mode.asks.list.includes(key)} onChange={(e) => setMode({ asks: { ...mode.asks, list: e.target.checked ? [...mode.asks.list, key] : mode.asks.list.filter((k) => k !== key) } })} /> {label}
                      </label>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <Btn small variant="primary" onClick={() => run(() => projectsAPI.changeStage(industry, s.id, { required_fields: mode.asks.list }), 'Saved')}>Save what it asks for</Btn>
                      <Btn small onClick={() => setMode(null)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (s.required_fields.length ? s.required_fields.map(nameOf).join(', ') : <span style={{ color: 'var(--text-secondary)' }}>Nothing</span>)}
              </td>
              {canEdit && (
                <td style={{ ...td, width: 260 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 2 }}>
                    <Btn small variant="quiet" aria-label={`Rename the stage ${s.name}`} onClick={() => { setText(s.name); setMode({ stage: s }); }}>Rename</Btn>
                    <Btn small variant="quiet" aria-label={`What ${s.name} asks for`} onClick={() => setMode({ asks: { id: s.id, list: s.required_fields } })}>Asks for</Btn>
                    <Btn small variant="quiet" aria-label={`Move ${s.name} up`} onClick={() => run(() => projectsAPI.changeStage(industry, s.id, { move: 'up' }), 'Moved')}>↑</Btn>
                    <Btn small variant="quiet" aria-label={`Move ${s.name} down`} onClick={() => run(() => projectsAPI.changeStage(industry, s.id, { move: 'down' }), 'Moved')}>↓</Btn>
                    {s.projects === 0 && type.stages.length > 1 && <Btn small variant="quiet" aria-label={`Remove the stage ${s.name}`} onClick={() => run(() => projectsAPI.removeStage(industry, s.id), 'Stage removed')}>Remove</Btn>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}

function FieldsCard({ shape, industry, apply, canEdit }) {
  const blank = { label: '', kind: 'text', options: '', scope: 'industry', type_id: '', required: false, sensitive: false };
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const picks = f.kind === 'pick_one' || f.kind === 'pick_many';
  const add = async (e) => {
    e.preventDefault();
    const data = { label: f.label, kind: f.kind, scope: f.scope, industry_key: industry, type_id: f.scope === 'type' ? Number(f.type_id) : null, required: f.required, sensitive: f.sensitive,
      ...(picks ? { options: f.options.split(/[\n,]/).map((o) => o.trim()).filter(Boolean) } : {}) };
    if (await apply(() => projectsAPI.addField(industry, data), 'Field added')) { setAdding(false); setF(blank); }
  };
  return (
    <Panel>
      <PanelTitle hint="Your own fields, on top of the ones every piece of work has. A number is a count or a measure: money is never a field here." right={canEdit && !adding ? <Btn small variant="primary" onClick={() => setAdding(true)}>New field</Btn> : null}>Extra fields</PanelTitle>
      {adding && (
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label="Name of the field" htmlFor="field-label"><TextInput id="field-label" value={f.label} maxLength={80} onChange={(e) => setF({ ...f, label: e.target.value })} required autoFocus /></Field>
          <Field label="Kind" htmlFor="field-kind" hint="The kind cannot be changed later.">
            <SelectInput id="field-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(shape.field_kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
          </Field>
          <Field label="Shows on" htmlFor="field-scope">
            <SelectInput id="field-scope" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>{Object.entries(SCOPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
          </Field>
          {f.scope === 'type' && (
            <Field label="Which kind of work" htmlFor="field-type">
              <SelectInput id="field-type" value={f.type_id} onChange={(e) => setF({ ...f, type_id: e.target.value })} required><option value="">Choose…</option>{shape.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput>
            </Field>
          )}
          {picks && <Field label="Choices, one per line" htmlFor="field-options" style={{ gridColumn: '1 / -1' }}>
            <textarea id="field-options" rows={3} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} required
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)' }} />
          </Field>}
          <label htmlFor="field-required" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}><input id="field-required" type="checkbox" style={check} checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Must be filled in</label>
          <label htmlFor="field-sensitive" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}><input id="field-sensitive" type="checkbox" style={check} checked={f.sensitive} onChange={(e) => setF({ ...f, sensitive: e.target.checked })} /> Sensitive: only people allowed to see sensitive fields</label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small>Add field</Btn><Btn small onClick={() => setAdding(false)}>Cancel</Btn></div>
        </form>
      )}
      {shape.fields.length === 0 && !adding && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No extra fields yet.</p>}
      {shape.fields.length > 0 && (
        <DataTable minWidth={680}>
          <thead><tr><th style={th}>Field</th><th style={th}>Kind</th><th style={th}>Shows on</th><th style={th}>Must be filled</th><th style={th}>Sensitive</th>{canEdit && <th style={th} />}</tr></thead>
          <tbody>
            {shape.fields.map((x) => (
              <tr key={x.id} data-field={x.label}>
                <td style={{ ...td, fontWeight: 600 }}>{x.label}{!x.is_active && <Chip style={{ marginLeft: 6 }}>Off</Chip>}{x.options.length > 0 && <div style={{ fontWeight: 400, fontSize: 12.5, color: 'var(--text-secondary)' }}>{x.options.join(', ')}</div>}</td>
                <td style={td}>{(shape.field_kinds[x.kind] || x.kind).replace(/ \(.*/, '')}</td>
                <td style={td}>{x.scope === 'type' ? x.type_name : SCOPE[x.scope]}</td>
                <td style={td}>{canEdit ? <input type="checkbox" style={check} aria-label={`${x.label} must be filled in`} checked={x.required} onChange={() => apply(() => projectsAPI.changeField(industry, x.id, { required: !x.required }), 'Saved')} /> : (x.required ? 'Yes' : 'No')}</td>
                <td style={td}>{canEdit ? <input type="checkbox" style={check} aria-label={`${x.label} is sensitive`} checked={x.sensitive} onChange={() => apply(() => projectsAPI.changeField(industry, x.id, { sensitive: !x.sensitive }), 'Saved')} /> : (x.sensitive ? <Chip status="problem">Yes</Chip> : 'No')}</td>
                {canEdit && <td style={{ ...td, textAlign: 'right' }}><Btn small variant="quiet" aria-label={`${x.is_active ? 'Switch off' : 'Switch on'} the field ${x.label}`} onClick={() => apply(() => projectsAPI.changeField(industry, x.id, { is_active: !x.is_active }), x.is_active ? 'Switched off. Its values are kept.' : 'Switched on')}>{x.is_active ? 'Switch off' : 'Switch on'}</Btn></td>}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}

export default function ShapePanel({ part, industries, startIndustry, wordsOf }) {
  const [industry, setIndustry] = useState(startIndustry);
  const [shape, setShape] = useState(null);
  const [failed, setFailed] = useState('');
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState({ name: '', prefix: '' });

  const load = useCallback(async (i) => {
    try { setShape(await projectsAPI.shape(i)); setFailed(''); } catch (e) { setFailed(message(e, 'This could not be loaded. Try again.')); }
  }, []);
  useEffect(() => { load(industry); }, [load, industry]);

  const apply = async (call, done) => {
    try { setShape(await call()); if (done) toast.success(done); return true; } catch (e) { toast.error(message(e, 'That could not be saved. Try again.')); return false; }
  };
  if (failed) return <Notice status="problem">{failed} <Btn small variant="quiet" onClick={() => load(industry)}>Try again</Btn></Notice>;
  if (!shape) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const words = wordsOf(industry);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Industry" htmlFor={`shape-industry-${part}`} style={{ minWidth: 220 }}>
          <SelectInput id={`shape-industry-${part}`} value={industry} onChange={(e) => { setShape(null); setIndustry(e.target.value); }}>
            {industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
          </SelectInput>
        </Field>
        {part === 'stages' && shape.can.stages && !adding && <Btn variant="primary" onClick={() => { setType({ name: '', prefix: '' }); setAdding(true); }}>New kind of work</Btn>}
      </div>
      {part === 'stages' && adding && (
        <Panel as="form" onSubmit={async (e) => { e.preventDefault(); if (await apply(() => projectsAPI.addType(industry, type), 'Kind of work added, with two stages to start from')) setAdding(false); }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Name of the kind of work" htmlFor="type-new-name"><TextInput id="type-new-name" value={type.name} maxLength={80} onChange={(e) => setType({ ...type, name: e.target.value })} required autoFocus /></Field>
            <Field label="Number prefix" htmlFor="type-new-prefix" hint="1 to 8 letters and digits. Its numbers will read like FAM-0001."><TextInput id="type-new-prefix" value={type.prefix} maxLength={8} onChange={(e) => setType({ ...type, prefix: e.target.value.toUpperCase() })} required style={{ maxWidth: 140 }} /></Field>
            <Btn type="submit" variant="primary">Add kind of work</Btn><Btn onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </Panel>
      )}
      {part === 'stages' && shape.types.map((t) => <TypeCard key={t.id} type={t} shape={shape} industry={industry} apply={apply} canEdit={shape.can.stages} words={words} />)}
      {part === 'stages' && shape.types.length === 0 && <Notice status="info">This industry has no kinds of work yet.</Notice>}
      {part === 'fields' && <FieldsCard shape={shape} industry={industry} apply={apply} canEdit={shape.can.fields} />}
    </div>
  );
}
