import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import serviceSettingsAPI from '../../../_shared/api/serviceSettings';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors, input } from '../../../_shared/theme/tokens';

/**
 * Services settings: how late a cancellation or a move counts as late, and the defaults of every service fee — its amount and
 * whether a new service starts with it ticked. A service can still change both for itself (Service → Fees). The amounts are kept
 * on the fee ledgers, so changing them here changes them in Books → Chart of accounts too.
 */

const WHEN = { booking: 'When booked', completion: 'When the service is done', late_cancel: 'On a late cancellation', no_show: 'On a no-show', reschedule: 'On a late reschedule' };
const BUCKETS = [
  ['With the service', ['call_out', 'travel', 'urgent', 'after_hours', 'consumables', 'equipment', 'extra_person', 'overtime', 'service_charge', 'payment_processing', 'other_service']],
  ['At booking', ['booking_fee', 'deposit']],
  ['When things go wrong', ['cancellation', 'no_show', 'reschedule']],
  ['Money held for the customer, not income', ['tip', 'disbursement']],
];
const TAX = { taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Not taxed' };
const cell = { ...input, padding: '6px 8px', fontSize: '0.82rem' };
const td = { padding: '7px 8px', borderBottom: '1px solid var(--line)', verticalAlign: 'middle' };

export default function ServiceSettings() {
  const [data, setData] = useState(null);
  const [win, setWin] = useState({ cancellation_window_hours: '', reschedule_window_hours: '' });
  const [fees, setFees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const apply = useCallback((d) => {
    setData(d);
    setWin({ cancellation_window_hours: d.settings.cancellation_window_hours, reschedule_window_hours: d.settings.reschedule_window_hours });
    setFees(d.fees.map((f) => ({ ledger_id: f.ledger.id, amount: f.amount ?? '', default_on: f.default_on })));
  }, []);
  useEffect(() => { serviceSettingsAPI.get().then(apply).catch((e) => setError(errMsg(e, 'Could not load the configuration'))); }, [apply]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return Number(win.cancellation_window_hours) !== data.settings.cancellation_window_hours || Number(win.reschedule_window_hours) !== data.settings.reschedule_window_hours
      || fees.some((r) => { const f = data.fees.find((x) => x.ledger.id === r.ledger_id); return f && (Number(r.amount) !== Number(f.amount ?? 0) || r.default_on !== f.default_on); });
  }, [data, win, fees]);

  const patch = (id, p) => setFees((rs) => rs.map((r) => (r.ledger_id === id ? { ...r, ...p } : r)));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await serviceSettingsAPI.save({
        settings: { cancellation_window_hours: Number(win.cancellation_window_hours), reschedule_window_hours: Number(win.reschedule_window_hours) },
        fees: fees.map((r) => ({ ledger_id: r.ledger_id, amount: r.amount === '' ? null : Number(r.amount), default_on: r.default_on })),
      });
      apply(res); toast.success(res.message ?? 'Saved');
    } catch (e) { setError(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };

  const unit = (f) => (f.basis === 'percent' ? (f.kind === 'tip' ? '% of the bill' : '% of the price') : f.basis === 'per_unit' ? `${data.currency} / ${f.unit || 'unit'}` : data.currency);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="Services configuration" description="Defaults for every service: when a cancellation is late, and what each fee comes to. A service can still change these for itself." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {!data && !error && <p style={{ color: colors.textMuted }}>Loading…</p>}
        {data && (
          <div style={{ display: 'grid', gap: 16 }}>
            {!data.table_ready && <p style={{ margin: 0, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 59_service_settings.sql to save the cancellation and reschedule windows. The fee defaults below save without it.</p>}

            <section style={{ ...card, padding: 20 }}>
              <p style={{ margin: 0, fontWeight: 700, color: colors.primaryDeep }}>When a cancellation or a move is "late"</p>
              <p style={{ margin: '4px 0 12px', fontSize: '0.76rem', color: colors.textFaint, maxWidth: 640 }}>A customer who cancels, or moves the booking, closer to the start than this pays the late cancellation fee or the reschedule fee below. Earlier than this, nothing is charged.</p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[['cancellation_window_hours', 'Cancelling'], ['reschedule_window_hours', 'Moving a booking']].map(([k, label]) => (
                  <label key={k} style={{ fontSize: '0.78rem', color: colors.textMuted }}>{label}: late within
                    <input type="number" min="0" value={win[k]} onChange={(e) => setWin((w) => ({ ...w, [k]: e.target.value }))} style={{ ...cell, width: 80, margin: '0 6px' }} /> hours of the start
                  </label>
                ))}
              </div>
            </section>

            <section style={{ ...card, padding: 20 }}>
              <p style={{ margin: 0, fontWeight: 700, color: colors.primaryDeep }}>Fee defaults</p>
              <p style={{ margin: '4px 0 12px', fontSize: '0.76rem', color: colors.textFaint, maxWidth: 680 }}>
                The amount is what a service starts with, and a ticked fee is switched on for every <strong>new</strong> service (existing services keep what they have). Each fee posts to its own ledger with its own tax — see them under <Link to="/admin/books?tab=accounts">Books → Chart of accounts → Service Income</Link>. The accounts services post to by default are in <Link to="/admin/books?tab=settings">Books → Configuration → Default ledgers</Link>.
              </p>
              {BUCKETS.map(([title, kinds]) => {
                const list = data.fees.filter((f) => kinds.includes(f.kind));
                if (!list.length) return null;
                return (
                  <div key={title} style={{ marginBottom: 14 }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 800, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ textAlign: 'left', fontSize: '0.66rem', color: colors.textFaint, textTransform: 'uppercase' }}><th style={td}>New services</th><th style={td}>Fee</th><th style={{ ...td, textAlign: 'right' }}>Amount</th></tr></thead>
                      <tbody>
                        {list.map((f) => {
                          const r = fees.find((x) => x.ledger_id === f.ledger.id);
                          if (!r) return null;
                          return (
                            <tr key={f.ledger.id}>
                              <td style={{ ...td, width: 100 }}><input type="checkbox" checked={r.default_on} onChange={(e) => patch(r.ledger_id, { default_on: e.target.checked })} aria-label={`Switch on ${f.ledger.name} for new services`} /> <span style={{ fontSize: '0.72rem', color: colors.textMuted }}>on</span></td>
                              <td style={td}><strong style={{ fontSize: '0.82rem' }}>{f.ledger.name}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{WHEN[f.timing] ?? f.timing}{f.refundable ? ' · refundable' : ''} · {f.not_income ? 'Not income' : `${TAX[f.ledger.tax_nature] ?? '—'}${f.ledger.tax_nature === 'taxable' && f.tax_rate?.rate_value != null ? ` ${Number(f.tax_rate.rate_value)}%` : ''}`}</div></td>
                              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <input type="number" min="0" step="any" value={r.amount} onChange={(e) => patch(r.ledger_id, { amount: e.target.value })} style={{ ...cell, width: 100, textAlign: 'right' }} aria-label={`Default amount of ${f.ledger.name}`} />
                                <span style={{ marginLeft: 6, fontSize: '0.72rem', color: colors.textMuted }}>{unit(f)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {data.fees.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>No service fees are set up yet (script 56).</p>}
            </section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              {dirty && <span style={{ fontSize: '0.76rem', color: '#b45309' }}>Unsaved changes</span>}
              <button type="button" style={btnPrimary} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save configuration'}</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
