import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import { Field, TextInput, TextArea } from '../../../components/admin/ui/Form';
import booksAPI from '../../../../_shared/api/books';
import memorandaAPI from '../../../../_shared/api/memoranda';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { filterStyle, today } from '../../../components/admin/books/booksFmt';
import { PURPOSES } from '../../../components/admin/books/memoPurposes';
import MemoLines from '../../../components/admin/books/MemoLines';

/** Write a memorandum (or, for finance, change an open one): what it is for, what it says, what it is about, and its debit and credit lines. */
export default function MemorandumForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const finance = canWriteFinance(user);
  const [f, setF] = useState({ date: today(), purpose: 'other', direction: '', amount: '', narration: '', about_voucher_id: params.get('about') ?? '' });
  const [aboutLabel, setAboutLabel] = useState('');
  const [lines, setLines] = useState([{ ledger_id: '', side: 'D', amount: '', narration: '' }, { ledger_id: '', side: 'C', amount: '', narration: '' }]);
  const [ledgers, setLedgers] = useState([]);
  const [find, setFind] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (finance) booksAPI.ledgers({ all: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, [finance]);
  useEffect(() => {
    if (!id) return;
    memorandaAPI.get(id).then((m) => {
      if (m.state !== 'open') { toast.error('Only an open memorandum can be edited.'); nav(`/admin/books/vouchers/${id}`, { replace: true }); return; }
      setF({ date: m.date, purpose: m.purpose, direction: m.direction ?? '', amount: m.amount || '', narration: m.narration, about_voucher_id: m.about?.id ?? '' });
      setAboutLabel(m.about ? `${m.about.number} · ${m.about.type}` : '');
      setLines(m.lines.length ? m.lines.map((l) => ({ ledger_id: l.ledger_id, side: l.side, amount: l.amount, narration: l.narration ?? '' })) : [{ ledger_id: '', side: 'D', amount: '', narration: '' }, { ledger_id: '', side: 'C', amount: '', narration: '' }]);
    }).catch((e) => setErr(errMsg(e, 'Could not load the memorandum')));
  }, [id, nav]);
  useEffect(() => { if (f.about_voucher_id && !aboutLabel) booksAPI.voucher(f.about_voucher_id).then((v) => setAboutLabel(`${v.voucher_number} · ${v.type?.name}`)).catch(() => {}); }, [f.about_voucher_id, aboutLabel]);
  useEffect(() => {
    if (!find.trim()) { setFound([]); return undefined; }
    const t = setTimeout(() => booksAPI.vouchers({ search: find.trim(), per_page: 8 }).then((r) => setFound(r.data ?? [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [find]);

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { ...f, amount: f.amount === '' ? undefined : f.amount, direction: f.direction || null, about_voucher_id: f.about_voucher_id || null,
      ...(finance ? { lines: lines.filter((l) => l.ledger_id || l.amount).map((l) => ({ ...l, ledger_id: l.ledger_id || null })) } : {}) };
    try {
      const r = id ? await memorandaAPI.update(id, body) : await memorandaAPI.create(body);
      toast.success(r.message); nav(`/admin/books/vouchers/${r.data.id}`);
    } catch (x) { setErr(errMsg(x, 'Could not save the memorandum')); }
    finally { setBusy(false); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 860, margin: '0 auto' }}>
        <HubHeader title={id ? 'Edit memorandum' : 'New memorandum'} description="Nothing here touches the books. When it is real, finance converts it into a journal." />
        <form onSubmit={save} style={{ ...card, padding: 20, display: 'grid', gap: 16 }}>
          {err && <p role="alert" style={{ color: colors.dangerText, margin: 0 }}>{err}</p>}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 6 }}>WHAT IS IT FOR</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PURPOSES.map(([k, l]) => (
                <button key={k} type="button" onClick={() => set('purpose')(k)} style={{ ...filterStyle, cursor: 'pointer', fontWeight: f.purpose === k ? 700 : 500, background: f.purpose === k ? colors.tint(0.12) : 'var(--surface-card, #fff)', borderColor: f.purpose === k ? 'var(--color-primary-500)' : undefined }}>{l}</button>
              ))}
            </div>
          </div>
          <Field label="What it says *"><TextArea required rows={4} value={f.narration} onChange={(e) => set('narration')(e.target.value)} placeholder="What was agreed or is expected, and why. Anyone reading this later should understand it." /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
            <Field label="Date"><TextInput type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} /></Field>
            <Field label="Amount (optional)" hint="Filled in from the debit lines if you leave it."><TextInput type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set('amount')(e.target.value)} /></Field>
            <Field label="Money">
              <div style={{ display: 'flex', gap: 6 }}>
                {[['', 'Not sure'], ['in', '▲ In'], ['out', '▼ Out']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => set('direction')(k)} style={{ ...filterStyle, flex: 1, cursor: 'pointer', fontWeight: f.direction === k ? 700 : 500, background: f.direction === k ? colors.tint(0.12) : 'var(--surface-card, #fff)' }}>{l}</button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="About a voucher (optional)">
            {f.about_voucher_id ? (
              <span style={{ ...filterStyle, display: 'inline-flex', gap: 10, alignItems: 'center' }}><strong>{aboutLabel || `Voucher ${f.about_voucher_id}`}</strong>
                <button type="button" onClick={() => { set('about_voucher_id')(''); setAboutLabel(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--status-error, #ef4444)', fontWeight: 700 }}>remove</button></span>
            ) : (
              <div style={{ position: 'relative' }}>
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Type a voucher number…" style={{ ...filterStyle, width: '100%', boxSizing: 'border-box' }} />
                {found.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, top: '100%', marginTop: 4, ...card, maxHeight: 220, overflowY: 'auto' }}>
                    {found.map((v) => <button key={v.id} type="button" onClick={() => { set('about_voucher_id')(v.id); setAboutLabel(`${v.voucher_number} · ${v.type?.name}`); setFind(''); setFound([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: '0.8rem' }}><span style={{ fontFamily: 'monospace' }}>{v.voucher_number}</span> <span style={{ color: colors.textFaint }}>· {v.type?.name} · {v.party_ledger?.name ?? ''}</span></button>)}
                  </div>
                )}
              </div>
            )}
          </Field>
          {finance ? (
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 6 }}>DEBIT AND CREDIT LINES <span style={{ fontWeight: 400 }}>· needed (and equal) before it can be converted</span></div>
              <MemoLines lines={lines} onChange={setLines} ledgers={ledgers} />
            </div>
          ) : <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Finance adds the debit and credit lines when they look at it.</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link to="/admin/books/memoranda" style={{ ...btnGhost, textDecoration: 'none' }}>Cancel</Link>
            <button type="submit" style={btnPrimary} disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Save memorandum'}</button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
