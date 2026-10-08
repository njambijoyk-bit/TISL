import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceListPath } from '../../../_shared/lib/itemPath';
import { Download, ListChecks } from 'lucide-react';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Breadcrumb from '../../../_shared/components/layout/Breadcrumb';
import priceListsAPI from '../../../_shared/api/priceLists';
import { fmtDate, slugify } from '../../lib/priceList/format';
import { saveBlob } from '../../lib/priceList/bundle';

const card = { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'grid', gap: 6 };
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** The price lists this visitor may see, and the Archive of older ones (zips with a PDF, CSV and JSON). */
export default function PriceListsPage() {
  const [lists, setLists] = useState(null);
  const [archive, setArchive] = useState(null);
  useEffect(() => {
    priceListsAPI.publicList().then((r) => setLists(r.data)).catch(() => setLists([]));
    priceListsAPI.publicArchive().then((r) => setArchive(r.data)).catch(() => setArchive([]));
  }, []);

  const get = async (a) => { try { saveBlob(await priceListsAPI.publicArchiveFile(a.id), `${slugify(a.title)}.zip`); } catch { toast.error('Could not download that file.'); } };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Helmet><title>Price lists</title></Helmet>
      <Header />
      <div className="w-full px-4 py-6" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Breadcrumb items={[{ label: 'Products', path: '/products' }, { label: 'Price lists' }]} />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white" style={{ margin: '8px 0 4px' }}>Price lists</h1>
        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.88rem', margin: '0 0 18px' }}>Prices exclude tax, and each price is in its own item's currency. The tax for each line is shown with it. <Link to="/catalogues" style={{ color: 'var(--color-primary-500)' }}>Catalogues</Link> are kept separately.</p>

        {lists === null && <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>}
        {lists?.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>There are no price lists to show right now.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {lists?.map((l) => (
            <Link key={l.id} to={priceListPath(l)} style={{ ...card, textDecoration: 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--color-primary-500)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}><ListChecks size={14} /> {l.item_count} lines</div>
              <strong style={{ color: 'var(--text-primary)' }}>{l.name}</strong>
              {l.description && <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{l.description}</span>}
              <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Prices as at {fmtDate(l.as_at)}</span>
            </Link>
          ))}
        </div>

        {archive?.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white" style={{ margin: '28px 0 10px' }}>Archive</h2>
            <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.84rem', margin: '0 0 12px' }}>Older price lists, each a zip with a PDF, a CSV and a JSON file.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {archive.map((a) => (
                <div key={a.id} style={{ ...card, gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
                  <div><strong style={{ color: 'var(--text-primary)' }}>{a.title}</strong><div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Prices as at {fmtDate(a.list_as_at)} · {size(a.size_bytes)}</div></div>
                  <button type="button" onClick={() => get(a)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 12px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer', border: '1.5px solid var(--color-primary-500)', background: 'transparent', color: 'var(--color-primary-500)' }}><Download size={14} /> Download</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
