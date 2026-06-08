import { useState, useEffect } from 'react';
import {
  Search, ShoppingCart, Heart, FileText, Eye, Filter,
  Activity, Clock, User, AlertTriangle, Zap, Package
} from 'lucide-react';
import api from '../../../../api/axios';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n) => Number(n || 0).toLocaleString();
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtMin  = (d) => d ? new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

// ── Event type metadata ───────────────────────────────────────────────────────
const EVENT_META = {
  search:            { icon: Search,       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   label: 'Search'       },
  product_not_found: { icon: AlertTriangle, color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'No Results'   },
  product_view:      { icon: Eye,          color: '#10b981', bg: 'rgba(16,185,129,0.1)',   label: 'Product View' },
  service_view:      { icon: Eye,          color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',    label: 'Service View' },
  add_to_cart:       { icon: ShoppingCart, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   label: 'Add to Cart'  },
  add_to_wishlist:   { icon: Heart,        color: '#ec4899', bg: 'rgba(236,72,153,0.1)',   label: 'Wishlist'     },
  add_to_quotelist:  { icon: FileText,     color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   label: 'Quote List'   },
  filter:            { icon: Filter,       color: '#a855f7', bg: 'rgba(168,85,247,0.1)',   label: 'Filter'       },
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 14, radius = 6 }) {
  return (
    <div style={{ width: w, height: h, background: '#f3f4f6', borderRadius: radius, animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────
function EventRow({ event, index, startTime }) {
  const meta = EVENT_META[event.event_type] || { icon: Zap, color: '#9ca3af', bg: '#f3f4f6', label: event.event_type };
  const Icon = meta.icon;
  const offsetMs = startTime ? new Date(event.occurred_at) - new Date(startTime) : 0;
  const offsetSec = Math.round(offsetMs / 1000);
  const offsetLabel = offsetSec < 60
    ? `+${offsetSec}s`
    : `+${Math.floor(offsetSec / 60)}m${offsetSec % 60 > 0 ? ` ${offsetSec % 60}s` : ''}`;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 28 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} style={{ color: meta.color }} />
        </div>
        <div style={{ width: 2, flex: 1, background: '#f3f4f6', minHeight: 8, marginTop: 2 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: meta.color }}>{meta.label}</span>

          {/* Query */}
          {event.query && (
            <span style={{ fontSize: '0.78rem', color: '#111827', fontWeight: 600 }} className="dark:text-white">
              "{event.query}"
            </span>
          )}

          {/* No results badge */}
          {event.event_type === 'product_not_found' && (
            <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700 }}>
              0 results
            </span>
          )}

          {/* Had results badge */}
          {event.event_type === 'search' && event.had_results !== null && (
            <span style={{
              fontSize: '0.65rem', padding: '1px 6px', borderRadius: 6, fontWeight: 700,
              background: event.had_results ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: event.had_results ? '#10b981' : '#ef4444',
            }}>
              {event.had_results ? 'results found' : 'no results'}
            </span>
          )}

          {/* Filter info */}
          {event.filter_type && (
            <>
              <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 6, background: 'rgba(168,85,247,0.1)', color: '#a855f7', fontWeight: 700 }}>
                {event.filter_type}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#374151' }} className="dark:text-gray-300">{event.filter_value}</span>
              {event.search_context && (
                <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>in "{event.search_context}"</span>
              )}
            </>
          )}
        </div>

        {/* Entity (product/service viewed or added) */}
        {event.entity_name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Package size={11} style={{ color: '#9ca3af', flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 500 }} className="dark:text-gray-300">
              {event.entity_name}
            </span>
            {event.entity_sku && (
              <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>{event.entity_sku}</span>
            )}
          </div>
        )}

        {/* Originating query for cart/wishlist */}
        {event.originating_query && (
          <div style={{ marginTop: 3 }}>
            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>from search: </span>
            <span style={{ fontSize: '0.68rem', color: '#6b7280', fontStyle: 'italic' }}>"{event.originating_query}"</span>
          </div>
        )}

        {/* Time */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{fmtMin(event.occurred_at)}</span>
          {startTime && index > 0 && (
            <span style={{ fontSize: '0.65rem', color: '#c084fc', fontWeight: 600 }}>{offsetLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminSessionDetail({ sessionId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    api.get(`/admin/analytics/sessions/${sessionId}`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 22, border: '1px solid #f3f4f6' }}>
        <Skeleton w="50%" h={18} />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton w="70%" /><Skeleton w="40%" />
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: 16, padding: 22, border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <Skeleton w={28} h={28} radius={9} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton w="30%" /><Skeleton w="50%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
      Session not found
    </div>
  );

  const { session: s, events = [] } = data;

  const duration = s?.last_event_at && s?.started_at
    ? Math.round((new Date(s.last_event_at) - new Date(s.started_at)) / 60000)
    : 0;

  // Event type filter options
  const eventTypes = ['all', ...Object.keys(EVENT_META).filter(t => events.some(e => e.event_type === t))];
  const filteredEvents = filter === 'all' ? events : events.filter(e => e.event_type === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Session summary card ────────────────────────────────────────── */}
      <div style={{
        background: 'white', borderRadius: 16, padding: 20,
        border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }} className="dark:bg-gray-800 dark:border-gray-700">

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Icon */}
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={20} style={{ color: '#a855f7' }} />
          </div>

          {/* Info */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#a855f7', fontWeight: 700, background: 'rgba(168,85,247,0.08)', padding: '2px 8px', borderRadius: 6 }}>
                {sessionId}
              </span>
              {s?.customer_name ? (
                <span style={{ fontSize: '0.75rem', color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }} className="dark:text-gray-300">
                  <User size={11} style={{ color: '#9ca3af' }} /> {s.customer_name}
                  {s.customer_number && <span style={{ fontSize: '0.65rem', color: '#c084fc', fontFamily: 'monospace' }}>({s.customer_number})</span>}
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic' }}>Guest session</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> Started {fmtTime(s?.started_at)}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                Duration: {duration > 0 ? `${duration}m` : '< 1m'}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              { label: 'Events',    value: fmt(s?.total_events),   color: '#a855f7' },
              { label: 'Searches',  value: fmt(s?.searches),        color: '#3b82f6' },
              { label: 'Views',     value: fmt(s?.product_views),   color: '#10b981' },
              { label: 'Cart Adds', value: fmt(s?.cart_adds),       color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color }} className="dark:text-white">{value}</div>
                <div style={{ fontSize: '0.62rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Event timeline ────────────────────────────────────────────────── */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }} className="dark:bg-gray-800 dark:border-gray-700">

        {/* Header + filter pills */}
        <div style={{ padding: '13px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }} className="dark:border-gray-700">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Zap size={14} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827' }} className="dark:text-white">
              Event Timeline
            </span>
            <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>({filteredEvents.length} events)</span>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {eventTypes.map(type => {
              const meta = EVENT_META[type];
              const isActive = filter === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilter(type)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: '0.68rem', fontWeight: 700, transition: 'all 120ms',
                    background: isActive
                      ? (meta?.bg || 'rgba(168,85,247,0.12)')
                      : '#f3f4f6',
                    color: isActive ? (meta?.color || '#a855f7') : '#9ca3af',
                  }}>
                  {type === 'all' ? 'All' : (meta?.label || type)}
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {type === 'all' ? events.length : events.filter(e => e.event_type === type).length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Events */}
        <div style={{ padding: '20px 18px 6px' }}>
          {filteredEvents.length > 0 ? (
            filteredEvents.map((event, i) => (
              <EventRow
                key={event.id || i}
                event={event}
                index={i}
                startTime={events[0]?.occurred_at}
              />
            ))
          ) : (
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', textAlign: 'center', padding: '24px 0' }}>
              No events of this type in this session
            </p>
          )}
        </div>
      </div>
    </div>
  );
}