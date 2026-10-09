import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Loader2, AlertCircle, CheckCircle, X, Plus, Search, Send, Lock } from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import mimiKnowledgeAPI from '../../../../_shared/api/mimiKnowledgeAPI';
import useAuthStore from '../../../../_shared/store/authStore';
import { hasPermission } from '../../../../_shared/lib/roles';
import { useAiPageAudio } from './useAiPageAudio';
import { C, NeuralPageShell, NeuralBreadcrumb, NeuralDivider, neuralCard } from './AiPageShared';

// ── small pieces ───────────────────────────────────────────────────────────────
const input = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.bgInput, color: C.text, fontSize: '0.8rem', fontFamily: 'inherit',
};
const btn = (primary, disabled) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: `1px solid ${primary ? C.blue : C.border}`, background: primary ? C.blue : 'transparent', color: primary ? '#fff' : C.text,
});

function Badge({ label, color }) {
    return (
        <span style={{
            fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
            background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, color,
        }}>{label}</span>
    );
}
const statusColor = s => ({ live: C.green, draft: C.amber, retired: C.textDim }[s] ?? C.textMid);

function Field({ label, hint, children }) {
    return (
        <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</span>
            {children}
            {hint && <span style={{ display: 'block', fontSize: '0.68rem', color: C.textDim, marginTop: 3 }}>{hint}</span>}
        </label>
    );
}

function Notice({ tone = 'info', children }) {
    const color = { info: C.blue, warn: C.amber, bad: C.red, good: C.green }[tone];
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, marginBottom: 14, fontSize: '0.75rem', lineHeight: 1.5, color: C.text,
            background: `color-mix(in srgb, ${color} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}>
            <AlertCircle size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
            <div>{children}</div>
        </div>
    );
}

const errText = e => {
    const d = e?.response?.data;
    if (d?.errors?.entry) return d.errors.entry;
    if (d?.errors) return Object.values(d.errors).flat();
    return [d?.message || e?.message || 'Something went wrong.'];
};

// pick permissions from the catalogue
function PermPicker({ all, value, onChange }) {
    const [q, setQ] = useState('');
    const shown = useMemo(() => all.filter(p => !value.includes(p.key) && (`${p.key} ${p.label}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 8), [all, value, q]);
    return (
        <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {value.map(k => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', fontFamily: 'monospace', padding: '2px 8px', borderRadius: 6, border: `1px solid ${C.borderHi}`, color: C.text }}>
                        {k}<button type="button" aria-label={`Remove ${k}`} onClick={() => onChange(value.filter(x => x !== k))} style={{ background: 'none', border: 0, color: C.textMid, cursor: 'pointer', padding: 0 }}><X size={11} /></button>
                    </span>
                ))}
                {!value.length && <span style={{ fontSize: '0.7rem', color: C.textDim }}>No permission needed</span>}
            </div>
            <input style={input} placeholder="Search permissions to add…" value={q} onChange={e => setQ(e.target.value)} />
            {q && (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 180, overflow: 'auto', background: C.bgCard }}>
                    {shown.map(p => (
                        <button key={p.key} type="button" onClick={() => { onChange([...value, p.key]); setQ(''); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 0, color: C.text, cursor: 'pointer', fontSize: '0.74rem' }}>
                            <code>{p.key}</code> <span style={{ color: C.textDim }}>· {p.label}</span>
                        </button>
                    ))}
                    {!shown.length && <div style={{ padding: 8, fontSize: '0.72rem', color: C.textDim }}>Nothing matches.</div>}
                </div>
            )}
        </div>
    );
}

// ── the entry editor ───────────────────────────────────────────────────────────
const blank = { entry_key: '', title: '', audience: ['guest', 'customer'], requires: [], sensitivity: 'public', resolver: '', keywords: '', follow: '',
    questionsText: '', answer_md: '', more_md: '', denied_text: '', empty_text: '' };

const toForm = e => ({
    ...blank, ...e, follow: (e.follow || []).join(' '), resolver: e.resolver || '', keywords: e.keywords || '', more_md: e.more_md || '', denied_text: e.denied_text || '', empty_text: e.empty_text || '',
    questionsText: (e.questions || []).map(q => (q.lang && q.lang !== 'en' ? `${q.lang}| ` : '') + q.question).join('\n'),
});
const parseQuestions = t => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^([a-z]{2})\|\s*(.+)$/);
    return m ? { lang: m[1], question: m[2] } : { lang: 'en', question: l };
});

function EntryEditor({ initial, meta, onClose, onSaved }) {
    const [f, setF] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState([]);
    const creating = !initial.id;
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));
    const everyone = f.audience.includes('any');
    const toggleKind = k => set('audience', f.audience.includes(k) ? f.audience.filter(x => x !== k) : [...f.audience.filter(x => x !== 'any'), k]);
    const resolver = meta.resolvers.find(r => r.name === f.resolver);

    const save = async () => {
        setSaving(true); setErrors([]);
        const body = {
            entry_key: f.entry_key, title: f.title, audience: f.audience, requires: f.requires, sensitivity: f.sensitivity, resolver: f.resolver || null, keywords: f.keywords,
            follow: f.follow.split(/\s+/).filter(Boolean), answer_md: f.answer_md, more_md: f.more_md, denied_text: f.denied_text, empty_text: f.empty_text, questions: parseQuestions(f.questionsText),
        };
        try {
            const saved = creating ? await mimiKnowledgeAPI.create(body) : await mimiKnowledgeAPI.update(initial.id, body);
            onSaved(saved);
        } catch (e) { setErrors(errText(e)); }
        setSaving(false);
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={creating ? 'New entry' : `Edit ${initial.entry_key}`}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }}>
            <div style={{ ...neuralCard, width: 'min(760px, 100%)', padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', color: C.text }}>{creating ? 'New entry' : `Edit ${initial.entry_key}`}</h2>
                    <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 0, color: C.textMid, cursor: 'pointer' }}><X size={18} /></button>
                </div>
                {!creating && initial.status === 'live' && <Notice tone="warn">This entry is live. Saving a change sends it back to draft until someone else reviews it.</Notice>}
                {errors.length > 0 && <Notice tone="bad"><strong>Not saved.</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Notice>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    <Field label="Key" hint="area.topic, for example store.hours. Never changes, never reused.">
                        <input style={input} value={f.entry_key} disabled={!creating} onChange={e => set('entry_key', e.target.value)} />
                    </Field>
                    <Field label="Title"><input style={input} value={f.title} onChange={e => set('title', e.target.value)} /></Field>
                </div>

                <Field label="Who is it for?" hint="Kinds of account, never role names. What a person may see is decided by their permissions below.">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: '0.78rem', color: C.text }}>
                        <label><input type="checkbox" checked={everyone} onChange={e => set('audience', e.target.checked ? ['any'] : [])} /> Everyone</label>
                        {!everyone && meta.kinds.map(k => <label key={k}><input type="checkbox" checked={f.audience.includes(k)} onChange={() => toggleKind(k)} /> {k}</label>)}
                    </div>
                </Field>
                <Field label="Permissions needed (all of them)"><PermPicker all={meta.permissions} value={f.requires} onChange={v => set('requires', v)} /></Field>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    <Field label="Sensitivity" hint="Public text may be offered to an outside AI as context. Own and restricted never are.">
                        <select style={input} value={f.sensitivity} onChange={e => set('sensitivity', e.target.value)}>
                            <option value="public">public: anyone may read it</option><option value="own">own: about the caller's own account</option><option value="restricted">restricted: needs a permission</option>
                        </select>
                    </Field>
                    <Field label="Live data (resolver)" hint={resolver ? `Needs: ${resolver.requires.join(', ') || 'no permission'} · for ${resolver.kinds.join(', ')}` : 'Leave empty for a plain written answer.'}>
                        <select style={input} value={f.resolver} onChange={e => set('resolver', e.target.value)}>
                            <option value="">None</option>{meta.resolvers.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                        </select>
                    </Field>
                </div>

                <Field label="Ways people ask it (one per line, at least 3)" hint="Write them as people type them. Use {order} {payment} {customer} {email} where a reference goes. Start a line with sw| for Swahili.">
                    <textarea style={{ ...input, minHeight: 110, fontFamily: 'inherit' }} value={f.questionsText} onChange={e => set('questionsText', e.target.value)} />
                </Field>
                <Field label="Answer" hint="Short enough to read at a glance. {{company.name}} and {{support.email}} are filled in. Supports **bold**, *italic*, `code` and - bullets.">
                    <textarea style={{ ...input, minHeight: 110, fontFamily: 'inherit' }} value={f.answer_md} onChange={e => set('answer_md', e.target.value)} />
                </Field>
                <Field label="When they are not allowed" hint="Safe for anyone to read. Required when someone could ask about this but not see it."><input style={input} value={f.denied_text} onChange={e => set('denied_text', e.target.value)} /></Field>
                <Field label="When nothing is found (live data only)"><input style={input} value={f.empty_text} onChange={e => set('empty_text', e.target.value)} /></Field>
                <details style={{ marginBottom: 12 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: C.textMid }}>More options</summary>
                    <div style={{ marginTop: 10 }}>
                        <Field label="Extra keywords" hint="A nudge for matching, never a substitute for good questions."><input style={input} value={f.keywords} onChange={e => set('keywords', e.target.value)} /></Field>
                        <Field label="You might also ask (keys, space separated)"><input style={input} value={f.follow} onChange={e => set('follow', e.target.value)} /></Field>
                        <Field label="More detail"><textarea style={{ ...input, minHeight: 70, fontFamily: 'inherit' }} value={f.more_md} onChange={e => set('more_md', e.target.value)} /></Field>
                    </div>
                </details>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
                    <button type="button" style={btn(true, saving)} disabled={saving} onClick={save}>{saving ? <Loader2 size={13} className="animate-spin" /> : null} Save as draft</button>
                </div>
            </div>
        </div>
    );
}

// ── tabs ───────────────────────────────────────────────────────────────────────
function EntriesTab({ meta, reloadMeta, canEdit, startWith, clearStart }) {
    const [data, setData] = useState({ source: 'file', data: [] });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [q, setQ] = useState('');
    const [editing, setEditing] = useState(null);
    const [msg, setMsg] = useState(null);

    const load = useCallback(async () => { setLoading(true); try { setData(await mimiKnowledgeAPI.list()); } catch (e) { setMsg({ tone: 'bad', text: errText(e)[0] }); } setLoading(false); }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (startWith) { setEditing(startWith); clearStart(); } }, [startWith, clearStart]);

    const rows = data.data.filter(e => (filter === 'all' || e.status === filter) && `${e.entry_key} ${e.title}`.toLowerCase().includes(q.toLowerCase()));
    const act = async (fn, ok) => { try { await fn(); setMsg({ tone: 'good', text: ok }); await load(); await reloadMeta(); } catch (e) { setMsg({ tone: 'bad', text: errText(e).join(' ') }); } };

    return (
        <div>
            {!meta.tables_ready && <Notice tone="warn">The database tables are not there yet. Run <code>database/sql/105_mimi_local_layer.sql</code> in Workbench. Until then Mimi reads the knowledge file and this list is read only.</Notice>}
            {meta.tables_ready && data.source === 'file' && (
                <Notice tone="info">Mimi is reading the knowledge file, not the database. Copy the {data.data.length} entries into the database to edit and review them here.{' '}
                    {canEdit && <button type="button" style={btn(true)} onClick={() => act(() => mimiKnowledgeAPI.importFile(false), 'Imported. Every entry starts as a draft until someone reviews it.')}>Import into the database</button>}</Notice>
            )}
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: C.textDim }} />
                    <input aria-label="Search entries" style={{ ...input, paddingLeft: 28 }} placeholder="Search entries" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                {['all', 'live', 'draft', 'retired'].map(s => <button key={s} type="button" aria-pressed={filter === s} style={{ ...btn(filter === s) }} onClick={() => setFilter(s)}>{s}</button>)}
                {canEdit && data.source === 'database' && <button type="button" style={btn(true)} onClick={() => setEditing(blank)}><Plus size={13} /> New entry</button>}
            </div>
            {loading ? <Loader2 className="animate-spin" size={18} style={{ color: C.blue }} /> : (
                <div style={{ ...neuralCard, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', color: C.text }}>
                        <thead><tr style={{ textAlign: 'left', color: C.textMid, fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {['Entry', 'For', 'Needs', 'Status', ''].map(h => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {rows.map(e => (
                                <tr key={e.entry_key} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <td style={{ padding: '10px 12px' }}><strong>{e.title}</strong><div style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: C.textDim }}>{e.entry_key}{e.version ? ` · v${e.version}` : ''}</div></td>
                                    <td style={{ padding: '10px 12px' }}>{e.audience.map(a => <Badge key={a} label={a === 'any' ? 'everyone' : a} color={C.blue} />)}</td>
                                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.68rem' }}>{e.requires.join(', ') || '–'}{e.resolver ? <div style={{ color: C.textDim }}>live: {e.resolver}</div> : null}</td>
                                    <td style={{ padding: '10px 12px' }}><Badge label={e.status} color={statusColor(e.status)} /></td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {e.editable && canEdit && (<>
                                            <button type="button" style={btn(false)} onClick={() => setEditing(toForm(e))}>Edit</button>{' '}
                                            {e.status === 'draft' && <button type="button" style={btn(true)} onClick={() => act(() => mimiKnowledgeAPI.review(e.id), `${e.entry_key} is live.`)}><CheckCircle size={12} /> Review</button>}{' '}
                                            {e.status !== 'retired' && <button type="button" style={btn(false)} onClick={() => window.confirm(e.status === 'draft' && !e.reviewed_at ? `Delete the draft ${e.entry_key}?` : `Retire ${e.entry_key}? It stops being served and its key stays taken.`) && act(() => mimiKnowledgeAPI.remove(e.id), 'Done.')}>{e.status === 'draft' && !e.reviewed_at ? 'Delete' : 'Retire'}</button>}
                                        </>)}
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && <tr><td colSpan={5} style={{ padding: 18, color: C.textDim }}>No entries match.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
            <p style={{ fontSize: '0.68rem', color: C.textDim, marginTop: 10 }}>
                {meta.allow_drafts ? 'Drafts are being served while MIMI_LOCAL_ALLOW_DRAFTS is on. Turn it off once the wording is signed off, and only live entries will answer.' : 'Only live entries are served.'}
            </p>
            {editing && <EntryEditor initial={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMsg({ tone: 'good', text: 'Saved as a draft. Someone else reviews it before it is live.' }); load(); reloadMeta(); }} />}
        </div>
    );
}

function GapsTab({ canEdit, onMake }) {
    const [days, setDays] = useState(30);
    const [res, setRes] = useState(null);
    useEffect(() => { let on = true; mimiKnowledgeAPI.gaps(days).then(r => on && setRes(r)).catch(() => on && setRes({ ready: false })); return () => { on = false; }; }, [days]);
    if (!res) return <Loader2 className="animate-spin" size={18} style={{ color: C.blue }} />;
    if (!res.ready) return <Notice tone="warn">The log columns are not there yet. Run <code>database/sql/105_mimi_local_layer.sql</code>. Questions are counted from then on.</Notice>;
    const s = res.summary;
    return (
        <div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {[['Questions seen', s.total], ['Settled locally', s.local_share == null ? '–' : `${s.local_share}%`], ['Not answered locally', (s.by_outcome.none || 0) + (s.by_outcome.suggest || 0)]].map(([k, v]) => (
                    <div key={k} style={{ ...neuralCard, padding: '10px 16px', minWidth: 150 }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: C.text }}>{v}</div><div style={{ fontSize: '0.68rem', color: C.textMid }}>{k}</div></div>
                ))}
                <select aria-label="Period" style={{ ...input, width: 140, alignSelf: 'center' }} value={days} onChange={e => setDays(+e.target.value)}>{[7, 30, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}</select>
            </div>
            <Notice tone="info">Counted even while Mimi is in shadow mode, so you can see what the local layer <em>would</em> have missed. Emails, phone numbers and reference numbers are blanked.</Notice>
            <div style={{ ...neuralCard, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', color: C.text }}>
                    <thead><tr style={{ textAlign: 'left', color: C.textMid, fontSize: '0.64rem', textTransform: 'uppercase' }}>{['Question', 'Asked', 'Nearest entry', ''].map(h => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
                    <tbody>
                        {res.data.map(g => (
                            <tr key={g.question} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: '10px 12px' }}>{g.question}</td>
                                <td style={{ padding: '10px 12px' }}>{g.asked}</td>
                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.68rem' }}>{g.nearest ? `${g.nearest} (${g.confidence.toFixed(2)})` : '–'}</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>{canEdit && <button type="button" style={btn(false)} onClick={() => onMake(g.question)}><Plus size={12} /> Write an entry</button>}</td>
                            </tr>
                        ))}
                        {!res.data.length && <tr><td colSpan={4} style={{ padding: 18, color: C.textDim }}>Nothing unanswered in this period.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TryTab({ meta }) {
    const [message, setMessage] = useState('');
    const [kind, setKind] = useState('guest');
    const [perms, setPerms] = useState([]);
    const [out, setOut] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const run = async e => {
        e.preventDefault(); setBusy(true); setErr(null);
        try { setOut(await mimiKnowledgeAPI.tryIt({ message, kind, permissions: perms })); } catch (x) { setErr(errText(x).join(' ')); }
        setBusy(false);
    };
    return (
        <form onSubmit={run} style={{ maxWidth: 680 }}>
            <Notice tone="info">Asks the real engine as a made-up person. Live data (orders, payments) is not fetched here, so those answers only show which entry would answer.</Notice>
            {err && <Notice tone="bad">{err}</Notice>}
            <Field label="Who is asking"><select style={input} value={kind} onChange={e => setKind(e.target.value)}>{meta.kinds.map(k => <option key={k}>{k}</option>)}</select></Field>
            {kind === 'staff' && <Field label="Permissions they hold"><PermPicker all={meta.permissions} value={perms} onChange={setPerms} /></Field>}
            <Field label="Question"><div style={{ display: 'flex', gap: 8 }}><input style={input} value={message} onChange={e => setMessage(e.target.value)} placeholder="Where is my order?" /><button type="submit" style={btn(true, busy || !message)} disabled={busy || !message}><Send size={13} /> Ask</button></div></Field>
            {out && (
                <div style={{ ...neuralCard, padding: 14, fontSize: '0.78rem', color: C.text }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}><Badge label={out.outcome} color={C.blue} />{out.entry && <Badge label={out.entry} color={C.purple} />}<Badge label={`confidence ${out.confidence}`} color={C.textMid} /><Badge label={`${out.ms} ms`} color={C.textMid} /></div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{out.text || '(no answer)'}</div>
                    {out.suggestions?.length > 0 && <ul>{out.suggestions.map(s => <li key={s.label}>{s.label}</li>)}</ul>}
                </div>
            )}
        </form>
    );
}

const MODES = [['off', 'Off: the old behaviour'], ['shadow', 'Shadow: record only, change nothing'], ['on', 'On: the local layer answers']];
const FALLBACKS = [['local_only', 'Stay local: "not written down yet"'], ['ai_public', 'Outside AI with the redacted question and public information only'], ['ai_scoped', 'The old full prompt (guests and customers only)']];
const NAMES = { guest: 'Guests (not signed in)', customer: 'Customers', staff: 'Staff', other: 'Vendors, applicants, drivers' };

function SettingsTab({ canChange }) {
    const [res, setRes] = useState(null);
    const [rows, setRows] = useState([]);
    const [msg, setMsg] = useState(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => { mimiKnowledgeAPI.routing().then(r => { setRes(r); setRows(r.data); }).catch(e => setMsg({ tone: 'bad', text: errText(e)[0] })); }, []);
    if (!res) return msg ? <Notice tone="bad">{msg.text}</Notice> : <Loader2 className="animate-spin" size={18} style={{ color: C.blue }} />;
    const set = (a, k, v) => setRows(rs => rs.map(r => r.audience === a ? { ...r, [k]: v } : r));
    const turningOn = rows.filter(r => r.mode === 'on' && res.data.find(x => x.audience === r.audience)?.mode !== 'on');
    const save = async () => {
        if (turningOn.length && !window.confirm(`Switch ${turningOn.map(r => NAMES[r.audience]).join(', ')} to On? Mimi's replies to them will change. Check the Questions we couldn't answer tab in shadow mode first.`)) return;
        setSaving(true);
        try { const r = await mimiKnowledgeAPI.saveRouting(rows); setRes(r); setRows(r.data); setMsg({ tone: 'good', text: 'Saved.' }); } catch (e) { setMsg({ tone: 'bad', text: errText(e).join(' ') }); }
        setSaving(false);
    };
    return (
        <div style={{ maxWidth: 860 }}>
            {!res.ready && <Notice tone="warn">Run <code>database/sql/105_mimi_local_layer.sql</code> to keep these switches here. Until then the server's .env settings apply.</Notice>}
            {!canChange && <Notice tone="info"><Lock size={12} /> Only people who may choose what Mimi sends outside (<code>mimi.routing</code>) can change these.</Notice>}
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Notice tone="warn"><strong>Start in Shadow.</strong> The local layer works out its answer and logs it, while people still get today's reply. Switch an audience to On only when the questions-we-couldn't-answer list looks right. If the Mimi usage policy still says nothing about local answers or outside AI help, give it a new major version first.</Notice>
            <div style={{ ...neuralCard, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', color: C.text }}>
                    <thead><tr style={{ textAlign: 'left', color: C.textMid, fontSize: '0.64rem', textTransform: 'uppercase' }}>{['Who', 'Mode', 'If the local layer is not confident'].map(h => <th key={h} style={{ padding: '10px 12px' }}>{h}</th>)}</tr></thead>
                    <tbody>{rows.map(r => (
                        <tr key={r.audience} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{NAMES[r.audience]}</td>
                            <td style={{ padding: '10px 12px' }}><select aria-label={`Mode for ${NAMES[r.audience]}`} style={input} disabled={!canChange || !res.ready} value={r.mode} onChange={e => set(r.audience, 'mode', e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                            <td style={{ padding: '10px 12px' }}><select aria-label={`Fallback for ${NAMES[r.audience]}`} style={input} disabled={!canChange || !res.ready} value={r.fallback} onChange={e => set(r.audience, 'fallback', e.target.value)}>
                                {FALLBACKS.filter(([v]) => v !== 'ai_scoped' || ['guest', 'customer'].includes(r.audience)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                        </tr>))}</tbody>
                </table>
            </div>
            {canChange && res.ready && <div style={{ marginTop: 12 }}><button type="button" style={btn(true, saving)} disabled={saving} onClick={save}>{saving ? <Loader2 size={13} className="animate-spin" /> : null} Save</button></div>}
        </div>
    );
}

// ── the page ───────────────────────────────────────────────────────────────────
export default function MimiKnowledgePage() {
    const navigate = useNavigate();
    const audio = useAiPageAudio();
    const user = useAuthStore(s => s.user);
    const [ambientOn, setAmbientOn] = useState(false);
    const [tab, setTab] = useState('entries');
    const [meta, setMeta] = useState(null);
    const [error, setError] = useState(null);
    const [start, setStart] = useState(null);

    const reloadMeta = useCallback(async () => { try { setMeta(await mimiKnowledgeAPI.meta()); } catch (e) { setError(errText(e).join(' ')); } }, []);
    useEffect(() => { reloadMeta(); }, [reloadMeta]);

    const canEdit = hasPermission(user, 'mimi.knowledge');
    const canRoute = hasPermission(user, 'mimi.routing');
    const clearStart = useCallback(() => setStart(null), []);
    const tabs = [['entries', 'Entries'], ['gaps', "Questions we couldn't answer"], ['try', 'Try it'], ['settings', 'Settings']];

    return (
        <GeneralLayout>
            <NeuralPageShell audio={audio} ambientOn={ambientOn} setAmbientOn={setAmbientOn}>
                <NeuralBreadcrumb onHover={audio.playHover} items={[
                    { label: '⚙ SETTINGS', onClick: () => navigate('/admin/settings/general') },
                    { label: 'OVERVIEW', onClick: () => navigate('/admin/ai-analytics/mimi') },
                    { label: 'MIMI KNOWLEDGE' },
                ]} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
                    <BookOpen size={32} style={{ color: C.blue, flexShrink: 0, marginTop: 4 }} />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>Mimi's knowledge</h1>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: C.textMid }}>What she answers from on our own server, who may see each answer, and what she may send to an outside AI.</p>
                    </div>
                </div>
                <NeuralDivider />
                {error && <Notice tone="bad">{error}</Notice>}
                <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 18px' }}>
                    {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" style={btn(tab === k)} onClick={() => setTab(k)}>{l}</button>)}
                </div>
                {!meta ? (error ? null : <Loader2 className="animate-spin" size={20} style={{ color: C.blue }} />) : (<>
                    {tab === 'entries' && <EntriesTab meta={meta} reloadMeta={reloadMeta} canEdit={canEdit} startWith={start} clearStart={clearStart} />}
                    {tab === 'gaps' && <GapsTab canEdit={canEdit} onMake={q => { setStart({ ...blank, questionsText: q + '\n' }); setTab('entries'); }} />}
                    {tab === 'try' && <TryTab meta={meta} />}
                    {tab === 'settings' && <SettingsTab canChange={canRoute} />}
                </>)}
            </NeuralPageShell>
        </GeneralLayout>
    );
}
