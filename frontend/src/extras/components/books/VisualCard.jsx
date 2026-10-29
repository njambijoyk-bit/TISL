import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Image as ImageIcon, RefreshCw, Table2, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../_shared/api/books';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { saveCardImage, tableText } from './visualExport';
import { label } from './visualPeriods';
import { full } from './visualFmt';

const cell = (c, v) => (c.num && v !== '' && v != null && !Number.isNaN(Number(v)) ? full(v) : (v ?? ''));
const tool = { ...btnGhost, padding: '3px 8px', fontSize: '0.7rem', gap: 4 };

/** One chart on the page. It fetches its own figures when it scrolls into view (and again whenever the period changes), draws them, and offers the same figures as a table, a copy, and a picture. */
export default function VisualCard({ def, chartKey, params, sample, openLedger, openPlanning }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(Boolean(sample));
  const [state, setState] = useState(sample ? { data: sample, cmp: null, ready: true } : { loading: true });
  const [view, setView] = useState('chart');
  const [tick, setTick] = useState(0);   // reload asks the server again
  const key = JSON.stringify(params);

  useEffect(() => {
    if (sample || seen || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [sample, seen]);

  useEffect(() => {
    if (sample || !seen) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    booksAPI.visualChart(chartKey, params)
      .then((r) => { if (live) setState({ data: r.data, cmp: r.compare?.data ?? null, cmpRange: r.compare, range: { from: r.from, to: r.to }, loading: false }); })
      .catch((e) => { if (live) setState({ error: errMsg(e, 'Could not load this chart'), loading: false }); });
    return () => { live = false; };
  }, [sample, seen, chartKey, key, tick]);   // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for the params

  const { data, cmp, loading, error } = state;
  const ok = data && data.ready !== false;
  const table = ok && view === 'table' ? def.table(data, cmp?.ready === false ? null : cmp) : null;
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(tableText(table.columns, table.rows)); toast.success('Copied: paste it into a spreadsheet'); } catch { toast.error('Could not copy'); }
  }, [table]);
  const save = async () => { try { await saveCardImage(ref.current, def.title); } catch (e) { toast.error(errMsg(e, 'Could not save the image')); } };

  return (
    <section ref={ref} aria-label={def.title} style={{ ...card, padding: 16, gridColumn: def.wide ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>{def.title}</h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>{def.note}</p>
        </div>
        {ok && !sample && (
          <div data-html2canvas-ignore style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button type="button" style={tool} data-visual-reload onClick={() => setTick((t) => t + 1)} aria-label={`Reload ${def.title}`}><RefreshCw size={12} /></button>
            <button type="button" style={tool} data-visual-table onClick={() => setView(view === 'chart' ? 'table' : 'chart')} aria-pressed={view === 'table'}>{view === 'chart' ? <><Table2 size={12} /> Table</> : <><BarChart3 size={12} /> Chart</>}</button>
            {view === 'table' && <button type="button" style={tool} onClick={copy}><Copy size={12} /> Copy</button>}
            <button type="button" style={tool} data-visual-image onClick={save} aria-label={`Save ${def.title} as an image`}><ImageIcon size={12} /> Image</button>
          </div>
        )}
      </div>
      {cmp && state.cmpRange && <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: colors.textMuted }}>{label(state.range.from, state.range.to)} against <b>{label(state.cmpRange.from, state.cmpRange.to)}</b> (dashed or lighter)</p>}
      <div style={{ marginTop: 10, minHeight: 60, opacity: loading && data ? 0.5 : 1, transition: 'opacity 150ms' }}>
        {error ? <p style={{ fontSize: '0.8rem', color: colors.dangerText }}>{error}</p>
          : !data ? <div style={{ height: 180, borderRadius: 8, background: `linear-gradient(90deg, ${colors.tint(0.04)}, ${colors.tint(0.09)}, ${colors.tint(0.04)})`, backgroundSize: '200% 100%', animation: 'vis-shimmer 1.4s infinite linear' }} aria-label="Loading" />
          : data.ready === false ? <p style={{ fontSize: '0.8rem', color: colors.warningText }}>{data.message}</p>
          : table ? (
            <div style={{ overflow: 'auto', maxHeight: 340 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                <thead><tr>{table.columns.map((c) => <th key={c.key} style={{ textAlign: c.num ? 'right' : 'left', padding: '5px 8px', fontSize: '0.64rem', color: colors.textFaint, position: 'sticky', top: 0, background: 'var(--surface-card, #fff)' }}>{c.label}</th>)}</tr></thead>
                <tbody>{table.rows.map((r, i) => <tr key={i}>{table.columns.map((c) => <td key={c.key} style={{ textAlign: c.num ? 'right' : 'left', padding: '4px 8px', borderTop: `1px solid ${colors.tint(0.06)}`, fontVariantNumeric: 'tabular-nums' }}>{cell(c, r[c.key])}</td>)}</tr>)}</tbody>
              </table>
              {!table.rows.length && <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>Nothing for this period.</p>}
            </div>
          ) : <div key={`${state.range?.from}${state.range?.to}${state.cmpRange?.from ?? ''}`}>{def.render(data, cmp?.ready === false ? null : cmp, { openLedger, openPlanning })}</div>}
      </div>
      <style>{'@keyframes vis-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }'}</style>
    </section>
  );
}
