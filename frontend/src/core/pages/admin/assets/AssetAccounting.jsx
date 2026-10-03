import { useState, useEffect, useCallback } from 'react';
import inventoryAPI from '../../../../_shared/api/inventory';
import { colors, input, label as labelStyle, card, btnPrimary, btnGhost } from '../../../../_shared/theme/tokens';

const money = (n) => Number(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textMuted, borderBottom: `1px solid ${colors.tint(0.12)}`, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', color: colors.text, borderBottom: `1px solid ${colors.tint(0.06)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const lastMonthEnd = () => { const d = new Date(); d.setDate(0); return d.toISOString().split('T')[0]; };

function Field({ label, children, hint }) {
  return <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}{hint && <div style={{ fontSize: '0.68rem', color: colors.textFaint, marginTop: 3 }}>{hint}</div>}</div>;
}

/** Category: which ledgers its assets post to, and how they depreciate unless an asset says otherwise. */
export function CategoryDepreciationFields({ form, set, opts, categoryId, onSetup }) {
  if (!opts?.ready) return <div style={{ fontSize: '0.74rem', color: colors.textFaint, marginTop: 8 }}>Run script 71 to set up depreciation.</div>;
  const sel = (k, list, empty) => (
    <select style={input} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value || null)}>
      <option value="">{empty}</option>
      {list.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
  return (
    <div style={{ borderTop: `1px solid ${colors.tint(0.12)}`, marginTop: 10, paddingTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 8 }}>Books &amp; depreciation</div>
      <Field label="Asset account (cost)">{sel('asset_ledger_id', opts.asset_ledgers, 'Choose or create…')}</Field>
      <Field label="Accumulated depreciation account">{sel('accumulated_ledger_id', opts.asset_ledgers, 'Choose or create…')}</Field>
      <Field label="Depreciation expense account">{sel('expense_ledger_id', opts.expense_ledgers, 'Choose or create…')}</Field>
      {categoryId && <button type="button" style={{ ...btnGhost, marginBottom: 12 }} onClick={onSetup}>Create the missing ledgers for me</button>}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8 }}>
        <Field label="Usual method">
          <select style={input} value={form.default_method ?? 'none'} onChange={(e) => set('default_method', e.target.value)}>{opts.methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        </Field>
        <Field label="Life (years)"><input style={input} type="number" min="1" value={form.default_life_years ?? ''} onChange={(e) => set('default_life_years', e.target.value || null)} /></Field>
        <Field label="Rate % a year"><input style={input} type="number" min="0" max="100" step="0.01" value={form.default_rate ?? ''} onChange={(e) => set('default_rate', e.target.value || null)} /></Field>
      </div>
    </div>
  );
}

/** An asset: its currency, the floor where depreciation stops, how it depreciates and how the purchase is booked. */
export function AssetMoneyFields({ form, set, opts }) {
  if (!opts?.ready) return null;
  const base = opts.currencies.find((c) => c.is_base);
  const method = form.depreciation_method ?? '';
  return (
    <div style={{ borderTop: `1px solid ${colors.tint(0.12)}`, marginTop: 6, paddingTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 8 }}>Value &amp; depreciation</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Currency of the cost" hint="Cost and floor are kept in this currency, so they convert when rates or your base currency change.">
          <select style={input} value={form.currency_id ?? ''} onChange={(e) => set('currency_id', e.target.value || '')}>
            <option value="">{base ? `${base.code} (base)` : 'Base currency'}</option>
            {opts.currencies.filter((c) => !c.is_base).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </Field>
        <Field label="Floor — depreciation stops here" hint="Land: its value. A sofa: what it is still worth.">
          <input style={input} type="number" min="0" step="0.01" value={form.floor_value ?? ''} onChange={(e) => set('floor_value', e.target.value)} placeholder="0.00" />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
        <Field label="Method">
          <select style={input} value={method} onChange={(e) => set('depreciation_method', e.target.value)}>
            <option value="">Use the category's</option>
            {opts.methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Life (years)"><input style={input} type="number" min="1" value={form.useful_life_years ?? ''} onChange={(e) => set('useful_life_years', e.target.value)} /></Field>
        <Field label="Rate % a year"><input style={input} type="number" min="0" max="100" step="0.01" value={form.depreciation_rate ?? ''} onChange={(e) => set('depreciation_rate', e.target.value)} /></Field>
      </div>
      <Field label="In service from" hint="Depreciation starts this month, pro-rated by days. Blank = the purchase date.">
        <input style={input} type="date" value={form.in_service_date ?? ''} onChange={(e) => set('in_service_date', e.target.value)} />
      </Field>
      {form.depreciated_to !== undefined && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Already depreciated (optional)" hint="For assets you owned before using this.">
            <input style={input} type="number" min="0" step="0.01" value={form.opening_accumulated ?? ''} onChange={(e) => set('opening_accumulated', e.target.value)} />
          </Field>
          <Field label="…up to the end of">
            <input style={input} type="date" value={form.depreciated_to ?? ''} onChange={(e) => set('depreciated_to', e.target.value)} />
          </Field>
        </div>
      )}
      {form.acquisition_mode !== undefined && (
        <>
          <Field label="How is the purchase booked?">
            <select style={input} value={form.acquisition_mode} onChange={(e) => set('acquisition_mode', e.target.value)}>
              <option value="none">Already in the books / opening balance</option>
              <option value="payment">Pay now from cash or bank</option>
              <option value="link">A voucher already booked it</option>
            </select>
          </Field>
          {form.acquisition_mode === 'payment' && (
            <Field label="Paid from">
              <select style={input} value={form.paid_ledger_id ?? ''} onChange={(e) => set('paid_ledger_id', e.target.value)}>
                <option value="">Choose…</option>
                {opts.pay_from.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.group})</option>)}
              </select>
            </Field>
          )}
          {form.acquisition_mode === 'link' && <Field label="Voucher id"><input style={input} type="number" value={form.acquisition_voucher_id ?? ''} onChange={(e) => set('acquisition_voucher_id', e.target.value)} /></Field>}
        </>
      )}
    </div>
  );
}

/** One asset: what it cost, what is left, and the months depreciated so far. */
export function BookValuePanel({ instanceId }) {
  const [d, setD] = useState(null);
  useEffect(() => { inventoryAPI.accounting.bookValue(instanceId).then((r) => setD(r.data)).catch(() => setD(null)); }, [instanceId]);
  if (!d) return null;
  const cell = (l, v, strong) => <div><div style={{ fontSize: '0.66rem', color: colors.textFaint, textTransform: 'uppercase' }}>{l}</div><div style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? '1.05rem' : '0.9rem' }}>{d.currency} {money(v)}</div></div>;
  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: d.months.length ? 12 : 0 }}>
        {cell('Cost', d.cost)}{cell('Depreciated', d.accumulated)}{cell('Floor', d.floor)}{cell('Book value', d.book_value, true)}
      </div>
      {d.months.length > 0 && (
        <details><summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: colors.textMuted }}>{d.months.length} month(s) depreciated</summary>
          <table style={{ borderCollapse: 'collapse', marginTop: 8 }}><tbody>{d.months.map((m) => <tr key={m.period_end}><td style={td}>{m.period_end}</td><td style={{ ...td, ...num }}>{money(m.amount)}</td></tr>)}</tbody></table>
        </details>
      )}
    </div>
  );
}

/** Depreciation: choose a month, look at what is due, post it; undo the latest; and the asset register. */
export function DepreciationTab({ toast }) {
  const [upTo, setUpTo] = useState(lastMonthEnd());
  const [pre, setPre] = useState(null);
  const [hist, setHist] = useState([]);
  const [reg, setReg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadSide = useCallback(async () => {
    try { setHist((await inventoryAPI.accounting.history()).data ?? []); setReg((await inventoryAPI.accounting.register()).data); }
    catch (e) { setErr(e?.response?.data?.message ?? 'Could not load.'); }
  }, []);
  useEffect(() => { loadSide(); }, [loadSide]);

  const run = async (fn, ok) => {
    setBusy(true); setErr('');
    try { const r = await fn(); if (ok) toast(ok(r), 'success'); return r; }
    catch (e) { setErr(e?.response?.data?.message ?? 'That did not work.'); }
    finally { setBusy(false); }
  };
  const preview = () => run(async () => { setPre((await inventoryAPI.accounting.preview({ up_to: upTo })).data); });
  const post = () => run(async () => { const r = await inventoryAPI.accounting.post({ up_to: upTo }); setPre(null); await loadSide(); return r; }, (r) => r.message);
  const undo = (id) => window.confirm('Cancel this depreciation journal? The assets will owe that month again.') && run(async () => { await inventoryAPI.accounting.undo(id); await loadSide(); setPre(null); }, () => 'Depreciation undone');

  return (
    <div>
      {err && <div role="alert" style={{ color: colors.dangerText, fontSize: '0.82rem', marginBottom: 10 }}>{err}</div>}
      <div style={{ ...card, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Depreciate up to the end of</div>
        <div style={{ fontSize: '0.76rem', color: colors.textMuted, marginBottom: 10 }}>Look at what is due first. Posting makes one Journal per category and currency for each month (Dr Depreciation Expense, Cr Accumulated Depreciation).</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" style={{ ...input, width: 170 }} value={upTo} onChange={(e) => { setUpTo(e.target.value); setPre(null); }} />
          <button type="button" style={btnGhost} disabled={busy} onClick={preview}>Look at what is due</button>
          {pre && pre.journals.length > 0 && <button type="button" style={btnPrimary} disabled={busy} onClick={post}>Post {pre.journals.length} journal(s)</button>}
        </div>
      </div>

      {pre && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          {pre.journals.length === 0 && <div style={{ fontSize: '0.84rem', color: colors.textMuted }}>Nothing is due up to {pre.up_to}.</div>}
          {pre.journals.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Journals that would be posted</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 14 }}>
                <thead><tr><th style={th}>Month</th><th style={th}>Category</th><th style={th}>Currency</th><th style={{ ...th, ...num }}>Amount</th></tr></thead>
                <tbody>{pre.journals.map((j, i) => <tr key={i}><td style={td}>{j.period_end}</td><td style={td}>{j.category}</td><td style={td}>{j.currency ?? 'Base'}</td><td style={{ ...td, ...num }}>{money(j.amount)}</td></tr>)}</tbody>
              </table>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>By asset</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr><th style={th}>Asset</th><th style={th}>Method</th><th style={{ ...th, ...num }}>Cost</th><th style={{ ...th, ...num }}>Floor</th><th style={{ ...th, ...num }}>Charge</th><th style={{ ...th, ...num }}>Book value after</th></tr></thead>
                  <tbody>{pre.assets.map((a) => <tr key={a.instance_id}><td style={td}>{a.asset}</td><td style={td}>{a.method === 'straight_line' ? 'Straight line' : 'Reducing balance'}</td><td style={{ ...td, ...num }}>{a.currency ?? ''} {money(a.cost)}</td><td style={{ ...td, ...num }}>{money(a.floor)}</td><td style={{ ...td, ...num }}>{money(a.charge)}</td><td style={{ ...td, ...num }}>{money(a.book_value_after)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {pre.problems.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: colors.warningText }}>Cannot be depreciated yet</div>
              {pre.problems.map((p) => <div key={p.instance_id} style={{ fontSize: '0.8rem', color: colors.textMuted }}>{p.asset} — {p.reason}</div>)}
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Posted</div>
        {hist.length === 0 ? <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>No depreciation posted yet.</div> : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Month</th><th style={th}>Journal</th><th style={th}>Assets</th><th style={{ ...th, ...num }}>Amount</th><th style={th} /></tr></thead>
            <tbody>{hist.map((h) => <tr key={h.voucher_id} style={{ opacity: h.status === 'cancelled' ? 0.45 : 1 }}>
              <td style={td}>{h.period_end}</td><td style={td}>{h.voucher_number} <span style={{ color: colors.textFaint }}>· {h.narration}</span></td><td style={td}>{h.assets}</td>
              <td style={{ ...td, ...num }}>{h.currency ?? ''} {money(h.amount)}</td>
              <td style={td}>{h.status === 'posted' && <button type="button" style={{ ...btnGhost, padding: '2px 8px' }} disabled={busy} onClick={() => undo(h.voucher_id)}>Undo</button>}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      {reg && (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Asset register</div>
          <div style={{ fontSize: '0.74rem', color: colors.textMuted, marginBottom: 10 }}>Each asset in its own currency; the last three columns are in {reg.base_currency} at today's rates, so they follow a change of rate or base currency.</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Asset</th><th style={th}>Cur.</th><th style={{ ...th, ...num }}>Cost</th><th style={{ ...th, ...num }}>Depreciated</th><th style={{ ...th, ...num }}>Book value</th><th style={{ ...th, ...num }}>Cost ({reg.base_currency})</th><th style={{ ...th, ...num }}>Depreciated</th><th style={{ ...th, ...num }}>Book value</th></tr></thead>
              <tbody>
                {reg.rows.map((r) => <tr key={r.instance_id}><td style={td}>{r.asset}</td><td style={td}>{r.currency}</td><td style={{ ...td, ...num }}>{money(r.cost)}</td><td style={{ ...td, ...num }}>{money(r.accumulated)}</td><td style={{ ...td, ...num }}>{money(r.book_value)}</td><td style={{ ...td, ...num }}>{money(r.base_cost)}</td><td style={{ ...td, ...num }}>{money(r.base_accumulated)}</td><td style={{ ...td, ...num }}>{money(r.base_book_value)}</td></tr>)}
                <tr><td style={{ ...td, fontWeight: 700 }} colSpan={5}>Total in {reg.base_currency}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{money(reg.totals.cost)}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{money(reg.totals.accumulated)}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{money(reg.totals.book_value)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
