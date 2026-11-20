import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day as showDay, message } from '../lib/format';
import { ProductPicker } from './MaterialsPanel';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const WEATHER = ['Sunny', 'Cloudy', 'Rain', 'Heavy rain', 'Windy'];
const ADD = [['person', 'Person'], ['crew', 'Crew'], ['plant', 'Plant hours'], ['material', 'Material received'], ['visitor', 'Visitor'], ['event', 'Something happened']];
const KIND = { person: 'On site', crew: 'Crews', plant: 'Plant', material: 'Materials received', visitor: 'Visitors', event: 'What happened', photo: 'Photos', note: 'Notes' };
const area = { width: '100%', boxSizing: 'border-box', minHeight: 84, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'var(--font-body)', resize: 'vertical' };
const big = { minHeight: 44, padding: '10px 14px', fontSize: 14 };
const shift = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

function describe(l) {
  switch (l.kind) {
    case 'person': return `${l.person}${l.hours != null ? ` · ${l.hours} h` : ''}`;
    case 'crew': return `${l.head_count} ${l.trade}${l.hours != null ? ` · ${l.hours} h` : ''}`;
    case 'plant': return `${l.plant}${l.hours != null ? ` · ${l.hours} h` : ''}`;
    case 'material': return `${l.quantity} × ${l.material}${l.text ? ` · ${l.text}` : ''}`;
    case 'photo': return `${l.file?.name ?? 'Photo'}${l.text ? ` · ${l.text}` : ''}`;
    default: return l.text;
  }
}

/**
 * The daily record (docs/PROJECTS_STAGE10_SPEC.md, build 10.5), made for a phone: one a day per piece of work. The weather, what was done,
 * who and what was on site, materials received, visitors, what happened and photos. Signing locks the day; then only notes can be added.
 */
export default function DailyPanel({ projectId, word = (k) => k }) {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [text, setText] = useState({ weather: '', work_done: '', delays: '', notes: '' });
  const [adding, setAdding] = useState(null);
  const [signName, setSignName] = useState('');
  const [problem, setProblem] = useState('');
  const camera = useRef(null);
  const take = useCallback((d) => { setData(d); setText({ weather: d.record?.weather ?? '', work_done: d.record?.work_done ?? '', delays: d.record?.delays ?? '', notes: d.record?.notes ?? '' }); }, []);
  const load = useCallback(async () => { try { take(await projectsAPI.daily(projectId, day)); setProblem(''); } catch (e) { setProblem(message(e, 'The daily record could not be loaded.')); } }, [projectId, day, take]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice>The site is not set up yet. Run script 267.</Notice>;
  const run = async (fn, done) => { try { take(await fn()); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const saveText = () => data.can.write && run(() => projectsAPI.saveDaily(projectId, day, text), 'Saved');
  const add = async (e) => {
    e.preventDefault();
    const a = adding;
    const body = { kind: a.kind, text: a.text || null, hours: a.hours === '' ? null : a.hours };
    if (a.kind === 'person') body.user_id = Number(a.user_id);
    if (a.kind === 'crew') Object.assign(body, { trade: a.trade, head_count: Number(a.head_count) });
    if (a.kind === 'plant') { const [k, id] = String(a.plant).split(':'); body[k === 'h' ? 'hire_id' : 'instance_id'] = Number(id); }
    if (a.kind === 'material') { if (!a.product) { setProblem('Choose the material from the list.'); return; } Object.assign(body, { variant_id: a.product.id, quantity: Number(a.quantity) }); }
    if (await run(() => projectsAPI.addDailyLine(projectId, day, body), 'Added')) setAdding(null);
  };
  const signed = data.record?.state === 'signed';
  const groups = Object.keys(KIND).map((k) => [k, data.lines.filter((l) => l.kind === k)]).filter(([, ls]) => ls.length);

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 720 }} data-daily>
      <Panel style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn style={big} aria-label="The day before" onClick={() => setDay(shift(day, -1))}>‹</Btn>
          <TextInput type="date" aria-label="The day" value={day} max={data.today} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ ...big, width: 'auto', flex: 1, minWidth: 150 }} />
          <Btn style={big} aria-label="The day after" disabled={day >= data.today} onClick={() => setDay(shift(day, 1))}>›</Btn>
          {day !== data.today && <Btn style={big} variant="quiet" onClick={() => setDay(data.today)}>Today</Btn>}
        </div>
        {data.recent.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }} aria-label="Recent days">
            {data.recent.slice(0, 10).map((r) => <button key={r.day} type="button" onClick={() => setDay(r.day)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }}><Chip status={r.day === day ? 'info' : r.state === 'signed' ? 'good' : 'warning'}>{r.day.slice(5)}{r.state === 'signed' ? ' ✓' : ''}</Chip></button>)}
          </div>
        )}
      </Panel>

      {problem && <Notice status="problem">{problem}</Notice>}
      {signed && <div data-daily-signed><Notice status="good">Signed by {data.record.signed.name} on {data.record.signed.at?.slice(0, 16).replace('T', ' ')}. Only notes can be added now.</Notice></div>}

      <Panel style={{ padding: 14 }} data-daily-text>
        <PanelTitle hint={showDay(day)}>{word('daily_record')}</PanelTitle>
        <Field label="Weather" htmlFor="dy-weather">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WEATHER.map((w) => <Btn key={w} style={big} variant={text.weather === w ? 'primary' : 'plain'} aria-pressed={text.weather === w} disabled={!data.can.write} onClick={() => setText({ ...text, weather: w })}>{w}</Btn>)}
            <TextInput id="dy-weather" value={WEATHER.includes(text.weather) ? '' : text.weather} placeholder="Other" maxLength={60} disabled={!data.can.write} onChange={(e) => setText({ ...text, weather: e.target.value })} style={{ ...big, width: 140 }} />
          </div>
        </Field>
        <Field label="Work done" htmlFor="dy-done" style={{ marginTop: 10 }}><textarea id="dy-done" style={area} value={text.work_done} disabled={!data.can.write} onChange={(e) => setText({ ...text, work_done: e.target.value })} /></Field>
        <Field label="Delays" htmlFor="dy-delays" style={{ marginTop: 10 }}><textarea id="dy-delays" style={{ ...area, minHeight: 56 }} value={text.delays} disabled={!data.can.write} onChange={(e) => setText({ ...text, delays: e.target.value })} /></Field>
        {data.can.write && <Btn variant="primary" style={{ ...big, marginTop: 10 }} onClick={saveText}>Save</Btn>}
      </Panel>

      <Panel style={{ padding: 14 }} data-daily-lines>
        <PanelTitle hint="Who and what was on site, and what happened">On site</PanelTitle>
        {(data.can.write || data.can.note) && !adding && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {data.can.write && ADD.map(([k, l]) => <Btn key={k} style={big} onClick={() => setAdding({ kind: k, user_id: '', trade: '', head_count: '', hours: '', plant: '', product: null, quantity: '', text: '' })}>+ {l}</Btn>)}
            {data.can.write && data.can.photos && <Btn style={big} onClick={() => camera.current?.click()}>+ Photo</Btn>}
            {signed && data.can.note && <Btn style={big} onClick={() => setAdding({ kind: 'note', text: '', hours: '' })}>+ A note</Btn>}
          </div>
        )}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take a photo" onChange={async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { const caption = window.prompt('A few words about the photo (optional)') ?? ''; run(() => projectsAPI.dailyPhoto(projectId, day, f, caption), 'Photo kept in Files'); } }} />
        {adding && (
          <form onSubmit={add} data-daily-add style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12, padding: 10, borderRadius: 10, background: 'var(--surface-hover)' }}>
            {adding.kind === 'person' && <Field label="Who" htmlFor="dl-who"><SelectInput id="dl-who" value={adding.user_id} onChange={(e) => setAdding({ ...adding, user_id: e.target.value })} required style={big}><option value="">Choose</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>}
            {adding.kind === 'crew' && <>
              <Field label="Trade" htmlFor="dl-trade"><TextInput id="dl-trade" value={adding.trade} placeholder="Masons" maxLength={80} onChange={(e) => setAdding({ ...adding, trade: e.target.value })} required style={big} /></Field>
              <Field label="How many" htmlFor="dl-count"><TextInput id="dl-count" type="number" inputMode="numeric" min="1" value={adding.head_count} onChange={(e) => setAdding({ ...adding, head_count: e.target.value })} required style={big} /></Field>
            </>}
            {adding.kind === 'plant' && <Field label="Plant" htmlFor="dl-plant"><SelectInput id="dl-plant" value={adding.plant} onChange={(e) => setAdding({ ...adding, plant: e.target.value })} required style={big}><option value="">Choose</option>{data.plant.map((p) => <option key={p.hire_id ? `h${p.hire_id}` : `i${p.instance_id}`} value={p.hire_id ? `h:${p.hire_id}` : `i:${p.instance_id}`}>{p.name}</option>)}</SelectInput></Field>}
            {adding.kind === 'material' && <>
              <Field label="Material" htmlFor="dl-mat"><ProductPicker id="dl-mat" value={adding.product} onChange={(p) => setAdding((a) => ({ ...a, product: p }))} /></Field>
              <Field label="How much came" htmlFor="dl-qty"><TextInput id="dl-qty" type="number" inputMode="decimal" min="0" step="any" value={adding.quantity} onChange={(e) => setAdding({ ...adding, quantity: e.target.value })} required style={big} /></Field>
            </>}
            {['person', 'crew', 'plant'].includes(adding.kind) && <Field label="Hours (optional)" htmlFor="dl-hours"><TextInput id="dl-hours" type="number" inputMode="decimal" min="0" max="24" step="0.25" value={adding.hours} onChange={(e) => setAdding({ ...adding, hours: e.target.value })} style={big} /></Field>}
            {['visitor', 'event', 'note', 'material'].includes(adding.kind) && <Field label={{ visitor: 'Who visited, and why', event: 'What happened', note: 'The note', material: 'Delivery note (optional)' }[adding.kind]} htmlFor="dl-text"><TextInput id="dl-text" value={adding.text} maxLength={500} onChange={(e) => setAdding({ ...adding, text: e.target.value })} required={adding.kind !== 'material'} style={big} /></Field>}
            <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" variant="primary" style={big}>Add</Btn><Btn style={big} onClick={() => setAdding(null)}>Cancel</Btn></span>
          </form>
        )}
        {groups.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Nothing added for this day yet.</p>}
        {groups.map(([k, ls]) => (
          <div key={k} data-daily-group={k} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-secondary)', margin: '6px 0 2px' }}>{KIND[k]}</div>
            {ls.map((l) => (
              <div key={l.id} data-daily-line={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 14.5 }}>
                <span>{describe(l)}{l.after_signing && <> <Chip status="warning">Added after signing</Chip></>}</span>
                {data.can.write && <Btn small variant="quiet" aria-label={`Take off ${describe(l)}`} onClick={() => run(() => projectsAPI.removeDailyLine(projectId, day, l.id))}>✕</Btn>}
              </div>
            ))}
          </div>
        ))}
      </Panel>

      {data.can.sign && (
        <Panel style={{ padding: 14 }} data-daily-sign>
          <PanelTitle hint="Signing locks the day. After that only notes can be added.">Sign the day</PanelTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <TextInput aria-label="Type your full name to sign" placeholder="Type your full name to sign" value={signName} onChange={(e) => setSignName(e.target.value)} style={{ ...big, flex: 1, minWidth: 200 }} />
            <Btn variant="primary" style={big} onClick={async () => { if (await run(() => projectsAPI.signDaily(projectId, day, signName), 'Signed')) setSignName(''); }}>Sign</Btn>
          </div>
        </Panel>
      )}

      {data.can.settings && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
          <input type="checkbox" checked={data.keeps_daily} onChange={(e) => run(() => projectsAPI.keepDaily(projectId, e.target.checked), e.target.checked ? 'The lead is told at 18:00 on a weekday with no record' : 'Reminders off')} style={{ width: 20, height: 20, accentColor: 'var(--color-primary-500)' }} />
          This work keeps a daily record (the lead is told at 18:00 on a weekday with none)
        </label>
      )}
    </div>
  );
}
