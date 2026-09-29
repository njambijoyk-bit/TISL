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
  });
  // The group decides which fields exist (Tally: the group carries the behaviour).
  const behaviour = flat(groups).find((g) => String(g.id) === String(f.group_id))?.behaviour ?? 'standard';
  const rated = behaviour === 'tax' || behaviour === 'delivery';
  const expense = behaviour === 'delivery' && f.side === 'expense';
  const trading = behaviour === 'sales' || behaviour === 'purchase';
  const bankish = behaviour === 'bank';
  const [rateChoices, setRateChoices] = useState([]);
  useEffect(() => {
    if (!trading) return;
    taxAPI.getRates({ active: true }).then((r) => setRateChoices((r.tax_rates ?? []).filter((x) => x.rate_type === 'percentage' && x.tax_type?.application_mode !== 'withheld'))).catch(() => {});
  }, [trading]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    try {
      const blank = (v) => (v === '' ? null : v);
      const body = { ...f, currency_id: blank(f.currency_id) };
      if (rated && !expense) {
        ['rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days'].forEach((k) => { body[k] = blank(f[k]); });
      } else {
        ['rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days'].forEach((k) => { body[k] = null; });
      }
      if (behaviour !== 'delivery') body.side = null;
      if (!trading) { body.tax_nature = null; body.tax_rate_ledger_id = null; body.affects_stock = false; } else {
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
          {trading && (
            <>
              <Field label="Tax on this account" error={errs.tax_nature} hint={behaviour === 'sales'
                ? 'Every sale line posted here is taxed this way — put exempt goods on an exempt account and VAT-able goods on a VAT-able one.'
                : 'Every purchase line posted here is treated this way.'}>
                <SelectInput value={f.tax_nature} onChange={(e) => set('tax_nature')(e.target.value)}>
                  <option value="">Not set (use the tax rules)</option>
                  <option value="taxable">VAT-able / taxable</option>
                  <option value="zero_rated">Zero-rated</option>
                  <option value="exempt">Exempt</option>
                  <option value="out_of_scope">Out of scope</option>
                </SelectInput>
              </Field>
              {(f.tax_nature === 'taxable' || f.tax_nature === 'zero_rated') && (
                <Field label="Tax rate" error={errs.tax_rate_ledger_id} hint={f.tax_nature === 'zero_rated' ? 'A 0 % rate, so the return shows the value.' : 'The rate charged on these lines.'}>
                  <SelectInput required value={f.tax_rate_ledger_id} onChange={(e) => set('tax_rate_ledger_id')(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Choose…</option>
                    {rateChoices.filter((r) => (f.tax_nature === 'zero_rated' ? Number(r.rate_value) === 0 : true)).map((r) => <option key={r.id} value={r.id}>{r.name} — {r.tax_type?.code}</option>)}
                  </SelectInput>
                </Field>
              )}
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
              <option value="">Same as its parent</option><option value="standard">Ordinary accounts</option><option value="tax">Duties &amp; taxes (rates)</option><option value="delivery">Shipping &amp; delivery (charges)</option><option value="sales">Sales accounts (tax nature)</option><option value="purchase">Purchase accounts (tax nature)</option><option value="bank">Bank / cash</option>
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
    { key: 'tax', label: 'Tax', render: (l) => ({ taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Out of scope' }[l.tax_nature] ?? '') },
    { key: 'rate', label: 'Rate', align: 'right', render: (l) => (l.rate_type && l.rate_value != null ? (l.rate_type === 'percent' ? `${Number(l.rate_value)}%` : Number(l.rate_value).toLocaleString()) : '—') },
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
