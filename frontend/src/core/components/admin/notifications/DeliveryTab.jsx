import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCw } from 'lucide-react';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import { SelectInput, TextInput } from '../ui/Form';
import { btnGhost, colors } from '../../../../_shared/theme/tokens';

const STATUS = { queued: ['Waiting', '#b45309'], sent: ['Sent', '#047857'], delivered: ['Delivered', '#047857'], read: ['Read', '#047857'], failed: ['Failed', '#b91c1c'], to_send: ['To send by hand', '#1d4ed8'], skipped: ['Not sent', '#6b7280'] };
const WHY = { no_email: 'no email address', no_number: 'no WhatsApp number', number_source: 'number not from an accepted source', nobody_reachable: 'nobody could be reached: someone should contact them' };
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

/** Every message on every channel and what became of it. A failed or waiting email can be tried again. */
export default function DeliveryTab({ canSend }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [f, setF] = useState({ channel: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await notificationSettingsAPI.deliveries({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page });
      setRows(r.data); setMeta({ current_page: r.current_page, last_page: r.last_page, total: r.total });
    } catch (e) { toast.error(errMsg(e, 'Could not load the log')); } finally { setLoading(false); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { setPage(1); setF((x) => ({ ...x, [k]: e.target.value })); };
  const retry = async (id) => { try { const r = await notificationSettingsAPI.retry(id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'Could not try again')); } };

  const columns = [
    { key: 'at', label: 'When', render: (d) => when(d.at) },
    { key: 'type', label: 'Message', render: (d) => <span><strong>{d.type_label}</strong>{d.subject && <span style={{ color: colors.textMuted }}> · {d.subject}</span>}</span> },
    { key: 'channel', label: 'Channel', render: (d) => (d.channel === 'whatsapp' ? `WhatsApp${d.via ? ` (${d.via === 'link' ? 'by hand' : 'automatic'})` : ''}` : d.channel === 'email' ? 'Email' : 'Bell') },
    { key: 'to', label: 'To', render: (d) => d.to ?? '—' },
    { key: 'status', label: 'Status', render: (d) => {
      const [label, color] = STATUS[d.status] ?? [d.status, '#6b7280'];
      return <span style={{ color, fontWeight: 700 }}>{label}{d.error ? <span style={{ fontWeight: 400, color: colors.textMuted }}> · {WHY[d.error] ?? d.error}</span> : ''}</span>;
    } },
    { key: 'act', label: '', align: 'right', render: (d) => (canSend && d.channel === 'email' && ['failed', 'queued'].includes(d.status)
      ? <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => retry(d.id)}><RotateCw size={12} /> Try again</button> : null) },
  ];

  return (
    <div>
      <Toolbar>
        <SelectInput aria-label="Channel" value={f.channel} onChange={set('channel')} style={{ width: 150 }}><option value="">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></SelectInput>
        <SelectInput aria-label="Status" value={f.status} onChange={set('status')} style={{ width: 170 }}><option value="">Any status</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
        <TextInput aria-label="Search" placeholder="Search address or subject" value={f.q} onChange={set('q')} style={{ width: 240 }} />
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="No messages yet." />
      {meta.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 14, fontSize: '0.8rem', color: colors.textMuted }}>
          <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          Page {meta.current_page} of {meta.last_page} · {meta.total} messages
          <button type="button" style={btnGhost} disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
