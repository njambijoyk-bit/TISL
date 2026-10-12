import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission, hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import CoursesNav from '../../components/CoursesNav';
import Pill from '../../components/Pill';
import UserPicker from '../../components/UserPicker';

const TONE = { published: 'ok', draft: 'warn', archived: 'neutral' };

export function OfferingForm({ meta, offering, onClose, onDone }) {
  const [f, setF] = useState({ kind: offering?.kind ?? 'course', title: offering?.title ?? '', summary: offering?.summary ?? '', category: offering?.category ?? '', skill_level: offering?.skill_level ?? 'all',
    delivery: offering?.delivery ?? 'online', location_id: offering?.location_id ?? '', tags: (offering?.tags ?? []).join(', '), instructor_user_id: offering?.instructor_user_id ?? null, instructor: offering?.instructor ?? '',
    free_preview: offering?.free_preview ?? false, access_days: offering?.access_days ?? '', cover: offering?.cover ?? '', body: offering?.body ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const payload = { kind: f.kind, title: f.title, summary: f.summary, category: f.category, skill_level: f.skill_level, delivery: f.delivery, location_id: f.delivery === 'online' ? null : (f.location_id ? Number(f.location_id) : null),
        tags: f.tags, instructor_user_id: f.instructor_user_id, free_preview: f.free_preview, access_days: f.access_days === '' ? null : Number(f.access_days), cover: f.cover, body: f.body };
      const r = offering ? await coursesAPI.saveOffering(offering.id, payload) : await coursesAPI.createOffering(payload);
      toast.success('Saved.'); onDone(r.offering);
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={offering ? `Edit ${offering.title}` : 'Add an offering'} onClose={onClose} width={640} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save" busy={busy} disabled={!f.title.trim()} />}>
      <FormStack>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="What is it" htmlFor="of-kind"><SelectInput id="of-kind" value={f.kind} onChange={set('kind')} disabled={Boolean(offering?.lessons)}>{Object.entries(meta.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="Level" htmlFor="of-level"><SelectInput id="of-level" value={f.skill_level} onChange={set('skill_level')}>{Object.entries(meta.levels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
        </div>
        <Field label="Title" htmlFor="of-title"><TextInput id="of-title" maxLength={160} value={f.title} onChange={set('title')} /></Field>
        <Field label="A line about it" htmlFor="of-sum"><TextInput id="of-sum" maxLength={400} value={f.summary} onChange={set('summary')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Category" htmlFor="of-cat"><TextInput id="of-cat" maxLength={80} value={f.category} onChange={set('category')} placeholder="Baking" /></Field>
          <Field label="Tags" htmlFor="of-tags" hint="Separate with commas."><TextInput id="of-tags" value={f.tags} onChange={set('tags')} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Taught" htmlFor="of-del"><SelectInput id="of-del" value={f.delivery} onChange={set('delivery')}>{Object.entries(meta.delivery).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          {f.delivery !== 'online' && <Field label="Branch" htmlFor="of-loc"><SelectInput id="of-loc" value={f.location_id} onChange={set('location_id')}><option value="">Choose</option>{meta.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
        </div>
        {meta.can_manage && (
          <Field label="Teacher" htmlFor="of-teacher" hint={f.instructor_user_id ? `Chosen: ${f.instructor || 'someone'}` : 'Search for a member of staff.'}>
            <UserPicker id="of-teacher" onPick={(u) => setF((x) => ({ ...x, instructor_user_id: u.id, instructor: u.name }))} />
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Access lasts (days)" htmlFor="of-days" hint="Empty: for ever."><TextInput id="of-days" inputMode="numeric" value={f.access_days} onChange={set('access_days')} /></Field>
          <Field label="Cover picture address" htmlFor="of-cover"><TextInput id="of-cover" maxLength={255} value={f.cover} onChange={set('cover')} /></Field>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.free_preview} onChange={set('free_preview')} /> Anyone may open the lessons marked as previews</label>
        <Field label={f.kind === 'recipe' ? 'The recipe (ingredients and method)' : 'About it'} htmlFor="of-body"><TextArea id="of-body" rows={6} maxLength={60000} value={f.body} onChange={set('body')} /></Field>
      </FormStack>
    </Modal>
  );
}

export default function CoursesOfferings() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(false);
  const [filter, setFilter] = useState({ q: '', kind: '', status: '' });

  const load = useCallback(() => coursesAPI.offerings(filter).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load'))), [filter]);
  useEffect(() => { coursesAPI.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  if (!hasAnyPermission(user, ['courses.view', 'courses.manage', 'courses.teach'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Courses" /></div></AdminLayout>;
  const canAdd = hasPermission(user, 'courses.manage');

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="courses-offerings">
        <CoursesNav />
        <HubHeader title="Courses, recipes and notes" description="What you teach and sell: courses, recipes, notes and files, and live classes with a Zoom link. Fees and invoices come through the books." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 152_courses.sql to switch Courses on.</p>}
        {data?.ready && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              {canAdd && meta && <button type="button" style={btnPrimary} onClick={() => setForm(true)}><Plus size={14} aria-hidden="true" /> Add an offering</button>}
              <TextInput aria-label="Search" placeholder="Search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ maxWidth: 220 }} />
              {meta && <SelectInput aria-label="Kind" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })} style={{ maxWidth: 180 }}><option value="">All kinds</option>{Object.entries(meta.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>}
              {meta && <SelectInput aria-label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={{ maxWidth: 160 }}><option value="">Any status</option>{Object.entries(meta.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>}
            </div>
            {data.offerings.length === 0 && <p style={{ color: colors.textMuted }}>Nothing here yet.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              {data.offerings.map((o) => (
                <Link key={o.id} to={`/admin/courses/${o.id}`} data-offering={o.title} style={{ ...card, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <strong>{o.title}</strong>
                    <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{o.kind_label}{o.category ? ` · ${o.category}` : ''}{o.instructor ? ` · ${o.instructor}` : ''}</div>
                  </div>
                  <Pill tone={TONE[o.status]}>{o.status_label}</Pill>
                  <Pill>{o.lessons} lesson{o.lessons === 1 ? '' : 's'}</Pill>
                  <Pill>{o.people} {o.people === 1 ? 'person' : 'people'}</Pill>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      {form && meta && <OfferingForm meta={meta} onClose={() => setForm(false)} onDone={(o) => { setForm(false); navigate(`/admin/courses/${o.id}`); }} />}
    </AdminLayout>
  );
}
