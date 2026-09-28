import { MapPin } from 'lucide-react';

/**
 * Small pill naming the branch a hamper or auction belongs to. Hampers and
 * auctions are limited, event-like items, so they are listed from every branch
 * and this badge says where each one is held.
 */
export default function BranchBadge({ location, style }) {
  if (!location?.name) return null;
  return (
    <span
      title={`Held at ${location.name}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99,
        fontSize: '0.68rem', fontWeight: 700, background: 'rgba(255,255,255,0.92)', color: '#374151',
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)', ...style,
      }}
    >
      <MapPin size={11} /> {location.name}
    </span>
  );
}
