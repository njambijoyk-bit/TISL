import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Breadcrumb from '../../../_shared/components/layout/Breadcrumb';
import cataloguesAPI from '../../../_shared/api/catalogues';
import CataloguePreview from '../../components/catalogue/CataloguePreview';
import { fmtDate } from '../../lib/priceList/format';

const card = { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, display: 'grid', gap: 8 };

/** The published brochures and catalogues this visitor may open: look at the first pages, or download the whole PDF. */
export default function Brochures() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { cataloguesAPI.publicList().then((r) => setRows(r.data)).catch(() => setRows([])); }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Helmet><title>Brochures and catalogues</title></Helmet>
      <Header />
      <div className="w-full px-4 py-6" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Breadcrumb items={[{ label: 'Products', href: '/products' }, { label: 'Brochures', href: '/brochures' }]} />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white" style={{ margin: '8px 0 4px' }}>Brochures and catalogues</h1>
        <p className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.88rem', margin: '0 0 18px' }}>Look through them here, or download one as a PDF. <Link to="/price-lists" style={{ color: 'var(--color-primary-500)' }}>Price lists</Link> are kept separately.</p>
        {rows === null && <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>}
        {rows?.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>There are no brochures to show right now.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {rows?.map((b) => (
            <div key={b.id} style={card}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--color-primary-500)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}><BookOpen size={14} /> {b.kind === 'catalogue' ? `Catalogue · ${b.entry_count} items` : 'Brochure'}</div>
              <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{b.title}</strong>
              {b.subtitle && <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{b.subtitle}</span>}
              <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Published {fmtDate(b.published_at)}</span>
              <button type="button" onClick={() => setOpen(b)} style={{ justifySelf: 'start', display: 'inline-flex', gap: 6, alignItems: 'center', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'var(--color-primary-500)', color: '#fff' }}><Eye size={14} /> Look and download</button>
            </div>
          ))}
        </div>
      </div>
      <Footer />
      {open && <CataloguePreview title={open.title} loadSlice={(from) => cataloguesAPI.publicData(open.id, { from, limit: 20 })} onClose={() => setOpen(null)} />}
    </div>
  );
}
