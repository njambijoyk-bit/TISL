import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import membershipsAPI from '../../../_shared/api/memberships';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import MembershipsNav from '../../components/MembershipsNav';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, borderBottom: '1px solid rgba(148,163,184,0.3)' };
const td = { padding: '6px 8px', fontSize: '0.86rem', borderBottom: '1px solid rgba(148,163,184,0.15)' };
const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** A headline figure: the number in text ink, what it is underneath. */
function Tile({ label, value, note }) {
  return (
    <div style={{ ...card, padding: 14, display: 'grid', gap: 2 }}>
      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: colors.textMuted }}>{label}</span>
      <span style={{ fontSize: '1.6rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {note && <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{note}</span>}
    </div>
  );
}

function Table({ title, cols, rows, empty = 'Nothing to show.' }) {
  return (
    <section style={{ ...card, padding: 14, overflowX: 'auto' }}>
      <strong>{title}</strong>
      {rows.length === 0 ? <p style={{ margin: '6px 0 0', color: colors.textMuted }}>{empty}</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead><tr>{cols.map((c) => <th key={c.key} style={{ ...th, textAlign: c.right ? 'right' : 'left' }}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.id ?? i}>{cols.map((c) => <td key={c.key} style={c.right ? num : td}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

/** Memberships in numbers: members now, the money that recurs, who joined and left, what is owed, who ends soon, check-ins and credits. */
export default function MembershipReports() {
  const user = useAuthStore((s) => s.user);
  const [f, setF] = useState({ from: '', to: '', plan_id: '' });
  const [d, setD] = useState(null);
  const load = useCallback(() => membershipsAPI.report({ from: f.from || undefined, to: f.to || undefined, plan_id: f.plan_id || undefined }).then(setD).catch((e) => toast.error(errMsg(e, 'Could not load the report'), { duration: 8000 })), [f]);
  useEffect(() => { load(); }, [load]);
  const csv = async () => {
    try {
      const blob = await membershipsAPI.membersCsv({ plan_id: f.plan_id || undefined });
      const url = URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = 'members.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { toast.error(errMsg(e, 'Could not download')); }
  };

  if (!hasAnyPermission(user, ['memberships.view', 'memberships.manage'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Membership reports" /></div></AdminLayout>;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 14 }} data-testid="membership-reports">
        <MembershipsNav />
        <HubHeader title="Membership reports" description="Plan prices are before tax; invoiced and collected amounts are invoice totals, tax included." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextInput aria-label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} style={{ maxWidth: 170 }} />
          <TextInput aria-label="To" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} style={{ maxWidth: 170 }} />
          <SelectInput aria-label="Plan" value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })} style={{ maxWidth: 200 }}><option value="">Every plan</option>{d?.plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput>
          <button type="button" style={btnGhost} onClick={csv}><Download size={14} aria-hidden="true" /> Members as a spreadsheet</button>
          {d?.from && <span style={{ color: colors.textMuted, fontSize: '0.82rem' }}>{day(d.from)} to {day(d.to)}</span>}
        </div>
        {d && !d.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 163_memberships_members.sql first.</p>}
        {d?.ready && d.now && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <Tile label="Members now" value={d.now.members} note="running, on trial or paying late" />
              <Tile label="Monthly recurring" value={money(d.now.mrr)} note={`before tax · ${money(d.now.arpm)} a member`} />
              <Tile label="Joined" value={d.range.new} note="in the dates chosen" />
              <Tile label="Left" value={d.range.left} note={d.range.churn_pct != null ? `${d.range.churn_pct}% of those at the start` : 'in the dates chosen'} />
              <Tile label="Collected" value={money(d.range.collected)} note={`invoiced ${money(d.range.invoiced)}${d.range.refunded ? ` · refunded ${money(d.range.refunded)}` : ''}`} />
              <Tile label="Owed now" value={money(d.now.owing)} note="open membership invoices" />
            </div>
            <Table title="By plan" rows={d.now.by_plan} cols={[{ key: 'plan', label: 'Plan' }, { key: 'period_label', label: 'Billed' }, { key: 'members', label: 'Members', right: true }, { key: 'on_trial', label: 'On trial', right: true }, { key: 'late', label: 'Late', right: true }, { key: 'given', label: 'Given', right: true }, { key: 'mrr', label: 'Monthly (before tax)', right: true, render: (r) => money(r.mrr) }]} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <Table title="Joined and left, by month" rows={d.trend} cols={[{ key: 'month', label: 'Month' }, { key: 'joined', label: 'Joined', right: true }, { key: 'left', label: 'Left', right: true }, { key: 'net', label: 'Change', right: true, render: (r) => (r.joined - r.left > 0 ? `+${r.joined - r.left}` : r.joined - r.left) }]} />
              <Table title="Every membership by status" rows={d.now.by_status} cols={[{ key: 'label', label: 'Status' }, { key: 'count', label: 'Memberships', right: true }]} />
            </div>
            <Table title="Late or lapsed" empty="Nobody is late." rows={d.late} cols={[{ key: 'member', label: 'Member' }, { key: 'number', label: 'Number' }, { key: 'plan', label: 'Plan' }, { key: 'status_label', label: 'Status' }, { key: 'since', label: 'Unpaid since', render: (r) => day(r.since) }, { key: 'owing', label: 'Owes', right: true, render: (r) => money(r.owing) }]} />
            <Table title="Ending in the next 14 days and not renewing" empty="None." rows={d.ending} cols={[{ key: 'member', label: 'Member' }, { key: 'number', label: 'Number' }, { key: 'plan', label: 'Plan' }, { key: 'last_day', label: 'Last day', render: (r) => day(r.last_day) }, { key: 'why', label: 'Why' }]} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {d.checkins && <Table title={`Check-ins: ${d.checkins.visits} visits by ${d.checkins.people} people${d.checkins.turned_away ? ` · ${d.checkins.turned_away} turned away` : ''}`} empty="No check-ins." rows={d.checkins.by_branch} cols={[{ key: 'branch', label: 'Branch' }, { key: 'visits', label: 'Visits', right: true }]} />}
              {d.credits && <Table title="Credits" rows={[{ id: 1, ...d.credits }]} cols={[{ key: 'granted', label: 'Given', right: true }, { key: 'spent', label: 'Spent', right: true }, { key: 'given_back', label: 'Given back', right: true }, { key: 'expired', label: 'Expired', right: true }]} />}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
