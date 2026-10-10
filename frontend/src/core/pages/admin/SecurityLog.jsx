import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../components/admin/ui/HubHeader';
import SimpleTable from '../../components/admin/ui/SimpleTable';
import { SelectInput, TextInput } from '../../components/admin/ui/Form';
import securityAPI from '../../../_shared/api/security';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';

const PERIODS = [{ hours: 24, label: 'Last 24 hours' }, { hours: 168, label: 'Last 7 days' }, { hours: 720, label: 'Last 30 days' }];
const SEVERITY = {
  info: { label: 'Routine', color: colors.neutralText, bg: colors.neutralBg },
  notice: { label: 'Worth a look', color: colors.infoText, bg: colors.infoBg },
  warning: { label: 'Warning', color: colors.warningText, bg: colors.warningBg },
  alert: { label: 'Alert', color: colors.dangerText, bg: colors.dangerBg },
};
const REASONS = { wrong_password: 'wrong password', unknown_email: 'no account with that email', temporary_password: 'temporary password', locked: 'account locked', not_allowed: 'account not allowed in', applicant: 'job applicant' };

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

/** The few words of a line's detail that are worth reading. */
function detailText(row) {
  const d = row.detail || {};
  const bits = [];
  if (d.reason) bits.push(REASONS[d.reason] ?? d.reason);
  if (d.door && REASONS[d.door]) bits.push(REASONS[d.door]);
  if (d.method) bits.push(`by ${d.method}`);
  if (d.new_device) bits.push('a device not used before');
  if (d.wait_seconds) bits.push(`wait of ${d.wait_seconds} s`);
  if (d.wrong_passwords_in_an_hour) bits.push(`${d.wrong_passwords_in_an_hour} wrong passwords in an hour`);
  if (d.sessions_ended != null) bits.push(`${d.sessions_ended} device${d.sessions_ended === 1 ? '' : 's'} signed out`);
  if (d.count != null) bits.push(`${d.count} device${d.count === 1 ? '' : 's'} signed out`);
  if (d.forced) bits.push('was required by an administrator');
  return bits.join(' · ');
}

function Badge({ severity }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ ...card, padding: '14px 16px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tone ?? colors.text, lineHeight: 1.1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: '0.74rem', color: colors.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function TopList({ title, rows, name }) {
  if (!rows?.length) return null;
  return (
    <div style={{ ...card, padding: '12px 16px', flex: '1 1 260px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, marginBottom: 6 }}>{title}</div>
      {rows.map((r) => (
        <div key={r[name]} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem', padding: '2px 0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[name]}</span><strong>{r.count}</strong>
        </div>
      ))}
    </div>
  );
}

/** Admin → Sign-in log: who signed in, wrong passwords, waits, requests turned away and alerts (permission security.view). */
export default function SecurityLog() {
  const [hours, setHours] = useState(24);
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('');
  const [event, setEvent] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ data: [], total: 0, last_page: 1, ready: true, events: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { securityAPI.summary(hours).then(setSummary).catch((e) => toast.error(errMsg(e, 'Could not load the numbers'))); }, [hours]);

  const load = useCallback(() => {
    setLoading(true);
    return securityAPI.events({ q: q || undefined, severity: severity || undefined, event: event || undefined, from: from || undefined, to: to || undefined, page })
      .then((r) => setData((d) => ({ ...r, events: r.events ?? d.events })))
      .catch((e) => toast.error(errMsg(e, 'Could not load the log')))
      .finally(() => setLoading(false));
  }, [q, severity, event, from, to, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  const change = (set) => (e) => { set(e.target.value); setPage(1); };

  const columns = [
    { key: 'at', label: 'When', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{when(r.at)}</span> },
    { key: 'label', label: 'What', render: (r) => <span style={{ display: 'grid', gap: 3, justifyItems: 'start' }}><span style={{ fontWeight: 600 }}>{r.label}</span><Badge severity={r.severity} /></span> },
    { key: 'who', label: 'Who', render: (r) => (r.who
      ? <span><span style={{ fontWeight: 600, display: 'block' }}>{r.who.name || 'Someone'}</span><span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{r.who.email}{r.who.type === 'applicant' ? ' · job applicant' : ''}</span></span>
      : r.email_tried ? <span><span style={{ fontSize: '0.74rem', color: colors.textFaint, display: 'block' }}>typed</span>{r.email_tried}</span> : <span style={{ color: colors.textFaint }}>—</span>) },
    { key: 'ip', label: 'Where', render: (r) => <span>{r.ip || '—'}{r.device && <span style={{ display: 'block', fontSize: '0.74rem', color: colors.textFaint }}>{r.device}</span>}</span> },
    { key: 'detail', label: 'Details', render: (r) => <span style={{ fontSize: '0.76rem', color: colors.textMuted }}>{detailText(r) || '—'}</span> },
  ];

  const s = summary;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Sign-in log" description="Who signed in, wrong passwords, people made to wait, requests turned away and alerts. Lines are only ever added; routine ones are kept for 90 days, alerts for two years." />
        {!data.ready && <p role="status" style={{ margin: '0 0 12px', fontSize: '0.82rem', color: colors.textMuted }}>{data.message}</p>}

        <Toolbar>
          <SelectInput value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Period" style={{ width: 'auto' }}>
            {PERIODS.map((p) => <option key={p.hours} value={p.hours}>{p.label}</option>)}
          </SelectInput>
        </Toolbar>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Stat label="Signed in" value={s?.signed_in} />
          <Stat label="Wrong passwords" value={s?.wrong_passwords} />
          <Stat label="Made to wait or turned away" value={s?.made_to_wait} tone={s?.made_to_wait ? colors.warningText : undefined} />
          <Stat label="Alerts" value={s?.alerts} tone={s?.alerts ? colors.danger : undefined} />
          <Stat label="Signed in right now" value={s?.signed_in_now} />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <TopList title="Addresses with the most wrong passwords and waits" rows={s?.top_addresses} name="ip" />
          <TopList title="Emails most often tried with a wrong password" rows={s?.top_emails} name="email" />
        </div>

        <Toolbar right={<span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{data.total} line{data.total === 1 ? '' : 's'}</span>}>
          <div style={{ position: 'relative' }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
            <TextInput value={q} onChange={change(setQ)} placeholder="Email, name or address" aria-label="Search the log" style={{ paddingLeft: 30, minWidth: 240 }} />
          </div>
          <SelectInput value={severity} onChange={change(setSeverity)} aria-label="How serious" style={{ width: 'auto' }}>
            <option value="">Any kind</option>
            <option value="alert">Alerts</option>
            <option value="alert,warning">Alerts and warnings</option>
            <option value="alert,warning,notice">Everything but routine</option>
          </SelectInput>
          <SelectInput value={event} onChange={change(setEvent)} aria-label="What happened" style={{ width: 'auto' }}>
            <option value="">Anything</option>
            {data.events.map((e) => <option key={e.event} value={e.event}>{e.label}</option>)}
          </SelectInput>
          <TextInput type="date" value={from} onChange={change(setFrom)} aria-label="From" style={{ width: 'auto' }} />
          <TextInput type="date" value={to} onChange={change(setTo)} aria-label="To" style={{ width: 'auto' }} />
        </Toolbar>
        <SimpleTable columns={columns} rows={data.data} loading={loading} empty="Nothing in the log matches." />

        {data.last_page > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 }}>
            <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /> Newer</button>
            <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>Page {page} of {data.last_page}</span>
            <button type="button" style={btnGhost} disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)}>Older <ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
