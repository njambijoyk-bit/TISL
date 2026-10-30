import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { eventsPlanAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import { CheckboxRow, Field, FormGrid, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const STATUS = [['todo', 'Not started'], ['doing', 'In progress'], ['review', 'Under review'], ['done', 'Done'], ['blocked', 'Blocked'], ['on_hold', 'On hold'], ['cancelled', 'Cancelled']];
const PRIORITY = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']];
const TONE = { urgent: colors.danger, high: colors.warningText };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };

/** Tasks of the event: a checklist grouped by status, each with owner, priority, dates, a dependency, comments and whether the client sees it. */
export default function TasksPanel({ eventId, canEdit }) {
  const [tasks, setTasks] = useState(null);
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);       // the task whose comments are open
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => eventsPlanAPI.list(eventId, 'tasks').then((r) => setTasks(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load the tasks'))), [eventId]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (t, status) => {
    try { await eventsPlanAPI.save(eventId, 'tasks', t.id, { status }); load(); } catch (e) { toast.error(errMsg(e, 'Could not change it'), { duration: 7000 }); }
  };
  const blank = { id: null, title: '', department: '', priority: 'normal', status: 'todo', starts_on: '', due_on: '', notes: '', depends_on_id: '', client_visible: false, evidence: '' };
  const save = async () => {
    setBusy(true);
    try {
      const { id, ...v } = edit;
      await eventsPlanAPI.save(eventId, 'tasks', id, { ...v, department: v.department || null, starts_on: v.starts_on || null, due_on: v.due_on || null, depends_on_id: v.depends_on_id || null, notes: v.notes || null, evidence: v.evidence || null });
      toast.success('Saved'); setEdit(null); load();
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const remove = async (t) => { try { await eventsPlanAPI.remove(eventId, 'tasks', t.id); load(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); } };
  const openComments = async (t) => { setOpen(t); setComments([]); setText(''); eventsPlanAPI.comments(eventId, t.id).then(setComments).catch(() => {}); };
  const comment = async () => { try { setComments(await eventsPlanAPI.addComment(eventId, open.id, text)); setText(''); load(); } catch (e) { toast.error(errMsg(e, 'Could not add it')); } };

  if (!tasks) return <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>Loading…</p>;
  const shown = tasks.filter((t) => (filter === 'open' ? !['done', 'cancelled'].includes(t.status) : filter === 'late' ? t.late : filter === 'done' ? t.status === 'done' : true));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {canEdit && <button type="button" style={btnPrimary} onClick={() => setEdit(blank)}><Plus size={14} /> Add a task</button>}
        {[['open', 'Open'], ['late', 'Late'], ['done', 'Done'], ['all', 'All']].map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={{ ...small, ...(filter === k ? { background: colors.primary, color: '#fff', borderColor: colors.primary } : {}) }}>{l}</button>)}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: colors.textMuted }}>{tasks.filter((t) => t.status === 'done').length} of {tasks.length} done</span>
      </div>
      {shown.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>{tasks.length ? 'Nothing here.' : 'No tasks yet. Add one, or fill the plan from a template on the Overview tab.'}</p>}
      {shown.map((t) => (
        <div key={t.id} style={{ ...card, padding: 12, display: 'grid', gap: 6, opacity: t.status === 'cancelled' ? 0.55 : 1 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="checkbox" checked={t.status === 'done'} disabled={!canEdit} onChange={(e) => setStatus(t, e.target.checked ? 'done' : 'todo')} aria-label={`Done: ${t.title}`} />
            <strong style={{ flex: 1, minWidth: 160, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</strong>
            {t.priority !== 'normal' && <span style={{ fontSize: '0.72rem', fontWeight: 800, color: TONE[t.priority] ?? colors.textMuted, textTransform: 'uppercase' }}>{t.priority}</span>}
            {canEdit ? <SelectInput value={t.status} onChange={(e) => setStatus(t, e.target.value)} aria-label="Status" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.76rem' }}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput> : <span style={{ fontSize: '0.76rem' }}>{STATUS.find(([k]) => k === t.status)?.[1]}</span>}
          </div>
          <div style={{ fontSize: '0.76rem', color: colors.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {t.department && <span>{t.department}</span>}
            {t.assignee && <span>{t.assignee}</span>}
            {t.due_on && <span style={{ color: t.late ? colors.danger : undefined, fontWeight: t.late ? 700 : 400 }}>Due {t.due_on}{t.late ? ' (late)' : ''}</span>}
            {t.depends_on_id && <span>Waits for “{tasks.find((x) => x.id === t.depends_on_id)?.title ?? 'a task'}”</span>}
            {t.client_visible ? <span>Client sees it</span> : null}
          </div>
          {t.notes && <span style={{ fontSize: '0.82rem', color: colors.textBody }}>{t.notes}</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={small} onClick={() => openComments(t)}><MessageSquare size={12} /> {t.comments || ''} Comments</button>
            {canEdit && <button type="button" style={small} onClick={() => setEdit({ ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, t[k] ?? blank[k]])), client_visible: Boolean(t.client_visible) })}>Edit</button>}
            {canEdit && <button type="button" style={{ ...small, color: colors.danger }} onClick={() => remove(t)} aria-label="Remove"><Trash2 size={12} /></button>}
          </div>
        </div>
      ))}

      {edit && (
        <Modal title={edit.id ? 'Edit task' : 'Add a task'} width={560} onClose={() => setEdit(null)} footer={<ModalActions onCancel={() => setEdit(null)} onSubmit={save} busy={busy} disabled={!edit.title.trim()} submitLabel="Save" busyLabel="Saving…" />}>
          <FormStack>
            <Field label="Title" htmlFor="tk-title"><TextInput id="tk-title" maxLength={200} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <FormGrid min={150}>
              <Field label="Department" htmlFor="tk-dep"><TextInput id="tk-dep" maxLength={60} value={edit.department ?? ''} onChange={(e) => setEdit({ ...edit, department: e.target.value })} placeholder="Catering, Venue…" /></Field>
              <Field label="Priority" htmlFor="tk-pri"><SelectInput id="tk-pri" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>{PRIORITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
              <Field label="Status" htmlFor="tk-st"><SelectInput id="tk-st" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
              <Field label="Starts" htmlFor="tk-s"><TextInput id="tk-s" type="date" value={edit.starts_on ?? ''} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} /></Field>
              <Field label="Due" htmlFor="tk-d"><TextInput id="tk-d" type="date" value={edit.due_on ?? ''} onChange={(e) => setEdit({ ...edit, due_on: e.target.value })} /></Field>
              <Field label="Waits for" htmlFor="tk-dep2"><SelectInput id="tk-dep2" value={edit.depends_on_id ?? ''} onChange={(e) => setEdit({ ...edit, depends_on_id: e.target.value })}><option value="">Nothing</option>{tasks.filter((x) => x.id !== edit.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</SelectInput></Field>
            </FormGrid>
            <Field label="Notes" htmlFor="tk-n"><TextArea id="tk-n" rows={3} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            <Field label="Proof it is done" htmlFor="tk-ev" hint="A receipt number, a link, a note."><TextInput id="tk-ev" maxLength={300} value={edit.evidence ?? ''} onChange={(e) => setEdit({ ...edit, evidence: e.target.value })} /></Field>
            <CheckboxRow checked={edit.client_visible} onChange={(v) => setEdit({ ...edit, client_visible: v })} label="Show this to the client" description="They see it in their progress list." />
          </FormStack>
        </Modal>
      )}
      {open && (
        <Modal title={open.title} subtitle="Comments" width={480} onClose={() => setOpen(null)}>
          <FormStack>
            {comments.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No comments yet.</p>}
            {comments.map((c) => <div key={c.id} style={{ fontSize: '0.84rem' }}><strong>{c.by ?? 'Someone'}</strong> <span style={{ color: colors.textFaint, fontSize: '0.72rem' }}>{String(c.at).slice(0, 16).replace('T', ' ')}</span><div>{c.body}</div></div>)}
            <TextArea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="New comment" />
            <div><button type="button" style={btnPrimary} disabled={!text.trim()} onClick={comment}>Add comment</button></div>
          </FormStack>
        </Modal>
      )}
    </div>
  );
}
