import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import membershipsAPI from '../../../_shared/api/memberships';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission, hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MembershipsNav from '../../components/MembershipsNav';
import Pill from '../../../courses/components/Pill';

const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TONE = { draft: 'neutral', published: 'ok', archived: 'warn' };
const check = { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' };

/** What the plan gives from Courses: every course, some kinds, some categories, or a chosen list, and whether tuition is free. */
function CoursesBenefit({ meta, value, onChange }) {
  const [offerings, setOfferings] = useState([]);
  useEffect(() => { if (value.mode === 'selected') coursesAPI.offerings({ status: 'published' }).then((r) => setOfferings(r.offerings ?? [])).catch(() => setOfferings([])); }, [value.mode]);
  const set = (k, v) => onChange({ ...value, [k]: v });
  const toggle = (k, id) => set(k, value[k].includes(id) ? value[k].filter((x) => x !== id) : [...value[k], id]);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <SelectInput aria-label="Which courses" value={value.mode} onChange={(e) => set('mode', e.target.value)}>{Object.entries(meta.course_modes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
      {value.mode === 'kind' && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{Object.entries(meta.offering_kinds).map(([k, v]) => <label key={k} style={check}><input type="checkbox" checked={value.kinds.includes(k)} onChange={() => toggle('kinds', k)} /> {v}</label>)}</div>}
      {value.mode === 'category' && <TextInput aria-label="Categories" placeholder="Categories, separated by commas" value={value.categories.join(', ')} onChange={(e) => set('categories', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />}
      {value.mode === 'selected' && (
        <div style={{ display: 'grid', gap: 3, maxHeight: 160, overflow: 'auto' }}>
          {offerings.length === 0 && <span style={{ color: colors.textMuted, fontSize: '0.82rem' }}>No published offerings yet.</span>}
          {offerings.map((o) => <label key={o.id} style={check}><input type="checkbox" checked={value.offering_ids.includes(o.id)} onChange={() => toggle('offering_ids', o.id)} /> {o.title}</label>)}
        </div>
      )}
      <label style={check}><input type="checkbox" checked={value.waive_tuition} onChange={(e) => set('waive_tuition', e.target.checked)} /> Tuition is free for members (registration, exam and kit fees are still charged)</label>
    </div>
  );
}

const BLANK = { courses: { mode: 'all', kinds: [], categories: [], offering_ids: [], waive_tuition: false }, meals: { discount_pct: 0 }, credits: { amount: 4, rollover: false } };

function PlanForm({ meta, plan, onClose, onDone }) {
  const [f, setF] = useState({ name: plan?.name ?? '', summary: plan?.summary ?? '', description: plan?.description ?? '', period_count: plan?.period_count ?? 1, period_unit: plan?.period_unit ?? 'month', price: plan?.price ?? '', joining_fee: plan?.joining_fee ?? '',
    ledger_id: plan?.ledger_id ?? '', joining_ledger_id: plan?.joining_ledger_id ?? '', trial_days: plan?.trial_days ?? 0, grace_days: plan?.grace_days ?? 7, auto_renew: plan?.auto_renew ?? true, capacity: plan?.capacity ?? '', all_branches: plan?.all_branches ?? true, branch_ids: plan?.branch_ids ?? [] });
  const [ben, setBen] = useState(() => Object.fromEntries((plan?.benefits ?? []).map((b) => [b.type, { ...(BLANK[b.type] ?? {}), ...b.config }])));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      const payload = { name: f.name, summary: f.summary, description: f.description, period_count: Number(f.period_count), period_unit: f.period_unit, price: Number(f.price || 0), joining_fee: Number(f.joining_fee || 0), ledger_id: num(f.ledger_id), joining_ledger_id: num(f.joining_ledger_id),
        trial_days: Number(f.trial_days || 0), grace_days: Number(f.grace_days || 0), auto_renew: f.auto_renew, capacity: num(f.capacity), all_branches: f.all_branches, branch_ids: f.all_branches ? [] : f.branch_ids,
        benefits: Object.entries(ben).map(([type, config]) => ({ type, config })) };
      const r = plan ? await membershipsAPI.savePlan(plan.id, payload) : await membershipsAPI.createPlan(payload);
      toast.success(r.message); onDone(r.plan);
    } catch (e) { toast.error(errMsg(e, 'Could not save the plan'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'Add a membership plan'} onClose={onClose} width={680} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save plan" busy={busy} disabled={!f.name.trim()} />}>
      <FormStack>
        <Field label="Name" htmlFor="mp-name"><TextInput id="mp-name" maxLength={120} value={f.name} onChange={set('name')} /></Field>
        <Field label="One line about it" htmlFor="mp-sum"><TextInput id="mp-sum" maxLength={300} value={f.summary} onChange={set('summary')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="Every" htmlFor="mp-cnt"><TextInput id="mp-cnt" inputMode="numeric" value={f.period_count} onChange={set('period_count')} /></Field>
          <Field label="Unit" htmlFor="mp-unit"><SelectInput id="mp-unit" value={f.period_unit} onChange={set('period_unit')}>{Object.keys(meta.units).map((u) => <option key={u} value={u}>{u}(s)</option>)}</SelectInput></Field>
          <Field label="Price per period (before tax)" htmlFor="mp-price"><TextInput id="mp-price" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
          <Field label="Joining fee (once)" htmlFor="mp-fee"><TextInput id="mp-fee" inputMode="decimal" value={f.joining_fee} onChange={set('joining_fee')} /></Field>
          <Field label="Free trial (days)" htmlFor="mp-trial"><TextInput id="mp-trial" inputMode="numeric" value={f.trial_days} onChange={set('trial_days')} /></Field>
          <Field label="Grace after a late payment (days)" htmlFor="mp-grace"><TextInput id="mp-grace" inputMode="numeric" value={f.grace_days} onChange={set('grace_days')} /></Field>
        </div>
        <SalesAccountSelect kind="sales" scope="service" label="Booked under (it decides the tax)" value={f.ledger_id} onChange={(v) => setF((x) => ({ ...x, ledger_id: v }))} />
        {Number(f.joining_fee) > 0 && <SalesAccountSelect kind="sales" scope="service" label="Joining fee booked under (empty: the same)" value={f.joining_ledger_id} onChange={(v) => setF((x) => ({ ...x, joining_ledger_id: v }))} />}
        <Field label="Most members" htmlFor="mp-cap" hint="Empty: no limit."><TextInput id="mp-cap" inputMode="numeric" value={f.capacity} onChange={set('capacity')} /></Field>
        <label style={check}><input type="checkbox" checked={f.auto_renew} onChange={set('auto_renew')} /> Renews by itself (each period is invoiced; the member pays it)</label>
        <label style={check}><input type="checkbox" checked={f.all_branches} onChange={set('all_branches')} /> Valid at every branch</label>
        {!f.all_branches && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{meta.locations.map((l) => <label key={l.id} style={check}><input type="checkbox" checked={f.branch_ids.includes(l.id)} onChange={() => setF((x) => ({ ...x, branch_ids: x.branch_ids.includes(l.id) ? x.branch_ids.filter((i) => i !== l.id) : [...x.branch_ids, l.id] }))} /> {l.name}</label>)}</div>}
        <Field label="Description" htmlFor="mp-desc"><TextArea id="mp-desc" rows={4} maxLength={20000} value={f.description} onChange={set('description')} /></Field>
        <fieldset style={{ border: '1px solid rgba(148,163,184,0.3)', borderRadius: 10, padding: 12, display: 'grid', gap: 10, margin: 0 }}>
          <legend style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0 6px' }}>What the plan gives</legend>
          {Object.keys(meta.benefit_types).length === 0 && <span style={{ color: colors.textMuted, fontSize: '0.84rem' }}>No other module is switched on to give anything yet.</span>}
          {Object.entries(meta.benefit_types).map(([type, label]) => (
            <div key={type} data-benefit={type} style={{ display: 'grid', gap: 6 }}>
              <label style={{ ...check, fontWeight: 700 }}><input type="checkbox" checked={type in ben} onChange={(e) => setBen((b) => { const n = { ...b }; if (e.target.checked) n[type] = { ...BLANK[type] }; else delete n[type]; return n; })} /> {label}</label>
              {type === 'courses' && type in ben && <CoursesBenefit meta={meta} value={ben.courses} onChange={(v) => setBen((b) => ({ ...b, courses: v }))} />}
              {type === 'credits' && type in ben && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <Field label="Credits each paid period" htmlFor="mp-cred"><TextInput id="mp-cred" inputMode="numeric" value={ben.credits.amount} onChange={(e) => setBen((b) => ({ ...b, credits: { ...b.credits, amount: e.target.value } }))} /></Field>
                  <label style={check}><input type="checkbox" checked={ben.credits.rollover} onChange={(e) => setBen((b) => ({ ...b, credits: { ...b.credits, rollover: e.target.checked } }))} /> Unused credits roll over (otherwise they expire when the period ends)</label>
                </div>
              )}
              {type === 'meals' && type in ben && <Field label="Discount on meal plans (%)" htmlFor="mp-meal"><TextInput id="mp-meal" inputMode="decimal" value={ben.meals.discount_pct} onChange={(e) => setBen((b) => ({ ...b, meals: { discount_pct: e.target.value } }))} /></Field>}
            </div>
          ))}
        </fieldset>
      </FormStack>
    </Modal>
  );
}

/** Memberships → plans: what each costs, how often, what it gives. */
export default function MembershipPlans() {
  const user = useAuthStore((s) => s.user);
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);   // null | 'new' | plan
  const canManage = hasPermission(user, 'memberships.manage');
  const load = useCallback(() => membershipsAPI.plans().then(setData).catch((e) => { toast.error(errMsg(e, 'Could not load')); setData({ ready: true, plans: [] }); }), []);
  useEffect(() => { membershipsAPI.meta().then(setMeta).catch(() => {}); load(); }, [load]);
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };

  if (!hasAnyPermission(user, ['memberships.view', 'memberships.manage'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Memberships" /></div></AdminLayout>;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="membership-plans">
        <MembershipsNav />
        <HubHeader title="Membership plans" description="What members pay each period and what they get. Each period is invoiced through the books." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 162_memberships.sql to switch Memberships on.</p>}
        {data?.ready && (
          <>
            {canManage && meta && <div style={{ marginBottom: 14 }}><button type="button" style={btnPrimary} onClick={() => setForm('new')}><Plus size={14} aria-hidden="true" /> Add a plan</button></div>}
            {data.plans.length === 0 && <section style={{ ...card, padding: 16 }}>No plans yet.</section>}
            <div style={{ display: 'grid', gap: 10 }}>
              {data.plans.map((p) => (
                <section key={p.id} data-plan={p.name} style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ flex: 1, minWidth: 180, fontSize: '1.05rem' }}>{p.name}</strong>
                    <Pill tone={TONE[p.status]}>{p.status_label}</Pill>
                    <span style={{ fontWeight: 800 }}>{money(p.price)} <span style={{ fontWeight: 500, color: colors.textMuted, fontSize: '0.8rem' }}>{p.period_label}, before tax</span></span>
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: '0.82rem' }}>
                    {p.joining_fee > 0 ? `Joining fee ${money(p.joining_fee)} · ` : ''}{p.trial_days ? `${p.trial_days}-day trial · ` : ''}{p.members} member{p.members === 1 ? '' : 's'}{p.capacity ? ` of ${p.capacity}` : ''}{p.all_branches ? '' : ' · some branches'}
                  </div>
                  {p.benefits.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.86rem' }}>{p.benefits.map((b) => <li key={b.id} style={{ opacity: b.available ? 1 : 0.5 }}>{b.description}{b.available ? '' : ' (module is off)'}</li>)}</ul>}
                  {canManage && meta && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" style={btnGhost} onClick={() => setForm(p)}>Edit</button>
                      {p.status !== 'published' && p.status !== 'archived' && <button type="button" style={btnPrimary} onClick={() => act(() => membershipsAPI.setStatus(p.id, 'publish'), 'Published.')}>Publish</button>}
                      {p.status === 'published' && <button type="button" style={btnGhost} onClick={() => act(() => membershipsAPI.setStatus(p.id, 'unpublish'), 'Back to draft.')}>Unpublish</button>}
                      {p.status !== 'archived' && <button type="button" style={btnGhost} onClick={() => act(() => membershipsAPI.setStatus(p.id, 'archive'), 'Archived.')}>Archive</button>}
                      {p.status === 'archived' && <button type="button" style={btnGhost} onClick={() => act(() => membershipsAPI.setStatus(p.id, 'restore'), 'Restored to draft.')}>Restore</button>}
                      <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm(`Remove ${p.name}?`) && act(() => membershipsAPI.removePlan(p.id), 'Removed.')}>Remove</button>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
      {form && meta && <PlanForm meta={meta} plan={form === 'new' ? null : form} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
    </AdminLayout>
  );
}
