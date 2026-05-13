import { Star, ThumbsUp, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

export default function ReviewCard({ review, onMarkHelpful, onImageClick }) {
  const [isHelpful, setIsHelpful] = useState(false);

  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    return `http://localhost:8000${imagePath}`;
  };

  const handleMarkHelpful = async () => {
    if (!isHelpful && onMarkHelpful) {
      try {
        await onMarkHelpful(review.id);
        setIsHelpful(true);
      } catch (err) {
        if (err.response?.status === 400) setIsHelpful(true);
      }
    }
  };

  const rating = parseInt(review.rating) || 0;
  const initial = (review.user?.name || review.customer_name || 'A')[0].toUpperCase();

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid rgba(168,85,247,0.12)',
        borderRadius: 14,
        padding: '18px 20px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
        e.currentTarget.style.boxShadow = '0 2px 16px rgba(168,85,247,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(168,85,247,0.12)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '0.82rem', fontWeight: 800,
          }}>
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                {review.user?.name || review.customer_name || 'Anonymous'}
              </span>
              {review.is_verified_purchase && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: '0.62rem', fontWeight: 700, color: '#059669',
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                  padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  <CheckCircle size={9} /> Verified
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>
              {review.created_at ? format(new Date(review.created_at), 'MMMM d, yyyy') : 'Recently'}
            </p>
          </div>
        </div>

        {/* Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 1 }}>
            {[...Array(5)].map((_, i) => (
              <Star
                key={i} size={13}
                style={{
                  color: i < rating ? '#f59e0b' : '#e5e7eb',
                  fill: i < rating ? '#f59e0b' : '#e5e7eb',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>{rating}.0</span>
        </div>
      </div>

      {/* Title */}
      {review.title && (
        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111827', margin: '0 0 8px', lineHeight: 1.3 }}>
          {review.title}
        </p>
      )}

      {/* Comment */}
      <p style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.7, margin: '0 0 12px' }}>
        {review.comment || review.review}
      </p>

      {/* Review Images — small thumbnails */}
      {review.image_urls && review.image_urls.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {review.image_urls.slice(0, 5).map((url, i) => (
            <img
              key={i}
              src={getImageUrl(url)}
              alt={`Review ${i + 1}`}
              onClick={() => onImageClick?.(getImageUrl(url))}
              onError={e => { e.target.style.display = 'none'; }}
              style={{
                width: 44, height: 44, objectFit: 'cover',
                borderRadius: 8,
                border: '1.5px solid rgba(168,85,247,0.2)',
                cursor: 'pointer',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#a855f7';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          ))}
          {review.image_urls.length > 5 && (
            <div
              onClick={() => onImageClick?.(getImageUrl(review.image_urls[5]))}
              style={{
                width: 44, height: 44, borderRadius: 8,
                background: 'rgba(168,85,247,0.06)',
                border: '1.5px solid rgba(168,85,247,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed',
                cursor: 'pointer',
              }}
            >
              +{review.image_urls.length - 5}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 12, borderTop: '1px solid rgba(168,85,247,0.08)',
      }}>
        <button
          onClick={handleMarkHelpful}
          disabled={isHelpful}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.75rem', fontWeight: 600,
            color: isHelpful ? '#a855f7' : '#9ca3af',
            background: isHelpful ? 'rgba(168,85,247,0.06)' : 'transparent',
            border: isHelpful ? '1px solid rgba(168,85,247,0.15)' : '1px solid transparent',
            padding: '5px 10px', borderRadius: 8,
            cursor: isHelpful ? 'default' : 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!isHelpful) { e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; } }}
          onMouseLeave={e => { if (!isHelpful) { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; } }}
        >
          <ThumbsUp size={12} style={{ fill: isHelpful ? '#a855f7' : 'none' }} />
          {isHelpful ? 'Helpful' : 'Helpful'} ({review.helpful_count || 0})
        </button>

        {review.variant && (
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af',
            background: '#f9fafb', border: '1px solid #f3f4f6',
            padding: '3px 8px', borderRadius: 6,
          }}>
            Variant: {review.variant}
          </span>
        )}
      </div>
    </div>
  );
}
