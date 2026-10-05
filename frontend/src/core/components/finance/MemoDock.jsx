import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NotebookPen, X, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../../_shared/store/authStore';
import useDragPosition from '../../../_shared/hooks/useDragPosition';
import useMemoStore from '../../../_shared/store/memoStore';
import memorandaAPI from '../../../_shared/api/memoranda';
import booksAPI from '../../../_shared/api/books';
import { canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import MemoLines from '../admin/books/MemoLines';
import { StateChip, PurposeChip } from '../admin/books/memoBits';
import { PURPOSES } from '../admin/books/memoPurposes';

const field = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: '1.5px solid var(--line)', background: 'var(--surface-input, var(--surface-card))', color: 'var(--text-primary)', font: 'inherit', fontSize: '0.84rem' };
const small = { fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: '0 0 6px' };
const chip = (on) => ({ cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)' : 'transparent', fontWeight: on ? 700 : 500 });

/**
 * The Memo dock: a tab on the right edge of every staff page that opens a side panel for writing a memorandum without leaving what you are doing.
 * A memorandum posts nothing; finance later turns the real ones into journals. On a voucher page it offers to link the note to that voucher,
 * and "Open" lists the memoranda still waiting. (Alt+M opens and closes it.)
 */
export default function MemoDock() {
  const user = useAuthStore((s) => s.user);
  const staff = user && !['customer', 'applicant'].includes(user.role);
  if (!staff) return null;
  return <Dock user={user} />;
}

function Dock({ user }) {
  const { isOpen, tab, draft, open, close, toggle, setTab, update, clear } = useMemoStore();
  const finance = canWriteFinance(user);
  const { pathname } = useLocation();
  const here = useMemo(() => { const m = /^\/admin\/books\/vouchers\/(\d+)$/.exec(pathname); return m ? Number(m[1]) : null; }, [pathname]);   // the voucher being looked at
  const [hereLabel, setHereLabel] = useState('');
  const [list, setList] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [showLines, setShowLines] = useState(false);
  const [busy, setBusy] = useState(false);
  const tabDrag = useDragPosition('memo-tab-pos');
  const panelDrag = useDragPosition('memo-panel-pos');

  const refresh = useCallback(() => memorandaAPI.list({ state: 'open', per_page: 50 }).then((r) => setList(r.data ?? [])).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (isOpen && tab === 'open') refresh(); }, [isOpen, tab, refresh]);
  useEffect(() => { if (here && finance) booksAPI.voucher(here).then((v) => setHereLabel(`${v.voucher_number} · ${v.type?.name}`)).catch(() => setHereLabel('')); else setHereLabel(''); }, [here, finance]);
  useEffect(() => { if (showLines && finance && ledgers.length === 0) booksAPI.ledgers({ all: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, [showLines, finance, ledgers.length]);
  useEffect(() => {
    const key = (e) => { if (e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggle(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [toggle]);

  const linked = here !== null && Number(draft.about_voucher_id) === here;
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...draft, amount: draft.amount === '' ? undefined : draft.amount, direction: draft.direction || null, about_voucher_id: draft.about_voucher_id || null,
        ...(finance ? { lines: (draft.lines ?? []).filter((l) => l.ledger_id || l.amount).map((l) => ({ ...l, ledger_id: l.ledger_id || null })) } : {}) };
      const r = await memorandaAPI.create(body);
      toast.success(`${r.data.number} saved`);
      clear(); setShowLines(false); refresh(); setTab('open');
    } catch (e) { toast.error(errMsg(e, 'Could not save the memorandum'), { duration: 7000 }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {!isOpen && (
        <button type="button" ref={tabDrag.ref} {...tabDrag.handleProps} onClick={() => { if (!tabDrag.wasDragged()) open(); }} title="Write a memorandum (Alt+M). Drag to move, double-click to put back." aria-label="Open the memo panel"
          style={{ ...tabDrag.handleProps.style, position: 'fixed', right: 0, top: 120, ...tabDrag.style, zIndex: 9000, width: 34, padding: '12px 0', border: '1px solid var(--line)', borderRight: tabDrag.pos ? '1px solid var(--line)' : 'none', borderRadius: tabDrag.pos ? 10 : '10px 0 0 10px',
            background: 'var(--surface-card, #fff)', color: 'var(--color-primary-500)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, boxShadow: '-2px 2px 12px rgba(0,0,0,0.18)' }}>
          <NotebookPen size={15} />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Memo</span>
          {list.length > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-primary-500)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{list.length}</span>}
        </button>
      )}

      {isOpen && (
        <>
          <aside ref={panelDrag.ref} role="dialog" aria-label="Memorandum" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9990, width: 'min(400px, 100vw)', display: 'flex', flexDirection: 'column',
            background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', borderLeft: '1px solid var(--line)', boxShadow: '-12px 0 40px rgba(0,0,0,0.35)', fontFamily: 'var(--font-body, inherit)',
            ...(panelDrag.pos ? { height: 'min(640px, calc(100vh - 32px))', bottom: 'auto', border: '1px solid var(--line)', borderRadius: 14 } : {}), ...panelDrag.style }}>
            <header {...panelDrag.handleProps} title="Drag to move, double-click to put back" style={{ ...panelDrag.handleProps.style, padding: '16px 18px 10px', borderBottom: '1px solid var(--line)', borderRadius: panelDrag.pos ? '14px 14px 0 0' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NotebookPen size={17} color="var(--color-primary-500)" />
                <strong style={{ fontSize: '1rem', flex: 1 }}>Memorandum</strong>
                <button type="button" onClick={close} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={18} /></button>
              </div>
              <p style={{ margin: '4px 0 10px', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>A note with debit and credit lines. It posts nothing to the books; finance turns the real ones into journals.</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['write', 'Write'], ['open', `Open${list.length ? ` · ${list.length}` : ''}`]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit',
                    background: tab === k ? 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)' : 'transparent', color: tab === k ? 'var(--color-primary-500)' : 'var(--text-secondary)' }}>{l}</button>
                ))}
              </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
              {tab === 'write' ? (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <p style={small}>What is it for</p>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {PURPOSES.map(([k, l]) => <button key={k} type="button" onClick={() => update({ purpose: k })} style={{ ...chip(draft.purpose === k), padding: '4px 10px', borderRadius: 14, fontSize: '0.72rem' }}>{l}</button>)}
                    </div>
                  </div>
                  <div>
                    <p style={small}>What it says</p>
                    <textarea rows={5} value={draft.narration} onChange={(e) => update({ narration: e.target.value })} placeholder="What was agreed or is expected, and why." style={{ ...field, resize: 'vertical' }} autoFocus />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><p style={small}>Money</p>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {[['', '—'], ['in', '▲ In'], ['out', '▼ Out']].map(([k, l]) => <button key={k} type="button" onClick={() => update({ direction: k })} style={{ ...chip(draft.direction === k), flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.74rem' }}>{l}</button>)}
                      </div>
                    </div>
                    <div><p style={small}>Amount</p><input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => update({ amount: e.target.value })} placeholder="optional" style={{ ...field, textAlign: 'right' }} /></div>
                  </div>

                  {here && (
                    <button type="button" onClick={() => update({ about_voucher_id: linked ? '' : here })}
                      style={{ ...chip(linked), display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, fontSize: '0.78rem', textAlign: 'left', fontWeight: 500 }}>
                      <Link2 size={15} color="var(--color-primary-500)" />
                      <span style={{ flex: 1 }}>{linked ? 'About' : 'Link to'} <strong>{hereLabel || `this voucher (#${here})`}</strong></span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{linked ? 'linked ✓' : 'tap to link'}</span>
                    </button>
                  )}

                  {finance && (
                    <div>
                      <button type="button" onClick={() => setShowLines((x) => !x)} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 700, padding: 0 }}>
                        {showLines ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Debit and credit lines <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(so it can be converted)</span>
                      </button>
                      {showLines && <div style={{ marginTop: 10 }}><MemoLines compact lines={draft.lines ?? []} onChange={(lines) => update({ lines })} ledgers={ledgers} /></div>}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {list.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Nothing is waiting. {finance ? 'Every memorandum has been converted or dismissed.' : ''}</p>}
                  {list.map((m) => (
                    <div key={m.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-hover, transparent)' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                        {finance ? <Link to={`/admin/books/vouchers/${m.id}`} onClick={close} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: 'inherit' }}>{m.number}</Link> : <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem' }}>{m.number}</span>}
                        <PurposeChip label={m.purpose_label} /> <StateChip state={m.state} />
                        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{m.date}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.narration.length > 160 ? `${m.narration.slice(0, 160)}…` : m.narration}</div>
                      {m.about && finance && <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>about <Link to={`/admin/books/vouchers/${m.about.id}`} onClick={close} style={{ fontFamily: 'monospace', color: 'inherit' }}>{m.about.number}</Link></div>}
                    </div>
                  ))}
                  {finance && <Link to="/admin/books/memoranda" onClick={close} style={{ marginTop: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-primary-500)', textDecoration: 'none' }}>Open the register →</Link>}
                </div>
              )}
            </div>

            {tab === 'write' && (
              <footer style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', flex: 1 }}>{draft.narration ? 'Draft kept on this device' : ''}</span>
                {draft.narration && <button type="button" onClick={() => { clear(); setShowLines(false); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Clear</button>}
                <button type="button" onClick={save} disabled={busy || !draft.narration.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.8rem', color: '#fff',
                  background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', opacity: busy || !draft.narration.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save memorandum'}</button>
              </footer>
            )}
          </aside>
        </>
      )}
    </>
  );
}
