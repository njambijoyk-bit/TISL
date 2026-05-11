import { useState } from 'react';
import auctionsAPI from '../../api/auctions';
import toast from 'react-hot-toast';
import useAuctionSSE from '../../hooks/useAuctionSSE';

export default function BidModal({ auction, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  // Real-time data stream
  const liveData = useAuctionSSE(auction.id);
  
  // Merge static auction data with live SSE data
  const currentPrice = liveData?.current_price ?? auction.current_price;
  const minBid = liveData?.min_next ?? (auction.current_price + auction.bid_increment);
  const timeLeft = liveData?.time_left ?? Math.max(0, (new Date(auction.end_time) - new Date()) / 1000);

  const handleBid = async () => {
    const val = parseFloat(amount);
    if (!val || val < minBid) {
      return toast.error(`Minimum bid is KSh ${Number(minBid).toLocaleString()}`);
    }

    setLoading(true);
    try {
      await auctionsAPI.placeBid(auction.id, val);
      toast.success('Bid placed successfully!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place bid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
          <h3 className="font-bold text-gray-800 dark:text-white">Place Bid</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="text-sm text-gray-500">{auction.product?.name}</div>
          
          <div className="flex justify-between items-center bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <span className="text-sm text-gray-600 dark:text-gray-300">Current Bid</span>
            <span className="text-2xl font-bold text-green-600 dark:text-green-400">
              KSh {Number(currentPrice).toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between text-xs text-gray-400">
            <span>Ends in: {Math.floor(timeLeft / 60)}m {Math.floor(timeLeft % 60)}s</span>
            <span>Min Increment: KSh {auction.bid_increment}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Your Maximum Bid</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">KSh</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min: KSh ${Number(minBid).toLocaleString()}`}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 outline-none transition"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button 
            onClick={handleBid} 
            disabled={loading}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {loading ? 'Placing...' : 'Place Bid'}
          </button>
        </div>
      </div>
    </div>
  );
}