import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';
import stockAlertsAPI from '../../../../_shared/api/stockAlerts';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
const MODE = { stock: 'as many as there was stock', all: 'everyone' };

/**
 * Products people asked to be told about. Normally they are told on their own when stock arrives (the company's choice under General); here staff can see who is
 * waiting and tell them now, either as many as there is stock for or everyone, and read the record of every time people were told.
 */
export default function StockAlertsTab({ canSend }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => stockAlertsAPI.overview().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the stock alerts'))), []);
  useEffect(() => { load(); }, [load]);

  const tell = async (p, mode) => {
    if (mode === 'all' && !window.confirm(`Tell all ${p.waiting} people waiting for ${p.product}? There is ${p.stock} in stock.`)) return;
    setBusy(`${p.variant_id}${mode}`);
    try { const r = await stockAlertsAPI.tell(p.variant_id, mode); toast.success(r.message, { duration: 6000 }); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not tell them'), { duration: 8000 }); } finally { setBusy(null); }
  };

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!data.ready) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Stock alerts are not set up yet. Run database script 112_stock_watches.sql, then reload this page.</p>;
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Waiting for stock</h2>
        {data.products.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nobody is waiting for anything. Customers can ask on an out-of-stock product page.</p>}
        {data.products.map((p) => (
          <div key={p.variant_id} style={{ ...card, padding: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Bell size={16} aria-hidden="true" style={{ color: colors.textFaint }} />
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <strong>{p.product}</strong>{p.option && p.option !== 'Default' ? <span style={{ color: colors.textMuted }}> · {p.option}</span> : null}
              <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>
                {p.waiting} waiting · {p.stock > 0 ? <strong style={{ color: '#047857' }}>{p.stock} in stock now</strong> : 'out of stock'}
                {p.last_run && <> · last told {p.last_run.told} on {when(p.last_run.at)} ({p.last_run.by === 'staff' ? 'by staff' : 'automatically'})</>}
              </div>
            </div>
            {canSend && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={btnPrimary} disabled={p.stock <= 0 || busy !== null} onClick={() => tell(p, 'stock')}>{busy === `${p.variant_id}stock` ? 'Telling…' : 'Tell as many as stock'}</button>
                <button type="button" style={btnGhost} disabled={p.stock <= 0 || busy !== null} onClick={() => tell(p, 'all')}>{busy === `${p.variant_id}all` ? 'Telling…' : `Tell all ${p.waiting}`}</button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Record</h2>
        {data.runs.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nobody has been told yet.</p>}
        {data.runs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr style={{ textAlign: 'left', color: colors.textMuted }}>{['When', 'Product', 'By', 'Who', 'In stock', 'Told', 'Still waiting'].map((h) => <th key={h} style={{ padding: '6px 8px', fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${colors.tint(0.08)}` }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{when(r.at)}</td>
                    <td style={{ padding: '6px 8px' }}>{r.product}{r.option && r.option !== 'Default' ? ` · ${r.option}` : ''}</td>
                    <td style={{ padding: '6px 8px' }}>{r.by}</td>
                    <td style={{ padding: '6px 8px' }}>{MODE[r.mode] ?? r.mode}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.stock}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.told}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.left_waiting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
