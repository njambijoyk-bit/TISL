import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, ExternalLink, FileText, Lock, Plus, Trash2, Video } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import CoursesNav from '../../components/CoursesNav';
import Pill from '../../components/Pill';
import UserPicker from '../../components/UserPicker';
import FeesPanel from '../../components/FeesPanel';
import BooksPanel from '../../components/BooksPanel';
import AttendancePanel from '../../components/AttendancePanel';
import { MarkingPanel, QuizEditor } from '../../components/QuizPanel';
import CertificatesPanel from '../../components/CertificatesPanel';
import { IntakesPanel, StudentsPanel } from '../../components/TeachingPanels';
import { OfferingForm } from './CoursesOfferings';

const TONE = { published: 'ok', draft: 'warn', archived: 'neutral' };
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const local = (iso) => (iso ? iso.slice(0, 16) : '');

function LessonForm({ offering, lesson, sections, files, meta, onClose, onDone }) {
  const live = lesson?.live ?? {};
  const [f, setF] = useState({ kind: lesson?.kind ?? 'text', title: lesson?.title ?? '', section_id: lesson?.section_id ?? '', body: lesson?.body ?? '', video_url: lesson?.video_url ?? '', file_id: lesson?.file?.id ?? '',
    duration_minutes: lesson?.duration_minutes ?? '', drip_days: lesson?.drip_days ?? '', is_preview: lesson?.is_preview ?? false, is_required: lesson?.is_required ?? true });
  const [lv, setLv] = useState({ starts_at: local(live.starts_at), ends_at: local(live.ends_at), timezone: live.timezone ?? meta.timezone, provider: live.provider ?? 'auto', join_url: live.join_url ?? '', meeting_id: live.meeting_id ?? '',
    passcode: live.passcode ?? '', replay_url: live.replay_url ?? '', capacity: live.capacity ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setL = (k) => (e) => setLv((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const payload = { kind: f.kind, title: f.title, section_id: f.section_id ? Number(f.section_id) : null, body: f.body, video_url: f.video_url, file_id: f.file_id ? Number(f.file_id) : null,
        duration_minutes: f.duration_minutes === '' ? null : Number(f.duration_minutes), drip_days: f.drip_days === '' ? null : Number(f.drip_days), is_preview: f.is_preview, is_required: f.is_required,
        ...(f.kind === 'live' ? { live: { ...lv, capacity: lv.capacity === '' ? null : Number(lv.capacity) } } : {}) };
      await coursesAPI.saveLesson(offering.id, payload, lesson?.id);
      toast.success('Lesson saved.'); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the lesson'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={lesson ? 'Edit lesson' : 'Add a lesson'} onClose={onClose} width={640} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save lesson" busy={busy} disabled={!f.title.trim()} />}>
      <FormStack>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Kind" htmlFor="ls-kind"><SelectInput id="ls-kind" value={f.kind} onChange={set('kind')}>{Object.entries(meta.lesson_kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="Section" htmlFor="ls-sec"><SelectInput id="ls-sec" value={f.section_id} onChange={set('section_id')}><option value="">None</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</SelectInput></Field>
        </div>
        <Field label="Title" htmlFor="ls-title"><TextInput id="ls-title" maxLength={160} value={f.title} onChange={set('title')} /></Field>
        {f.kind === 'video' && <Field label="Video address" htmlFor="ls-video" hint="A link starting with https:// (YouTube, Vimeo or any page)."><TextInput id="ls-video" maxLength={500} value={f.video_url} onChange={set('video_url')} /></Field>}
        {(f.kind === 'file' || f.kind === 'recipe' || f.kind === 'text') && (
          <Field label="File" htmlFor="ls-file" hint={files.length === 0 ? 'Add files on the Files tab first.' : f.kind === 'file' ? 'Required.' : 'Optional: a file to go with it.'}>
            <SelectInput id="ls-file" value={f.file_id} onChange={set('file_id')}><option value="">None</option>{files.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectInput>
          </Field>
        )}
        {f.kind === 'live' && (
          <fieldset style={{ border: `1px solid ${colors.border ?? 'rgba(148,163,184,0.3)'}`, borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
            <legend style={{ fontSize: '0.72rem', fontWeight: 800 }}>The live session</legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Starts" htmlFor="lv-s"><TextInput id="lv-s" type="datetime-local" value={lv.starts_at} onChange={setL('starts_at')} /></Field>
              <Field label="Ends" htmlFor="lv-e"><TextInput id="lv-e" type="datetime-local" value={lv.ends_at} onChange={setL('ends_at')} /></Field>
            </div>
            <Field label="Join link" htmlFor="lv-url" hint="Zoom, Google Meet, Teams or any https link. People see it only with access, shortly before it starts."><TextInput id="lv-url" maxLength={500} value={lv.join_url} onChange={setL('join_url')} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Field label="Link is" htmlFor="lv-p"><SelectInput id="lv-p" value={lv.provider} onChange={setL('provider')}><option value="auto">Work it out</option>{Object.entries(meta.providers).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
              <Field label="Meeting id" htmlFor="lv-m"><TextInput id="lv-m" maxLength={60} value={lv.meeting_id} onChange={setL('meeting_id')} /></Field>
              <Field label="Passcode" htmlFor="lv-pc"><TextInput id="lv-pc" maxLength={60} value={lv.passcode} onChange={setL('passcode')} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Field label="Replay link (after it ends)" htmlFor="lv-r"><TextInput id="lv-r" maxLength={500} value={lv.replay_url} onChange={setL('replay_url')} /></Field>
              <Field label="Places" htmlFor="lv-c"><TextInput id="lv-c" inputMode="numeric" value={lv.capacity} onChange={setL('capacity')} /></Field>
            </div>
            <Field label="Time zone" htmlFor="lv-tz"><TextInput id="lv-tz" value={lv.timezone} onChange={setL('timezone')} /></Field>
          </fieldset>
        )}
        <Field label={f.kind === 'recipe' ? 'Ingredients and method' : 'Text'} htmlFor="ls-body"><TextArea id="ls-body" rows={6} maxLength={60000} value={f.body} onChange={set('body')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Minutes" htmlFor="ls-dur"><TextInput id="ls-dur" inputMode="numeric" value={f.duration_minutes} onChange={set('duration_minutes')} /></Field>
          <Field label="Opens after (days)" htmlFor="ls-drip" hint="Days after access begins. Empty: at once."><TextInput id="ls-drip" inputMode="numeric" value={f.drip_days} onChange={set('drip_days')} /></Field>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_preview} onChange={set('is_preview')} /> A free preview</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_required} onChange={set('is_required')} /> Counts towards finishing</label>
      </FormStack>
    </Modal>
  );
}

function LessonRow({ l, i, n, onEdit, onRemove, onMove, onQuiz }) {
  return (
    <li data-lesson={l.title} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid rgba(148,163,184,0.18)', fontSize: '0.88rem' }}>
      <span style={{ flex: 1, minWidth: 180 }}>{l.kind === 'video' ? <Video size={13} aria-hidden="true" /> : l.kind === 'file' ? <FileText size={13} aria-hidden="true" /> : null} <strong>{l.title}</strong> <span style={{ color: colors.textMuted }}>{l.kind_label}</span></span>
      {l.is_preview && <Pill tone="ok">Preview</Pill>}
      {l.drip_days != null && <Pill>after {l.drip_days} d</Pill>}
      {l.live && <Pill tone="neutral">{l.live.provider_label} · {new Date(l.live.starts_at).toLocaleString()}</Pill>}
      {l.live?.join_url && <a href={l.live.join_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem' }}><ExternalLink size={12} aria-hidden="true" /> Open link</a>}
      <button type="button" aria-label="Move up" style={btnGhost} disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp size={13} aria-hidden="true" /></button>
      <button type="button" aria-label="Move down" style={btnGhost} disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown size={13} aria-hidden="true" /></button>
      {l.kind === 'quiz' && <button type="button" style={btnPrimary} onClick={onQuiz}>Questions</button>}
      <button type="button" style={btnGhost} onClick={onEdit}>Edit</button>
      <button type="button" aria-label="Remove lesson" style={{ ...btnGhost, color: colors.danger }} onClick={onRemove}><Trash2 size={13} aria-hidden="true" /></button>
    </li>
  );
}

export default function CourseBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('lessons');
  const [edit, setEdit] = useState(false);
  const [lesson, setLesson] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [sectionTitle, setSectionTitle] = useState('');
  const [access, setAccess] = useState([]);
  const [grant, setGrant] = useState({ user: null, until: '', note: '' });

  const load = useCallback(() => coursesAPI.offering(id).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load'))), [id]);
  useEffect(() => { coursesAPI.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const loadAccess = useCallback(() => coursesAPI.access(id).then((r) => setAccess(r.access)).catch(() => setAccess([])), [id]);
  useEffect(() => { if (tab === 'access' && meta?.can_grant) loadAccess(); }, [tab, meta, loadAccess]);

  if (!hasAnyPermission(user, ['courses.view', 'courses.manage', 'courses.teach'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Courses" /></div></AdminLayout>;
  if (!data || !meta) return <AdminLayout><div style={{ padding: 32 }}>Loading…</div></AdminLayout>;
  const o = data.offering;
  const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };
  const all = [...data.outline.sections.flatMap((s) => s.lessons), ...data.outline.loose];
  const move = (l, dir) => {
    const groups = [...data.outline.sections.map((s) => ({ section_id: s.id, lessons: s.lessons })), { section_id: null, lessons: data.outline.loose }];
    const g = groups.find((x) => x.lessons.some((y) => y.id === l.id));
    const idx = g.lessons.findIndex((y) => y.id === l.id);
    const to = idx + dir;
    if (to < 0 || to >= g.lessons.length) return;
    [g.lessons[idx], g.lessons[to]] = [g.lessons[to], g.lessons[idx]];
    run(() => coursesAPI.reorder(o.id, data.outline.sections.map((s) => s.id), groups.flatMap((x) => x.lessons.map((y) => ({ id: y.id, section_id: x.section_id })))));
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await run(() => coursesAPI.uploadFile(o.id, file), 'File added.');
  };
  const doGrant = async () => {
    try { await coursesAPI.grant(o.id, { user_id: grant.user.id, until: grant.until || undefined, note: grant.note || undefined }); toast.success('Access given.'); setGrant({ user: null, until: '', note: '' }); loadAccess(); } catch (e) { toast.error(errMsg(e, 'Could not give access'), { duration: 8000 }); }
  };

  const tabs = [['lessons', 'Lessons'], ['files', `Files (${data.files.length})`], ['students', 'Students'], ['intakes', 'Intakes and waiting list'], ['classes', 'Classes and attendance'], ['marking', 'Quiz results'], ...(o.certificate ? [['certificates', 'Certificates']] : []), ...(meta.can_manage ? [['fees', 'Fees and payments'], ['books', 'Books']] : []), ...(meta.can_grant ? [['access', 'Access']] : [])];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="course-builder">
        <CoursesNav here={o.title} />
        <HubHeader title={o.title} description={`${o.kind_label}${o.category ? ` · ${o.category}` : ''}${o.instructor ? ` · taught by ${o.instructor}` : ''}`} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <Pill tone={TONE[o.status]}>{o.status_label}</Pill>
          <button type="button" style={btnGhost} onClick={() => setEdit(true)}>Edit details</button>
          {o.status !== 'published' && o.status !== 'archived' && <button type="button" style={btnPrimary} onClick={() => run(() => coursesAPI.setStatus(o.id, 'publish'), 'Published.')}>Publish</button>}
          {o.status === 'published' && <button type="button" style={btnGhost} onClick={() => run(() => coursesAPI.setStatus(o.id, 'unpublish'), 'Back to draft.')}>Unpublish</button>}
          {meta.can_manage && o.status !== 'archived' && <button type="button" style={btnGhost} onClick={() => window.confirm('Archive this? Nobody new can be added; people with access keep it until it ends.') && run(() => coursesAPI.setStatus(o.id, 'archive'), 'Archived.')}>Archive</button>}
          {meta.can_manage && o.status === 'archived' && <button type="button" style={btnGhost} onClick={() => run(() => coursesAPI.setStatus(o.id, 'restore'), 'Restored to draft.')}>Restore</button>}
          {meta.can_manage && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={async () => { if (!window.confirm('Delete this for good?')) return; try { await coursesAPI.removeOffering(o.id); navigate('/admin/courses'); } catch (e) { toast.error(errMsg(e, 'Could not delete'), { duration: 8000 }); } }}>Delete</button>}
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ ...btnGhost, fontWeight: tab === k ? 800 : 600, borderColor: tab === k ? colors.primary : undefined }}>{label}</button>)}
        </div>

        {tab === 'lessons' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btnPrimary} onClick={() => setLesson({})}><Plus size={14} aria-hidden="true" /> Add a lesson</button>
              <TextInput aria-label="New section title" placeholder="New section" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} style={{ maxWidth: 220 }} />
              <button type="button" style={btnGhost} disabled={!sectionTitle.trim()} onClick={() => run(async () => { await coursesAPI.saveSection(o.id, { title: sectionTitle }); setSectionTitle(''); }, 'Section added.')}>Add section</button>
            </div>
            {all.length === 0 && data.outline.sections.length === 0 && <p style={{ color: colors.textMuted }}>No lessons yet.</p>}
            {data.outline.sections.map((s) => (
              <section key={s.id} style={{ ...card, padding: 14 }} data-section={s.title}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{s.title}</strong><button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('Remove this section? Its lessons are kept.') && run(() => coursesAPI.removeSection(o.id, s.id), 'Section removed.')}>Remove section</button></div>
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>{s.lessons.map((l, i) => <LessonRow key={l.id} l={l} i={i} n={s.lessons.length} onEdit={() => setLesson(l)} onRemove={() => window.confirm('Remove this lesson?') && run(() => coursesAPI.removeLesson(o.id, l.id), 'Lesson removed.')} onMove={(d) => move(l, d)} onQuiz={() => setQuiz(l)} />)}</ul>
              </section>
            ))}
            {data.outline.loose.length > 0 && (
              <section style={{ ...card, padding: 14 }}>
                {data.outline.sections.length > 0 && <strong>Not in a section</strong>}
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>{data.outline.loose.map((l, i) => <LessonRow key={l.id} l={l} i={i} n={data.outline.loose.length} onEdit={() => setLesson(l)} onRemove={() => window.confirm('Remove this lesson?') && run(() => coursesAPI.removeLesson(o.id, l.id), 'Lesson removed.')} onMove={(d) => move(l, d)} onQuiz={() => setQuiz(l)} />)}</ul>
              </section>
            )}
          </div>
        )}

        {tab === 'files' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.84rem' }}><Lock size={12} aria-hidden="true" /> Files are private: only people with access can download them, by a link that works for a few minutes. Every download is logged. Allowed: {meta.allowed_files.join(', ')} (up to {meta.settings.max_file_mb} MB).</p>
            <label style={{ ...btnPrimary, display: 'inline-flex', width: 'fit-content', cursor: 'pointer' }}><Plus size={14} aria-hidden="true" /> Add a file<input type="file" onChange={upload} style={{ display: 'none' }} data-testid="course-file-input" /></label>
            {data.files.length === 0 && <p style={{ color: colors.textMuted }}>No files yet.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {data.files.map((x) => (
                <li key={x.id} style={{ ...card, padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FileText size={14} aria-hidden="true" /><span style={{ flex: 1, minWidth: 160 }}><strong>{x.name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{fmtBytes(x.size_bytes)}</span></span>
                  <Pill>{x.downloads} download{x.downloads === 1 ? '' : 's'}</Pill>
                  <button type="button" aria-label={`Remove ${x.name}`} style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('Remove this file?') && run(() => coursesAPI.removeFile(o.id, x.id), 'File removed.')}><Trash2 size={13} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'students' && <StudentsPanel offering={o} />}
        {tab === 'intakes' && <IntakesPanel offering={o} />}
        {tab === 'classes' && <AttendancePanel offering={o} meta={meta} />}

        {tab === 'marking' && <MarkingPanel offering={o} />}
        {tab === 'certificates' && o.certificate && <CertificatesPanel offering={o} />}

        {tab === 'books' && meta.can_manage && <BooksPanel offering={o} />}

        {tab === 'fees' && meta.can_manage && <FeesPanel offering={o} onChanged={load} />}

        {tab === 'access' && meta.can_grant && (
          <div style={{ display: 'grid', gap: 12 }}>
            <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
              <strong>Give someone access</strong>
              <Field label="Person" htmlFor="ac-user" hint={grant.user ? `Chosen: ${grant.user.name}` : 'Search by name or email.'}><UserPicker id="ac-user" onPick={(u) => setGrant((g) => ({ ...g, user: u }))} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <Field label="Until" htmlFor="ac-until" hint="Empty: the offering's own access time."><TextInput id="ac-until" type="date" value={grant.until} onChange={(e) => setGrant({ ...grant, until: e.target.value })} /></Field>
                <Field label="Why" htmlFor="ac-note"><TextInput id="ac-note" maxLength={300} value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} placeholder="Staff, trial, paid at the desk…" /></Field>
              </div>
              <div><button type="button" style={btnPrimary} disabled={!grant.user} onClick={doGrant}>Give access</button></div>
            </section>
            {access.length === 0 && <p style={{ color: colors.textMuted }}>Nobody has access yet.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {access.map((a) => (
                <li key={a.id} data-access={a.name} style={{ ...card, padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 180 }}><strong>{a.name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{a.email}</span></span>
                  <Pill>{a.source_label}</Pill>
                  <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{a.ends_at ? `until ${a.ends_at.slice(0, 10)}` : 'no end'}</span>
                  {a.active ? <Pill tone="ok">Has access</Pill> : <Pill tone="danger">{a.revoked_at ? 'Ended' : 'Expired'}</Pill>}
                  {a.active && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('End this access now?') && coursesAPI.revoke(o.id, a.id).then((r) => { setAccess(r.access); toast.success('Access ended.'); }).catch((e) => toast.error(errMsg(e, 'Could not end it')))}>End</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {edit && <OfferingForm meta={meta} offering={o} onClose={() => setEdit(false)} onDone={() => { setEdit(false); load(); }} />}
      {quiz && <QuizEditor offering={o} lesson={quiz} onClose={() => setQuiz(null)} />}
      {lesson && <LessonForm offering={o} lesson={lesson.id ? lesson : null} sections={data.sections} files={data.files} meta={meta} onClose={() => setLesson(null)} onDone={() => { setLesson(null); load(); }} />}
    </AdminLayout>
  );
}
