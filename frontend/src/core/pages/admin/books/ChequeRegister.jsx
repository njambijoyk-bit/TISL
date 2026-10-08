import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import booksAPI from '../../../../_shared/api/books';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance, hasPermission } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { Chip } from '../../../components/admin/books/booksUi';
import { money } from '../../../components/admin/books/booksFmt';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const TABS = [['in_hand', 'In hand'], ['post_dated', 'Post-dated'], ['deposited', 'Deposited'], ['issued', 'Issued'], ['bounced', 'Bounced'], ['cleared', 'Cleared'], ['all', 'All']];
const LABEL = { deposit: 'Deposit', clear: 'Clear', undo: 'Undo', bounce: 'Bounced' };

function BounceModal({ cheque, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [bankFee, setBankFee] = useState('');
  const [bill, setBill] = useState(true);
  const [billFee, setBillFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const charged = bill ? (billFee === '' ? Number(bankFee) || 0 : Number(billFee)) : 0;
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await booksAPI.chequeBounce(cheque.id, { reason, bank_fee: Number(bankFee) || 0, bill_fee: bill ? (billFee === '' ? undefined : Number(billFee)) : 0 });
      toast.success(res.message); onDone(res);
    } catch (x) { setErr(errMsg(x, 'Could not record the bounce')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Cheque ${cheque.number} bounced`} subtitle={`${cheque.party ?? ''} · ${money(cheque.amount)} · on ${cheque.voucher_number}. Cancel the journal it creates to undo this.`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Why did it bounce?"><TextInput required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Insufficient funds, account closed, stopped…" /></Field>
          <Field label="Fee the bank charged us" hint="Leave blank if none."><NumberInput min="0" step="0.01" value={bankFee} onChange={(e) => setBankFee(e.target.value)} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}><input type="checkbox" checked={bill} onChange={(e) => setBill(e.target.checked)} /> Bill the customer for the fee</label>
          {bill && <Field label="Amount billed to the customer" hint="Blank = the same as the bank's fee."><NumberInput min="0" step="0.01" value={billFee} onChange={(e) => setBillFee(e.target.value)} placeholder={bankFee || '0'} /></Field>}
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
            The customer will owe the cheque again ({money(cheque.amount)} — the invoices it paid open again){charged > 0 ? `, plus a ${money(charged)} fee as its own bill` : ''}. Loyalty points earned on this money are taken off.
          </p>
          <ModalActions onCancel={onClose} submitLabel="Record the bounce" busyLabel="Saving…" busy={busy} danger />
        </FormStack>
      </form>
    </Modal>
  );
}

/** Cheques we hold, have banked, have written, or that came back — with what can be done to each. */
export default function ChequeRegister() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('in_hand');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [bounce, setBounce] = useState(null);
  const canMove = canWriteFinance(user);
  const canBounce = hasPermission(user, 'books.bounce');

  const load = useCallback(() => booksAPI.cheques({ status: tab, search: search || undefined }).then((d) => { setData(d); setErr(null); }).catch((e) => setErr(errMsg(e, 'Could not load the cheques'))), [tab, search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const act = async (c, action) => {
    if (action === 'bounce') { setBounce(c); return; }
    try { const res = await booksAPI.chequeMove(c.id, { action }); toast.success(res.message); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not do that'), { duration: 7000 }); }
  };
  const s = data?.summary;
  const count = (k) => (s && s[k] ? ` (${s[k].n})` : '');
  const when = (c) => (c.post_dated ? `post-dated · in ${c.days_to_date}d` : c.status === 'received' && c.days_to_date < 0 ? `${-c.days_to_date}d ago` : '');

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canReadFinance(user) ? <NoAccess what="the cheque register" /> : (
          <>
            <HubHeader title="Cheque register" description="Cheques received and written: in hand, post-dated, deposited, cleared or bounced." />
            {s && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, margin: '12px 0' }}>
                {[['in_hand', 'Holding'], ['post_dated', 'Post-dated'], ['deposited', 'Awaiting the bank'], ['issued', 'Issued, not cleared'], ['bounced', 'Bounced']].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setTab(k)} style={{ ...card, padding: 12, textAlign: 'left', cursor: 'pointer', border: tab === k ? `2px solid ${colors.primary}` : undefined }}>
                    <div style={{ fontSize: '0.68rem', color: colors.textFaint, fontWeight: 700 }}>{label.toUpperCase()}</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: k === 'bounced' && s[k].n ? colors.dangerText : colors.text }}>{money(s[k].amount)}</div>
                    <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{s[k].n} cheque{s[k].n === 1 ? '' : 's'}</div>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 12px' }}>
              {TABS.map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', fontWeight: tab === k ? 800 : 500, color: tab === k ? colors.primary : undefined }}>{label}{k !== 'all' ? count(k) : ''}</button>)}
              <input placeholder="Search cheque no., customer, voucher…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.15)}`, minWidth: 240 }} />
            </div>
            {err && <p role="alert" style={{ color: colors.dangerText }}>{err}</p>}
            <div style={{ ...card, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr><th style={th}>Cheque</th><th style={th}>Customer / payee</th><th style={th}>Drawn on → our bank</th><th style={th}>Voucher</th><th style={th}>Cheque date</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Status</th><th style={th} /></tr></thead>
                <tbody>
                  {data === null && <tr><td style={td} colSpan={8}>Loading…</td></tr>}
                  {data && data.rows.length === 0 && <tr><td style={{ ...td, color: colors.textMuted }} colSpan={8}>No cheques here.</td></tr>}
                  {(data?.rows ?? []).map((c) => (
                    <tr key={c.id}>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{c.number}<div style={{ fontFamily: 'inherit', fontWeight: 400, fontSize: '0.68rem', color: colors.textFaint }}>{c.direction === 'in' ? 'received' : 'written by us'}</div></td>
                      <td style={td}>{c.party ?? '—'}</td>
                      <td style={td}>{c.direction === 'in' ? `${c.bank_name ?? '—'} → ${c.our_bank}` : `${c.our_bank}${c.bank_name ? ` → ${c.bank_name}` : ''}`}</td>
                      <td style={td}><Link to={`/admin/books/vouchers/${c.voucher_id}`}>{c.voucher_number}</Link>{c.bounce_voucher_id && <div><Link to={`/admin/books/vouchers/${c.bounce_voucher_id}`} style={{ fontSize: '0.7rem' }}>bounce entry</Link></div>}</td>
                      <td style={td}>{c.cheque_date}{when(c) && <div style={{ fontSize: '0.68rem', color: c.post_dated ? colors.warningText : colors.textFaint }}>{when(c)}</div>}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(c.amount)}</td>
                      <td style={td}><Chip status={c.status} />{c.bounce_reason && <div style={{ fontSize: '0.68rem', color: colors.dangerText, maxWidth: 160 }}>{c.bounce_reason}</div>}{c.deposited_on && c.status !== 'received' && <div style={{ fontSize: '0.68rem', color: colors.textFaint }}>banked {c.deposited_on}</div>}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {c.actions.filter((a) => (a === 'bounce' ? canBounce : canMove)).map((a) => (
                          <button key={a} type="button" onClick={() => act(c, a)} style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.72rem', marginLeft: 4, color: a === 'bounce' ? colors.dangerText : undefined }}>{LABEL[a]}</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {bounce && <BounceModal cheque={bounce} onClose={() => setBounce(null)} onDone={() => { setBounce(null); load(); }} />}
    </AdminLayout>
  );
}
