import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuctionCard from '../../components/products/AuctionCard';
import auctionsAPI from '../../api/auctions';
import { Gavel, Package } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';

const AuctionSkeleton = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: '3px solid #e5e7eb' }}>
    <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, background: '#e5e7eb' }} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ height: 12, width: '65%', background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: '85%', background: '#e5e7eb', borderRadius: 6 }} />
    </div>
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <div style={{ height: 12, width: 56, background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 10, width: 40, background: '#e5e7eb', borderRadius: 6 }} />
      <div style={{ height: 24, width: 52, background: '#e5e7eb', borderRadius: 20 }} />
    </div>
  </div>
);

export default function AuctionListPage() {
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await auctionsAPI.getAllAuctions({ status: 'active', page, per_page: 24 });
        setAuctions(res.data || []);
      } catch { setAuctions([]); }
      finally { setLoading(false); }
    };
    fetch();
  }, [page]);

  return (
    <>
      <Helmet><title>Live Auctions | TISL</title></Helmet>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="w-full px-4 py-6">
          <Breadcrumb items={[{ label: 'Auctions', href: '/auctions' }]} />

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                <Gavel className="text-red-600" /> Live Auctions
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5" style={{ fontSize: '0.85rem' }}>
                {loading ? 'Loading…' : `${auctions.length} active auction${auctions.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            {/* Live badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 99,
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
              color: '#dc2626', fontSize: '0.75rem', fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', animation: 'pulse 1.2s infinite' }} />
              Live Now
            </span>
          </div>

          {/* Grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {Array.from({ length: 12 }).map((_, i) => <AuctionSkeleton key={i} />)}
            </div>
          ) : auctions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">No active auctions right now</h3>
              <p className="text-sm text-gray-400 mt-1 mb-4">Check back soon or browse our products</p>
              <button onClick={() => navigate('/products')} className="text-purple-600 hover:underline text-sm font-medium">
                Browse regular products →
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {auctions.map(a => <AuctionCard key={a.id} auction={a} />)}
            </div>
          )}
        </div>
        <Footer />
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  );
}