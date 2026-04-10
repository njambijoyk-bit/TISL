import { Heart, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../common/Button';

export default function EmptyWishlist({ loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-gray-400" />
        <p className="mt-3 text-gray-600 dark:text-gray-300">Loading wishlist...</p>
      </div>
    );
  }

  return (
    <div className="py-16 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <Heart className="w-12 h-12 mx-auto text-red-400 mb-3" />
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        Your wishlist is empty
      </h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Tap the heart on any product to save it here.
      </p>
      <Button variant="outline" onClick={() => navigate('/products')}>
        Browse products
      </Button>
    </div>
  );
}
