import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Breadcrumb from '../../../_shared/components/layout/Breadcrumb';
import priceListsAPI from '../../../_shared/api/priceLists';
import { loadCompany } from '../../../_shared/lib/useCompany';
import { earlierOf, fmtAmount, fmtDate, slugify } from '../../lib/priceList/format';
import { listPdfBlob, listZip, saveBlob } from '../../lib/priceList/bundle';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' };
const td = { padding: '8px 10px', fontSize: '0.84rem', color: 'var(--text-primary)', borderTop: '1px solid var(--line)', verticalAlign: 'top' };
const btn = { display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 12px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer', border: '1.5px solid var(--color-primary-500)', background: 'transparent', color: 'var(--color-primary-500)' };

/** One price list for a customer: its lines (price excluding tax, the earlier price, the tax and the total) and downloads. */
export default function PriceListPublic() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(200);
  const [busy, setBusy] = useState(false);
  useEffect(() => { priceListsAPI.publicShow(id).then((r) => setD(r.data)).catch(() => setD(false)); }, [id]);
  const rows = useMemo(() => (d?.items ?? []).filter((x) => !q || `${x.code ?? ''} ${x.name} ${x.variant ?? ''} ${x.category ?? ''}`.toLowerCase().includes(q.toLowerCase())), [d, q]);

  const run = async (fn) => { setBusy(true); try { await fn(); } catch { toast.error('Could not make that file.'); } finally { setBusy(false); } };
  const info = d ? { name: d.name, description: d.description, as_at: d.as_at } : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Helmet><title>{d?.name ?? 'Price list'}</title></Helmet>
      <Header />
      <div className="w-full px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Breadcrumb items={[{ label: 'Products', href: '/products' }, { label: 'Price lists', href: '/price-lists' }, { label: d?.name ?? '…', href: `/price-lists/${id}` }]} />
        {d === false && <p style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>This price list is not available.</p>}
        {d && (
          <>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white" style={{ margin: '8px 0 4px' }}>{d.name}</h1>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.86rem', margin: '0 0 14px' }}>Prices as at {fmtDate(d.as_at)}. {d.description}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button type="button" style={btn} disabled={busy} onClick={() => run(async () => saveBlob(listPdfBlob({ list: info, items: d.items, rule: d.earlier_price, company: await loadCompany() }), `${slugify(d.name)}.pdf`))}><FileDown size={14} /> PDF</button>
              <button type="button" style={btn} disabled={busy} onClick={() => run(async () => saveBlob(await priceListsAPI.publicCsv(d.id), `${slugify(d.name)}.csv`))}><FileDown size={14} /> CSV</button>
              <button type="button" style={btn} disabled={busy} onClick={() => run(async () => saveBlob(await priceListsAPI.publicJson(d.id), `${slugify(d.name)}.json`))}><FileDown size={14} /> JSON</button>
              <button type="button" style={btn} disabled={busy} onClick={() => run(async () => saveBlob(await listZip({ list: info, items: d.items, rule: d.earlier_price, company: await loadCompany(), csv: await priceListsAPI.publicCsv(d.id), json: await priceListsAPI.publicJson(d.id) }), `${slugify(d.name)}.zip`))}><FileDown size={14} /> Zip of all three</button>
              <input value={q} onChange={(e) => { setQ(e.target.value); setShown(200); }} placeholder="Search…" style={{ marginLeft: 'auto', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-card)', color: 'inherit', fontFamily: 'inherit', width: 220 }} />
            </div>
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Code</th><th style={th}>Item</th><th style={th}>Price excl. tax</th><th style={th}>Tax</th><th style={th}>Total</th></tr></thead>
                  <tbody>
                    {rows.slice(0, shown).map((x) => {
                      const e = earlierOf(x, d.earlier_price);

                      return (
                        <tr key={x.id}>
                          <td style={{ ...td, color: 'var(--text-tertiary)' }}>{x.code}</td>
                          <td style={td}><strong>{x.name}</strong><div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{[x.variant, x.unit, x.category].filter(Boolean).join(' · ')}</div></td>
                          <td style={td}><strong>{fmtAmount(x.price, x.currency_code, x.currency_symbol)}</strong>
                            {e?.strike && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textDecoration: 'line-through' }}>{fmtAmount(e.strike, x.currency_code, x.currency_symbol)}</div>}
                            {e?.was && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Was {fmtAmount(e.was, x.currency_code, x.currency_symbol)}, up {e.up}%</div>}
                          </td>
                          <td style={td}>{fmtAmount(x.tax_amount, x.currency_code, x.currency_symbol)}<div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{[x.tax_name, x.tax_account].filter(Boolean).join(' · ')}</div></td>
                          <td style={td}><strong>{fmtAmount(x.total, x.currency_code, x.currency_symbol)}</strong></td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td style={td} colSpan={5}>No lines match.</td></tr>}
                  </tbody>
                </table>
              </div>
              {rows.length > shown && <div style={{ padding: 12, textAlign: 'center' }}><button type="button" style={btn} onClick={() => setShown((n) => n + 300)}>Show more ({rows.length - shown} left)</button></div>}
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
