import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import useCurrencyStore from '../../../../_shared/store/currencyStore';
import { useBaseCode } from '../../../../_shared/lib/baseCurrency';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, FormGrid, FormStack, ModalActions, FormError } from '../ui/Form';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import { btnPrimary, btnGhost, colors } from '../../../../_shared/theme/tokens';
import { Chip } from './booksUi';
import { money, filterStyle } from './booksFmt';

const STATUS_TONE = { active: 'posted', used: 'closed', expired: 'closed', cancelled: 'cancelled' };

function IssueForm({ onClose, onSaved }) {
  useBaseCode();
  const currencies = useCurrencyStore((s) => s.currencies);
  const [methods, setMethods] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ source: 'manual', amount: '', currency_id: '', customer: null, payment_method_id: '', party_ledger_id: '', expires_at: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    booksAPI.paymentMethods().then((m) => setMethods(m.filter((x) => x.is_active && x.kind !== 'gift_voucher'))).catch(() => {});
    booksAPI.ledgers({ all: 1, group: 'Sundry Debtors' }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (q.length < 2) { setCustomers([]); return undefined; }
    const t = setTimeout(() => booksAPI.lookup('customer', q).then(setCustomers).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    try {
      await booksAPI.issueGiftVoucher({
        source: f.source, amount: Number(f.amount), currency_id: f.currency_id || undefined, customer_id: f.customer?.customer_id || undefined,
        payment_method_id: f.source === 'sale' ? f.payment_method_id : undefined, party_ledger_id: f.source === 'customer_account' ? f.party_ledger_id : undefined,
        expires_at: f.expires_at || undefined, note: f.note || undefined,
      });
      toast.success('Gift voucher issued'); onSaved(); onClose();
    } catch (x) { setErrs(fieldErrors(x)); if (!x.response?.data?.errors) setErr(errMsg(x, 'Could not issue the gift voucher')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Issue a gift voucher" subtitle="Creates a code the customer can spend at checkout. The value is booked to Gift Vouchers Liability." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <Field label="Where does the value come from?" error={errs.source}>
            <SelectInput value={f.source} onChange={(e) => set('source')(e.target.value)}>
              <option value="manual">A goodwill / reward (expense)</option>
              <option value="promo">A promotion (expense)</option>
              <option value="sale">Someone bought it (money received)</option>
              <option value="customer_account">From the customer's account balance</option>
            </SelectInput>
          </Field>
          {f.source === 'sale' && (
            <Field label="Paid with" error={errs.payment_method_id}>
              <SelectInput required value={f.payment_method_id} onChange={(e) => set('payment_method_id')(e.target.value)}><option value="">Choose…</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput>
            </Field>
          )}
          {f.source === 'customer_account' && (
            <Field label="Customer account" error={errs.party_ledger_id}>
              <SelectInput required value={f.party_ledger_id} onChange={(e) => set('party_ledger_id')(e.target.value)}><option value="">Choose…</option>{ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput>
            </Field>
          )}
          <FormGrid min={160}>
            <Field label="Amount" error={errs.amount}><NumberInput required min="0.01" step="0.01" value={f.amount} onChange={(e) => set('amount')(e.target.value)} /></Field>
            <Field label="Currency" error={errs.currency_id}>
              <SelectInput value={f.currency_id} onChange={(e) => set('currency_id')(e.target.value)}><option value="">Base currency</option>{currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</SelectInput>
            </Field>
          </FormGrid>
          <Field label="Holder (optional)" hint="Leave empty for a bearer voucher anyone with the code can use.">
            {f.customer ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{f.customer.name}</strong><button type="button" style={{ ...btnGhost, padding: '2px 8px' }} onClick={() => set('customer')(null)}>Change</button></div>
            ) : (
              <>
                <TextInput placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} />
                {customers.map((c) => <button key={c.customer_id} type="button" onClick={() => { set('customer')(c); setQ(''); setCustomers([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}>{c.name} <span style={{ color: colors.textFaint }}>{c.email}</span></button>)}
              </>
            )}
          </Field>
          <FormGrid min={160}>
            <Field label="Expires" error={errs.expires_at}><TextInput type="date" value={f.expires_at} onChange={(e) => set('expires_at')(e.target.value)} /></Field>
            <Field label="Note"><TextInput value={f.note} onChange={(e) => set('note')(e.target.value)} /></Field>
          </FormGrid>
          <ModalActions onCancel={onClose} submitLabel="Issue" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function Detail({ id, canWrite, onClose, onChanged }) {
  const [gv, setGv] = useState(null);
  useEffect(() => { booksAPI.giftVoucher(id).then(setGv).catch((e) => toast.error(errMsg(e, 'Could not load the gift voucher'))); }, [id]);
  const cancel = async () => {
    if (!confirm(`Cancel ${gv.code}? The unspent ${money(gv.balance)} goes back to where it came from.`)) return;
    try { await booksAPI.cancelGiftVoucher(id); toast.success('Cancelled'); onChanged(); onClose(); } catch (e) { toast.error(errMsg(e, 'Could not cancel'), { duration: 7000 }); }
  };
  if (!gv) return null;
  return (
    <Modal title={gv.code} subtitle={`${gv.currency?.code} ${money(gv.balance)} left of ${money(gv.initial_amount)}${gv.expires_at ? ` · expires ${gv.expires_at}` : ''}`} onClose={onClose} width={560}>
      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: colors.textMuted }}>Holder: {gv.customer ? `${gv.customer.first_name ?? ''} ${gv.customer.last_name ?? ''}` : 'bearer'} · source: {gv.source}</p>
      <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
        <tbody>
          {gv.transactions.map((t) => (
            <tr key={t.id} style={{ borderTop: `1px solid ${colors.tint(0.06)}` }}>
              <td style={{ padding: 6 }}>{new Date(t.created_at).toLocaleString()}</td><td>{t.type.replace('_', ' ')}</td>
              <td style={{ textAlign: 'right' }}>{money(t.amount)}</td><td style={{ textAlign: 'right', color: colors.textFaint }}>{money(t.balance_after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && gv.status === 'active' && <div style={{ marginTop: 14 }}><button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={cancel}>Cancel this voucher</button></div>}
    </Modal>
  );
}

export default function GiftVouchersTab({ canWrite }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [issue, setIssue] = useState(false);
  const [detail, setDetail] = useState(null);
  const [rec, setRec] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await booksAPI.giftVouchers({ status: status || undefined, search: search || undefined }); setRows(r.data ?? []); }
    catch (e) { toast.error(errMsg(e, 'Could not load gift vouchers')); }
    finally { setLoading(false); }
    booksAPI.reconcileGiftVouchers().then(setRec).catch(() => setRec(null));
  }, [status, search]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'code', label: 'Code', render: (g) => <strong style={{ fontFamily: 'monospace', color: colors.text }}>{g.code}</strong> },
    { key: 'holder', label: 'Holder', render: (g) => (g.customer ? `${g.customer.first_name ?? ''} ${g.customer.last_name ?? ''}`.trim() || g.customer.email : 'Bearer') },
    { key: 'source', label: 'Source', render: (g) => g.source },
    { key: 'status', label: 'Status', render: (g) => <Chip status={STATUS_TONE[g.status] ?? g.status} /> },
    { key: 'expires', label: 'Expires', render: (g) => g.expires_at ?? '—' },
    { key: 'balance', label: 'Balance', align: 'right', render: (g) => `${g.currency?.code ?? ''} ${money(g.balance)}` },
  ];

  return (
    <div>
      {rec && !rec.balanced && <p role="alert" style={{ padding: '10px 14px', borderRadius: 8, background: colors.warningBg, color: colors.warningText, fontSize: '0.82rem' }}>The gift vouchers add up to {money(rec.sub_ledger)} but the ledger holds {money(rec.ledger)} — a difference of {money(rec.difference)}. Check for a manual journal to Gift Vouchers Liability.</p>}
      <Toolbar right={<>
        {canWrite && <button type="button" style={btnGhost} onClick={async () => { try { const r = await booksAPI.expireGiftVouchers(); toast.success(`${r.count} expired`); load(); } catch (e) { toast.error(errMsg(e, 'Could not expire vouchers')); } }}>Expire due vouchers</button>}
        {canWrite && <button type="button" style={btnPrimary} onClick={() => setIssue(true)}><Plus size={14} /> Issue gift voucher</button>}
      </>}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code…" style={{ ...filterStyle, width: 200 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={filterStyle} aria-label="Status">
          <option value="">Any status</option><option value="active">Active</option><option value="used">Used</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option>
        </select>
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={(g) => setDetail(g.id)} empty="No gift vouchers yet." />
      {issue && <IssueForm onClose={() => setIssue(false)} onSaved={load} />}
      {detail && <Detail id={detail} canWrite={canWrite} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  );
}
