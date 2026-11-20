import { useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle, Loader2, Plus, X } from 'lucide-react';
import aiAnalyticsAPI from '../../../../_shared/api/aiAnalytics';

const C = {
  card: 'var(--surface-card, #fff)', input: 'var(--surface-input)', border: 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  accent: 'var(--color-primary-500)', text: 'var(--color-text-primary)', mid: 'var(--color-text-secondary)', dim: 'var(--color-text-tertiary)',
  good: 'var(--color-success-600, #059669)', warn: 'var(--color-warning-600, #b45309)', bad: 'var(--color-error-600, #dc2626)',
};
const label = { display: 'block', fontSize: '0.65rem', color: C.mid, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 };
const field = { width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontFamily: 'inherit', fontSize: '0.78rem', boxSizing: 'border-box' };
const btn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.mid, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700 };
const iconBtn = { ...btn, padding: '4px 6px' };
const tag = (color) => ({ fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`, color, whiteSpace: 'nowrap', fontWeight: 700 });
const until = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * AI → Keys, Purposes tab (docs/AI_PURPOSES_SPEC.md, build A.2): each kind of AI work with its own line of keys, first choice first, a model for each
 * place; after the line, every other key allowed for the purpose in the general order. Only purposes a licensed module uses are shown.
 */
export default function AiPurposesPanel({ data, keys, providers, onChanged }) {
  const [editing, setEditing] = useState(null);   // purpose key
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(null);
  const [tests, setTests] = useState({});
  const [problem, setProblem] = useState({});
  const [rest, setRest] = useState(String(data.rest_minutes ?? 10));

  if (!data.ready) {
    return <p style={{ color: C.mid, fontSize: '0.8rem' }}>Purposes need database script <code>270_ai_purposes.sql</code>. Until it is run, each key's "used for" decides where it is used, as before.</p>;
  }
  const keyOf = (id) => keys.find((k) => k.id === id);
  const models = (id) => providers.find((p) => p.value === keyOf(id)?.provider)?.models ?? [];
  const allowed = (purpose) => keys.filter((k) => k.is_active && (k.open_to_all || (k.kept_to ?? []).includes(purpose)));
  const fail = (p, e) => setProblem((x) => ({ ...x, [p]: e?.response?.data?.message ?? Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? 'That could not be saved.' }));

  const edit = (p) => { setEditing(p.key); setDraft(p.own_line.map((l) => ({ ...l, model: l.model ?? '' }))); setProblem((x) => ({ ...x, [p.key]: null })); };
  const move = (i, by) => setDraft((d) => { const n = [...d]; [n[i], n[i + by]] = [n[i + by], n[i]]; return n; });
  const save = async (purpose) => {
    setBusy(purpose);
    try { await aiAnalyticsAPI.savePurposeLine(purpose, draft.map((l) => ({ key_id: l.key_id, model: l.model || null }))); setEditing(null); await onChanged(); } catch (e) { fail(purpose, e); }
    setBusy(null);
  };
  const test = async (purpose) => {
    setBusy(`t-${purpose}`);
    try { setTests((t) => ({ ...t, [purpose]: null })); const r = await aiAnalyticsAPI.testPurpose(purpose); setTests((t) => ({ ...t, [purpose]: r })); await onChanged(); } catch (e) { fail(purpose, e); }
    setBusy(null);
  };
  const saveRest = async () => {
    try { await aiAnalyticsAPI.saveRestMinutes(Number(rest)); await onChanged(); setProblem((x) => ({ ...x, rest: null })); } catch (e) { fail('rest', e); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }} data-ai-purposes>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end', padding: 14, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card }}>
        <div style={{ flex: '1 1 260px', fontSize: '0.78rem', color: C.mid, lineHeight: 1.5 }}>
          A call goes down its purpose's line, then every other key allowed for it. A key kept to other purposes is never used. A key that is over quota or refused rests, so the next key answers straight away.
        </div>
        <div>
          <label htmlFor="ai-rest" style={label}>A refused key rests (minutes, 0 = never)</label>
          <span style={{ display: 'flex', gap: 6 }}>
            <input id="ai-rest" type="number" min={0} max={1440} value={rest} onChange={(e) => setRest(e.target.value)} style={{ ...field, width: 90 }} />
            <button type="button" style={btn} onClick={saveRest} disabled={String(data.rest_minutes) === rest}>Save</button>
          </span>
          {problem.rest && <p role="alert" style={{ color: C.bad, fontSize: '0.7rem', margin: '4px 0 0' }}>{problem.rest}</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {data.purposes.map((p) => {
          const own = p.line.filter((l) => l.own);
          const rest2 = p.line.filter((l) => !l.own);
          const t = tests[p.key];
          return (
            <article key={p.key} data-ai-purpose={p.key} style={{ padding: 16, borderRadius: 14, border: `1px solid ${C.border}`, background: C.card, display: 'grid', gap: 10, alignContent: 'start', minWidth: 0 }}>
              <header>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                  <span style={{ fontSize: '0.66rem', color: C.dim }}>read by {p.readers}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: C.mid }}>{p.about}</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: C.dim }} data-ai-used-by>Used by: {p.used_by.join(', ')}</p>
              </header>

              {editing === p.key ? (
                <div style={{ display: 'grid', gap: 8 }} data-ai-line-form>
                  {draft.length === 0 && <p style={{ margin: 0, fontSize: '0.72rem', color: C.dim }}>No line of its own: the keys allowed for it are used in the general order.</p>}
                  {draft.map((l, i) => (
                    <div key={l.key_id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) minmax(0,1fr) auto', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: C.dim }}>{i + 1}</span>
                      <span style={{ fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{keyOf(l.key_id)?.label}</span>
                      <span>
                        <input aria-label={`Model for ${keyOf(l.key_id)?.label}`} list={`m-${p.key}-${l.key_id}`} value={l.model} placeholder={keyOf(l.key_id)?.effective_model} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))} style={field} />
                        <datalist id={`m-${p.key}-${l.key_id}`}>{models(l.key_id).map((m) => <option key={m} value={m} />)}</datalist>
                      </span>
                      <span style={{ display: 'flex', gap: 2 }}>
                        <button type="button" aria-label="Earlier" style={iconBtn} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={11} /></button>
                        <button type="button" aria-label="Later" style={iconBtn} disabled={i === draft.length - 1} onClick={() => move(i, 1)}><ArrowDown size={11} /></button>
                        <button type="button" aria-label="Take out" style={iconBtn} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}><X size={11} /></button>
                      </span>
                    </div>
                  ))}
                  {allowed(p.key).some((k) => !draft.find((l) => l.key_id === k.id)) && (
                    <select aria-label={`Add a key to ${p.name}`} value="" onChange={(e) => e.target.value && setDraft((d) => [...d, { key_id: Number(e.target.value), model: '' }])} style={field}>
                      <option value="">+ Add a key to the line…</option>
                      {allowed(p.key).filter((k) => !draft.find((l) => l.key_id === k.id)).map((k) => <option key={k.id} value={k.id}>{k.label} · {k.effective_model}</option>)}
                    </select>
                  )}
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" style={{ ...btn, color: C.accent, borderColor: C.accent }} onClick={() => save(p.key)} disabled={busy === p.key}>{busy === p.key ? <Loader2 size={11} /> : <CheckCircle size={11} />} Save the line</button>
                    <button type="button" style={btn} onClick={() => setEditing(null)}>Cancel</button>
                  </span>
                </div>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 5 }} data-ai-line>
                  {own.map((l) => <Place key={l.key_id} l={l} />)}
                  {rest2.length > 0 && <li style={{ fontSize: '0.64rem', color: C.dim, marginTop: own.length ? 4 : 0, letterSpacing: '0.06em' }}>{own.length ? 'THEN THE OTHER KEYS ALLOWED FOR IT' : 'NO LINE OF ITS OWN: THE KEYS ALLOWED FOR IT'}</li>}
                  {rest2.map((l) => <Place key={l.key_id} l={l} dim />)}
                  {p.line.length === 0 && <li style={{ fontSize: '0.74rem', color: C.bad }}>No key may be used for this. Add a key open to all, or tick this purpose on a key.</li>}
                </ol>
              )}

              {problem[p.key] && <p role="alert" style={{ margin: 0, color: C.bad, fontSize: '0.72rem' }}>{problem[p.key]}</p>}
              {t && (
                <div data-ai-test={p.key} style={{ fontSize: '0.72rem', color: t.ok ? C.good : C.bad }}>
                  {t.ok ? `✓ ${t.key} answered at place ${t.position} (${t.model}, ${t.ms} ms)` : `✗ ${t.message}`}
                  {t.failed?.map((f, i) => <div key={i} style={{ color: C.warn }}>{f.key} failed first: {f.error}</div>)}
                </div>
              )}
              {editing !== p.key && (
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" style={btn} onClick={() => edit(p)}><Plus size={11} /> {p.own_line.length ? 'Change the line' : 'Set up a line'}</button>
                  <button type="button" style={{ ...btn, color: C.accent, borderColor: C.accent }} onClick={() => test(p.key)} disabled={busy === `t-${p.key}`}>{busy === `t-${p.key}` ? <Loader2 size={11} /> : <CheckCircle size={11} />} Test this purpose</button>
                </span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Place({ l, dim }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '6px 9px', borderRadius: 8, background: dim ? 'transparent' : 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)', border: dim ? `1px dashed ${C.border}` : '1px solid transparent', fontSize: '0.76rem', opacity: dim ? 0.85 : 1 }}>
      <span style={{ fontSize: '0.66rem', color: C.dim }}>{l.position}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {l.label}{' '}
        {l.resting_until && new Date(l.resting_until) > new Date() && <span style={tag(C.warn)}>resting until {until(l.resting_until)}</span>}
      </span>
      <span style={{ fontSize: '0.68rem', color: C.accent, whiteSpace: 'nowrap' }}>{l.model}</span>
    </li>
  );
}
