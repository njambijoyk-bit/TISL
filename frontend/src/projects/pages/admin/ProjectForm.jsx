import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useProjectNames } from '../../lib/names';
import { message, PRIORITY } from '../../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import { ExtraFieldInputs } from '../../components/ExtraFields';
import { check } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * Start a piece of work, or change one (docs/PROJECTS_STAGE1_SPEC.md, build 1.3). One form for every industry: the labels come from the names
 * table, so "Reference" reads "Case number" to a law firm and "Contract number" to a builder, and it is the same field.
 * What is fixed when work starts (industry, kind of work, branch, lead, number) is only asked for when starting.
 */
const EMPTY = { industry_key: '', type_id: '', title: '', description: '', customer_id: null, lead_user_id: '', location_id: '', priority: 'medium', reference: '', authority: '', place: '', start_date: '', due_date: '', confidential: false };

function ClientPicker({ label, value, onChange }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);

  useEffect(() => {
    if (q.trim() === '') { setFound(null); return undefined; }
    let live = true;
    const id = setTimeout(() => { projectsAPI.customers(q).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q]);

  if (value) {
    return (
      <Field label={label} htmlFor="project-client-chosen">
        <div id="project-client-chosen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', fontSize: 13.5 }}>
          <span>{value.name}</span>
          <Btn small variant="quiet" onClick={() => onChange(null)} aria-label={`Remove ${value.name}`}>Change</Btn>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor="project-client" hint="Type a name, a company or a customer number. Leave empty for work with no client.">
      <TextInput id="project-client" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {found && (
        <div role="listbox" aria-label={`${label} found`} style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden' }}>
          {found.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)' }}>Nobody found. Add them under Customers first.</div>}
          {found.map((c) => (
            <button
              key={c.id} type="button" role="option" aria-selected="false" onClick={() => { onChange(c); setQ(''); setFound(null); }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', textAlign: 'left', cursor: 'pointer' }}
            >
              <span>{c.name}</span><span style={{ color: 'var(--text-secondary)' }}>{c.detail}</span>
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

export default function ProjectForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { t } = useProjectNames();
  const [options, setOptions] = useState(null);
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [client, setClient] = useState(null);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [extra, setExtra] = useState({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [o, p] = await Promise.all([projectsAPI.options(), editing ? projectsAPI.get(id) : null]);
        if (!live) return;
        setOptions(o);
        if (p) {
          setProject(p);
          setClient(p.customer);
          setExtra(Object.fromEntries((p.fields || []).map((f) => [f.key, f.value])));
          setForm({ ...EMPTY, industry_key: p.industry.key, type_id: p.type.id, title: p.title, description: p.description || '', priority: p.priority, reference: p.reference || '', authority: p.authority || '',
            place: p.place || '', start_date: p.start_date || '', due_date: p.due_date || '', confidential: p.confidential });
        } else {
          const first = o.types.find((x) => x.industry === o.default_industry);
          setForm((f) => ({ ...f, industry_key: o.default_industry, type_id: first ? first.id : '' }));
        }
      } catch (e) {
        if (live) setFailed(message(e, 'This could not be loaded. Check your connection and try again.'));
      }
    })();
    return () => { live = false; };
  }, [id, editing]);

  // the words of the industry chosen on the form (a new piece of work), or of the work being changed
  const words = useMemo(() => (editing ? project?.words : options?.words?.[form.industry_key]) || {}, [editing, project, options, form.industry_key]);
  const w = (key, plural = false, lower = false) => {
    const word = words[key] ? (plural ? words[key].plural : words[key].name) : t(key, plural);
    return lower ? word.charAt(0).toLowerCase() + word.slice(1) : word;
  };
  const types = options ? options.types.filter((x) => x.industry === form.industry_key) : [];
  const type = types.find((x) => String(x.id) === String(form.type_id));
  const set = (patch) => { setProblem(''); setForm((f) => ({ ...f, ...patch })); };   // a refusal is about what was sent: it goes once something is changed
  const canConfidential = editing ? project?.can?.confidential : options?.can?.confidential;
  const extraFields = (editing ? project?.fields : options?.fields?.[form.type_id]) || [];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    const common = { title: form.title, description: form.description, customer_id: client ? client.id : null, priority: form.priority, reference: form.reference, authority: form.authority, place: form.place,
      start_date: form.start_date || null, due_date: form.due_date || null,
      fields: Object.fromEntries(extraFields.map((f) => [f.key, extra[f.key] ?? (f.kind === 'pick_many' ? [] : f.kind === 'yes_no' ? false : null)])) };
    try {
      const saved = editing
        ? await projectsAPI.update(id, { ...common, ...(canConfidential && form.confidential !== project.confidential ? { confidential: form.confidential } : {}) })
        : await projectsAPI.create({ ...common, industry_key: form.industry_key, type_id: Number(form.type_id), lead_user_id: form.lead_user_id ? Number(form.lead_user_id) : undefined,
          location_id: form.location_id ? Number(form.location_id) : null, confidential: canConfidential ? form.confidential : false });
      toast.success(editing ? 'Saved' : `${saved.number} started`);
      navigate(`/admin/projects/${saved.id}`);
    } catch (err) {
      setProblem(message(err, 'Could not save. Check what you entered and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => navigate(editing ? `/admin/projects/${id}` : '/admin/projects');
  const heading = editing ? (project ? `Change ${project.number}` : 'Change') : `New ${w('project', false, true)}`;

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title={heading} subtitle={editing ? project?.title : 'Its number and its cost centre in the books are made when you save'} actions={<Btn onClick={back}>Cancel</Btn>} />
      {failed && <Notice status="problem">{failed}</Notice>}
      {!failed && !options && <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>}

      {options && (!editing || project) && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <Panel style={{ gridColumn: 'span 2', minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {!editing && options.industries.length > 1 && (
                <Field label="Industry" htmlFor="project-industry">
                  <SelectInput id="project-industry" value={form.industry_key} onChange={(e) => { const first = options.types.find((x) => x.industry === e.target.value); set({ industry_key: e.target.value, type_id: first ? first.id : '' }); }}>
                    {options.industries.map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
                  </SelectInput>
                </Field>
              )}
              {!editing && (
                <Field label="Kind of work" htmlFor="project-type">
                  <SelectInput id="project-type" value={form.type_id} onChange={(e) => set({ type_id: e.target.value })} required>
                    {types.length === 0 && <option value="">None set up for this industry</option>}
                    {types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </SelectInput>
                </Field>
              )}
              <Field label="Title" htmlFor="project-title" style={{ gridColumn: '1 / -1' }}>
                <TextInput id="project-title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} required autoFocus={!editing} />
              </Field>
              <ClientPicker label={w('client')} value={client} onChange={setClient} />
              {!editing && (
                <Field label={w('lead')} htmlFor="project-lead">
                  <SelectInput id="project-lead" value={form.lead_user_id} onChange={(e) => set({ lead_user_id: e.target.value })}>
                    <option value="">Me</option>
                    {options.leads.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </SelectInput>
                </Field>
              )}
              {!editing && options.branches.length > 0 && (
                <Field label="Branch" htmlFor="project-branch">
                  <SelectInput id="project-branch" value={form.location_id} onChange={(e) => set({ location_id: e.target.value })}>
                    <option value="">No branch</option>
                    {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </SelectInput>
                </Field>
              )}
              <Field label="Priority" htmlFor="project-priority">
                <SelectInput id="project-priority" value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                  {options.priorities.map((p) => <option key={p} value={p}>{PRIORITY[p]?.label || p}</option>)}
                </SelectInput>
              </Field>
              <Field label={w('reference')} htmlFor="project-reference">
                <TextInput id="project-reference" value={form.reference} maxLength={120} onChange={(e) => set({ reference: e.target.value })} />
              </Field>
              <Field label={w('authority')} htmlFor="project-authority">
                <TextInput id="project-authority" value={form.authority} maxLength={160} onChange={(e) => set({ authority: e.target.value })} />
              </Field>
              <Field label={w('place')} htmlFor="project-place" style={{ gridColumn: '1 / -1' }}>
                <TextInput id="project-place" value={form.place} maxLength={300} onChange={(e) => set({ place: e.target.value })} />
              </Field>
              <Field label="Start" htmlFor="project-start">
                <TextInput id="project-start" type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
              </Field>
              <Field label="Expected end" htmlFor="project-due">
                <TextInput id="project-due" type="date" value={form.due_date} min={form.start_date || undefined} onChange={(e) => set({ due_date: e.target.value })} />
              </Field>
              <ExtraFieldInputs fields={extraFields} values={extra} onChange={(v) => { setProblem(''); setExtra(v); }} people={options.leads} />
              <Field label="Description" htmlFor="project-description" style={{ gridColumn: '1 / -1' }}>
                <textarea id="project-description" value={form.description} rows={4} onChange={(e) => set({ description: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' }} />
              </Field>
              {canConfidential && (
                <label htmlFor="project-confidential" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 }}>
                  <input id="project-confidential" type="checkbox" style={check} checked={form.confidential} onChange={(e) => set({ confidential: e.target.checked })} />
                  <span><b>Confidential.</b> Only the people on it can find it, even in search. Every time it is opened is recorded.</span>
                </label>
              )}
            </div>
            {problem && <Notice status="problem" style={{ marginTop: 14 }}>{problem}</Notice>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Btn type="submit" variant="primary" busy={busy} disabled={!editing && !form.type_id}>Save</Btn>
              <Btn onClick={back}>Cancel</Btn>
            </div>
          </Panel>

          {!editing && (
            <Panel>
              <PanelTitle>When you save</PanelTitle>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                <li>It gets the next number{type ? <> in the <b>{type.prefix}-</b> series</> : null}</li>
                <li>{options.cost_centres ? 'Its cost centre is made in the books, under the branch\'s Projects' : 'The books have no cost centres yet, so it starts without one'}</li>
                <li>It starts at the first stage of its kind of work</li>
                <li>The {w('lead', false, true)} is put on it; so are you</li>
                <li>All of this is written to the log</li>
              </ul>
            </Panel>
          )}
        </form>
      )}
    </AdminLayout>
  );
}
