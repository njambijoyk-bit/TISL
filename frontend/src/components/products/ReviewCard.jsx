import { Star, ThumbsUp, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import Badge from '../common/Badge';

export default function ReviewCard({ review, onMarkHelpful }) {
  const [imagePreview, setImagePreview] = useState(null);
  const [isHelpful, setIsHelpful] = useState(false);

  // Helper to resolve image URLs
  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    return `http://localhost:8000${imagePath}`;
  };

  const handleMarkHelpful = async () => {  
    if (!isHelpful && onMarkHelpful) {  
      try {  
        await onMarkHelpful(review.id);  
        setIsHelpful(true);  
      } catch (err) {  
        // If already voted, just show as helpful (idempotent)  
        if (err.response?.status === 400) {  
          setIsHelpful(true);  
        }  
      }  
    }  
  };

  // Parse rating as number
  const rating = parseInt(review.rating) || 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {/* User Avatar */}
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
              {(review.user?.name || review.customer_name || 'A')[0].toUpperCase()}
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">
                  {review.user?.name || review.customer_name || 'Anonymous'}
                </p>
                {review.is_verified_purchase && (
                  <Badge variant="success" size="sm" className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Verified Purchase
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {review.created_at ? format(new Date(review.created_at), 'MMMM d, yyyy') : 'Recently'}
              </p>
            </div>
          </div>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-5 h-5 ${
                  i < rating
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-gray-200 text-gray-200'
                }`}
              />
            ))}
          </div>
          <span className="font-semibold text-gray-700">{rating}.0</span>
        </div>
      </div>

      {/* Review Title */}
      {review.title && (
        <h4 className="font-semibold text-lg text-gray-900 mb-3">
          {review.title}
        </h4>
      )}

      {/* Review Comment */}
      <p className="text-gray-700 leading-relaxed mb-4">
        {review.comment || review.review}
      </p>

      {/* Review Images */}
      {review.image_urls && review.image_urls.length > 0 && (  
        <div className="flex gap-3 mb-4 overflow-x-auto pb-2">  
          {review.image_urls.map((url, index) => (  
            <button  
              key={index}  
              onClick={() => setImagePreview(url)}  
              className="relative flex-shrink-0 group"  
            >  
              <img  
                src={url}  
                alt={`Review ${index + 1}`}  
                className="w-24 h-24 object-cover rounded-lg border-2 border-gray-200 group-hover:border-primary transition-all"  
                onError={(e) => {  
                  e.target.src = '/placeholder-product.png';  
                }}  
              />  
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-all" />  
            </button>  
          ))}  
        </div>  
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        {/* Helpful Button */}
        <button
          onClick={handleMarkHelpful}
          disabled={isHelpful}
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${
            isHelpful
              ? 'text-primary cursor-default'
              : 'text-gray-600 hover:text-primary'
          }`}
        >
          <ThumbsUp className={`w-4 h-4 ${isHelpful ? 'fill-primary' : ''}`} />
          <span>
            {isHelpful ? 'Marked as helpful' : 'Helpful'} ({review.helpful_count || 0})
          </span>
        </button>

        {/* Additional Info */}
        {review.variant && (
          <Badge variant="secondary" size="sm">
            Variant: {review.variant}
          </Badge>
        )}
      </div>

      {/* Image Preview Modal */}
      {review.image_urls && review.image_urls.length > 0 && (  
        <div className="flex gap-1 mt-2">  
          {review.image_urls.slice(0, 3).map((url, i) => (  
            <img  
              key={i}  
              src={url}  
              alt={`Review img ${i + 1}`}  
              className="w-10 h-10 object-cover rounded border border-gray-200"  
              onError={(e) => { e.target.style.display = 'none'; }}  
            />  
          ))}  
          {review.image_urls.length > 3 && (  
            <span className="text-xs text-gray-500 self-center ml-1">  
              +{review.image_urls.length - 3} more  
            </span>  
          )}  
        </div>  
      )}
    </div>
  );
}
