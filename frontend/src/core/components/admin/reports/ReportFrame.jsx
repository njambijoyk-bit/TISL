import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import locationsAPI from '../../../../_shared/api/locations';
import costCentresAPI from '../../../../_shared/api/costCentres';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { ExportMenu } from '../books/booksUi';
import { filterStyle } from '../books/booksFmt';

/**
 * The frame every report on the engine sits in, so they all filter, warn, drill and export the same way.
 *
 *  - Opens on the financial year (the server says which dates) and runs once. After that nothing re-runs until Run is pressed, so a half-typed date
 *    never starts a heavy report; a note says when the figures on screen are not for the filters shown.
 *  - The banners come from the engine's answer: limited to your branches, filtered by cost centre or branch, restated at today's rate.
 *  - The header and footer text from the Reports settings are shown above and below the report.
 *  - Export goes through the same engine, so a file always matches the screen.
 *
 * `children(result)` draws the report's own body from `result.data`, with `result.format` for amounts.
 */

const Note = ({ children, tone = 'warning' }) => (
  <div role="note" style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: tone === 'warning' ? colors.warningText : colors.textMuted }}>{children}</div>
);

export default function ReportFrame({ reportKey, children }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({ from: '', to: '', compare: 'none', locId: '', ccId: '', opts: {}, page: 1 });
  const ran = useRef(null);   // the filters the figures on screen were run for
  const seq = useRef(0);
  const ranState = useRef(null);   // the filter values the figures on screen were run with
  const [branches, setBranches] = useState([]);
  const [ccOpts, setCcOpts] = useState({ ready: false, data: [] });

  const params = useCallback((x) => ({
    ...(x.from ? { from: x.from } : {}), ...(x.to ? { to: x.to } : {}), ...(x.compare && x.compare !== 'none' ? { compare: x.compare } : {}),
    ...(x.locId ? { location_id: x.locId } : {}), ...(x.ccId ? { cost_centre_id: x.ccId } : {}), ...(x.opts ?? {}), ...(x.page > 1 ? { page: x.page } : {}),
  }), []);

  const run = useCallback(async (x) => {
    const mine = ++seq.current;   // an older answer arriving late is dropped
    setLoading(true); setError(null);
    try {
      const r = await booksAPI.engineReport(reportKey, params(x));
      ranState.current = x;
      if (mine !== seq.current) return;
      setResult(r);
      ran.current = JSON.stringify(params(x));
      // the first run has no dates: take the ones the server used, so the filters show what the figures are for
      setF((cur) => ({ ...cur, from: x.from || r.scope.from || '', to: x.to || r.scope.to || '' }));
      ran.current = JSON.stringify(params({ ...x, from: x.from || r.scope.from || '', to: x.to || r.scope.to || '' }));
    } catch (e) {
      if (mine !== seq.current) return;
      setResult(null); setError(errMsg(e, 'Could not run the report')); toast.error(errMsg(e, 'Could not run the report'));
    } finally { if (mine === seq.current) setLoading(false); }
  }, [reportKey, params]);

  useEffect(() => { setResult(null); run({ from: '', to: '', compare: 'none', locId: '', ccId: '', opts: {}, page: 1 }); setF((x) => ({ ...x, opts: {}, compare: 'none', page: 1 })); }, [reportKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    costCentresAPI.options().then(setCcOpts).catch(() => {});
    locationsAPI.getAdmin().then((l) => setBranches((l.locations ?? []).filter((x) => x.is_active !== false))).catch(() => {});
  }, []);

  // the answer of another report (left over for a moment after switching reports) is never drawn with this report's view
  const current = result?.report?.key === reportKey ? result : null;
  const ranFilters = () => ({ ...f, ...(ranState.current ?? {}) });
  const rep = current?.report;
  const asOf = rep?.kind === 'asof';
  const stale = current && ran.current !== JSON.stringify(params(f));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const b = current?.banners ?? {};
  const fmt = current?.format ?? {};

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {rep?.filters?.includes('branch') && branches.length > 1 && (
          <select value={f.locId} onChange={set('locId')} style={filterStyle} aria-label="Branch"><option value="">All branches</option>{branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        )}
        {rep?.filters?.includes('cost_centre') && ccOpts.ready && (
          <select value={f.ccId} onChange={set('ccId')} style={{ ...filterStyle, minWidth: 180 }} aria-label="Cost centre"><option value="">All cost centres</option>{ccOpts.data.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}</select>
        )}
        {rep && !asOf && <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>From <input type="date" value={f.from} onChange={set('from')} style={filterStyle} /></label>}
        {rep && <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>{asOf ? 'As of' : 'To'} <input type="date" value={f.to} onChange={set('to')} style={filterStyle} /></label>}
        {rep?.supports_comparison && (
          <select value={f.compare} onChange={set('compare')} style={filterStyle} aria-label="Compare with">
            <option value="none">No comparison</option><option value="previous_period">Previous period</option><option value="previous_year">Same period last year</option>
          </select>
        )}
        {(rep?.options ?? []).map((o) => (
          <select key={o.key} value={f.opts[o.key] ?? o.default} aria-label={o.label}
            onChange={(e) => setF((x) => ({ ...x, opts: { ...x.opts, [o.key]: e.target.value } }))} style={filterStyle}>
            {Object.entries(o.choices).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        ))}
        <button type="button" style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }} disabled={loading} onClick={() => { setF((x) => ({ ...x, page: 1 })); run({ ...f, page: 1 }); }}>{loading ? 'Running…' : 'Run'}</button>
        <span style={{ flex: 1 }} />
        {rep && <ExportMenu onExport={(format) => booksAPI.exportEngineReport(reportKey, { ...params(f), format })} />}
      </div>

      {error && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>{error}</p>}
      {stale && !loading && <Note tone="muted">The dates or filters have changed. Press Run to update the figures below.</Note>}
      {b.restated_vouchers > 0 && <Note>{b.restated_vouchers} voucher{b.restated_vouchers === 1 ? ' was' : 's were'} made when the base currency was different and {b.restated_vouchers === 1 ? 'is' : 'are'} shown at today's rate, so every figure here is in the current base currency.</Note>}
      {b.filtered && <Note>Only entries of the chosen cost centre or branch are counted, so these figures will not balance on their own. Opening balances belong to the whole business and are left out.</Note>}
      {b.branch_limited && <Note>These figures cover only the branches you have access to. Opening balances belong to the whole business, so ask someone with access to every branch for company-wide totals.</Note>}

      {fmt.report_header && <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: colors.textMuted }}>{fmt.report_header}</p>}
      {!current ? (loading ? <p style={{ color: colors.textMuted }}>Running…</p> : null) : children(current)}
      {current?.data?.paging?.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 12, fontSize: '0.78rem', color: colors.textMuted }}>
          <button type="button" style={filterStyle} disabled={loading || current.data.paging.page <= 1} onClick={() => { const page = current.data.paging.page - 1; setF((x) => ({ ...x, page })); run({ ...ranFilters(), page }); }}>Previous</button>
          <span>Page {current.data.paging.page} of {current.data.paging.pages} · {current.data.paging.total} rows</span>
          <button type="button" style={filterStyle} disabled={loading || current.data.paging.page >= current.data.paging.pages} onClick={() => { const page = current.data.paging.page + 1; setF((x) => ({ ...x, page })); run({ ...ranFilters(), page }); }}>Next</button>
        </div>
      )}
      {current && fmt.report_footer && <p style={{ margin: '12px 0 0', fontSize: '0.75rem', color: colors.textFaint }}>{fmt.report_footer}</p>}
    </div>
  );
}
