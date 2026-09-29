import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, ChevronDown, Lock, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, FormGrid, FormStack, ModalActions, FormError, CheckboxRow } from '../ui/Form';
import SimpleTable from '../ui/SimpleTable';
import CurrencySelect from './CurrencySelect';
import taxAPI from '../../../../_shared/api/tax';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const NATURE = { asset: 'Asset', liability: 'Liability', income: 'Income', expense: 'Expense' };

function flat(groups, depth = 0, out = []) {
  groups.forEach((g) => { out.push({ ...g, depth }); flat(g.children ?? [], depth + 1, out); });
  return out;
}

function GroupNode({ g, depth, selected, onSelect, open, toggle }) {
  const isOpen = open[g.id] ?? depth < 1;
  const has = (g.children ?? []).length > 0;
  return (
    <div>
      <div onClick={() => onSelect(g)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(g)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
          background: selected === g.id ? colors.tint(0.1) : 'transparent', color: colors.text, fontWeight: g.is_primary ? 700 : 500 }}>
        <span onClick={(e) => { e.stopPropagation(); toggle(g.id, isOpen); }} style={{ width: 16, display: 'inline-flex', color: colors.textFaint }}>
          {has ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        <span style={{ flex: 1 }}>{g.name}</span>
        {g.is_system && <Lock size={11} color={colors.textGhost} aria-label="System group" />}
        <span style={{ fontSize: '0.68rem', color: colors.textFaint }}>{g.ledger_count || ''}</span>
      </div>
      {has && isOpen && g.children.map((c) => <GroupNode key={c.id} g={c} depth={depth + 1} selected={selected} onSelect={onSelect} open={open} toggle={toggle} />)}
    </div>
  );
}

function LedgerForm({ ledger, groups, defaultGroupId, onClose, onSaved }) {
  const editing = Boolean(ledger);
  const [f, setF] = useState({
    name: ledger?.name ?? '', group_id: ledger?.group_id ?? defaultGroupId ?? '', code: ledger?.code ?? '',
    opening_balance: ledger?.opening_balance ?? 0, opening_side: ledger?.opening_side ?? 'D', notes: ledger?.notes ?? '', is_active: ledger?.is_active ?? true,
    currency_id: ledger?.currency_id ?? '', rate_type: ledger?.rate_type ?? '', rate_value: ledger?.rate_value ?? '', valid_from: ledger?.valid_from ?? '', valid_until: ledger?.valid_until ?? '',
    tax_nature: ledger?.tax_nature ?? '', tax_rate_ledger_id: ledger?.tax_rate_ledger_id ?? '', affects_stock: ledger?.affects_stock ?? false,
    bank_name: ledger?.bank_name ?? '', account_number: ledger?.account_number ?? '', branch: ledger?.branch ?? '',
    min_amount: ledger?.min_amount ?? '', max_amount: ledger?.max_amount ?? '', free_above: ledger?.free_above ?? '', transit_days: ledger?.transit_days ?? '', side: ledger?.side ?? 'income',
    charge_kind: ledger?.settings?.charge_kind ?? 'other', timing: ledger?.settings?.timing ?? 'on_win', refundable: ledger?.settings?.refundable ?? false,
    default_on: ledger?.settings?.default_on ?? false, free_days: ledger?.settings?.free_days ?? 0, tax_follows: ledger?.settings?.tax_follows ?? 'own',
  });
  // The group decides which fields exist (Tally: the group carries the behaviour).
  const behaviour = flat(groups).find((g) => String(g.id) === String(f.group_id))?.behaviour ?? 'standard';
  const rated = behaviour === 'tax' || behaviour === 'delivery';
  const expense = behaviour === 'delivery' && f.side === 'expense';
  const trading = behaviour === 'sales' || behaviour === 'purchase';
  const charging = behaviour === 'charge';
  const taxed = trading || charging;
  const bankish = behaviour === 'bank';
  const [rateChoices, setRateChoices] = useState([]);
  useEffect(() => {
    if (!taxed) return;
    taxAPI.getRates({ active: true }).then((r) => setRateChoices((r.tax_rates ?? []).filter((x) => x.rate_type === 'percentage' && x.tax_type?.application_mode !== 'withheld'))).catch(() => {});
  }, [taxed]);
  const taxChoice = (f.tax_nature === 'taxable' || f.tax_nature === 'zero_rated') && f.tax_rate_ledger_id ? `rate:${f.tax_rate_ledger_id}` : (f.tax_nature || '');
  const rateGroups = rateChoices.reduce((m, r) => { const k = r.tax_type?.name || r.tax_type?.code || 'Tax rates'; (m[k] = m[k] || []).push(r); return m; }, {});
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    try {
      const blank = (v) => (v === '' ? null : v);
      const body = { ...f, currency_id: blank(f.currency_id) };
      if ((rated && !expense) || charging) {
        ['rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days'].forEach((k) => { body[k] = blank(f[k]); });
      } else {
        ['rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days'].forEach((k) => { body[k] = null; });
      }
      if (behaviour !== 'delivery') body.side = null;
      if (charging) body.settings = { charge_kind: f.charge_kind, timing: f.timing, refundable: Boolean(f.refundable), default_on: Boolean(f.default_on), free_days: Number(f.free_days) || 0, tax_follows: f.tax_follows };
      if (!taxed) { body.tax_nature = null; body.tax_rate_ledger_id = null; body.affects_stock = false; } else {
        body.tax_nature = f.tax_nature || null;
        body.tax_rate_ledger_id = (f.tax_nature === 'taxable' || f.tax_nature === 'zero_rated') ? blank(f.tax_rate_ledger_id) : null;
      }
      if (!bankish) { body.bank_name = null; body.account_number = null; body.branch = null; }
      if (editing) await booksAPI.updateLedger(ledger.id, body); else await booksAPI.createLedger(body);
      toast.success(editing ? 'Ledger saved' : 'Ledger created');
      onSaved(); onClose();
    } catch (x) { setErrs(fieldErrors(x)); if (!x.response?.data?.errors) setErr(errMsg(x, 'Could not save the ledger')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={editing ? `Edit ${ledger.name}` : 'New ledger'} subtitle="An account that vouchers post to." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name" error={errs.name}><TextInput required value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <Field label="Group" error={errs.group_id} hint={ledger?.is_system ? 'System ledgers stay in their group.' : 'Where it appears in the chart and the reports.'}>
            <SelectInput required disabled={ledger?.is_system} value={f.group_id} onChange={(e) => set('group_id')(e.target.value)}>
              <option value="">Choose…</option>
              {flat(groups).map((g) => <option key={g.id} value={g.id}>{'  '.repeat(g.depth)}{g.name}</option>)}
            </SelectInput>
          </Field>
          {taxed && (
            <>
              <Field label="Tax on this account *" error={errs.tax_nature || errs.tax_rate_ledger_id} hint={behaviour === 'sales'
                ? 'Required. Every sale line posted here is taxed this way — keep VAT-able goods and exempt goods on separate accounts.'
                : behaviour === 'charge' ? 'Required. Fees are often VAT-able; a refundable deposit is not — it is out of scope.'
                : 'Required. Every purchase line posted here is treated this way.'}>
                <SelectInput required value={taxChoice}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith('rate:')) {
                      const r = rateChoices.find((x) => String(x.id) === v.slice(5));
                      setF((p) => ({ ...p, tax_rate_ledger_id: Number(v.slice(5)), tax_nature: r && Number(r.rate_value) === 0 ? 'zero_rated' : 'taxable' }));
                    } else setF((p) => ({ ...p, tax_rate_ledger_id: '', tax_nature: v }));
                  }}>
                  <option value="">Choose the tax…</option>
                  {Object.entries(rateGroups).map(([tt, rs]) => (
                    <optgroup key={tt} label={tt}>
                      {rs.map((r) => <option key={r.id} value={`rate:${r.id}`}>{r.name} ({Number(r.rate_value)}%)</option>)}
                    </optgroup>
                  ))}
                  <optgroup label="No tax charged">
                    <option value="exempt">Exempt</option>
                    <option value="out_of_scope">Out of scope</option>
                  </optgroup>
                </SelectInput>
                {rateChoices.length === 0 && <span style={{ fontSize: 12, color: '#b45309' }}>No tax rates in the system yet — add them under Duties &amp; Taxes; until then only Exempt / Out of scope are available.</span>}
              </Field>
            </>
          )}
          {charging && (
            <>
              <FormGrid>
                <Field label="What it is" error={errs['settings.charge_kind']}>
                  <SelectInput value={f.charge_kind} onChange={(e) => { const k = e.target.value; setF((p) => ({ ...p, charge_kind: k, timing: k === 'entry_fee' ? 'entry' : k === 'deposit' ? 'deposit' : k === 'storage' ? 'after_win' : 'on_win', refundable: k === 'deposit' ? true : p.refundable })); }}>
                    <option value="buyer_premium">Buyer's premium / fee</option><option value="entry_fee">Entry / registration fee</option><option value="deposit">Deposit (refundable)</option>
                    <option value="delivery">Shipping / delivery</option><option value="handling">Handling / processing fee</option><option value="storage">Storage fee</option>
                    <option value="removal">Removal / collection fee</option><option value="payment">Payment / transaction fee</option><option value="customs">Import / customs charges</option><option value="other">Other</option>
                  </SelectInput>
                </Field>
                <Field label="When it is charged" error={errs['settings.timing']} hint="Entry and deposit are taken before bidding; “on winning” is added to the winner's order; “after winning” builds up later.">
                  <SelectInput value={f.timing} onChange={(e) => set('timing')(e.target.value)}>
                    <option value="on_win">On winning (added to the order)</option><option value="entry">To take part (entry)</option><option value="deposit">Held as a deposit</option><option value="after_win">After winning (e.g. storage)</option>
                  </SelectInput>
                </Field>
              </FormGrid>
              <FormGrid>
                <Field label="Worked out as" error={errs.rate_type}>
                  <SelectInput required value={f.rate_type} onChange={(e) => set('rate_type')(e.target.value)}>
                    <option value="">Choose…</option><option value="percent">% of the winning bid</option><option value="fixed">Fixed amount</option><option value="per_day">Amount per day</option>
                  </SelectInput>
                </Field>
                <Field label={f.rate_type === 'percent' ? 'Rate (%)' : 'Amount'} error={errs.rate_value}><NumberInput required min="0" step="0.0001" value={f.rate_value} onChange={(e) => set('rate_value')(e.target.value)} /></Field>
              </FormGrid>
              {f.rate_type && f.rate_type !== 'percent' && (
                <Field label="Currency" error={errs.currency_id} hint="Converted to the auction's currency when the charge is added to an auction."><CurrencySelect value={f.currency_id} onChange={set('currency_id')} /></Field>
              )}
              <FormGrid>
                <Field label="Minimum" error={errs.min_amount} hint="A percentage never comes to less than this."><NumberInput min="0" step="0.01" value={f.min_amount} onChange={(e) => set('min_amount')(e.target.value)} /></Field>
                <Field label="Maximum" error={errs.max_amount} hint="…and never more than this."><NumberInput min="0" step="0.01" value={f.max_amount} onChange={(e) => set('max_amount')(e.target.value)} /></Field>
              </FormGrid>
              {f.rate_type === 'per_day' && (
                <Field label="Free days" error={errs['settings.free_days']} hint="Days before the daily charge starts."><NumberInput min="0" step="1" value={f.free_days} onChange={(e) => set('free_days')(e.target.value)} /></Field>
              )}
              <Field label="Tax on this charge follows" error={errs['settings.tax_follows']} hint="Usually a fee has its own tax (chosen above). Choose the auction's sales account if this charge should be taxed exactly like the item — exempt on an exempt auction, VAT-able on a VAT-able one.">
                <SelectInput value={f.tax_follows} onChange={(e) => set('tax_follows')(e.target.value)}>
                  <option value="own">This charge's own tax</option><option value="auction">The auction's sales account</option>
                </SelectInput>
              </Field>
              <CheckboxRow checked={f.refundable} onChange={set('refundable')} label="Refundable" description="Given back to the bidder (or applied to what they owe) instead of kept as income." />
              <CheckboxRow checked={f.default_on} onChange={set('default_on')} label="On for every new auction" description="New auctions start with this charge; you can still switch it off per auction." />
            </>
          )}
          {bankish && (
            <FormGrid>
              <Field label="Bank"><TextInput value={f.bank_name} onChange={(e) => set('bank_name')(e.target.value)} /></Field>
              <Field label="Account number"><TextInput value={f.account_number} onChange={(e) => set('account_number')(e.target.value)} /></Field>
              <Field label="Branch"><TextInput value={f.branch} onChange={(e) => set('branch')(e.target.value)} /></Field>
            </FormGrid>
          )}
          {behaviour === 'delivery' && (
            <Field label="This ledger is" error={errs.side} hint="Charges we bill customers are income; what the courier costs us is an expense.">
              <SelectInput value={f.side} onChange={(e) => set('side')(e.target.value)}><option value="income">A delivery charge (income)</option><option value="expense">A delivery cost (expense)</option></SelectInput>
            </Field>
          )}
          {rated && !expense && (
            <>
              <FormGrid>
                <Field label="Rate type" error={errs.rate_type}>
                  <SelectInput value={f.rate_type} onChange={(e) => set('rate_type')(e.target.value)}>
                    <option value="">Choose…</option><option value="percent">Percentage</option><option value="fixed">Fixed amount</option><option value="per_unit">Per unit (kg, km…)</option>
                  </SelectInput>
                </Field>
                <Field label={f.rate_type === 'percent' ? 'Rate (%)' : 'Amount'} error={errs.rate_value}><NumberInput min="0" step="0.0001" value={f.rate_value} onChange={(e) => set('rate_value')(e.target.value)} /></Field>
              </FormGrid>
              {f.rate_type && f.rate_type !== 'percent' && (
                <Field label="Currency" error={errs.currency_id} hint="Converted to the invoice currency on the day of the voucher."><CurrencySelect value={f.currency_id} onChange={set('currency_id')} /></Field>
              )}
              <FormGrid>
                <Field label="Valid from" error={errs.valid_from}><TextInput type="date" value={f.valid_from ?? ''} onChange={(e) => set('valid_from')(e.target.value)} /></Field>
                <Field label="Valid until" error={errs.valid_until}><TextInput type="date" value={f.valid_until ?? ''} onChange={(e) => set('valid_until')(e.target.value)} /></Field>
              </FormGrid>
              {behaviour === 'delivery' && (
                <>
                  <FormGrid>
                    <Field label="Minimum charge" error={errs.min_amount}><NumberInput min="0" step="0.01" value={f.min_amount} onChange={(e) => set('min_amount')(e.target.value)} /></Field>
                    <Field label="Maximum charge" error={errs.max_amount}><NumberInput min="0" step="0.01" value={f.max_amount} onChange={(e) => set('max_amount')(e.target.value)} /></Field>
                  </FormGrid>
                  <FormGrid>
                    <Field label="Free above (order value)" error={errs.free_above}><NumberInput min="0" step="0.01" value={f.free_above} onChange={(e) => set('free_above')(e.target.value)} /></Field>
                    <Field label="Transit days" error={errs.transit_days}><NumberInput min="0" step="1" value={f.transit_days} onChange={(e) => set('transit_days')(e.target.value)} /></Field>
                  </FormGrid>
                </>
              )}
            </>
          )}
          <FormGrid>
            <Field label="Opening balance" error={errs.opening_balance}><NumberInput min="0" step="0.01" value={f.opening_balance} onChange={(e) => set('opening_balance')(e.target.value)} /></Field>
            <Field label="Debit / credit" error={errs.opening_side}>
              <SelectInput value={f.opening_side} onChange={(e) => set('opening_side')(e.target.value)}><option value="D">Debit (Dr)</option><option value="C">Credit (Cr)</option></SelectInput>
            </Field>
          </FormGrid>
          <Field label="Code (optional)" error={errs.code}><TextInput value={f.code} onChange={(e) => set('code')(e.target.value)} /></Field>
          {editing && <CheckboxRow checked={f.is_active} onChange={set('is_active')} label="Active" description="Switch off to stop new postings without losing history." />}
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save' : 'Create ledger'} busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function GroupForm({ groups, parentId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState(parentId ?? '');
  const [behaviour, setBehaviour] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await booksAPI.createGroup({ name, parent_id: parent, behaviour: behaviour || undefined }); toast.success('Group added'); onSaved(); onClose(); }
    catch (x) { setErr(errMsg(x, 'Could not add the group')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New group" subtitle="Groups can nest as deep as you like. The top-level groups are fixed." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name"><TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent & Rates" /></Field>
          <Field label="Under">
            <SelectInput required value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Choose…</option>
              {flat(groups).map((g) => <option key={g.id} value={g.id}>{'  '.repeat(g.depth)}{g.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Behaves as" hint="Leave as inherited unless this group holds tax or delivery ledgers.">
            <SelectInput value={behaviour} onChange={(e) => setBehaviour(e.target.value)}>
              <option value="">Same as its parent</option><option value="standard">Ordinary accounts</option><option value="tax">Duties &amp; taxes (rates)</option><option value="delivery">Shipping &amp; delivery (charges)</option><option value="sales">Sales accounts (tax nature)</option><option value="purchase">Purchase accounts (tax nature)</option><option value="bank">Bank / cash</option><option value="charge">Auction charges (fees, deposits)</option>
            </SelectInput>
          </Field>
          <ModalActions onCancel={onClose} submitLabel="Add group" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function AccountsTab({ canWrite }) {
  const nav = useNavigate();
  const [groups, setGroups] = useState([]);
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState({});
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledgerForm, setLedgerForm] = useState(null);
  const [groupForm, setGroupForm] = useState(false);
  const [search, setSearch] = useState('');

  const loadGroups = useCallback(() => booksAPI.groups().then(setGroups).catch((e) => toast.error(errMsg(e, 'Could not load the chart of accounts'))), []);
  const loadLedgers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksAPI.ledgers({ all: 1, group_id: sel?.id || undefined, search: search || undefined });
      setLedgers(Array.isArray(res) ? res : res.data ?? []);
    } catch (e) { toast.error(errMsg(e, 'Could not load ledgers')); }
    finally { setLoading(false); }
  }, [sel, search]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { const t = setTimeout(loadLedgers, search ? 250 : 0); return () => clearTimeout(t); }, [loadLedgers]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeGroup = async () => {
    if (!sel || !confirm(`Delete the group “${sel.name}”?`)) return;
    try { await booksAPI.deleteGroup(sel.id); toast.success('Group deleted'); setSel(null); loadGroups(); }
    catch (e) { toast.error(errMsg(e, 'Could not delete the group')); }
  };
  const removeLedger = async (l) => {
    if (!confirm(`Delete the ledger “${l.name}”?`)) return;
    try { await booksAPI.deleteLedger(l.id); toast.success('Ledger deleted'); loadLedgers(); loadGroups(); }
    catch (e) { toast.error(errMsg(e, 'Could not delete the ledger')); }
  };

  const columns = [
    { key: 'name', label: 'Ledger', render: (l) => <strong style={{ color: colors.text, fontWeight: 600 }}>{l.name}{!l.is_active && <span style={{ color: colors.textFaint, fontWeight: 400 }}> · off</span>}</strong> },
    { key: 'group', label: 'Group', render: (l) => l.group?.name },
    { key: 'nature', label: 'Nature', render: (l) => NATURE[l.group?.nature] },
    { key: 'tax', label: 'Tax', render: (l) => ({ taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Out of scope' }[l.tax_nature] ?? (['sales', 'purchase', 'charge'].includes(l.group?.behaviour) ? 'Not set' : '')) },
    { key: 'rate', label: 'Rate', align: 'right', render: (l) => (l.tax_rate_ledger?.rate_value != null && (l.tax_nature === 'taxable' || l.tax_nature === 'zero_rated') ? `${Number(l.tax_rate_ledger.rate_value)}%` : l.rate_type && l.rate_value != null ? (l.rate_type === 'percent' ? `${Number(l.rate_value)}%` : `${Number(l.rate_value).toLocaleString()}${l.rate_type === 'per_day' ? '/day' : ''}`) : '—') },
    { key: 'opening', label: 'Opening', align: 'right', render: (l) => Number(l.opening_balance) ? `${Number(l.opening_balance).toLocaleString()} ${l.opening_side === 'C' ? 'Cr' : 'Dr'}` : '—' },
    { key: 'actions', label: '', align: 'right', render: (l) => (
      <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px' }} onClick={() => nav(`/admin/books?tab=reports&report=ledger&ledger=${l.id}`)}><FileText size={12} /> Statement</button>
        {canWrite && !l.is_system && !l.customer_id && <button type="button" style={{ ...btnGhost, padding: '4px 10px', color: colors.danger }} onClick={() => removeLedger(l)}>Delete</button>}
      </span>
    ) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 18, alignItems: 'start' }}>
      <div style={{ ...card, padding: 10 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 8px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint }}>GROUPS</span>
          <button type="button" onClick={() => setSel(null)} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: colors.primary, cursor: 'pointer' }}>Show all</button>
        </div>
        {groups.map((g) => (
          <GroupNode key={g.id} g={g} depth={0} selected={sel?.id} onSelect={setSel} open={open} toggle={(id, cur) => setOpen((o) => ({ ...o, [id]: !cur }))} />
        ))}
        {canWrite && (
          <div style={{ display: 'flex', gap: 6, padding: '10px 6px 2px', flexWrap: 'wrap' }}>
            <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setGroupForm(true)}><Plus size={12} /> Group</button>
            {sel && !sel.is_system && <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem', color: colors.danger }} onClick={removeGroup}>Delete “{sel.name}”</button>}
          </div>
        )}
      </div>
      <div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{sel ? sel.name : 'All ledgers'}</p>
            {sel && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>{NATURE[sel.nature]} · includes subgroups</p>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ledgers…" style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem' }} />
            {canWrite && <button type="button" style={btnPrimary} onClick={() => setLedgerForm('new')}><Plus size={14} /> New ledger</button>}
          </div>
        </div>
        <SimpleTable columns={columns} rows={ledgers} loading={loading} onRowClick={canWrite ? setLedgerForm : undefined} empty="No ledgers in this group yet." />
      </div>
      {ledgerForm && <LedgerForm ledger={ledgerForm === 'new' ? null : ledgerForm} groups={groups} defaultGroupId={sel?.id} onClose={() => setLedgerForm(null)} onSaved={() => { loadLedgers(); loadGroups(); }} />}
      {groupForm && <GroupForm groups={groups} parentId={sel?.id} onClose={() => setGroupForm(false)} onSaved={loadGroups} />}
    </div>
  );
}
