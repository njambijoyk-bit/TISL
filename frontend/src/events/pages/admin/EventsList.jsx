import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarDays, Plus, Search, Pencil, Eye, EyeOff, Ban, Trash2 } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import Tabs from '../../../core/components/admin/ui/Tabs';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import ConfirmModal from '../../../core/components/admin/ui/ConfirmModal';
import { SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import eventsAPI from '../../../_shared/api/events';
import useAuthStore from '../../../_shared/store/authStore';
import useCurrencyStore from '../../../_shared/store/currencyStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../../_shared/theme/tokens';
import StatusBadge from '../../components/admin/StatusBadge';
import EventSettingsTab from '../../components/admin/EventSettingsTab';
import { whenText } from '../../lib/eventFormat';

const TABS = [{ id: 'events', label: 'Events' }, { id: 'settings', label: 'Settings' }];
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };

/** Admin → Events: every event with what is sold, and the buttons to put it on sale, take it down or cancel it. */
export default function EventsList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const can = { edit: hasPermission(user, 'events.edit'), del: hasPermission(user, 'events.delete') };
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'events';
  const { adminCurrencies, fetchAdminCurrencies } = useCurrencyStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState('');
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState(null);   // {kind, row}
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!adminCurrencies.length) fetchAdminCurrencies().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    setLoading(true);
    return eventsAPI.list({ q: q || undefined, status: status || undefined, when: when || undefined })
      .then((r) => { setRows(r.data); setReady(r.ready); })
      .catch((e) => toast.error(errMsg(e, 'Could not load the events')))
      .finally(() => setLoading(false));
  }, [q, status, when]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const money = useCallback((amount, id) => formatMoney(amount, adminCurrencies.find((c) => Number(c.id) === Number(id))), [adminCurrencies]);
  const totals = useMemo(() => ({
    live: rows.filter((r) => r.status === 'published' && !r.over).length,
    sold: rows.reduce((n, r) => n + r.sold, 0),
  }), [rows]);

  const run = async () => {
    const { kind, row } = ask;
    setBusy(true);
    try {
      if (kind === 'delete') { await eventsAPI.remove(row.id); toast.success('Deleted'); }
      else { const r = await ({ publish: eventsAPI.publish, unpublish: eventsAPI.unpublish, cancel: eventsAPI.cancel }[kind])(row.id); toast.success(r.message); }
      setAsk(null); load();
    } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 9000 }); setAsk(null); } finally { setBusy(false); }
  };

  const MESSAGES = {
    publish: (r) => ({ title: `Put "${r.title}" on sale?`, message: 'It will show on the website and anyone can buy tickets.', label: 'Put on sale' }),
    unpublish: (r) => ({ title: `Take "${r.title}" down?`, message: 'It stops showing on the website and no more tickets can be bought. Tickets already sold stay valid.', label: 'Take down' }),
    cancel: (r) => ({ title: `Cancel "${r.title}"?`, message: 'No more tickets can be bought. This can not be undone: a cancelled event can not be put on sale again.', label: 'Cancel the event', danger: true }),
    delete: (r) => ({ title: `Delete "${r.title}"?`, message: 'Only an event nobody bought a ticket for can be deleted.', label: 'Delete', danger: true }),
  };

  const columns = [
    { key: 'title', label: 'Event', render: (r) => (
      <Link to={`/admin/events/${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
        {r.image_url ? <img src={r.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} /> : <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 8, display: 'grid', placeItems: 'center', background: colors.tint(0.08), color: colors.primary }}><CalendarDays size={18} /></span>}
        <span><span style={{ fontWeight: 700, display: 'block' }}>{r.title}</span><span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{r.venue_name || (r.kind === 'online' ? 'Online' : 'No venue yet')}</span></span>
      </Link>
    ) },
    { key: 'next_at', label: 'When', render: (r) => (r.next_at ? <span>{whenText(r.next_at)}{r.sessions > 1 && <span style={{ color: colors.textFaint, fontSize: '0.74rem' }}> · {r.sessions} dates</span>}</span> : <span style={{ color: colors.danger, fontSize: '0.78rem' }}>no date yet</span>) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} over={r.over} /> },
    { key: 'sold', label: 'Sold', align: 'right', render: (r) => <span>{r.sold}{r.capacity != null ? ` / ${r.capacity}` : ''}</span> },
    { key: 'revenue', label: 'Takings', align: 'right', render: (r) => (r.revenue ? money(r.revenue, r.currency_id) : '—') },
    { key: 'act', label: '', align: 'right', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {can.edit && <button type="button" style={small} onClick={() => navigate(`/admin/events/${r.id}`)} aria-label={`Edit ${r.title}`}><Pencil size={12} /> Edit</button>}
        {can.edit && r.status === 'draft' && <button type="button" style={small} onClick={() => setAsk({ kind: 'publish', row: r })}><Eye size={12} /> Put on sale</button>}
        {can.edit && r.status === 'published' && !r.over && <button type="button" style={small} onClick={() => setAsk({ kind: 'unpublish', row: r })}><EyeOff size={12} /> Take down</button>}
        {can.edit && ['published', 'postponed', 'draft'].includes(r.status) && !r.over && <button type="button" style={{ ...small, color: colors.danger }} onClick={() => setAsk({ kind: 'cancel', row: r })}><Ban size={12} /> Cancel</button>}
        {can.del && !r.sold && <button type="button" style={{ ...small, color: colors.danger }} onClick={() => setAsk({ kind: 'delete', row: r })} aria-label={`Delete ${r.title}`}><Trash2 size={12} /></button>}
      </span>
    ) },
  ];

  const confirm = ask && MESSAGES[ask.kind](ask.row);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Events" description="Ticketed events, free RSVPs, multi-day and repeating events and online ones. Put an event on sale, see what is sold, and check people in at the door."
          action={can.edit && <Link to="/admin/events/new" style={{ ...btnPrimary, textDecoration: 'none' }}><Plus size={14} /> New event</Link>} />
        <Tabs tabs={TABS} active={tab} onChange={(id) => setParams(id === 'events' ? {} : { tab: id })} />

        {tab === 'settings' ? <EventSettingsTab canEdit={can.edit} /> : (
          <>
            {!ready && <p role="status" style={{ margin: '0 0 12px', fontSize: '0.82rem', color: colors.textMuted }}>Run database script 120_events.sql, then reload: events can not be saved until then.</p>}
            <Toolbar right={<span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{totals.live} on sale · {totals.sold} ticket{totals.sold === 1 ? '' : 's'} sold</span>}>
              <div style={{ position: 'relative' }}>
                <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or venue" aria-label="Search events" style={{ paddingLeft: 30, minWidth: 240 }} />
              </div>
              <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ width: 'auto' }}>
                <option value="">Any status</option><option value="draft">Draft</option><option value="published">On sale</option><option value="postponed">Postponed</option><option value="cancelled">Cancelled</option>
              </SelectInput>
              <SelectInput value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When" style={{ width: 'auto' }}>
                <option value="">Any time</option><option value="upcoming">Still to come</option><option value="past">Over</option>
              </SelectInput>
            </Toolbar>
            <SimpleTable columns={columns} rows={rows} loading={loading} empty={can.edit ? 'No events yet. Make the first one with "New event".' : 'No events yet.'} />
          </>
        )}
      </div>
      {confirm && <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger={confirm.danger} busy={busy} onConfirm={run} onClose={() => setAsk(null)} />}
    </AdminLayout>
  );
}
