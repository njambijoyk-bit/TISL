import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import PinDetail from '../../components/PinDetail';

/** A pin on its own page, for a shared link. Over the wall it opens as a card instead (WorldPage). */
export default function PinPage() {
  const { id } = useParams();

  return (
    <div className="min-h-screen">
      <Helmet><title>Pin | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <Link to="/world" style={{ fontSize: '0.84rem', color: 'var(--color-primary-500)', fontWeight: 700 }}>‹ Back to discover</Link>
        <div style={{ marginTop: 14, background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}><PinDetail key={id} id={id} /></div>
      </main>
      <Footer />
    </div>
  );
}
