import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import auctionsAPI from '../../api/auctions';
import useAuctionSSE from '../../hooks/useAuctionSSE';
import { Gavel, Clock, Shield, History, Package, ChevronLeft, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';

export default function AuctionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [imageError, setImageError] = useState(false);

  const fetchAuction = () =>
    auctionsAPI.getAuction(id).then(res =>
      setAuction({ ...(res.auction ?? res), top_bids: res.top_bids ?? [], bid_count: res.bid_count ?? 0 })
    );

  useEffect(() => {
    fetchAuction().catch(() => { toast.error('Auction not found'); navigate('/auctions'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const liveData = useAuctionSSE(id, !auction || auction.status !== 'active');
  const currentPrice = Number(liveData?.current_price ?? auction?.current_price ?? 0);
  const timeLeft = liveData?.time_left ?? Math.max(0, (new Date(auction?.end_time) - new Date()) / 1000);
  const minBid = currentPrice + Number(auction?.bid_increment || 50);
  const isEnded = countdown <= 0 && auction != null;
  const isUrgent = countdown > 0 && countdown < 600;

  useEffect(() => { setCountdown(Math.floor(timeLeft)); }, [Math.floor(timeLeft / 5)]);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown > 0]);

  const formatTime = (s) => {
    if (s <= 0) return 'Auction Ended';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
  };

  if (loading) return (
    <>
      <Header />
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div style={{ textAlign: 'center' }}>
          <Gavel size={40} style={{ color: '#dc2626', margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ color: '#6b7280', fontWeight: 600 }}>Loading auction...</p>
        </div>
      </div>
      <Footer />
    </>
  );

  if (!auction) return null;

  const product = auction.product;
  const imageUrl = product?.main_image_url ?? null;
  const totalBids = liveData?.bid_count ?? auction.bid_count ?? 0;
  const reserveMet = auction.reserve_price ? currentPrice >= Number(auction.reserve_price) : null;

  return (
    <>
      <Helmet><title>{product?.name ?? 'Auction'} | Live Auction — TISL</title></Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />

        <div className="w-full px-4 py-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Breadcrumb items={[
            { label: 'Auctions', href: '/auctions' },
            { label: product?.name ?? 'Auction Detail' },
          ]} />

          {/* ── MAIN GRID ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem', alignItems: 'start' }}>

            {/* LEFT: Image */}
            <div style={{ position: 'sticky', top: 24 }}>
              <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '1/1', background: '#f3f4f6' }}>
                {/* Live badge */}
                {!isEnded && (
                  <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: 'rgba(220,38,38,0.9)', backdropFilter: 'blur(4px)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'white', animation: 'pulse 1.2s infinite' }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white', letterSpacing: '0.1em' }}>LIVE</span>
                  </div>
                )}

                {/* Auction ID */}
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'white' }}>#{auction.id}</span>
                </div>

                {!imageError && imageUrl ? (
                  <img src={imageUrl} alt={product?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImageError(true)} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <Package size={64} style={{ color: '#d1d5db' }} />
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No image available</span>
                  </div>
                )}
              </div>

              {/* Bid stats strip below image */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                {[
                  { label: 'Start Price', value: `KSh ${Number(auction.start_price ?? 0).toLocaleString()}` },
                  { label: 'Bid Increment', value: `KSh ${Number(auction.bid_increment ?? 0).toLocaleString()}` },
                  { label: 'Total Bids', value: totalBids, icon: <Users size={12} /> },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '10px 8px', background: 'white', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>{item.label}</p>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {item.icon}{item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Name + description */}
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.2, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                  {product?.name}
                </h1>
                {product?.short_description && (
                  <p style={{ fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
                    {product.short_description}
                  </p>
                )}
              </div>

              {/* Current bid + timer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ padding: '16px 20px', borderRadius: 14, background: 'rgba(220,38,38,0.06)', border: '1.5px solid rgba(220,38,38,0.2)' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Current Bid</p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 800, color: '#dc2626', margin: 0, letterSpacing: '-0.02em' }}>
                    KSh {currentPrice.toLocaleString()}
                  </p>
                </div>
                <div style={{ padding: '16px 20px', borderRadius: 14, border: 'none', background: 'none' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: isUrgent ? '#dc2626' : '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={11} /> Time Remaining
                  </p>
                  {isEnded ? (
                    <p style={{ fontSize: '1rem', fontWeight: 700, color: '#9ca3af' }}>Auction Ended</p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {(() => {
                        const h = Math.floor(countdown / 3600);
                        const m = Math.floor((countdown % 3600) / 60);
                        const s = countdown % 60;
                        const color = isUrgent ? '#dc2626' : '#059669';
                        const Seg = ({ val }) => (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontSize: '1.6rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1, animation: isUrgent ? 'pulse 1s infinite' : 'none' }}>
                              {String(val).padStart(2, '0')}
                            </span>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              {val === h ? 'hrs' : val === m ? 'min' : 'sec'}
                            </span>
                          </div>
                        );
                        const Dot = () => <span style={{ fontSize: '1.4rem', fontWeight: 800, color: isUrgent ? '#dc2626' : '#d1d5db', marginBottom: 12, lineHeight: 1 }}>:</span>;
                        return <><Seg val={h} /><Dot /><Seg val={m} /><Dot /><Seg val={s} /></>;
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Reserve price */}
              {auction.reserve_price && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: reserveMet ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${reserveMet ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                  <Shield size={14} style={{ color: reserveMet ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: reserveMet ? '#059669' : '#d97706' }}>
                    Reserve price — {reserveMet ? '✓ Met' : 'Not yet met'}
                  </span>
                </div>
              )}

              {/* Place bid button */}
              <button
                onClick={() => setShowModal(true)}
                disabled={isEnded || auction.status !== 'active'}
                style={{
                  width: '100%', height: 52, borderRadius: 14, border: 'none',
                  background: isEnded ? '#e5e7eb' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: isEnded ? '#9ca3af' : 'white',
                  fontSize: '1rem', fontWeight: 800, cursor: isEnded ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: isEnded ? 'none' : '0 4px 20px rgba(220,38,38,0.35)',
                  transition: 'all 200ms ease', letterSpacing: '0.02em',
                }}
                onMouseEnter={e => { if (!isEnded) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <Gavel size={20} /> {isEnded ? 'Auction Ended' : 'Place Bid Now'}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', margin: '-12px 0 0' }}>
                {!isEnded && <>Minimum next bid: <strong style={{ color: '#374151' }}>KSh {minBid.toLocaleString()}</strong></>}
              </p>

              {/* Bid history */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <History size={16} style={{ color: '#a855f7' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151' }}>Recent Bids</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>{totalBids} total</span>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {auction.top_bids?.length > 0 ? auction.top_bids.slice(0, 5).map((bid, idx) => (
                    <div key={bid.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px', borderBottom: idx < 4 ? '1px solid #f9fafb' : 'none' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: idx === 0 ? 'rgba(220,38,38,0.1)' : 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem', color: idx === 0 ? '#dc2626' : '#a855f7', flexShrink: 0 }}>
                        {bid.bidder?.name?.charAt(0) ?? 'U'}
                      </div>
                      <span style={{ flex: 1, fontSize: '0.82rem', color: '#374151', fontWeight: idx === 0 ? 700 : 400 }}>
                        {bid.bidder?.name ?? 'Anonymous'}
                        {idx === 0 && <span style={{ marginLeft: 6, fontSize: '0.65rem', fontWeight: 800, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '1px 6px', borderRadius: 99 }}>TOP</span>}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: idx === 0 ? '#dc2626' : '#374151' }}>KSh {Number(bid.amount).toLocaleString()}</span>
                    </div>
                  )) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                      No bids yet — be the first! 🎯
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        <Footer />
      </div>

      {/* ── BID MODAL ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', width: '100%', maxWidth: 420, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gavel size={20} style={{ color: '#dc2626' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>Place Your Bid</h3>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{product?.name}</p>
              </div>
            </div>

            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', marginBottom: 16 }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Minimum Bid</p>
              <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#dc2626', margin: 0 }}>KSh {minBid.toLocaleString()}</p>
            </div>

            <input
              type="number"
              id="bid-amount"
              style={{ width: '100%', padding: '12px 16px', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '1.1rem', fontWeight: 600, color: '#111827', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
              placeholder={`Enter amount (min KSh ${minBid.toLocaleString()})`}
              onFocus={e => e.target.style.borderColor = '#dc2626'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const val = parseFloat(document.getElementById('bid-amount').value);
                  if (!val || val < minBid) return toast.error(`Minimum bid is KSh ${minBid.toLocaleString()}`);
                  try {
                    await auctionsAPI.placeBid(id, val);
                    toast.success('Bid placed! 🎉');
                    setShowModal(false);
                    auctionsAPI.getAuction(id).then(res => setAuction({ ...(res.auction ?? res), top_bids: res.top_bids ?? [], bid_count: res.bid_count ?? 0 }));
                  } catch (err) { toast.error(err.response?.data?.message || 'Bid failed'); }
                }}
                style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: 'white', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}
              >
                Confirm Bid
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  );
}