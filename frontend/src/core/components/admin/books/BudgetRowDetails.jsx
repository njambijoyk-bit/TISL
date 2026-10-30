import { useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../../../_shared/theme/tokens';
import { CheckboxRow, Field, FormGrid, NumberInput, SelectInput, TextInput } from '../ui/Form';
import { METHODS, SEASONS, fillMonths } from './budgetMethods';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (i) => String(i + 1).padStart(2, '0');

/**
 * The details of one budget row, opened under it: which cost centre, department, branch and initiative it is for, whether it is a recovery, and how its months are filled
 * (a method and what it needs, applied to the months above, which can still be changed by hand).
 */
export default function BudgetRowDetails({ row, rows, choices, months, year, canEdit, onChange, onApply }) {
  const [method, setMethod] = useState(row.method === 'manual' ? 'fixed' : row.method);
  const [params, setParams] = useState(row.method_params ?? {});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => onChange({ [k]: e.target.value === '' ? null : Number(e.target.value) });
  const p = (k, v) => setParams((x) => ({ ...x, [k]: v }));
  const others = rows.filter((r) => r.key !== row.key);
  const label = (r) => `${r.name}${r.dimensions?.length ? ` (${r.dimensions.join(', ')})` : ''}`;
  const valuesOf = (key) => Object.fromEntries(Object.entries(rows.find((r) => r.key === key)?.months ?? {}).map(([ym, v]) => [ym, Number(v) || 0]));

  const apply = async () => {
    let history;
    if (method === 'history') {
      setBusy(true);
      try {
        history = (await booksAPI.budgetHistory({ type: row.type, target_id: row.target_id, year, cost_centre_id: row.cost_centre_id || undefined, department_id: row.department_id || undefined, location_id: row.location_id || undefined })).months;
      } catch (e) { toast.error(errMsg(e, "Could not read last year's figures")); setBusy(false); return; }
      setBusy(false);
    }
    const filled = fillMonths(method, params, { months, valuesOf, history });
    if (!filled) { toast.error('Choose the row to use first'); return; }
    onApply(filled, method, params);
    toast.success('Months filled. You can still change any of them.');
  };
  const shares = params.shares ?? {};
  const field = { style: { maxWidth: 200 } };

  return (
    <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, margin: '4px 0 10px', background: colors.tint(0.025), maxWidth: 900, position: 'sticky', left: 0 }}>
      <FormGrid min={190}>
        <Field label="Cost centre" htmlFor={`b-cc-${row.key}`}>
          <SelectInput id={`b-cc-${row.key}`} disabled={!canEdit || !choices.dimensions_ready} value={row.cost_centre_id ?? ''} onChange={set('cost_centre_id')}>
            <option value="">Any cost centre</option>{choices.cost_centres.map((c) => <option key={c.id} value={c.id}>{'  '.repeat(c.depth)}{c.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Department" htmlFor={`b-dep-${row.key}`} hint="A department's own cost centre is where its actuals are read from.">
          <SelectInput id={`b-dep-${row.key}`} disabled={!canEdit || !choices.dimensions_ready} value={row.department_id ?? ''} onChange={set('department_id')}>
            <option value="">Any department</option>{choices.departments.filter((d) => d.is_active || d.id === row.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}{d.location ? ` (${d.location})` : ''}</option>)}
          </SelectInput>
        </Field>
        <Field label="Branch" htmlFor={`b-loc-${row.key}`}>
          <SelectInput id={`b-loc-${row.key}`} disabled={!canEdit || !choices.dimensions_ready} value={row.location_id ?? ''} onChange={set('location_id')}>
            <option value="">Any branch</option>{choices.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Initiative" htmlFor={`b-ini-${row.key}`} hint="Actuals by initiative appear once the books carry it.">
          <SelectInput id={`b-ini-${row.key}`} disabled={!canEdit} value={row.initiative_id ?? ''} onChange={set('initiative_id')}>
            <option value="">None</option>{choices.initiatives.filter((i) => i.is_active || i.id === row.initiative_id).map((i) => <option key={i.id} value={i.id}>{'  '.repeat(i.depth)}{i.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Note" htmlFor={`b-note-${row.key}`}><TextInput id={`b-note-${row.key}`} disabled={!canEdit} maxLength={160} value={row.note ?? ''} onChange={(e) => onChange({ note: e.target.value })} /></Field>
      </FormGrid>
      {row.section === 'expense' && (
        <CheckboxRow disabled={!canEdit} checked={row.is_recovery} onChange={(e) => onChange({ is_recovery: e.target.checked })} label="This is a recovery"
          description="Money expected to be credited back to this expense (travel recharged to a customer). It lowers the net spend on the account." />
      )}
      {row.section === 'balance' && (
        <CheckboxRow disabled={!canEdit} checked={row.is_recovery} onChange={(e) => onChange({ is_recovery: e.target.checked })} label="This is a reduction"
          description="The planned movement goes the other way: an asset sold, or a loan repaid. In the cash budget an asset line is cash spent and a liability or equity line is cash raised; a reduction reverses that." />
      )}
      {canEdit && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.tint(0.1)}` }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted }}>Fill the months</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Way of filling" htmlFor={`b-m-${row.key}`}>
              <SelectInput id={`b-m-${row.key}`} value={method} onChange={(e) => { setMethod(e.target.value); setParams({}); }}>{METHODS.filter(([k]) => k !== 'manual').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
            </Field>
            {method === 'fixed' && <Field label="Amount each month" htmlFor={`b-a-${row.key}`}><NumberInput id={`b-a-${row.key}`} min="0" step="0.01" value={params.amount ?? ''} onChange={(e) => p('amount', e.target.value)} {...field} /></Field>}
            {(method === 'annual' || method === 'seasonal') && <Field label="Yearly figure" htmlFor={`b-t-${row.key}`}><NumberInput id={`b-t-${row.key}`} min="0" step="0.01" value={params.total ?? ''} onChange={(e) => p('total', e.target.value)} {...field} /></Field>}
            {method === 'percent' && <>
              <Field label="Of this row" htmlFor={`b-o-${row.key}`}><SelectInput id={`b-o-${row.key}`} value={params.of ?? ''} onChange={(e) => p('of', e.target.value)}><option value="">Choose a row…</option>{others.map((r) => <option key={r.key} value={r.key}>{label(r)}</option>)}</SelectInput></Field>
              <Field label="Percent" htmlFor={`b-p-${row.key}`}><NumberInput id={`b-p-${row.key}`} min="0" step="0.01" value={params.percent ?? ''} onChange={(e) => p('percent', e.target.value)} {...field} /></Field>
            </>}
            {method === 'quantity' && <>
              <Field label="Quantity each month" htmlFor={`b-q-${row.key}`}><NumberInput id={`b-q-${row.key}`} min="0" step="0.01" value={params.quantity ?? ''} onChange={(e) => p('quantity', e.target.value)} {...field} /></Field>
              <Field label="Rate" htmlFor={`b-r-${row.key}`}><NumberInput id={`b-r-${row.key}`} min="0" step="0.01" value={params.rate ?? ''} onChange={(e) => p('rate', e.target.value)} {...field} /></Field>
            </>}
            {method === 'history' && <Field label="Growth (%)" htmlFor={`b-g-${row.key}`} hint={`Last year's ${year - 1} actuals for this account, plus or minus this.`}><NumberInput id={`b-g-${row.key}`} step="0.1" value={params.growth ?? ''} onChange={(e) => p('growth', e.target.value)} {...field} /></Field>}
            {method === 'copy' && <Field label="Copy this row" htmlFor={`b-c-${row.key}`}><SelectInput id={`b-c-${row.key}`} value={params.of ?? ''} onChange={(e) => p('of', e.target.value)}><option value="">Choose a row…</option>{others.map((r) => <option key={r.key} value={r.key}>{label(r)}</option>)}</SelectInput></Field>}
            <button type="button" style={{ ...btnPrimary, marginBottom: 2 }} disabled={busy} onClick={apply}>{busy ? 'Reading…' : 'Fill the months'}</button>
          </div>
          {method === 'seasonal' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', fontSize: '0.72rem', color: colors.textMuted }}>
                Share of the year by month (percent):
                {Object.entries(SEASONS).map(([k, [name, vals]]) => <button key={k} type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => p('shares', Object.fromEntries(vals.map((v, i) => [pad(i), Math.round(v * 100) / 100])))}>{name}</button>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}>
                {MONTHS.map((m, i) => (
                  <label key={m} style={{ fontSize: '0.64rem', color: colors.textFaint }}>{m}
                    <input type="number" min="0" step="0.1" value={shares[pad(i)] ?? Math.round((100 / 12) * 100) / 100} onChange={(e) => p('shares', { ...shares, [pad(i)]: e.target.value })} aria-label={`${m} share`}
                      style={{ width: '100%', padding: '4px 6px', fontSize: '0.74rem', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--bg-primary)', color: colors.text }} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
