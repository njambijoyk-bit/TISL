import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Clock, Package } from 'lucide-react';
import { formatMoney } from '../../../../_shared/lib/money';
import BranchBadge from '../BranchBadge';
import { auctionPath } from '../../../../_shared/lib/itemPath';

export default function AuctionCard({ auction }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const [countdown, setCountdown] = useState(
    Math.max(0, Math.floor((new Date(auction?.end_time) - new Date()) / 1000))
  );

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown > 0]);

  const formatTime = (s) => {
    if (s <= 0) return 'Ended';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
  };

  const product = auction?.product;
  const imageUrl = product?.main_image_url ?? null;
  const currentPrice = Number(auction?.current_price ?? 0);
  const isEnded = countdown <= 0;
  const isUrgent = countdown > 0 && countdown < 600; // under 10 mins

  return (
    <div className="auction-collapsed-card" onClick={() => navigate(auctionPath(auction, product))}>
      {/* Full-width name banner on hover */}
      <div className="collapsed-hover-name">{product?.name}</div>      {/* Thumbnail */}
      <div className="collapsed-thumb">
        {!imageError && imageUrl ? (
          <img src={imageUrl} alt={product?.name ?? 'Auction'} className="collapsed-thumb-img" onError={() => setImageError(true)} />
        ) : (
          <div className="collapsed-thumb-placeholder"><Package size={22} style={{ color: "var(--text-tertiary)" }} /></div>
        )}
      </div>

      {/* Info */}
      <div className="collapsed-info">
        <p className="collapsed-name">{product?.name}</p>
        <p className="collapsed-desc">{product?.short_description || product?.brand?.name || 'Live auction'}</p>
        <BranchBadge location={auction?.location} style={{ background: 'rgba(107,114,128,0.1)', boxShadow: 'none', margin: '3px 0 2px', fontSize: '0.62rem' }} />
        <div className={`auction-timer ${isUrgent ? 'urgent' : ''} ${isEnded ? 'ended' : ''}`}>
          <Clock size={11} />
          {formatTime(countdown)}
        </div>
      </div>

      {/* Right: bid + timer + button */}
      <div className="collapsed-right">
        <div className="auction-price-group">
          <span className="auction-label">Current Bid{auction?.tax_info?.rate_percent ? ' (excl. tax)' : ''}</span>
          <span className="auction-price">{formatMoney(currentPrice, auction?.currency?.symbol || auction?.currency?.code || 'KSh', { decimals: 'auto', max: 10 })}</span>
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(auctionPath(auction, product)); }}
          disabled={isEnded}
          className={`collapsed-action-btn ${isEnded ? 'auction-ended' : 'auction'}`}
        >
          <Gavel size={13} /> {isEnded ? 'Ended' : 'Bid'}
        </button>
      </div>

      <style>{`
        .auction-collapsed-card {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; background: var(--surface-card); border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer;
          transition: box-shadow 150ms ease, transform 150ms ease; width: 100%;
          border-left: 3px solid #dc2626; position: relative;
        }
        .collapsed-hover-name {
          position: absolute; bottom: calc(100% + 6px); left: 0; right: 0;
          background: #1f2937; color: white;
          font-size: 0.78rem; font-weight: 600; line-height: 1.4;
          padding: 6px 12px; border-radius: 8px;
          opacity: 0; pointer-events: none;
          transition: opacity 150ms ease, transform 150ms ease;
          transform: translateY(4px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 100; white-space: normal; word-break: break-word;
        }
        .collapsed-hover-name::after {
          content: ''; position: absolute; top: 100%; left: 20px;
          border: 5px solid transparent; border-top-color: #1f2937;
        }
        .auction-collapsed-card:hover .collapsed-hover-name { opacity: 1; transform: translateY(0); }
        .auction-collapsed-card:hover { box-shadow: 0 4px 12px rgba(220,38,38,0.12); transform: translateY(-1px); }
                .collapsed-thumb { flex-shrink:0; width:52px; height:52px; border-radius:10px; overflow:hidden; background:var(--surface-input, var(--surface-hover)); }
        .collapsed-thumb-img { width:100%; height:100%; object-fit:cover; }
        .collapsed-thumb-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
        .collapsed-info { flex:1; min-width:0; }
        .collapsed-name { font-size:0.825rem; font-weight:600; color:var(--color-primary-500); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0 0 2px; line-height:1.3; }
        .collapsed-desc { font-size:0.72rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0; line-height:1.4; }
        .collapsed-right { flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
        .auction-price-group { display:flex; flex-direction:column; align-items:flex-end; gap:1px; }
        .auction-label { font-size:0.62rem; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; }
        .auction-price { font-size:0.82rem; font-weight:700; color:#dc2626; white-space:nowrap; }
        .auction-timer { display:flex; align-items:center; gap:3px; font-size:0.68rem; font-weight:700; color:var(--text-secondary); font-variant-numeric:tabular-nums; }
        .auction-timer.urgent { color:#dc2626; animation: pulse 1s infinite; }
        .auction-timer.ended { color:var(--text-tertiary); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .collapsed-action-btn { display:flex; align-items:center; gap:4px; padding:5px 11px; border-radius:20px; font-size:0.72rem; font-weight:600; cursor:pointer; transition:all 150ms ease; white-space:nowrap; border:none; }
        .collapsed-action-btn.auction { background-color:rgba(220,38,38,0.1); color:#dc2626; border:1px solid rgba(220,38,38,0.4); }
        .collapsed-action-btn.auction:hover { background-color:#dc2626; color:white; }
        .collapsed-action-btn.auction-ended { background:var(--surface-input, var(--surface-hover)); color:var(--text-tertiary); cursor:not-allowed; border:none; }
      `}</style>
    </div>
  );
}