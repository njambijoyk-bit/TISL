import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Tabs from '../../ui/Tabs';
import Modal from '../../ui/Modal';
import DataGrid from './DataGrid';
import { indexBook, trialBalance, ledgerStatement } from '../../../../../_shared/lib/otherBooks';
import { card, colors } from '../../../../../_shared/theme/tokens';

const fmt = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dc = (n) => (Math.abs(n) < 0.005 ? '' : `${fmt(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);
const input = { padding: '7px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.15)}`, fontSize: '0.8rem' };

const LABELS = { groups: 'Account groups', ledgers: 'Ledgers', balances: 'Balances', vouchers: 'Vouchers', entries: 'Entries', locations: 'Branches', cost_centres: 'Cost centres', voucher_items: 'Voucher lines',
  voucher_taxes: 'Voucher taxes', bill_refs: 'Bill references', customers: 'Customers', suppliers: 'Suppliers', products: 'Products', variants: 'Product options', stock: 'Stock on hand',
  batches: 'Batches', batch_balances: 'Batch balances', movements: 'Stock movements', departments: 'Departments' };

/** Every section as a plain table, whatever it holds: nothing is hidden because this screen has no special view for it. */
const plainColumns = (rows) => Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k.replace(/_/g, ' '), num: typeof rows[0][k] === 'number' }));

function VoucherDetail({ v, idx, doc, onClose }) {
  const entries = idx.entriesByVoucher.get(v.id) ?? [];
  const items = idx.itemsByVoucher.get(v.id) ?? [];
  const taxes = (doc.sections.voucher_taxes ?? []).filter((t) => t.voucher_id === v.id);
  const cur = doc.company.base_currency;
  return (
    <Modal title={`${v.type} ${v.voucher_number ?? ''}`} subtitle={`${v.date}${v.status === 'cancelled' ? ' · cancelled' : ''}${v.party_name ? ` · ${v.party_name}` : ''}`} onClose={onClose} width={760}>
      <div style={{ display: 'grid', gap: 14 }}>
        {v.narration && <p style={{ margin: 0, fontSize: '0.82rem' }}>{v.narration}</p>}
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
          {v.reference_no ? `Reference ${v.reference_no} · ` : ''}{v.location_id && idx.locations.get(v.location_id) ? `${idx.locations.get(v.location_id)} · ` : ''}{v.cost_centre_id && idx.costCentres.get(v.cost_centre_id) && idx.costCentres.get(v.cost_centre_id) !== idx.locations.get(v.location_id) ? `${idx.costCentres.get(v.cost_centre_id)} · ` : ''}Total {fmt(v.total_amount)} {v.currency ?? cur}
        </p>
        {items.length > 0 && <DataGrid file={`voucher-${v.voucher_number}-lines`} title={`${v.voucher_number} lines`} columns={[
          { key: 'description', label: 'Item' }, { key: 'quantity', label: 'Qty', num: true }, { key: 'unit_code', label: 'Unit' }, { key: 'rate', label: 'Rate', num: true, render: (r) => fmt(r.rate) },
          { key: 'amount', label: 'Amount', num: true, render: (r) => fmt(r.amount) }, { key: 'tax_amount', label: 'Tax', num: true, render: (r) => fmt(r.tax_amount) }]} rows={items} pageSize={50} />}
        {taxes.length > 0 && <p style={{ margin: 0, fontSize: '0.78rem' }}>{taxes.map((t) => `${t.label}: ${fmt(t.tax_amount)}`).join(' · ')}</p>}
        <DataGrid file={`voucher-${v.voucher_number}-entries`} title={`${v.voucher_number} entries`} columns={[
          { key: 'ledger', label: 'Ledger', value: (e) => idx.ledgers.get(e.ledger_id)?.name ?? e.ledger_id }, { key: 'debit', label: 'Debit', num: true, value: (e) => (e.side === 'D' ? Number(e.base_amount ?? e.amount) : ''), render: (e) => (e.side === 'D' ? fmt(e.base_amount ?? e.amount) : '') },
          { key: 'credit', label: 'Credit', num: true, value: (e) => (e.side === 'C' ? Number(e.base_amount ?? e.amount) : ''), render: (e) => (e.side === 'C' ? fmt(e.base_amount ?? e.amount) : '') },
          { key: 'cost_centre', label: 'Cost centre', value: (e) => idx.costCentres.get(e.cost_centre_id) ?? '' }]} rows={entries} pageSize={50} empty={v.status === 'cancelled' ? 'A cancelled voucher has no entries.' : 'No entries in this file.'} />
      </div>
    </Modal>
  );
}

/**
 * Another company's books, opened from a .wnkjap file and shown as read-only tables. The whole document is in this page's memory only:
 * nothing is saved or sent anywhere, and closing the page discards it.
 */
export default function OtherBooksViewer({ doc }) {
  const idx = useMemo(() => indexBook(doc), [doc]);
  const s = doc.sections;
  const [tab, setTab] = useState('overview');
  const [from, setFrom] = useState(doc.period?.from ?? '');
  const [to, setTo] = useState(doc.period?.to ?? '');
  const [ledgerId, setLedgerId] = useState('');
  const [open, setOpen] = useState(null);
  const [voucherType, setVoucherType] = useState('');
  const cur = doc.company.base_currency ?? '';
  const sub = `${doc.company.name} · ${cur} · ${doc.period?.from ?? 'start'} to ${doc.period?.to ?? 'today'} · opened from a file, not stored`;

  const tb = useMemo(() => trialBalance(doc, idx, from || null, to || null), [doc, idx, from, to]);
  const st = useMemo(() => (ledgerId ? ledgerStatement(doc, idx, Number(ledgerId), from || null, to || null) : null), [doc, idx, ledgerId, from, to]);
  const types = useMemo(() => [...new Set((s.vouchers ?? []).map((v) => v.type))].sort(), [s.vouchers]);

  const tabs = [
    { id: 'overview', label: 'Overview' }, { id: 'chart', label: 'Chart of accounts' }, { id: 'trial', label: 'Trial balance' },
    ...(doc.level >= 2 ? [{ id: 'ledger', label: 'Ledger statement' }, { id: 'vouchers', label: 'Vouchers' }] : []),
    ...(doc.level >= 3 ? [{ id: 'customers', label: 'Customers' }, { id: 'suppliers', label: 'Suppliers' }] : []),
    ...(doc.level >= 4 ? [{ id: 'stock', label: 'Stock' }, { id: 'movements', label: 'Movements' }] : []),
    { id: 'more', label: 'All tables' },
  ];
  const dates = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
      <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>From <input type="date" value={from} min={doc.period?.from ?? undefined} max={doc.period?.to ?? undefined} onChange={(e) => setFrom(e.target.value)} style={input} /></label>
      <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>To <input type="date" value={to} min={doc.period?.from ?? undefined} max={doc.period?.to ?? undefined} onChange={(e) => setTo(e.target.value)} style={input} /></label>
      {doc.level < 2 && <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>A summary file holds balances for its own period only.</span>}
    </div>
  );

  const stockRows = useMemo(() => {
    const prod = new Map((s.products ?? []).map((p) => [p.id, p]));
    const variant = new Map((s.variants ?? []).map((v) => [v.id, v]));
    return (s.stock ?? []).map((r) => { const v = variant.get(r.product_variant_id); const p = v ? prod.get(v.product_id) : null; return { item: p?.name ?? `#${r.product_variant_id}`, option: v?.name && v.name !== p?.name ? v.name : '', sku: v?.sku ?? p?.sku ?? '', branch: idx.locations.get(r.location_id) ?? r.location_id, quantity: Number(r.quantity), reorder_level: r.reorder_level ?? '' }; });
  }, [s, idx]);

  return (
    <div>
      <div style={{ ...card, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.8rem' }}>
        <ShieldCheck size={16} style={{ color: colors.successText, flexShrink: 0 }} />
        <span><strong>{doc.company.name}</strong>{doc.company.legal_name && doc.company.legal_name !== doc.company.name ? ` (${doc.company.legal_name})` : ''}. View only: opened here from the file, nothing is saved to this system, and it is gone when you close this page.</span>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, fontSize: '0.82rem' }}>
            <div><span style={{ color: colors.textMuted }}>Company</span><br /><strong>{doc.company.name}</strong>{doc.company.tax_pin && <><br />PIN {doc.company.tax_pin}</>}{doc.company.city && <><br />{doc.company.city}{doc.company.country ? `, ${doc.company.country}` : ''}</>}</div>
            <div><span style={{ color: colors.textMuted }}>Made</span><br /><strong>{new Date(doc.created_at).toLocaleString()}</strong>{doc.exported_by && <><br />by {doc.exported_by}</>}</div>
            <div><span style={{ color: colors.textMuted }}>Depth</span><br /><strong>Level {doc.level}</strong><br />{doc.level_name}</div>
            <div><span style={{ color: colors.textMuted }}>Period</span><br /><strong>{doc.period?.from ?? 'the start'} to {doc.period?.to ?? 'today'}</strong><br />in {cur}</div>
          </div>
          {doc.opening_balances_left_out && <div style={{ ...card, padding: '8px 12px', fontSize: '0.78rem', color: colors.warningText }}>This file covers one branch only. Opening balances belong to the whole company, so it shows movement, not full balances.</div>}
          {doc.branch_limited && <div style={{ ...card, padding: '8px 12px', fontSize: '0.78rem', color: colors.warningText }}>The person who made this file could only see some branches, so it covers those only.</div>}
          <DataGrid file="overview" title="What the file holds" subtitle={sub} columns={[{ key: 'section', label: 'Table' }, { key: 'rows', label: 'Rows', num: true }]}
            rows={Object.entries(doc.counts ?? {}).map(([k, n]) => ({ section: LABELS[k] ?? k, rows: n }))} />
        </div>
      )}

      {tab === 'chart' && (
        <DataGrid file="chart-of-accounts" title="Chart of accounts" subtitle={sub} pageSize={200} columns={[
          { key: 'group', label: 'Group' }, { key: 'ledger', label: 'Ledger' }, { key: 'opening', label: 'Opening', num: true, render: (r) => dc(r.opening) },
          { key: 'debit', label: 'Debit', num: true, render: (r) => fmt(r.debit) }, { key: 'credit', label: 'Credit', num: true, render: (r) => fmt(r.credit) }, { key: 'closing', label: 'Closing', num: true, render: (r) => dc(r.closing) }]}
        rows={(s.ledgers ?? []).map((l) => { const b = idx.balances.get(l.id); return { group: idx.groupPath(l.group_id), ledger: l.name, opening: b ? Number(b.opening) : 0, debit: b ? Number(b.debit) : 0, credit: b ? Number(b.credit) : 0, closing: b ? Number(b.closing) : 0 }; })} />
      )}

      {tab === 'trial' && (
        <>
          {dates}
          <DataGrid file="trial-balance" title="Trial balance" subtitle={`${sub} · ${from || 'start'} to ${to || 'end'}`} pageSize={200} columns={[
            { key: 'group', label: 'Group' }, { key: 'ledger', label: 'Ledger' }, { key: 'opening', label: 'Opening', num: true, render: (r) => dc(r.opening) },
            { key: 'debit', label: 'Debit', num: true, render: (r) => fmt(r.debit) }, { key: 'credit', label: 'Credit', num: true, render: (r) => fmt(r.credit) }, { key: 'closing', label: 'Closing', num: true, render: (r) => dc(r.closing) }]}
          rows={tb.rows} footer={tb.rows.length > 0 && (
            <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}><td colSpan={4} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>Totals (closing)</td><td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>Dr {fmt(tb.total_debit)}</td><td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>Cr {fmt(tb.total_credit)}</td></tr>
          )} />
          {tb.opening_difference !== 0 && (
            <div style={{ ...card, padding: '8px 12px', fontSize: '0.78rem', color: colors.warningText }}>
              <strong>Difference in opening balances: {fmt(Math.abs(tb.opening_difference))} {tb.opening_difference > 0 ? 'Cr' : 'Dr'}.</strong> It is a placeholder, not a ledger: the opening balances on this company's ledgers are {fmt(Math.abs(tb.opening_difference))} {tb.opening_difference > 0 ? 'heavy on the debit side' : 'heavy on the credit side'}, so it is held here to keep the trial balance in step. It clears when the opposite opening balance (usually Capital) is entered in their books.
            </div>
          )}
          {doc.opening_balances_left_out && <p style={{ fontSize: '0.76rem', color: colors.textMuted }}>It will not balance on its own: the file holds one branch and no opening balances.</p>}
        </>
      )}

      {tab === 'ledger' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} style={{ ...input, minWidth: 240 }} aria-label="Ledger">
              <option value="">Choose a ledger…</option>
              {[...idx.ledgers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {dates}
          {!st ? <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Choose a ledger to see its statement.</p> : (
            <DataGrid file={`ledger-${idx.ledgers.get(Number(ledgerId))?.name ?? ledgerId}`} title={`Ledger: ${idx.ledgers.get(Number(ledgerId))?.name}`} subtitle={`${sub} · opening ${dc(st.opening)}`} pageSize={200}
              columns={[{ key: 'date', label: 'Date' }, { key: 'number', label: 'Number' }, { key: 'type', label: 'Type' }, { key: 'narration', label: 'Narration' }, { key: 'debit', label: 'Debit', num: true, render: (r) => fmt(r.debit || '') },
                { key: 'credit', label: 'Credit', num: true, render: (r) => fmt(r.credit || '') }, { key: 'balance', label: 'Balance', num: true, render: (r) => dc(r.balance) }]}
              rows={st.rows} onRow={(r) => setOpen(idx.vouchers.get(r.voucher_id))} footer={<tr style={{ background: colors.tint(0.03), fontWeight: 700 }}><td colSpan={4} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>Opening {dc(st.opening)}</td><td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>{fmt(st.debit)}</td><td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>{fmt(st.credit)}</td><td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>{dc(st.closing)}</td></tr>} />
          )}
        </>
      )}

      {tab === 'vouchers' && (
        <>
          <div style={{ marginBottom: 10 }}>
            <select value={voucherType} onChange={(e) => setVoucherType(e.target.value)} style={input} aria-label="Type">
              <option value="">All types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <DataGrid file="vouchers" title="Vouchers" subtitle={sub} onRow={setOpen} columns={[
            { key: 'date', label: 'Date' }, { key: 'voucher_number', label: 'Number' }, { key: 'type', label: 'Type' }, { key: 'party', label: 'Party', value: (v) => v.party_name || idx.ledgers.get(v.party_ledger_id)?.name || '' },
            { key: 'status', label: 'Status' }, { key: 'narration', label: 'Narration' }, { key: 'total_amount', label: `Total (${cur})`, num: true, value: (v) => Number(v.base_total ?? v.total_amount), render: (v) => fmt(v.base_total ?? v.total_amount) }]}
          rows={(s.vouchers ?? []).filter((v) => !voucherType || v.type === voucherType)} />
          <p style={{ fontSize: '0.74rem', color: colors.textMuted }}>Click a voucher to see its entries{doc.level >= 3 ? ' and lines' : ''}.</p>
        </>
      )}

      {tab === 'customers' && <DataGrid file="customers" title="Customers" subtitle={sub} columns={[{ key: 'customer_number', label: 'Number' }, { key: 'name', label: 'Name', value: (c) => c.company_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() },
        { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'tax_id', label: 'Tax ID' }]} rows={s.customers ?? []} />}
      {tab === 'suppliers' && <DataGrid file="suppliers" title="Suppliers" subtitle={sub} columns={[{ key: 'vendor_number', label: 'Number' }, { key: 'company_name', label: 'Company' }, { key: 'contact_name', label: 'Contact' },
        { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'tax_id', label: 'Tax ID' }, { key: 'city', label: 'City' }]} rows={s.suppliers ?? []} />}
      {tab === 'stock' && <DataGrid file="stock" title="Stock on hand" subtitle={sub} pageSize={200} columns={[{ key: 'item', label: 'Item' }, { key: 'option', label: 'Option' }, { key: 'sku', label: 'SKU' }, { key: 'branch', label: 'Branch' },
        { key: 'quantity', label: 'On hand', num: true }, { key: 'reorder_level', label: 'Reorder at', num: true }]} rows={stockRows} />}
      {tab === 'movements' && <DataGrid file="stock-movements" title="Stock movements" subtitle={sub} pageSize={200} columns={[{ key: 'movement_date', label: 'Date' }, { key: 'variant_id', label: 'Item', value: (m) => { const v = (s.variants ?? []).find((x) => x.id === m.variant_id); return v ? (v.sku || v.name) : m.variant_id; } },
        { key: 'location_id', label: 'Branch', value: (m) => idx.locations.get(m.location_id) ?? m.location_id }, { key: 'movement_type', label: 'Kind' }, { key: 'quantity', label: 'Quantity', num: true },
        { key: 'unit_cost', label: 'Unit cost', num: true, render: (m) => fmt(m.unit_cost) }]} rows={s.movements ?? []} />}

      {tab === 'more' && <MoreTables doc={doc} sub={sub} />}
      {open && <VoucherDetail v={open} idx={idx} doc={doc} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MoreTables({ doc, sub }) {
  const names = Object.keys(doc.sections).filter((k) => (doc.sections[k] ?? []).length > 0);
  const [name, setName] = useState(names[0]);
  const rows = doc.sections[name] ?? [];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <select value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, maxWidth: 280 }} aria-label="Table">{names.map((k) => <option key={k} value={k}>{LABELS[k] ?? k} ({doc.sections[k].length})</option>)}</select>
      {rows.length > 0 && <DataGrid key={name} file={name} title={LABELS[name] ?? name} subtitle={sub} columns={plainColumns(rows)} rows={rows} pageSize={100} />}
    </div>
  );
}
