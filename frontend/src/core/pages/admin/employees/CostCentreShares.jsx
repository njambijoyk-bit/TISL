import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import departmentsAPI from '../../../../_shared/api/departments';
import costCentresAPI from '../../../../_shared/api/costCentres';

const cell = {
  width: '100%', padding: '7px 9px', borderRadius: 8, fontSize: '0.8rem', fontFamily: 'inherit', boxSizing: 'border-box',
  background: 'var(--surface-card, #fff)', border: '1.5px solid var(--line)', color: 'var(--text-primary)', outline: 'none',
};

/** Total of the shares in force on a date (null dates are open-ended). */
const totalOn = (rows, day) => rows.reduce((t, r) => ((!r.valid_from || r.valid_from <= day) && (!r.valid_to || r.valid_to >= day) ? t + (Number(r.share_percent) || 0) : t), 0);

/**
 * The cost centres an employee's pay is split across, with a share and optional dates. `sharesRef.current` holds { touched, rows } so the form
 * can save them after the employee is saved. Without a department there is nothing to split yet (the department's cost centre is the home one).
 */
export default function CostCentreShares({ employeeId, homeCostCentreId, sharesRef }) {
  const [rows, setRows] = useState([]);
  const [options, setOptions] = useState([]);

  useEffect(() => {
    costCentresAPI.list().then((d) => setOptions((d.data ?? []).filter((c) => c.is_active))).catch(() => setOptions([]));
    if (employeeId) {
      departmentsAPI.shares(employeeId).then((d) => setRows((d.data ?? []).map((r) => ({ cost_centre_id: r.cost_centre_id, kind: r.kind, share_percent: Number(r.share_percent), valid_from: r.valid_from ?? '', valid_to: r.valid_to ?? '' })))).catch(() => {});
    }
  }, [employeeId]);

  const change = (next) => { setRows(next); sharesRef.current = { touched: true, rows: next }; };
  const set = (i, k, v) => change(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => change([...rows, { cost_centre_id: '', kind: 'project', share_percent: 0, valid_from: '', valid_to: '' }]);

  if (!options.length) return null;

  // the dates where the total can change, to point at a problem before the server does
  const days = ['0000-01-01', ...rows.flatMap((r) => [r.valid_from, r.valid_to && new Date(new Date(r.valid_to).getTime() + 864e5).toISOString().slice(0, 10)]).filter(Boolean)];
  const bad = rows.length ? days.map((d) => ({ d, t: totalOn(rows, d) })).find((x) => Math.abs(x.t - 100) > 0.005) : null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Cost centres (how their pay is split)</p>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        By default all of it goes to their department's cost centre. Add a project or another cost centre with a share, for the dates it applies. On every date the shares must total 100%.
        {!employeeId && homeCostCentreId && ' The department\'s cost centre is set when the person is saved.'}
      </p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,2fr) 90px 100px 130px 130px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <select value={r.cost_centre_id} onChange={(e) => set(i, 'cost_centre_id', Number(e.target.value))} style={cell}>
            <option value="">Cost centre…</option>
            {options.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
          </select>
          <select value={r.kind} onChange={(e) => set(i, 'kind', e.target.value)} style={cell}>
            <option value="home">Home</option><option value="project">Project</option><option value="other">Other</option>
          </select>
          <input type="number" min="0" max="100" step="0.01" value={r.share_percent} onChange={(e) => set(i, 'share_percent', e.target.value)} style={cell} aria-label="Share percent" />
          <input type="date" value={r.valid_from} onChange={(e) => set(i, 'valid_from', e.target.value)} style={cell} aria-label="From" />
          <input type="date" value={r.valid_to} onChange={(e) => set(i, 'valid_to', e.target.value)} style={cell} aria-label="To" />
          <button type="button" onClick={() => change(rows.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }} aria-label="Remove"><Trash2 size={14} /></button>
        </div>
      ))}
      {bad && <p style={{ fontSize: '0.72rem', color: '#b91c1c', margin: '0 0 8px' }}>The shares add up to {Math.round(bad.t * 100) / 100}% {bad.d === '0000-01-01' ? 'before the first date' : `from ${bad.d}`}. They must total 100%.</p>}
      <button type="button" onClick={add} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--color-primary-600)', fontFamily: 'inherit' }}>
        <Plus size={13} /> Add a cost centre
      </button>
    </div>
  );
}
