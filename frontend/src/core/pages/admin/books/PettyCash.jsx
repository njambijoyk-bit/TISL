import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import pettyCashAPI from '../../../../_shared/api/pettyCash';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money, today } from '../../../components/admin/books/booksFmt';

/**
 * Petty cash. The box is a cash ledger marked "petty" (Books → Chart of accounts). Finance sets its float and custodian and tops it up from the bank;
 * the custodian records each payment as a petty cash voucher — who was paid, what for, the expense, the receipt. Nothing can be spent that the box does not hold.
 */

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };

function SpendModal({ box, expense, onClose, onDone }) {
  const [f, setF] = useState({ payee: '', purpose: '', expense_ledger_id: '', amount: '', spent_on: today() });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await pettyCashAPI.spend({ ...f, ledger_id: box.ledger_id }, file); toast.success(r.message); onDone(); } catch (x) { setErr(errMsg(x, 'Could not record it')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Petty cash voucher — ${box.name}`} subtitle={`The box holds ${money(box.balance)}.`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Paid to"><TextInput required value={f.payee} onChange={(e) => set('payee', e.target.value)} placeholder="Mary Wanjiku" /></Field>
          <Field label="What for"><TextInput required value={f.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Office stationery" /></Field>
          <Field label="Expense account"><SelectInput required value={f.expense_ledger_id} onChange={(e) => set('expense_ledger_id', e.target.value)}><option value="">Choose…</option>{expense.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Amount"><NumberInput required min="0.01" step="0.01" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Date"><TextInput type="date" max={today()} value={f.spent_on} onChange={(e) => set('spent_on', e.target.value)} /></Field></div>
          </div>
          <Field label="Receipt (photo, optional)"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Record" busyLabel="Saving…" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function TopUpModal({ box, sources, onClose, onDone }) {
  const [from, setFrom] = useState(sources[0]?.id ?? '');
  const [amount, setAmount] = useState(box.to_top_up > 0 ? String(box.to_top_up) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await pettyCashAPI.topUp({ ledger_id: box.ledger_id, from_ledger_id: Number(from), amount: amount === '' ? undefined : Number(amount) }); toast.success(r.message); onDone(); } catch (x) { setErr(errMsg(x, 'Could not top up')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Top up ${box.name}`} subtitle={box.float > 0 ? `Float ${money(box.float)} · holds ${money(box.balance)} · to reach the float: ${money(box.to_top_up)}` : 'No float set — enter the amount.'} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Take it from"><SelectInput required value={from} onChange={(e) => setFrom(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.balance)}</option>)}</SelectInput></Field>
          <Field label="Amount"><NumberInput min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Up to the float" /></Field>
          <ModalActions onCancel={onClose} submitLabel="Top up" busyLabel="Saving…" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function FloatModal({ box, staff, onClose, onDone }) {
  const [amt, setAmt] = useState(String(box.float || ''));
  const [who, setWho] = useState(box.custodian_user_id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await pettyCashAPI.setFloat({ ledger_id: box.ledger_id, float_amount: Number(amt), custodian_user_id: who ? Number(who) : null }); toast.success('Saved'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Float and custodian — ${box.name}`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Float (what the box should hold)"><NumberInput required min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
          <Field label="Custodian (looks after it and records spending)"><SelectInput value={who} onChange={(e) => setWho(e.target.value)}><option value="">Nobody — finance only</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>
          <ModalActions onCancel={onClose} submitLabel="Save" busyLabel="Saving…" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function PettyCash() {
  const [data, setData] = useState(null);
  const [opts, setOpts] = useState({ expense: [], sources: [], staff: [] });
  const [modal, setModal] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => pettyCashAPI.list().then(setData).catch((e) => setError(errMsg(e, 'Could not load petty cash'))), []);
  useEffect(() => { load(); pettyCashAPI.options().then(setOpts).catch(() => {}); }, [load]);
  const done = () => { setModal(null); load(); };
  const cancel = async (h) => {
    if (!window.confirm(`Cancel ${h.number}? The money goes back into the box.`)) return;
    try { toast.success((await pettyCashAPI.cancel(h.id)).message); load(); } catch (e) { toast.error(errMsg(e, 'Could not cancel')); }
  };
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="Petty cash" description="Small payments from the box. Every payment is a petty cash voucher with a receipt; finance tops the box up to its float from the bank." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {!data && !error && <p style={{ color: colors.textMuted }}>Loading…</p>}
        {data && !data.table_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 62_petty_cash.sql to use petty cash.</p>}
        {data && !data.boxes.length && (
          <p style={{ ...card, padding: 18, fontSize: '0.84rem', color: colors.textMuted }}>
            {data.is_manager ? <>There is no petty cash box yet. In <Link to="/admin/books?tab=accounts">Books → Chart of accounts</Link>, add a ledger under Cash-in-hand and mark it as <strong>Petty cash</strong>.</> : 'No petty cash box is assigned to you.'}
          </p>
        )}
        <div style={{ display: 'grid', gap: 16 }}>
          {data?.boxes.map((b) => (
            <section key={b.ledger_id} style={{ ...card, padding: 18 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div><div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{b.name}</div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{money(b.balance)}</div></div>
                <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Float {b.float > 0 ? money(b.float) : 'not set'}{b.to_top_up > 0 ? ` · needs ${money(b.to_top_up)} to reach it` : ''}<br />Custodian: {b.custodian ?? 'nobody'}</div>
                <div style={{ marginLeft: 'auto' }}>
                  {b.can_spend && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'spend', box: b })}>Record a payment</button>}{' '}
                  {data.is_manager && <><button type="button" style={small} onClick={() => setModal({ kind: 'top', box: b })}>Top up</button><button type="button" style={small} onClick={() => setModal({ kind: 'float', box: b })}>Float & custodian</button></>}
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead><tr><th style={th}>Voucher</th><th style={th}>Date</th><th style={th}>Paid to / for</th><th style={th}>Expense</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th} /></tr></thead>
                <tbody>
                  {data.history.filter((h) => h.ledger_id === b.ledger_id).map((h) => (
                    <tr key={h.id} style={{ opacity: h.cancelled ? 0.5 : 1 }}>
                      <td style={td}>{h.number}{h.cancelled ? ' (cancelled)' : ''}</td>
                      <td style={td}>{h.date}</td>
                      <td style={td}><strong>{h.payee}</strong><br /><span style={{ color: colors.textFaint }}>{h.purpose}</span></td>
                      <td style={td}>{h.expense}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(h.amount)}</td>
                      <td style={td}>{h.receipt_url && <a href={h.receipt_url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>Receipt</a>}{b.can_spend && !h.cancelled && <button type="button" style={small} onClick={() => cancel(h)}>Cancel</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        {modal?.kind === 'spend' && <SpendModal box={modal.box} expense={opts.expense} onClose={() => setModal(null)} onDone={done} />}
        {modal?.kind === 'top' && <TopUpModal box={modal.box} sources={opts.sources} onClose={() => setModal(null)} onDone={done} />}
        {modal?.kind === 'float' && <FloatModal box={modal.box} staff={opts.staff} onClose={() => setModal(null)} onDone={done} />}
      </div>
    </AdminLayout>
  );
}
