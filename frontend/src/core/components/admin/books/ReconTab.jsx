import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { money, today } from './booksFmt';

const STATUS = { open: 'Open', prepared: 'Prepared, waiting for approval', approved: 'Approved, ready to lock', locked: 'Locked', reopened: 'Reopened' };
const th = { padding: '6px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const input = { padding: '6px 8px', borderRadius: 6, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem' };

/** Reconciliation: a statement (bank, M-Pesa, a supplier's) set against the books for one ledger. Import it, match it, prove it, sign it off. */
export default function ReconTab() {
  const [open, setOpen] = useState(null);
  return open ? <Session id={open} onBack={() => setOpen(null)} /> : <Home onOpen={setOpen} />;
}

function Home({ onOpen }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ ledger_id: '', statement_from: '', statement_to: today(), statement_closing: '' });
  const load = useCallback(() => booksAPI.reconIndex().then(setD).catch((e) => toast.error(errMsg(e, 'Could not load'))), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!d.ready) return <p style={{ color: colors.textMuted }}>Run database script 233_reconciliation.sql to turn on reconciliation.</p>;
  const start = async (e) => {
    e.preventDefault();
    try { const r = await booksAPI.reconStart({ ...f, ledger_id: Number(f.ledger_id), statement_from: f.statement_from || undefined, statement_closing: Number(f.statement_closing) }); onOpen(r.id); } catch (x) { toast.error(errMsg(x, 'Could not start')); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, padding: 18 }}>
        <p style={{ margin: '0 0 8px', fontWeight: 800 }}>Start a reconciliation</p>
        {d.ledgers.length === 0
          ? <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>No ledger can be reconciled yet. Choose the groups under Books → Configuration → Reports → Reconciliation.</p>
          : (
            <form onSubmit={start} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ fontSize: '0.72rem' }}>Ledger<br /><select required value={f.ledger_id} onChange={(e) => setF({ ...f, ledger_id: e.target.value })} style={{ ...input, minWidth: 220 }}><option value="">Choose…</option>{d.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.group})</option>)}</select></label>
              <label style={{ fontSize: '0.72rem' }}>Statement from<br /><input type="date" value={f.statement_from} onChange={(e) => setF({ ...f, statement_from: e.target.value })} style={input} /></label>
              <label style={{ fontSize: '0.72rem' }}>Statement to<br /><input required type="date" value={f.statement_to} onChange={(e) => setF({ ...f, statement_to: e.target.value })} style={input} /></label>
              <label style={{ fontSize: '0.72rem' }}>Closing balance on the statement<br /><input required type="number" step="0.01" value={f.statement_closing} onChange={(e) => setF({ ...f, statement_closing: e.target.value })} style={{ ...input, width: 170 }} /></label>
              <button type="submit" style={btnPrimary}>Start</button>
            </form>
          )}
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Ledger</th><th style={th}>To</th><th style={{ ...th, ...num }}>Statement balance</th><th style={th}>Status</th><th /></tr></thead>
          <tbody>
            {d.sessions.length === 0 && <tr><td colSpan={5} style={{ ...td, color: colors.textMuted }}>No reconciliations yet.</td></tr>}
            {d.sessions.map((s) => (
              <tr key={s.id}><td style={td}>{s.ledger}</td><td style={td}>{String(s.statement_to).slice(0, 10)}</td><td style={{ ...td, ...num }}>{money(s.statement_closing)}</td><td style={td}>{STATUS[s.status] ?? s.status}</td>
                <td style={td}><button type="button" style={{ ...btnGhost, padding: '3px 10px' }} onClick={() => onOpen(s.id)}>Open</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const guess = (header, words) => header.find((h) => words.some((w) => h.toLowerCase().includes(w))) ?? '';

function Importer({ id, onDone }) {
  const [csv, setCsv] = useState('');
  const [m, setM] = useState({ date: '', description: '', reference: '', amount: '', in: '', out: '', balance: '', date_format: 'auto', has_header: true });
  const [replace, setReplace] = useState(false);
  const header = useMemo(() => (csv.trim() ? csv.trim().split(/\r?\n/)[0].split(',').map((h) => h.trim()) : []), [csv]);
  useEffect(() => {
    if (!header.length) return;
    setM((x) => ({ ...x, date: x.date || guess(header, ['date']), description: x.description || guess(header, ['detail', 'descr', 'narr', 'particular']), reference: x.reference || guess(header, ['ref', 'code', 'receipt']),
      in: x.in || guess(header, ['paid in', 'credit', 'deposit', 'money in', 'received']), out: x.out || guess(header, ['paid out', 'debit', 'withdraw', 'money out']), amount: x.amount || guess(header, ['amount']), balance: x.balance || guess(header, ['balance']) }));
  }, [header.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (k, label) => (
    <label style={{ fontSize: '0.72rem' }}>{label}<br /><select value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} style={input}><option value="">—</option>{header.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
  );
  const run = async () => {
    try {
      const r = await booksAPI.reconDo(id, 'import', { csv, replace, map: Object.fromEntries(Object.entries(m).filter(([, v]) => v !== '')) });
      toast.success(`${r.added} lines added${r.skipped ? `, ${r.skipped} skipped` : ''}`); setCsv(''); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not import')); }
  };
  return (
    <div style={{ ...card, padding: 16 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 800 }}>Import the statement</p>
      <p style={{ margin: '0 0 8px', fontSize: '0.74rem', color: colors.textMuted }}>Paste the CSV of the statement (first row the column names), or choose the file. Then say which column is which. Money in is positive for a bank.</p>
      <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => e.target.files?.[0]?.text().then(setCsv)} style={{ marginBottom: 8 }} />
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder="Date,Details,Ref,Paid in,Paid out,Balance" style={{ ...input, width: '100%', fontFamily: 'monospace' }} />
      {header.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0', alignItems: 'end' }}>
          {pick('date', 'Date')}{pick('description', 'Details')}{pick('reference', 'Reference')}{pick('in', 'Money in')}{pick('out', 'Money out')}{pick('amount', 'or one amount column')}{pick('balance', 'Balance')}
          <label style={{ fontSize: '0.72rem' }}>Date format<br /><select value={m.date_format} onChange={(e) => setM({ ...m, date_format: e.target.value })} style={input}><option value="auto">Find it</option><option value="d/m/Y">31/12/2026</option><option value="Y-m-d">2026-12-31</option><option value="d-m-Y">31-12-2026</option><option value="d M Y">31 Dec 2026</option></select></label>
          <label style={{ fontSize: '0.72rem' }}><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace what is there</label>
          <button type="button" style={btnPrimary} onClick={run} disabled={!m.date || !(m.amount || m.in || m.out)}>Import</button>
        </div>
      )}
    </div>
  );
}

function Session({ id, onBack }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);       // a statement line chosen to match by hand
  const [book, setBook] = useState({});       // line id => ledger to post it against
  const [ledgers, setLedgers] = useState([]);
  const [before, setBefore] = useState('');
  const [reason, setReason] = useState('');
  const load = useCallback(() => booksAPI.reconShow(id).then(setD).catch((e) => toast.error(errMsg(e, 'Could not load'))), [id]);
  useEffect(() => { load(); booksAPI.ledgers({ all: 1 }).then((r) => setLedgers((Array.isArray(r) ? r : r.data ?? []).filter((l) => l.is_active))).catch(() => {}); }, [load]);
  const act = async (action, body, ok) => { try { const r = await booksAPI.reconDo(id, action, body); if (ok) toast.success(typeof ok === 'function' ? ok(r) : ok); setSel(null); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } };
  if (!d) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const { session: s, proof: p } = d;
  const editable = ['open', 'reopened', 'prepared'].includes(s.status);
  const canRec = hasPermission(null, 'books.reconcile');
  const canApprove = hasPermission(null, 'books.reconcile.approve');
  const owner = hasPermission(null, 'books.period');
  const row = (label, v, strong) => <tr><td style={td}>{label}</td><td style={{ ...td, ...num, fontWeight: strong ? 800 : 500 }}>{money(v)}</td></tr>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div><button type="button" style={btnGhost} onClick={onBack}>← All reconciliations</button></div>
      <p style={{ margin: 0, fontWeight: 800 }}>{s.ledger} <span style={{ fontWeight: 400, color: colors.textMuted }}>· to {s.statement_to} · {STATUS[s.status]}</span></p>

      <div style={{ ...card, padding: 16, borderLeft: `5px solid ${p.reconciles ? colors.success : colors.warning}` }}>
        <p style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, color: p.reconciles ? colors.successText : colors.warningText }}>
          {p.reconciles ? <CheckCircle2 size={18} color={colors.success} /> : <AlertTriangle size={18} color={colors.warning} />} {p.reconciles ? 'It reconciles' : `It is out by ${money(Math.abs(p.difference))}`}
        </p>
        <table style={{ borderCollapse: 'collapse', minWidth: 420 }}><tbody>
          {row('Balance on the statement', p.statement_closing)}{row('less: statement lines not in the books yet', -p.unbooked_lines)}{row('Statement, adjusted', p.adjusted_statement, true)}
          {row('Balance in the books', p.book_balance)}{row('less: book entries not on the statement (cheques not cashed, deposits in transit)', -p.outstanding_entries)}{row('Books, adjusted', p.adjusted_book, true)}
        </tbody></table>
      </div>

      {editable && canRec && (
        <>
          <Importer id={id} onDone={load} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={btnPrimary} onClick={() => act('auto-match', {}, (r) => `${r.matched} matched`)}>Match automatically</button>
            <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>Clear entries dated before</span>
            <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} style={input} />
            <button type="button" style={btnGhost} disabled={!before} onClick={() => act('clear-before', { date: before }, (r) => `${r.cleared} entries cleared`)}>Clear them</button>
            <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>For the first reconciliation of a ledger: what earlier statements already cleared.</span>
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 14 }}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', fontWeight: 800 }}>Statement lines <span style={{ fontWeight: 400, color: colors.textFaint }}>({p.counts.matched} matched, {p.counts.unbooked} not in the books)</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Details</th><th style={{ ...th, ...num }}>Amount</th><th style={th}>Match</th></tr></thead>
              <tbody>
                {d.lines.filter((l) => l.match_how !== 'cleared').map((l) => (
                  <tr key={l.id} style={sel === l.id ? { background: colors.tint(0.08) } : undefined}>
                    <td style={td}>{String(l.line_date).slice(0, 10)}</td>
                    <td style={td}>{l.description}{l.reference ? <span style={{ color: colors.textFaint }}> · {l.reference}</span> : null}</td>
                    <td style={{ ...td, ...num }}>{money(l.amount)}</td>
                    <td style={td}>
                      {l.matched_entry_id
                        ? <span style={{ color: colors.successText }}>{l.match_how}{editable && canRec && <button type="button" onClick={() => act('unmatch', { line_id: l.id })} style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', color: colors.danger }}>undo</button>}</span>
                        : editable && canRec && (
                          <div style={{ display: 'grid', gap: 4 }}>
                            <button type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => setSel(sel === l.id ? null : l.id)}>{sel === l.id ? 'Pick an entry →' : 'Match by hand'}</button>
                            <select value={book[l.id] ?? ''} onChange={(e) => setBook({ ...book, [l.id]: e.target.value })} style={{ ...input, fontSize: '0.7rem' }} aria-label="Post it against"><option value="">Post it against…</option>{ledgers.filter((x) => x.id !== s.ledger_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                            {book[l.id] && <button type="button" style={{ ...btnPrimary, padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => act('book-line', { line_id: l.id, ledger_id: Number(book[l.id]) }, 'Posted')}>Post as a journal</button>}
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
                {d.lines.length === 0 && <tr><td colSpan={4} style={{ ...td, color: colors.textMuted }}>Nothing imported yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', fontWeight: 800 }}>Book entries not on the statement <span style={{ fontWeight: 400, color: colors.textFaint }}>({p.counts.outstanding})</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Voucher</th><th style={{ ...th, ...num }}>Amount</th><th /></tr></thead>
              <tbody>
                {d.entries.filter((e) => e.matched_line === null).map((e) => (
                  <tr key={e.id}><td style={td}>{e.date}</td><td style={td}>{e.number} <span style={{ color: colors.textFaint }}>{e.type}{e.narration ? ` · ${e.narration}` : ''}</span></td><td style={{ ...td, ...num }}>{money(e.amount)}</td>
                    <td style={td}>{sel && <button type="button" style={{ ...btnPrimary, padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => act('match', { line_id: sel, entry_id: e.id }, 'Matched')}>Match</button>}</td></tr>
                ))}
                {p.counts.outstanding === 0 && <tr><td colSpan={4} style={{ ...td, color: colors.textMuted }}>Everything in the books is on the statement.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['open', 'reopened'].includes(s.status) && canRec && <button type="button" style={{ ...btnPrimary, opacity: p.reconciles ? 1 : 0.5 }} disabled={!p.reconciles} onClick={() => act('prepare', {}, 'Prepared')}>Prepare for approval</button>}
        {s.status === 'prepared' && canApprove && <button type="button" style={btnPrimary} onClick={() => act('approve', {}, 'Approved')}>Approve</button>}
        {s.status === 'prepared' && <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>Prepared by {s.prepared_by}. {d.second_approver ? 'A second person must approve it.' : ''}</span>}
        {s.status === 'approved' && canApprove && <button type="button" style={btnPrimary} onClick={() => act('lock', {}, 'Locked')}>Lock</button>}
        {['prepared', 'approved', 'locked'].includes(s.status) && owner && (
          <><input placeholder="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...input, width: 220 }} /><button type="button" style={btnGhost} disabled={!reason.trim()} onClick={() => act('reopen', { reason }, 'Reopened')}>Reopen</button></>
        )}
      </div>
      {d.log.length > 0 && <div style={{ fontSize: '0.74rem', color: colors.textMuted }}>{d.log.map((l) => <div key={l.id}>{String(l.created_at).slice(0, 16)} · {l.action} · {l.user_name ?? ''}{l.note ? ` — ${l.note}` : ''}</div>)}</div>}
    </div>
  );
}
