import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import CodeScanner from '../../../core/components/admin/codes/CodeScanner';
import membershipsAPI from '../../../_shared/api/memberships';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import MembershipsNav from '../../components/MembershipsNav';

const KEY = 'membership-checkin-branch';
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Check-in at a door or desk: pick the branch once, then scan member cards (or find someone by name). Green lets them in, red says why not. */
export default function MembershipCheckin() {
  const user = useAuthStore((s) => s.user);
  const [meta, setMeta] = useState(null);
  const [branch, setBranch] = useState(() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } });
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);

  const loadRecent = useCallback(() => membershipsAPI.checkinRecent({ location_id: branch || undefined }).then((r) => setRecent(r.checkins)).catch(() => setRecent([])), [branch]);
  useEffect(() => { membershipsAPI.checkinMeta().then((m) => { setMeta(m); if (!branch && m.locations.length === 1) setBranch(String(m.locations[0].id)); }).catch((e) => toast.error(errMsg(e, 'Could not load'))); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(KEY, branch); } catch { /* fine */ } loadRecent(); }, [branch, loadRecent]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => membershipsAPI.checkinPeople(q).then((r) => setFound(r.users)).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const done = (r) => { setResult(r); loadRecent(); };
  const fail = (e) => setResult({ ok: false, reason: errMsg(e, 'That did not work.') });
  const scan = useCallback((code) => membershipsAPI.checkinScan(code, branch ? Number(branch) : null).then(done).catch(fail), [branch]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasPermission(user, 'memberships.checkin')) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Member check-in" /></div></AdminLayout>;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 820, margin: '0 auto', display: 'grid', gap: 14 }} data-testid="membership-checkin">
        <MembershipsNav />
        <HubHeader title="Check-in" description="Scan a member card, or find the person by name." />
        {meta && !meta.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 167_memberships_checkins.sql to switch check-in on.</p>}
        {meta?.ready && (
          <>
            <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
              <SelectInput aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">Choose the branch you are at</option>
                {meta.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </SelectInput>
              <CodeScanner onScan={scan} placeholder="Scan the member card, then Enter" />
              <div>
                <TextInput aria-label="Find by name" placeholder="No card? Find by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
                {found.length > 0 && <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>{found.map((u) => <li key={u.id}><button type="button" style={btnGhost} onClick={() => { setQ(''); setFound([]); membershipsAPI.checkinManual(u.id, branch ? Number(branch) : null).then(done).catch(fail); }}>{u.name} <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{u.email}</span></button></li>)}</ul>}
              </div>
            </section>
            {result && (
              <section role="status" data-testid="checkin-result" style={{ ...card, padding: 18, display: 'grid', gap: 6, borderWidth: 3, borderColor: result.ok ? '#16a34a' : '#dc2626', background: result.ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)' }}>
                <strong style={{ fontSize: '1.4rem', color: result.ok ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {result.ok ? <CheckCircle2 size={26} aria-hidden="true" /> : <XCircle size={26} aria-hidden="true" />}{result.ok ? (result.repeat ? 'Already checked in' : 'Welcome') : 'Not let in'}{result.name ? `: ${result.name}` : ''}
                </strong>
                {result.reason && <span style={{ fontWeight: 700 }}>{result.reason}</span>}
                {result.warning && <span style={{ color: '#92400e', fontWeight: 700 }}>{result.warning}</span>}
                {result.plan && <span>{result.plan} · {result.status_label}{result.last_day ? ` · paid up to ${day(result.last_day)}` : ''}</span>}
                {result.ok && <span style={{ color: colors.textMuted, fontSize: '0.86rem' }}>{result.visits_30_days} visit{result.visits_30_days === 1 ? '' : 's'} in the last 30 days{result.credits != null ? ` · ${result.credits} credits` : ''}</span>}
              </section>
            )}
            <section style={{ ...card, padding: 14, display: 'grid', gap: 4 }}>
              <strong>Latest here</strong>
              {recent.length === 0 && <span style={{ color: colors.textMuted }}>Nobody yet.</span>}
              {recent.map((c) => <div key={c.id} style={{ display: 'flex', gap: 8, fontSize: '0.86rem', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 4 }}><span style={{ width: 52 }}>{time(c.at)}</span><span style={{ flex: 1 }}>{c.name}{c.method === 'manual' ? ' (by name)' : ''}</span><span style={{ color: c.result === 'ok' ? '#15803d' : '#b91c1c', fontWeight: 700 }}>{c.result === 'ok' ? 'In' : c.reason}</span></div>)}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
