/**
 * Reading another company's opened .wnkjap document: lookups, a trial balance and ledger statements worked out from its entries.
 * Pure functions on the document in memory; nothing is stored or sent anywhere.
 */
const r2 = (n) => Math.round(n * 100) / 100;

export function indexBook(doc) {
  const s = doc.sections;
  const groups = new Map((s.groups ?? []).map((g) => [g.id, g]));
  const ledgers = new Map((s.ledgers ?? []).map((l) => [l.id, l]));
  const vouchers = new Map((s.vouchers ?? []).map((v) => [v.id, v]));
  const balances = new Map((s.balances ?? []).map((b) => [b.ledger_id, b]));
  const groupPath = (id) => { const out = []; for (let g = groups.get(id), n = 0; g && n < 12; g = groups.get(g.parent_id), n += 1) out.unshift(g.name); return out.join(' › '); };
  const entriesByLedger = new Map();
  (s.entries ?? []).forEach((e) => { if (!entriesByLedger.has(e.ledger_id)) entriesByLedger.set(e.ledger_id, []); entriesByLedger.get(e.ledger_id).push(e); });
  const entriesByVoucher = new Map();
  (s.entries ?? []).forEach((e) => { if (!entriesByVoucher.has(e.voucher_id)) entriesByVoucher.set(e.voucher_id, []); entriesByVoucher.get(e.voucher_id).push(e); });
  const itemsByVoucher = new Map();
  (s.voucher_items ?? []).forEach((i) => { if (!itemsByVoucher.has(i.voucher_id)) itemsByVoucher.set(i.voucher_id, []); itemsByVoucher.get(i.voucher_id).push(i); });
  const names = (list) => new Map((list ?? []).map((x) => [x.id, x.name]));

  return { groups, ledgers, vouchers, balances, groupPath, entriesByLedger, entriesByVoucher, itemsByVoucher, locations: names(s.locations), costCentres: names(s.cost_centres), hasEntries: (s.entries ?? []).length > 0 || doc.level >= 2 };
}

const signed = (e) => (e.side === 'D' ? 1 : -1) * (Number(e.base_amount ?? e.amount) || 0);

/** A ledger's opening at `from`: its balance at the start of the file's period plus what the file's entries moved before `from`. */
function openingAt(doc, idx, ledgerId, from) {
  const b = idx.balances.get(ledgerId);
  let open = b ? Number(b.opening) || 0 : 0;
  if (from && doc.level >= 2) {
    for (const e of idx.entriesByLedger.get(ledgerId) ?? []) {
      const v = idx.vouchers.get(e.voucher_id);
      if (v && v.date < from && (!doc.period?.from || v.date >= doc.period.from)) open += signed(e);
    }
  }
  return open;
}

/** Trial balance for [from, to] inside the file's period. A summary file (level 1) has only the balances for its own period. */
export function trialBalance(doc, idx, from, to) {
  const rows = [];
  for (const l of idx.ledgers.values()) {
    const b = idx.balances.get(l.id);
    let open; let dr = 0; let cr = 0;
    if (doc.level < 2) {
      if (!b) continue;
      open = Number(b.opening) || 0; dr = Number(b.debit) || 0; cr = Number(b.credit) || 0;
    } else {
      open = openingAt(doc, idx, l.id, from);
      for (const e of idx.entriesByLedger.get(l.id) ?? []) {
        const v = idx.vouchers.get(e.voucher_id);
        if (!v || (from && v.date < from) || (to && v.date > to)) continue;
        const a = Number(e.base_amount ?? e.amount) || 0;
        if (e.side === 'D') dr += a; else cr += a;
      }
    }
    const close = open + dr - cr;
    if (Math.abs(open) < 0.005 && dr < 0.005 && cr < 0.005) continue;
    rows.push({ ledger_id: l.id, ledger: l.name, group: idx.groupPath(l.group_id), opening: r2(open), debit: r2(dr), credit: r2(cr), closing: r2(close) });
  }
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.ledger.localeCompare(b.ledger));
  const tDr = r2(rows.reduce((t, r) => t + (r.closing > 0 ? r.closing : 0), 0));
  const tCr = r2(rows.reduce((t, r) => t + (r.closing < 0 ? -r.closing : 0), 0));
  return { rows, total_debit: tDr, total_credit: tCr };
}

/** One ledger's statement with a running balance (debit positive). */
export function ledgerStatement(doc, idx, ledgerId, from, to) {
  const open = openingAt(doc, idx, ledgerId, from);
  let bal = open;
  const rows = [];
  const list = [...(idx.entriesByLedger.get(ledgerId) ?? [])].map((e) => ({ e, v: idx.vouchers.get(e.voucher_id) })).filter((x) => x.v && (!from || x.v.date >= from) && (!to || x.v.date <= to));
  list.sort((a, b) => a.v.date.localeCompare(b.v.date) || a.v.id - b.v.id || (a.e.line_no ?? 0) - (b.e.line_no ?? 0));
  let dr = 0; let cr = 0;
  for (const { e, v } of list) {
    const a = Number(e.base_amount ?? e.amount) || 0;
    bal += signed(e);
    if (e.side === 'D') dr += a; else cr += a;
    rows.push({ voucher_id: v.id, date: v.date, number: v.voucher_number, type: v.type, narration: e.narration || v.narration || '', debit: e.side === 'D' ? r2(a) : 0, credit: e.side === 'C' ? r2(a) : 0, balance: r2(bal) });
  }

  return { opening: r2(open), rows, debit: r2(dr), credit: r2(cr), closing: r2(bal) };
}
