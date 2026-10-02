import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import calendarAPI from '../../../../_shared/api/calendar';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors, input } from '../../../../_shared/theme/tokens';

/**
 * A calendar of what is on for one person: tasks, milestones, project ends and (later) bookings. Customers never see it — they
 * see their own bookings in their portal. A manager can open anyone's calendar; the private link puts it in Google/Apple/Outlook.
 */

const KINDS = { task: ['Task', '#3b82f6'], milestone: ['Milestone', '#8b5cf6'], project: ['Project end', '#14b8a6'], booking: ['Booking', '#10b981'], verification: ['Verification', '#f59e0b'], time_off: ['Time off', '#9ca3af'] };
const kindOf = (k) => KINDS[k] ?? [k, '#6b7280'];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MyCalendar() {
  const [params] = useSearchParams();
  const userId = params.get('user_id');
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = ymd(month); const to = ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
      setData(await calendarAPI.mine({ from, to, ...(userId ? { user_id: userId } : {}) }));
    } catch (e) { setError(errMsg(e, 'Could not load the calendar')); }
  }, [month, userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!userId) calendarAPI.subscription().then((r) => setLink(r.url)).catch(() => {}); }, [userId]);

  const byDay = useMemo(() => {
    const m = {};
    (data?.entries ?? []).filter((e) => !hidden.includes(e.kind)).forEach((e) => {
      const start = new Date(e.starts_at); const end = e.ends_at ? new Date(e.ends_at) : start;
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end && d <= new Date(month.getFullYear(), month.getMonth() + 1, 0); d.setDate(d.getDate() + 1)) {
        (m[ymd(d)] ??= []).push(e);
        if (e.all_day && ymd(end) === ymd(start)) break;
      }
    });
    return m;
  }, [data, hidden, month]);

  const days = useMemo(() => {
    const first = month.getDay(); const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);

  const rotate = async () => {
    if (!window.confirm('Make a new link? The old one stops working everywhere it was added.')) return;
    try { const r = await calendarAPI.rotate(); setLink(r.url); toast.success(r.message); } catch (e) { toast.error(errMsg(e, 'Could not make a new link')); }
  };
  const kindsPresent = [...new Set((data?.entries ?? []).map((e) => e.kind))];
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title={data && userId ? `${data.owner.name}'s calendar` : 'My calendar'} description="Your tasks, milestones and bookings in one place. Customers never see this." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px', flexWrap: 'wrap' }}>
          <button type="button" style={{ ...input, width: 'auto', cursor: 'pointer' }} onClick={() => shift(-1)}>‹</button>
          <strong style={{ minWidth: 150, textAlign: 'center' }}>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" style={{ ...input, width: 'auto', cursor: 'pointer' }} onClick={() => shift(1)}>›</button>
          {kindsPresent.map((k) => (
            <label key={k} style={{ fontSize: '0.76rem', color: colors.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={!hidden.includes(k)} onChange={() => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))} />
              <span style={{ width: 9, height: 9, borderRadius: 5, background: kindOf(k)[1] }} />{kindOf(k)[0]}
            </label>
          ))}
          {data?.is_manager && <Link to="/admin/calendar/team" style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>Team calendar →</Link>}
        </div>

        <section style={{ ...card, padding: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 1, fontSize: '0.66rem', color: colors.textFaint, textTransform: 'uppercase', textAlign: 'center' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} style={{ padding: 4 }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 1, background: '#f3f4f6' }}>
            {days.map((d, i) => {
              const list = d ? byDay[ymd(d)] ?? [] : [];
              return (
                <div key={i} style={{ background: d ? '#fff' : '#fafafa', minHeight: 84, padding: 4, overflow: 'hidden' }}>
                  {d && <div style={{ fontSize: '0.72rem', fontWeight: ymd(d) === ymd(new Date()) ? 800 : 500, color: ymd(d) === ymd(new Date()) ? colors.primaryDeep : colors.textMuted }}>{d.getDate()}</div>}
                  {list.slice(0, 3).map((e) => {
                    const chip = <span title={e.title} style={{ display: 'block', margin: '2px 0', padding: '1px 5px', borderRadius: 4, background: `${kindOf(e.kind)[1]}22`, color: '#1f2937', fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `3px solid ${kindOf(e.kind)[1]}` }}>{!e.all_day && `${new Date(e.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} `}{e.title}</span>;
                    return e.url ? <Link key={e.id} to={e.url} style={{ textDecoration: 'none' }}>{chip}</Link> : <div key={e.id}>{chip}</div>;
                  })}
                  {list.length > 3 && <span style={{ fontSize: '0.66rem', color: colors.textFaint }}>+{list.length - 3} more</span>}
                </div>
              );
            })}
          </div>
        </section>

        {!userId && (
          <section style={{ ...card, padding: 16, marginTop: 16 }}>
            <p style={{ margin: 0, fontWeight: 700, color: colors.primaryDeep }}>See this in Google Calendar, Apple or Outlook</p>
            <p style={{ margin: '4px 0 8px', fontSize: '0.76rem', color: colors.textFaint, maxWidth: 680 }}>Copy the private link and add it as a calendar by URL (Google: Other calendars → From URL). It is read-only and refreshes by itself. Anyone with the link can see your calendar, so make a new one if it leaks.</p>
            {link ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...input, flex: 1, minWidth: 260 }} />
                <button type="button" style={btnPrimary} onClick={() => { navigator.clipboard?.writeText(link); toast.success('Link copied'); }}>Copy link</button>
                <button type="button" style={{ ...input, width: 'auto', cursor: 'pointer' }} onClick={rotate}>Make a new link</button>
              </div>
            ) : <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Loading…</p>}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
