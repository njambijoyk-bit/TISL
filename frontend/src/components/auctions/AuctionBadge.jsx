export default function AuctionBadge({ className = '' }) {
  return (
    <div className={`absolute top-2 left-2 z-10 flex items-center gap-1 bg-red-600/90 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm backdrop-blur-sm ${className}`}>
      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
      LIVE AUCTION
    </div>
  );
}