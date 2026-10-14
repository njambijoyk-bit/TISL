import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import membershipsAPI from '../../../_shared/api/memberships';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission, hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MembershipsNav from '../../components/MembershipsNav';
import PersonPicker from '../../components/PersonPicker';
import Pill from '../../../courses/components/Pill';

const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const TONE = { pending: 'warn', trial: 'ok', active: 'ok', past_due: 'danger', paused: 'neutral', lapsed: 'danger', cancelled: 'neutral', ended: 'neutral' };

/** Sign someone up, or give a membership without billing. */
function JoinForm({ plans, give, onClose, onDone }) {
  const [plan, setPlan] = useState(plans[0]?.id ?? '');
  const [member, setMember] = useState(null);
  const [payer, setPayer] = useState(null);
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (give || !plan || !member) { setQuote(null); return; }
    membershipsAPI.quote({ plan_id: Number(plan), member_user_id: member.id, payer_user_id: payer?.id }).then(setQuote).catch(() => setQuote(null));
  }, [plan, member, payer, give]);
  const save = async () => {
    setBusy(true);
    try {
      const r = give ? await membershipsAPI.give({ plan_id: Number(plan), member_user_id: member.id, until: until || undefined, reason }) : await membershipsAPI.join({ plan_id: Number(plan), member_user_id: member.id, payer_user_id: payer?.id });
      toast.success(r.message); onDone(r.membership);
    } catch (e) { toast.error(errMsg(e, 'Could not do that'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={give ? 'Give a membership without billing' : 'Sign someone up'} onClose={onClose} width={560} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel={give ? 'Give membership' : 'Sign up'} busy={busy} disabled={!member || !plan || (give && !reason.trim())} />}>
      <FormStack>
        <Field label="Plan" htmlFor="mj-plan"><SelectInput id="mj-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} {p.period_label}</option>)}</SelectInput></Field>
        <Field label="Member" htmlFor="mj-member" hint={member ? `Chosen: ${member.name}` : 'Search for the person.'}><PersonPicker id="mj-member" onPick={setMember} /></Field>
        {!give && <Field label="Someone else pays (optional)" htmlFor="mj-payer" hint={payer ? `Chosen: ${payer.name}` : 'Leave empty if the member pays.'}><PersonPicker id="mj-payer" onPick={setPayer} /></Field>}
        {give && <Field label="Until" htmlFor="mj-until" hint="Empty: one period."><TextInput id="mj-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>}
        {give && <Field label="Why" htmlFor="mj-why"><TextInput id="mj-why" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        {quote && (
          <div style={{ fontSize: '0.86rem', display: 'grid', gap: 2 }} data-testid="join-quote">
            {quote.free ? <span>Nothing to pay now{quote.trial_days ? `: ${quote.trial_days}-day trial first` : ''}.</span> : <>
              {quote.lines.map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l.description}</span><span>{money(l.amount)}</span></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Total with tax</span><span>{money(quote.total)}</span></div></>}
          </div>
        )}
      </FormStack>
    </Modal>
  );
}

function PayForm({ period, methods, onClose, onDone }) {
  const [amount, setAmount] = useState(String(period.owing ?? period.amount - period.paid_amount));
  const [method, setMethod] = useState(methods[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await membershipsAPI.takePayment(period.id, [{ payment_method_id: Number(method), amount: Number(amount), reference: ref || undefined }]); toast.success(r.message); onDone(r.membership); } catch (e) { toast.error(errMsg(e, 'Could not record the payment'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Take a payment: ${period.label}`} onClose={onClose} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Record payment" busy={busy} disabled={!method || !(Number(amount) > 0)} />}>
      <FormStack>
        <Field label="Amount" htmlFor="mp-amt"><TextInput id="mp-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid by" htmlFor="mp-m"><SelectInput id="mp-m" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
        <Field label="Reference" htmlFor="mp-r" hint="The M-Pesa code, cheque number…"><TextInput id="mp-r" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </FormStack>
    </Modal>
  );
}

function Detail({ id, meta, plans, can, onClose, onChanged }) {
  const [m, setM] = useState(null);
  const [pay, setPay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState('');
  useEffect(() => { membershipsAPI.member(id).then((r) => setM(r.membership)).catch((e) => { toast.error(errMsg(e, 'Could not load')); onClose(); }); }, [id, onClose]);
  const run = async (fn) => { setBusy(true); try { const r = await fn(); toast.success(r.message); setM(r.membership); onChanged(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); } };
  if (!m) return null;
  const live = ['pending', 'trial', 'active', 'past_due', 'paused', 'lapsed'].includes(m.status);

  return (
    <Modal title={`${m.member} · ${m.number}`} subtitle={`${m.plan} (${m.period_label})`} onClose={onClose} width={720}>
      <div style={{ display: 'grid', gap: 12 }} data-testid="member-detail">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill tone={TONE[m.status]}>{m.status_label}</Pill>
          {m.payer && <span style={{ fontSize: '0.84rem' }}>Paid by {m.payer}</span>}
          {m.billing === 'none' && <Pill>Given, not billed</Pill>}
          {m.last_day && <span style={{ fontSize: '0.84rem' }}>Paid up to <strong>{day(m.last_day)}</strong></span>}
          {m.cancel_at_end && <Pill tone="warn">Ends when the paid time runs out</Pill>}
          {m.change_to && <Pill tone="neutral">Moves to {m.change_to} at renewal</Pill>}
          {m.status === 'paused' && <Pill>Paused until {day(m.paused_until)}</Pill>}
        </div>
        <section style={{ display: 'grid', gap: 4 }}>
          <strong>Invoices</strong>
          {m.periods.length === 0 && <span style={{ color: colors.textMuted }}>None.</span>}
          {m.periods.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 5, fontSize: '0.86rem' }}>
              <span style={{ flex: 1, minWidth: 200 }}>{p.label}{p.due_date ? <span style={{ color: colors.textMuted }}> · due {day(p.due_date)}</span> : null}</span>
              <span>{money(p.paid_amount)} of {money(p.amount)}</span>
              <Pill tone={p.status === 'paid' ? 'ok' : p.status === 'open' ? 'warn' : 'neutral'}>{p.status}</Pill>
              {p.status === 'open' && can.enrol && <button type="button" style={btnPrimary} onClick={() => setPay({ ...p, owing: p.amount - p.paid_amount })}>Take payment</button>}
              {p.can_refund && can.refund && <button type="button" style={btnGhost} disabled={busy} onClick={() => { const reason = window.prompt('Why is this refunded? The membership ends today.'); if (reason) run(() => membershipsAPI.refund(p.id, { reason })); }}>Refund</button>}
            </div>
          ))}
        </section>
        {can.enrol && live && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {m.can_pause && <button type="button" style={btnGhost} disabled={busy} onClick={() => { const d = window.prompt('Pause for how many days?', '14'); if (d) run(() => membershipsAPI.pause(m.id, Number(d))); }}>Pause</button>}
            {m.status === 'paused' && <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => membershipsAPI.resume(m.id))}>Resume now</button>}
            {m.cancel_at_end ? <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => membershipsAPI.keep(m.id))}>Keep it going</button>
              : <button type="button" style={btnGhost} disabled={busy} onClick={() => { const reason = window.prompt('End at the end of the paid time. Why? (optional)', ''); if (reason !== null) run(() => membershipsAPI.cancel(m.id, { reason })); }}>End at the end of the paid time</button>}
            {can.grant && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={busy} onClick={() => { if (window.confirm('End this membership today? Benefits stop at once.')) run(() => membershipsAPI.cancel(m.id, { immediate: true, reason: window.prompt('Why?', '') || undefined })); }}>End today</button>}
            {['trial', 'active'].includes(m.status) && m.billing === 'invoice' && !m.cancel_at_end && (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <SelectInput aria-label="Change plan" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="">Change plan…</option>{plans.filter((p) => p.id !== m.plan_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput>
                <button type="button" style={btnGhost} disabled={busy || !plan} onClick={() => run(() => membershipsAPI.changePlan(m.id, Number(plan)))}>Change</button>
              </span>
            )}
          </div>
        )}
        {m.credits && (m.credits.balance > 0 || m.credits.held > 0 || m.credits.ledger.length > 0) && (
          <section style={{ display: 'grid', gap: 4 }} data-testid="member-credits">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Credits: {m.credits.balance}</strong>{m.credits.held > 0 && <Pill tone="warn">{m.credits.held} on hold until the membership is in good standing</Pill>}
              {can.grant && <button type="button" style={btnGhost} disabled={busy} onClick={() => { const n = window.prompt('Add (a number) or take away (a negative number) how many credits?', '1'); if (!n) return; const why = window.prompt('Why?', ''); if (why) run(() => membershipsAPI.adjustCredits(m.id, Number(n), why)); }}>Change credits</button>}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem' }}>{m.credits.ledger.slice(0, 8).map((e) => <li key={e.id}>{new Date(e.at).toLocaleDateString()} · {e.kind} · {e.delta > 0 ? `+${e.delta}` : e.delta}{e.note ? ` · ${e.note}` : ''}</li>)}</ul>
          </section>
        )}
        {m.checkins && m.checkins.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Check-ins</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.82rem' }}>{m.checkins.map((c) => <li key={c.id}>{new Date(c.at).toLocaleString()}{c.branch ? ` · ${c.branch}` : ''} · {c.result === 'ok' ? 'in' : `turned away: ${c.reason}`}</li>)}</ul>
          </details>
        )}
        {m.events && m.events.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>History</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.82rem' }}>{m.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString()} · {e.type.replace(/_/g, ' ')}{e.note ? ` · ${e.note}` : ''}</li>)}</ul>
          </details>
        )}
      </div>
      {pay && <PayForm period={pay} methods={meta.payment_methods ?? []} onClose={() => setPay(null)} onDone={(mm) => { setPay(null); setM(mm); onChanged(); }} />}
    </Modal>
  );
}

/** Memberships → members: who holds which plan, what is owed, and what to do about it. */
export default function MembershipMembers() {
  const user = useAuthStore((s) => s.user);
  const [meta, setMeta] = useState(null);
  const [plans, setPlans] = useState([]);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState({ q: '', status: '', plan_id: '' });
  const [form, setForm] = useState(null);   // null | 'join' | 'give'
  const [open, setOpen] = useState(null);
  const can = { enrol: hasPermission(user, 'memberships.enrol') || hasPermission(user, 'memberships.manage'), refund: hasPermission(user, 'memberships.refund'), grant: hasPermission(user, 'memberships.grant') };
  const load = useCallback(() => membershipsAPI.members({ q: filter.q || undefined, status: filter.status || undefined, plan_id: filter.plan_id || undefined }).then(setData).catch((e) => { toast.error(errMsg(e, 'Could not load')); setData({ ready: true, memberships: [], total: 0 }); }), [filter]);
  useEffect(() => { membershipsAPI.meta().then(setMeta).catch(() => {}); membershipsAPI.plans().then((r) => setPlans(r.plans.filter((p) => p.status === 'published'))).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const close = useCallback(() => setOpen(null), []);

  if (!hasAnyPermission(user, ['memberships.view', 'memberships.manage'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Memberships" /></div></AdminLayout>;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="membership-members">
        <MembershipsNav />
        <HubHeader title="Members" description="Who holds a plan, what is owed, and what to do about it." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 163_memberships_members.sql to switch members on.</p>}
        {data?.ready && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              {can.enrol && plans.length > 0 && <button type="button" style={btnPrimary} onClick={() => setForm('join')}><Plus size={14} aria-hidden="true" /> Sign someone up</button>}
              {can.grant && plans.length > 0 && <button type="button" style={btnGhost} onClick={() => setForm('give')}>Give a membership</button>}
              <TextInput aria-label="Search" placeholder="Name, email or number" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ maxWidth: 220 }} />
              <SelectInput aria-label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={{ maxWidth: 170 }}><option value="">Any status</option>{['pending', 'trial', 'active', 'past_due', 'paused', 'lapsed', 'cancelled', 'ended'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</SelectInput>
              <SelectInput aria-label="Plan" value={filter.plan_id} onChange={(e) => setFilter({ ...filter, plan_id: e.target.value })} style={{ maxWidth: 190 }}><option value="">Any plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput>
            </div>
            {data.memberships.length === 0 && <section style={{ ...card, padding: 16 }}>No members match.</section>}
            <div style={{ display: 'grid', gap: 8 }}>
              {data.memberships.map((m) => (
                <button key={m.id} type="button" onClick={() => setOpen(m.id)} data-member={m.member} style={{ ...card, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                  <span style={{ flex: 1, minWidth: 200 }}><strong>{m.member}</strong> <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{m.number} · {m.plan}</span></span>
                  <Pill tone={TONE[m.status]}>{m.status_label}</Pill>
                  {m.last_day && <span style={{ fontSize: '0.8rem' }}>to {day(m.last_day)}</span>}
                  {m.open && <Pill tone="warn">Owes {money(m.open.owing)}</Pill>}
                </button>
              ))}
            </div>
            {data.total > data.memberships.length && <p style={{ color: colors.textMuted }}>Showing the newest {data.memberships.length} of {data.total}: narrow the search.</p>}
          </>
        )}
      </div>
      {form && <JoinForm plans={plans} give={form === 'give'} onClose={() => setForm(null)} onDone={(m) => { setForm(null); load(); setOpen(m.id); }} />}
      {open && meta && <Detail id={open} meta={meta} plans={plans} can={can} onClose={close} onChanged={load} />}
    </AdminLayout>
  );
}
