import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import payrollAPI from '../../../../_shared/api/payroll';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { money } from '../../../components/admin/books/booksFmt';

/**
 * Gratuity (service pay): for each person, completed years of service to the date (or to the day they left) × the days of pay per year × a day's pay.
 * What the business would owe if everyone were paid off on that date — the figure to provide for. The days per year, the minimum completed years and the
 * day's-pay divisor are set in Payroll settings.
 */

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const r = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function Gratuity() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [left, setLeft] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => payrollAPI.gratuity({ as_of: asOf, include_left: left ? 1 : undefined }).then(setData).catch((e) => setError(errMsg(e, 'Could not work out the gratuity'))), [asOf, left]);
  useEffect(() => { load(); }, [load]);
  const csv = () => {
    const lines = [['Employee', 'Hired', 'Left', 'Service', 'Completed years', 'Basic', 'Per year', 'Due (completed years)', 'With part-years'], ...data.rows.map((x) => [x.name, x.hire_date, x.left ?? '', x.service, x.full_years, x.basic, x.per_year, x.due, x.with_part_year])];
    const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gratuity-${data.as_of}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const st = data?.settings;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Gratuity" description="Service pay owed to each person for their completed years, as at a date — the figure to provide for." action={<Link to="/admin/payroll/settings" style={{ ...btnGhost, textDecoration: 'none' }}>Rates in Payroll configuration</Link>} />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 12px' }}>
          <label style={{ fontSize: '0.8rem' }}>As at <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} /></label>
          <label style={{ fontSize: '0.8rem' }}><input type="checkbox" checked={left} onChange={(e) => setLeft(e.target.checked)} /> Include people who have left</label>
          {data && <button type="button" style={{ ...btnGhost, marginLeft: 'auto' }} onClick={csv}>Download CSV</button>}
        </div>
        {data && !data.columns_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.78rem' }}>Using the built-in rates. Run script 66_payroll_gratuity.sql to set your own in Payroll configuration.</p>}
        {data && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: colors.textMuted }}>{st.days_per_year} days of pay for each completed year, after {st.min_years} completed year{st.min_years === 1 ? '' : 's'}; a day's pay is basic ÷ {st.divisor}.</p>
            {data.missing_hire_date.length > 0 && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.78rem' }}>No hire date on the employee record, so left out: {data.missing_hire_date.join(', ')}.</p>}
            <section style={{ ...card, padding: 8, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Employee</th><th style={th}>Hired</th><th style={th}>Service</th><th style={{ ...th, ...r }}>Basic</th><th style={{ ...th, ...r }}>Per year</th><th style={{ ...th, ...r }}>Due (completed years)</th><th style={{ ...th, ...r }}>With part-years</th></tr></thead>
                <tbody>
                  {!data.rows.length && <tr><td style={{ ...td, color: colors.textMuted }} colSpan={7}>Nobody to show.</td></tr>}
                  {data.rows.map((x) => (
                    <tr key={x.user_id}>
                      <td style={td}><strong>{x.name}</strong>{x.left && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · left {x.left}</span>}</td>
                      <td style={td}>{x.hire_date}</td><td style={td}>{x.service}{!x.eligible && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · not yet due</span>}</td>
                      <td style={{ ...td, ...r }}>{money(x.basic)}</td><td style={{ ...td, ...r }}>{money(x.per_year)}</td><td style={{ ...td, ...r, fontWeight: 700 }}>{money(x.due)}</td><td style={{ ...td, ...r, color: colors.textMuted }}>{money(x.with_part_year)}</td>
                    </tr>
                  ))}
                  {data.rows.length > 0 && <tr><td style={{ ...td, fontWeight: 800 }} colSpan={3}>Total</td><td style={{ ...td, ...r, fontWeight: 800 }}>{money(data.totals.basic)}</td><td style={td} /><td style={{ ...td, ...r, fontWeight: 800 }}>{money(data.totals.due)}</td><td style={{ ...td, ...r, fontWeight: 800 }}>{money(data.totals.with_part_year)}</td></tr>}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
