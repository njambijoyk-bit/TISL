import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Download, MessageCircle, Search, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import { btnPrimary, btnGhost, colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle } from './booksFmt';
import { whatsappDocument } from './shareDocument';

const KINDS = [['', 'All documents'], ['invoices', 'Invoices & cash sales'], ['receipts', 'Receipts'], ['quotations', 'Quotations'], ['orders', 'Sales orders'], ['deliveries', 'Delivery notes'], ['credits', 'Credit notes']];
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
const pager = (meta, page, setPage, what) => meta.last_page > 1 && (
  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 14, fontSize: '0.8rem', color: colors.textMuted }}>
    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ ...filterStyle, cursor: 'pointer' }}>Previous</button>
    Page {meta.current_page} of {meta.last_page} · {meta.total} {what}
    <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} style={{ ...filterStyle, cursor: 'pointer' }}>Next</button>
  </div>
);

/** Send customer documents from a list (e-mail with the customer copy attached, or WhatsApp), and see what has been sent, by whom, to whom. */
export default function MailTab({ canWrite }) {
  const [view, setView] = useState('send');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['send', 'Send documents'], ['sent', 'Sent log']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} style={{ ...(view === id ? btnPrimary : btnGhost) }}>{label}</button>
        ))}
      </div>
      {view === 'send' ? <SendList canWrite={canWrite} /> : <SentLog />}
    </div>
  );
}

function SendList({ canWrite }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ kind: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksAPI.mailDocuments({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page });
      setRows(res.data ?? []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch (e) { toast.error(errMsg(e, 'Could not load documents')); }
    finally { setLoading(false); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => { setPage(1); setF((x) => ({ ...x, [k]: e.target.value })); };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const sendPicked = async () => {
    setBusy(true); setFailed([]);
    try {
      const r = await booksAPI.mailSend(picked, note);
      const bad = r.results.filter((x) => !x.ok);
      setFailed(bad);
      (bad.length ? toast : toast.success)(r.message);
      setPicked(bad.map((x) => x.id)); load();
    } catch (e) { toast.error(errMsg(e, 'Could not send')); }
    finally { setBusy(false); }
  };
  const sendOne = async (v) => {
    setBusy(true);
    try { const r = await booksAPI.mailSend([v.id], note); const x = r.results[0]; x.ok ? toast.success(`Sent to ${x.to}`) : toast.error(x.error); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not send')); }
    finally { setBusy(false); }
  };
  const wa = async (v) => {
    const text = `Hello ${v.customer}, here is your ${v.type_name} ${v.voucher_number}.`;
    try {
      const how = await whatsappDocument({ id: v.id, digits: v.whatsapp_to, text, to: v.phone });
      if (how === 'downloaded') toast.success('The PDF was saved to this computer — attach it in the WhatsApp chat that opened.');
      load();
    } catch (e) { toast.error(errMsg(e, 'Could not prepare the document')); }
  };

  const columns = [
    { key: 'pick', label: '', width: 36, render: (v) => <input type="checkbox" aria-label={`Select ${v.voucher_number}`} disabled={!canWrite || !v.email} checked={picked.includes(v.id)} onChange={() => toggle(v.id)} onClick={(e) => e.stopPropagation()} /> },
    { key: 'date', label: 'Date', render: (v) => v.date },
    { key: 'num', label: 'Document', render: (v) => <><Link to={`/admin/books/vouchers/${v.id}`} style={{ fontFamily: 'monospace', fontWeight: 700, color: colors.text }}>{v.voucher_number}</Link><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{v.type_name}</div></> },
    { key: 'customer', label: 'Customer', render: (v) => <>{v.customer}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{v.email ?? 'no e-mail on file'}{v.phone ? ` · ${v.phone}` : ''}</div></> },
    { key: 'total', label: 'Amount', align: 'right', render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v.currency} {money(v.total)}</span> },
    { key: 'last', label: 'Last sent', render: (v) => (v.last_sent ? <span style={{ fontSize: '0.74rem' }}>{when(v.last_sent.at)}<div style={{ color: colors.textFaint }}>{v.last_sent.channel}{v.last_sent.status === 'failed' ? ' · failed' : ''}</div></span> : <span style={{ color: colors.textFaint }}>—</span>) },
    { key: 'act', label: '', align: 'right', render: (v) => (
      <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} title="Download the customer copy" onClick={() => booksAPI.customerCopy(v.id).catch((e) => toast.error(errMsg(e, 'Could not make the customer copy')))}><Download size={13} /></button>
        {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} title={v.email ? `E-mail to ${v.email}` : 'No e-mail on file'} disabled={busy || !v.email} onClick={() => sendOne(v)}><Send size={13} /></button>}
        {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} title="Open WhatsApp with the document" onClick={() => wa(v)}><MessageCircle size={13} /></button>}
      </span>
    ) },
  ];

  return (
    <div>
      <Toolbar>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
          <input value={f.q} onChange={set('q')} placeholder="Number or customer…" style={{ ...filterStyle, paddingLeft: 30, width: 220 }} />
        </div>
        <select value={f.kind} onChange={set('kind')} style={filterStyle} aria-label="Kind">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input type="date" value={f.from} onChange={set('from')} style={filterStyle} aria-label="From" />
        <input type="date" value={f.to} onChange={set('to')} style={filterStyle} aria-label="To" />
      </Toolbar>
      {canWrite && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note above the document (optional)" style={{ ...filterStyle, width: 320 }} />
          <button type="button" style={btnPrimary} disabled={busy || picked.length === 0} onClick={sendPicked}><Send size={14} /> {busy ? 'Sending…' : `E-mail ${picked.length || ''} selected`}</button>
          <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>Each goes to its customer's e-mail with the customer copy attached. Rows with no e-mail on file can't be ticked.</span>
        </div>
      )}
      {failed.length > 0 && (
        <div role="alert" style={{ margin: '0 0 12px', padding: 10, borderRadius: 8, border: `1px solid ${colors.dangerText}`, fontSize: '0.78rem' }}>
          {failed.map((x) => <div key={x.id}><strong style={{ fontFamily: 'monospace' }}>{x.voucher_number}</strong> — {x.error}</div>)}
        </div>
      )}
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="No documents match." />
      {pager(meta, page, setPage, 'documents')}
    </div>
  );
}

function SentLog() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [f, setF] = useState({ q: '', channel: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksAPI.mailSent({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page });
      setSetup(!!res.setup_needed);
      setRows(res.data ?? []);
      setMeta({ current_page: res.current_page ?? 1, last_page: res.last_page ?? 1, total: res.total ?? 0 });
    } catch (e) { toast.error(errMsg(e, 'Could not load the log')); }
    finally { setLoading(false); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => { setPage(1); setF((x) => ({ ...x, [k]: e.target.value })); };

  const columns = [
    { key: 'at', label: 'When', render: (s) => when(s.at) },
    { key: 'doc', label: 'Document', render: (s) => <><Link to={`/admin/books/vouchers/${s.voucher_id}`} style={{ fontFamily: 'monospace', fontWeight: 700, color: colors.text }}>{s.voucher_number}</Link><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{s.type_name}</div></> },
    { key: 'channel', label: 'How', render: (s) => (s.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail') },
    { key: 'to', label: 'To', render: (s) => s.to ?? '—' },
    { key: 'by', label: 'Sent by', render: (s) => s.sent_by ?? '—' },
    { key: 'status', label: 'Result', render: (s) => (
      <span style={{ fontWeight: 700, color: s.status === 'failed' ? colors.dangerText : s.status === 'sent' ? '#059669' : colors.textMuted }} title={s.error ?? undefined}>
        {s.status === 'opened' ? 'Chat opened' : s.status === 'sent' ? 'Sent' : 'Failed'}
        {s.error && <div style={{ fontWeight: 400, fontSize: '0.7rem', maxWidth: 260 }}>{s.error}</div>}
      </span>
    ) },
  ];
  return (
    <div>
      {setup && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.82rem' }}>The send log needs a one-time database script (75_document_shares.sql). Until it is run nothing is recorded here.</p>}
      <Toolbar>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
          <input value={f.q} onChange={set('q')} placeholder="Document number or recipient…" style={{ ...filterStyle, paddingLeft: 30, width: 240 }} />
        </div>
        <select value={f.channel} onChange={set('channel')} style={filterStyle} aria-label="How"><option value="">E-mail and WhatsApp</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option></select>
        <select value={f.status} onChange={set('status')} style={filterStyle} aria-label="Result"><option value="">Any result</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="opened">Chat opened</option></select>
        <input type="date" value={f.from} onChange={set('from')} style={filterStyle} aria-label="From" />
        <input type="date" value={f.to} onChange={set('to')} style={filterStyle} aria-label="To" />
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="Nothing has been sent yet." />
      {pager(meta, page, setPage, 'sends')}
    </div>
  );
}
