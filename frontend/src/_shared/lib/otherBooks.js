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

/**
 * What the ledgers' own opening balances are out by (debit positive), like Tally's "Difference in opening balances". Every opening balance needs an opposite one;
 * when they do not net to nothing the trial balance can never balance, so the live report carries the difference on a placeholder line and so does this one.
 * The ledgers hold the opening balances as entered; `balances` in the file does not, because the exporter leaves the placeholder out. A one-branch file has no
 * opening balances at all (they belong to the whole company), so there is nothing to carry.
 */
export function openingDifference(doc) {
  if (doc.opening_balances_left_out) return 0;
  const net = (doc.sections.ledgers ?? []).reduce((t, l) => t + (l.opening_side === 'C' ? -1 : 1) * (Number(l.opening_balance) || 0), 0);
  return Math.abs(net) < 0.01 ? 0 : r2(net);
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
  const diff = openingDifference(doc);
  if (diff !== 0) rows.push({ ledger_id: null, ledger: 'Difference in opening balances', group: '', placeholder: true, opening: r2(-diff), debit: 0, credit: 0, closing: r2(-diff) });
  const tDr = r2(rows.reduce((t, r) => t + (r.closing > 0 ? r.closing : 0), 0));
  const tCr = r2(rows.reduce((t, r) => t + (r.closing < 0 ? -r.closing : 0), 0));
  return { rows, total_debit: tDr, total_credit: tCr, balanced: Math.abs(tDr - tCr) < 0.01, opening_difference: diff };
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

/**
 * The income statement (for [from, to]) and the balance sheet (as of `to`) drawn on the other company's own statement lines, when the file carries them (a file made
 * before the new report engine does not). Income and expense ledgers show their movement in the period; balance-sheet ledgers their closing balance, with the profit
 * to date as a line of its own so the two sides agree. A ledger on no line is listed apart, never dropped. Returns null when the file has no statements.
 */
export function statementReports(doc, idx, from, to) {
  const lines = doc.sections.statements ?? [];
  if (!lines.length) return null;
  const natureOf = (ledgerId) => idx.groups.get(idx.ledgers.get(ledgerId)?.group_id)?.nature;
  const period = trialBalance(doc, idx, from, to).rows.filter((r) => r.ledger_id);
  const upTo = trialBalance(doc, idx, null, to).rows.filter((r) => r.ledger_id);
  const children = new Map();
  lines.forEach((n) => { const k = n.parent_id ?? 0; if (!children.has(k)) children.set(k, []); children.get(k).push(n); });

  const build = (rootCode, rows, amountOf, keep) => {
    const root = lines.find((n) => n.code === rootCode);
    if (!root) return { rows: [], total: 0 };
    const own = new Map();
    const loose = [];
    rows.forEach((r) => {
      if (!keep(natureOf(r.ledger_id))) return;
      const sid = idx.ledgers.get(r.ledger_id)?.statement_id;
      const a = amountOf(r, natureOf(r.ledger_id));
      if (!sid || !lines.some((n) => n.id === sid)) { loose.push({ name: r.ledger, amount: a }); return; }
      if (!own.has(sid)) own.set(sid, []);
      own.get(sid).push({ name: r.ledger, amount: a });
    });
    const out = [];
    const walk = (node, depth) => {
      const mark = out.length;
      out.push({ depth, name: node.name, kind: node.kind, amount: 0 });
      let sum = 0;
      (own.get(node.id) ?? []).forEach((l) => { out.push({ depth: depth + 1, name: l.name, kind: 'ledger', amount: r2(l.amount) }); sum += l.amount; });
      (children.get(node.id) ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).forEach((c) => { sum += walk(c, depth + 1); });
      out[mark].amount = r2(sum);
      if (Math.abs(sum) < 0.005 && out.length - mark === 1) out.pop();
      return sum;
    };
    let total = walk(root, 0);
    if (loose.length) {
      out.push({ depth: 0, name: 'Not on a statement line', kind: 'heading', amount: r2(loose.reduce((t, l) => t + l.amount, 0)) });
      loose.forEach((l) => out.push({ depth: 1, name: l.name, kind: 'ledger', amount: r2(l.amount) }));
      total += loose.reduce((t, l) => t + l.amount, 0);
    }
    return { rows: out, total: r2(total) };
  };

  // income counts up and expense down, so every total on the income statement is a profit
  const income = build('IS', period, (r, n) => (n === 'income' ? r.credit - r.debit : -(r.debit - r.credit)), (n) => n === 'income' || n === 'expense');
  const profitOf = (rows) => rows.reduce((t, r) => { const n = natureOf(r.ledger_id); return n === 'income' ? t + (r.credit - r.debit) : n === 'expense' ? t - (r.debit - r.credit) : t; }, 0);
  const balance = build('BS', upTo, (r, n) => (n === 'asset' ? r.closing : -r.closing), (n) => n === 'asset' || n === 'liability');
  const sideOf = (nature) => r2(upTo.reduce((t, r) => (natureOf(r.ledger_id) === nature ? t + (nature === 'asset' ? r.closing : -r.closing) : t), 0));
  balance.assets = sideOf('asset');
  balance.claims = sideOf('liability');
  const toDate = r2(profitOf(upTo));
  const diff = openingDifference(doc);
  return { income, balance, profit_to_date: toDate, profit_in_period: r2(profitOf(period)), opening_difference: diff };
}
