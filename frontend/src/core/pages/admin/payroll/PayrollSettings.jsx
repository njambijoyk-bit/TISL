import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import payrollAPI from '../../../../_shared/api/payroll';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money } from '../../../components/admin/books/booksFmt';

/**
 * Payroll settings. Nothing is fixed to a country: every earning, deduction and employer contribution is a row you edit — a percentage of a base (with a cap on the
 * base, a minimum and a maximum), a fixed amount, or bands taxed slice by slice; with the ledger it posts to. The Kenyan rows are starters, switched off, to check and use.
 */

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const blank = { code: '', name: '', kind: 'deduction', calc: 'percent', base: 'gross', value: '', bands: [{ upto: '', rate: '' }], base_cap: '', min_amount: '', max_amount: '', relief: '', reduces_taxable: false, applies_to: 'all', ledger_id: '', expense_ledger_id: '', jurisdiction: '', notes: '', sort_order: 100, is_active: false };

function describe(c) {
  const on = { basic: 'basic pay', gross: 'gross pay', taxable: 'taxable pay' }[c.base];
  if (c.calc === 'percent') return `${c.value}% of ${on}${c.base_cap ? ` (up to ${money(c.base_cap)})` : ''}${c.min_amount ? `, min ${money(c.min_amount)}` : ''}${c.max_amount ? `, max ${money(c.max_amount)}` : ''}`;
  if (c.calc === 'bands') return `${(c.bands ?? []).length} bands on ${on}${c.relief ? `, relief ${money(c.relief)}` : ''}`;
  return `${money(c.value)} each month`;
}

function ComponentModal({ comp, ledgers, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...blank, ...Object.fromEntries(Object.entries(comp ?? {}).map(([k, v]) => [k, v ?? (k === 'bands' ? [{ upto: '', rate: '' }] : '')])) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const num = (v) => (v === '' || v === null ? null : Number(v));
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const body = { ...f, value: num(f.value) ?? 0, base_cap: num(f.base_cap), min_amount: num(f.min_amount), max_amount: num(f.max_amount), relief: num(f.relief), ledger_id: f.ledger_id ? Number(f.ledger_id) : null, expense_ledger_id: f.expense_ledger_id ? Number(f.expense_ledger_id) : null,
        bands: f.calc === 'bands' ? f.bands.filter((b) => b.rate !== '').map((b) => ({ upto: num(b.upto), rate: Number(b.rate) })) : null };
      delete body.id; delete body.created_at; delete body.updated_at;
      await payrollAPI.saveComponent(body, comp?.id); toast.success('Saved'); onSaved();
    } catch (x) { setErr(errMsg(x, 'Could not save')); } finally { setBusy(false); }
  };
  const liab = ledgers.filter((l) => ['liability', 'asset', 'expense'].includes(l.nature) || !l.nature);
  return (
    <Modal title={comp ? `Edit ${comp.name}` : 'New payroll component'} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 180 }}><Field label="Name"><TextInput required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="NITA levy" /></Field></div>
            <div style={{ width: 130 }}><Field label="Code"><TextInput required value={f.code} onChange={(e) => set('code', e.target.value.replace(/[^A-Za-z0-9_]/g, '').toUpperCase())} placeholder="NITA" /></Field></div>
          </div>
          <Field label="What is it"><SelectInput value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="deduction">Deduction — taken from the employee</option><option value="employer">Employer contribution — a cost to the business</option><option value="earning">Earning — added to pay (an allowance)</option></SelectInput></Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 170 }}><Field label="How it is worked out"><SelectInput value={f.calc} onChange={(e) => set('calc', e.target.value)}><option value="percent">A percentage</option><option value="fixed">A fixed amount</option><option value="bands">Bands (each slice at its own rate)</option></SelectInput></Field></div>
            {f.calc !== 'fixed' && f.kind !== 'earning' && <div style={{ flex: 1, minWidth: 150 }}><Field label="Of which pay"><SelectInput value={f.base} onChange={(e) => set('base', e.target.value)}><option value="basic">Basic pay</option><option value="gross">Gross pay</option><option value="taxable">Taxable pay</option></SelectInput></Field></div>}
            {f.calc !== 'bands' && <div style={{ width: 130 }}><Field label={f.calc === 'percent' ? 'Percent' : 'Amount'}><NumberInput min="0" step="any" value={f.value} onChange={(e) => set('value', e.target.value)} /></Field></div>}
          </div>
          {f.calc === 'bands' && (
            <div>
              <div style={{ fontSize: '0.74rem', color: colors.textFaint, marginBottom: 4 }}>Each slice of pay up to a limit is charged at that band's rate. Leave the last limit empty for "and above".</div>
              {f.bands.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
                  <input type="number" min="0" placeholder="Up to (empty = no limit)" value={b.upto ?? ''} onChange={(e) => set('bands', f.bands.map((x, n) => (n === i ? { ...x, upto: e.target.value } : x)))} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
                  <input type="number" min="0" max="100" step="any" placeholder="Rate %" value={b.rate} onChange={(e) => set('bands', f.bands.map((x, n) => (n === i ? { ...x, rate: e.target.value } : x)))} style={{ width: 100, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
                  <button type="button" style={small} onClick={() => set('bands', f.bands.filter((_, n) => n !== i))}>×</button>
                </div>
              ))}
              <button type="button" style={small} onClick={() => set('bands', [...f.bands, { upto: '', rate: '' }])}>+ Add a band</button>
            </div>
          )}
          {f.calc !== 'fixed' && f.kind !== 'earning' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ width: 150 }}><Field label="Count pay only up to"><NumberInput min="0" value={f.base_cap} onChange={(e) => set('base_cap', e.target.value)} placeholder="no limit" /></Field></div>
              <div style={{ width: 120 }}><Field label="Minimum"><NumberInput min="0" value={f.min_amount} onChange={(e) => set('min_amount', e.target.value)} /></Field></div>
              <div style={{ width: 120 }}><Field label="Maximum"><NumberInput min="0" value={f.max_amount} onChange={(e) => set('max_amount', e.target.value)} /></Field></div>
              <div style={{ width: 130 }}><Field label="Relief (taken off)"><NumberInput min="0" value={f.relief} onChange={(e) => set('relief', e.target.value)} /></Field></div>
            </div>
          )}
          {f.kind === 'deduction' && <label style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={f.reduces_taxable} onChange={(e) => set('reduces_taxable', e.target.checked)} /> Taken off before tax is worked out (a pension, a tax-deductible levy)</label>}
          <Field label="Who gets it"><SelectInput value={f.applies_to} onChange={(e) => set('applies_to', e.target.value)}><option value="all">Everyone (except people exempted)</option><option value="selected">Only people it is given to (a loan, a union fee, an allowance)</option></SelectInput></Field>
          {f.kind !== 'earning' && <Field label={f.kind === 'employer' ? 'Owed to (the liability ledger)' : 'Posts to (the liability, or a loan/advance account)'}><SelectInput value={f.ledger_id} onChange={(e) => set('ledger_id', e.target.value)}><option value="">Choose…</option>{liab.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
          {f.kind === 'employer' && <Field label="Charged to (the expense ledger)"><SelectInput value={f.expense_ledger_id} onChange={(e) => set('expense_ledger_id', e.target.value)}><option value="">Choose…</option>{ledgers.filter((l) => l.nature === 'expense').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}><Field label="Jurisdiction (for your own reference)"><TextInput value={f.jurisdiction} onChange={(e) => set('jurisdiction', e.target.value)} placeholder="Kenya" /></Field></div>
            <div style={{ width: 100 }}><Field label="Order"><NumberInput min="0" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></Field></div>
          </div>
          <Field label="Notes"><TextInput value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <label style={{ fontSize: '0.82rem' }}><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Switched on (used in payroll)</label>
          <ModalActions onCancel={onClose} submitLabel="Save" busyLabel="Saving…" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function Items({ staff, components, onSaved }) {
  const [uid, setUid] = useState('');
  const [rows, setRows] = useState([]);
  const person = staff.find((p) => String(p.id) === String(uid));
  useEffect(() => { setRows(person ? person.items.map((i) => ({ ...i, amount: i.amount ?? '' })) : []); }, [uid, person]);
  const set = (i, k, v) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  const save = async () => { try { await payrollAPI.saveItems(uid, rows.filter((r) => r.component_id).map((r) => ({ component_id: Number(r.component_id), amount: r.amount === '' ? null : Number(r.amount), exempt: !!r.exempt, note: r.note || null }))); toast.success('Saved'); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save')); } };
  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ fontWeight: 700, color: colors.primaryDeep }}>Per person</div>
      <p style={{ margin: '2px 0 10px', fontSize: '0.74rem', color: colors.textFaint, maxWidth: 640 }}>Give someone a component that applies only to chosen people (a loan repayment, a union fee, an allowance), change their own amount, or exempt them from one that applies to everyone.</p>
      <select value={uid} onChange={(e) => setUid(e.target.value)} style={{ padding: 8, borderRadius: 8, minWidth: 240 }}><option value="">Choose a person…</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.salary)}</option>)}</select>
      {person && (
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={r.component_id} onChange={(e) => set(i, 'component_id', e.target.value)} style={{ padding: 6, borderRadius: 6, minWidth: 200 }}><option value="">Component…</option>{components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.applies_to === 'selected' ? ' (given)' : ''}</option>)}</select>
              <label style={{ fontSize: '0.78rem' }}><input type="checkbox" checked={!!r.exempt} onChange={(e) => set(i, 'exempt', e.target.checked)} /> Exempt</label>
              {!r.exempt && <input type="number" min="0" step="any" placeholder="Own amount / rate (optional)" value={r.amount} onChange={(e) => set(i, 'amount', e.target.value)} style={{ width: 190, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />}
              <input placeholder="Note" value={r.note ?? ''} onChange={(e) => set(i, 'note', e.target.value)} style={{ flex: 1, minWidth: 120, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
              <button type="button" style={small} onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}>×</button>
            </div>
          ))}
          <div><button type="button" style={small} onClick={() => setRows((rs) => [...rs, { component_id: '', amount: '', exempt: false, note: '' }])}>+ Add</button><button type="button" style={btnPrimary} onClick={save}>Save</button></div>
        </div>
      )}
    </section>
  );
}

export default function PayrollSettings() {
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => payrollAPI.settings().then((d) => { setData(d); setS(d.settings); }).catch((e) => setError(errMsg(e, 'Could not load'))), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { try { await payrollAPI.saveSettings({ ...s, overtime_multiplier: Number(s.overtime_multiplier), salaries_expense_ledger_id: s.salaries_expense_ledger_id || null, salaries_payable_ledger_id: s.salaries_payable_ledger_id || null, ...(s.gratuity_columns ? { gratuity_days_per_year: Number(s.gratuity_days_per_year), gratuity_min_years: Number(s.gratuity_min_years), gratuity_divisor: Number(s.gratuity_divisor), gratuity_prorate: !!s.gratuity_prorate } : {}) }); toast.success('Saved'); load(); } catch (e) { toast.error(errMsg(e, 'Could not save')); } };
  const toggle = async (c) => { try { await payrollAPI.saveComponent({ ...c, is_active: !c.is_active }, c.id); load(); } catch (e) { toast.error(errMsg(e, 'Could not change it')); } };
  const del = async (c) => { if (!window.confirm(`Delete ${c.name}?`)) return; try { await payrollAPI.deleteComponent(c.id); load(); } catch (e) { toast.error(errMsg(e, 'Could not delete')); } };
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Payroll configuration" description="Earnings, deductions and employer contributions are rows you edit — any country, any levy. Each posts to its own ledger." action={<Link to="/admin/payroll" style={{ ...btnGhost, textDecoration: 'none' }}>← Payroll</Link>} />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {data && !data.table_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 64_payroll.sql first.</p>}
        {data && s && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ ...card, padding: 16 }}>
              <div style={{ fontWeight: 700, color: colors.primaryDeep, marginBottom: 8 }}>General</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: 150 }}><Field label="Overtime pays (× hourly rate)"><NumberInput min="1" step="0.05" value={s.overtime_multiplier} onChange={(e) => setS({ ...s, overtime_multiplier: e.target.value })} /></Field></div>
                <label style={{ fontSize: '0.82rem', paddingBottom: 10 }}><input type="checkbox" checked={!!s.deduct_absence} onChange={(e) => setS({ ...s, deduct_absence: e.target.checked })} /> Deduct unpaid absence</label>
                <div style={{ minWidth: 220 }}><Field label="Salaries & wages (expense)"><SelectInput value={s.salaries_expense_ledger_id ?? ''} onChange={(e) => setS({ ...s, salaries_expense_ledger_id: e.target.value ? Number(e.target.value) : null })}><option value="">Choose…</option>{data.ledgers.filter((l) => l.nature === 'expense').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field></div>
                <div style={{ minWidth: 220 }}><Field label="Salaries payable (liability)"><SelectInput value={s.salaries_payable_ledger_id ?? ''} onChange={(e) => setS({ ...s, salaries_payable_ledger_id: e.target.value ? Number(e.target.value) : null })}><option value="">Choose…</option>{data.ledgers.filter((l) => l.nature === 'liability').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field></div>
                <button type="button" style={btnPrimary} onClick={save}>Save</button>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.84rem', width: '100%' }}>Gratuity (service pay) <Link to="/admin/payroll/gratuity" style={{ fontWeight: 400, fontSize: '0.76rem' }}>open the report →</Link></div>
                {s.gratuity_columns ? (
                  <>
                    <div style={{ width: 170 }}><Field label="Days of pay per year of service"><NumberInput min="0" step="any" value={s.gratuity_days_per_year ?? 15} onChange={(e) => setS({ ...s, gratuity_days_per_year: e.target.value })} /></Field></div>
                    <div style={{ width: 150 }}><Field label="Completed years first"><NumberInput min="0" value={s.gratuity_min_years ?? 1} onChange={(e) => setS({ ...s, gratuity_min_years: e.target.value })} /></Field></div>
                    <div style={{ width: 160 }}><Field label="A day's pay = basic ÷"><NumberInput min="1" max="31" value={s.gratuity_divisor ?? 30} onChange={(e) => setS({ ...s, gratuity_divisor: e.target.value })} /></Field></div>
                    <button type="button" style={btnPrimary} onClick={save}>Save</button>
                  </>
                ) : <p style={{ margin: 0, fontSize: '0.76rem', color: '#92400e' }}>Run script 66_payroll_gratuity.sql to set these. Until then the report uses 15 days a year, after 1 completed year, with a day = basic ÷ 30.</p>}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Pay for a month = basic salary, less unpaid absence (verified attendance), plus overtime. Working days and hours come from Attendance settings.</p>
            </section>

            <section style={{ ...card, padding: 8, overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px' }}>
                <div><div style={{ fontWeight: 700, color: colors.primaryDeep }}>Components</div><div style={{ fontSize: '0.74rem', color: colors.textFaint }}>The starter rows are for Kenya and are switched off — check every rate and limit against the current tables, then switch them on.</div></div>
                <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => setEdit({})}>Add a component</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>On</th><th style={th}>Name</th><th style={th}>Kind</th><th style={th}>Worked out as</th><th style={th}>Posts to</th><th style={th} /></tr></thead>
                <tbody>
                  {data.components.map((c) => (
                    <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.6 }}>
                      <td style={td}><input type="checkbox" checked={c.is_active} onChange={() => toggle(c)} aria-label={`Switch ${c.name} on or off`} /></td>
                      <td style={td}><strong>{c.name}</strong>{c.reduces_taxable && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · before tax</span>}{c.applies_to === 'selected' && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · given to chosen people</span>}{c.notes && <div style={{ color: '#92400e', fontSize: '0.7rem' }}>{c.notes}</div>}</td>
                      <td style={td}>{{ earning: 'Earning', deduction: 'Deduction', employer: 'Employer' }[c.kind]}</td>
                      <td style={td}>{describe(c)}</td>
                      <td style={td}>{data.ledgers.find((l) => l.id === c.ledger_id)?.name ?? <span style={{ color: '#b91c1c' }}>{c.kind === 'earning' ? '—' : 'not chosen'}</span>}{c.expense_ledger_id ? ` / ${data.ledgers.find((l) => l.id === c.expense_ledger_id)?.name}` : ''}</td>
                      <td style={td}><button type="button" style={small} onClick={() => setEdit(c)}>Edit</button><button type="button" style={small} onClick={() => del(c)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <Items staff={data.staff} components={data.components} onSaved={load} />
          </div>
        )}
        {edit && data && <ComponentModal comp={edit.id ? edit : null} ledgers={data.ledgers} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      </div>
    </AdminLayout>
  );
}
