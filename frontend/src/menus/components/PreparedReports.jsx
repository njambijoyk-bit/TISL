import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import menusAPI from '../../_shared/api/menus';
import { Field, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../_shared/theme/tokens';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const thr = { ...th, textAlign: 'right' };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const tdr = { ...td, textAlign: 'right' };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function Reconcile({ location, from, to, daily }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    menusAPI.preparedReconciliation({ location_id: location, from, to, daily: daily ? 1 : 0 }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the reconciliation')));
  }, [location, from, to, daily]);
  if (!data) return <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p>;

  const table = (rows, key) => (!rows.length ? (
    <p key={key} style={{ padding: '14px 20px', margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>Nothing was on the shelf or moved.</p>
  ) : (
    <table key={key} style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th style={th}>Recipe</th><th style={thr}>Opening</th><th style={thr}>Made</th><th style={thr}>Served</th><th style={thr}>Thrown away</th><th style={thr}>Count found</th><th style={thr}>Closing</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.recipe_id}>
          <td style={td}><strong>{r.name}</strong>{r.differs && <div style={{ color: colors.danger }}>The shelf holds {num(r.shelf_now, 3)} {r.unit} now, not {num(r.closing, 3)}: something changed outside the batches, waste and counts.</div>}</td>
          <td style={tdr}>{num(r.opening, 3)} {r.unit}</td>
          <td style={tdr}>{num(r.made, 3)}{r.made_value ? <div style={{ color: colors.textMuted }}>{num(r.made_value)}</div> : null}</td>
          <td style={tdr}>{num(r.served, 3)}</td>
          <td style={tdr}>{num(r.waste, 3)}{r.waste_value ? <div style={{ color: colors.textMuted }}>{num(r.waste_value)}</div> : null}</td>
          <td style={{ ...tdr, color: r.count < 0 ? colors.danger : r.count > 0 ? colors.success : undefined }}>{r.count > 0 ? '+' : ''}{num(r.count, 3)}{r.count_value ? <div style={{ color: colors.textMuted }}>{num(r.count_value)}</div> : null}</td>
          <td style={tdr}><strong>{num(r.closing, 3)} {r.unit}</strong></td>
        </tr>
      ))}</tbody>
    </table>
  ));

  if (!data.ready) return <p role="status" style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Run database script 198_menus_prepared_food.sql first.</p>;
  if (daily) return <div>{data.days.map((d) => <div key={d.date}><div style={{ padding: '10px 10px 0', fontWeight: 800, fontSize: '0.8rem' }}>{d.date}</div>{table(d.rows, d.date)}</div>)}</div>;

  return <div>{table(data.rows, 'all')}<p style={{ margin: 0, padding: '8px 12px 12px', fontSize: '0.74rem', color: colors.textFaint }}>Opening + made − served − thrown away ± what a count found = closing. Served is filled in once dishes take from prepared stock.</p></div>;
}

function Chefs({ location, from, to, recipe }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    menusAPI.preparedChefs({ location_id: location, from, to, recipe_id: recipe || undefined }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the chef comparison')));
  }, [location, from, to, recipe]);
  if (!data) return <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p>;
  if (!data.ready) return <p role="status" style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Run database script 198_menus_prepared_food.sql first.</p>;
  if (!data.rows.length) return <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No batches in these dates.</p>;
  const over = (m) => (m == null ? '—' : `${m > 0 ? '+' : ''}${num(m, 1)}`);

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Recipe</th><th style={th}>Made by</th><th style={thr}>Batches</th><th style={thr}>Made</th><th style={thr}>Minutes a batch</th><th style={thr}>Expected</th><th style={thr}>Over / under</th><th style={thr}>Minutes per unit</th><th style={thr}>Came out</th><th style={thr}>Recipe followed</th><th style={thr}>Servings per unit</th><th style={thr}>Cost per unit</th></tr></thead>
        <tbody>{data.rows.map((r) => (
          <tr key={`${r.recipe_id}-${r.chef_id ?? 0}`}>
            <td style={td}><strong>{r.recipe}</strong></td>
            <td style={td}>{r.chef}</td>
            <td style={tdr}>{r.batches}</td>
            <td style={tdr}>{num(r.made, 3)} {r.unit}</td>
            <td style={tdr}>{num(r.minutes_avg, 1)}</td>
            <td style={tdr}>{num(r.expected_avg, 1)}</td>
            <td style={{ ...tdr, color: r.over_minutes > 0 ? colors.danger : r.over_minutes < 0 ? colors.success : undefined }}>{over(r.over_minutes)}</td>
            <td style={tdr}>{num(r.minutes_per_unit, 2)}</td>
            <td style={tdr}>{r.yield_pct == null ? '—' : `${num(r.yield_pct, 1)}%`}</td>
            <td style={tdr}>{r.recipe_followed_pct == null ? '—' : `${num(r.recipe_followed_pct, 1)}%`}</td>
            <td style={tdr}>{num(r.servings_per_unit, 2)}</td>
            <td style={tdr}>{num(r.cost_per_unit, 2)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p style={{ margin: 0, padding: '8px 12px 12px', fontSize: '0.74rem', color: colors.textFaint }}>Recipes are never added together: their units differ. Minutes are from the start and finish noted on the batch; a batch without them is left out of the minutes. Came out is what was made against what was planned; recipe followed is what was really used against what the recipe said.</p>
    </div>
  );
}

/** Menus → Prepared food → Reports: the daily reconciliation of each prepared item, and the chefs compared. */
export default function PreparedReports({ location, recipes }) {
  const [mode, setMode] = useState('reconcile');
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(new Date()));
  const [daily, setDaily] = useState(false);
  const [chefFrom, setChefFrom] = useState(daysAgo(30));
  const [chefTo, setChefTo] = useState(iso(new Date()));
  const [recipe, setRecipe] = useState('');
  const tab = (k, label) => <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', fontWeight: mode === k ? 800 : 500, background: mode === k ? colors.tint(0.08) : undefined }} onClick={() => setMode(k)}>{label}</button>;

  return (
    <div data-testid="prepared-reports" style={{ marginTop: 26 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>Reports</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>{tab('reconcile', 'Daily reconciliation')}{tab('chefs', 'Chefs compared')}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 10 }}>
        {mode === 'reconcile' ? (
          <>
            <Field label="From" htmlFor="pr-from"><TextInput id="pr-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="pr-to"><TextInput id="pr-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', paddingBottom: 10 }}><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> One table for each day (up to 31)</label>
          </>
        ) : (
          <>
            <Field label="From" htmlFor="pc-from"><TextInput id="pc-from" type="date" value={chefFrom} max={chefTo} onChange={(e) => setChefFrom(e.target.value)} /></Field>
            <Field label="To" htmlFor="pc-to"><TextInput id="pc-to" type="date" value={chefTo} min={chefFrom} onChange={(e) => setChefTo(e.target.value)} /></Field>
            <Field label="Recipe" htmlFor="pc-recipe"><SelectInput id="pc-recipe" value={recipe} onChange={(e) => setRecipe(e.target.value)}><option value="">All recipes</option>{recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>
          </>
        )}
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        {mode === 'reconcile' ? <Reconcile location={location} from={from} to={to} daily={daily} /> : <Chefs location={location} from={chefFrom} to={chefTo} recipe={recipe} />}
      </div>
    </div>
  );
}
