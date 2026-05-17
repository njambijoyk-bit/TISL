import React from 'react';
import { X, Clock, MapPin, User, CalendarDays, ChevronRight, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BookingStatusBadge from './BookingStatusBadge';

const toYMD = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const BookingDaySidebar = ({ day, bookings = [], loading = false, onClose }) => {
  const navigate = useNavigate();

  const dayBookings = day
    ? bookings.filter(b => b.scheduled_at && toYMD(b.scheduled_at) === toYMD(day))
    : [];

  const dayLabel = day
    ? new Date(day).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  if (!day) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.15)',
          backdropFilter: 'blur(2px)',
          transition: 'opacity 200ms',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 380, maxWidth: '95vw',
        background: 'white',
        borderLeft: '1px solid rgba(168,85,247,0.15)',
        boxShadow: '-8px 0 40px rgba(168,85,247,0.1)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 200ms ease-out',
      }}>
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);   opacity: 1; }
          }
        `}</style>

        {/* Accent strip */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(168,85,247,0.1)',
          flexShrink: 0,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CalendarDays size={16} color="white" />
            </div>
            <div>
              <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                {dayLabel}
              </p>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                {dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: 'none', cursor: 'pointer', color: '#9ca3af',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 120ms, background 120ms', flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'none'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 8, color: '#9ca3af', fontSize: '0.78rem' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Loading bookings…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : dayBookings.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 10, textAlign: 'center' }}>
              <CalendarDays size={32} style={{ color: 'rgba(168,85,247,0.2)' }} />
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No bookings for this day</p>
              <p style={{ fontSize: '0.72rem', color: '#d1d5db', margin: 0 }}>Click another day to explore</p>
            </div>
          ) : (
            dayBookings
              .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
              .map((booking) => {
                const time = booking.scheduled_at
                  ? new Date(booking.scheduled_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                  : '—';
                const endTime = booking.scheduled_end_at
                  ? new Date(booking.scheduled_end_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                  : null;

                return (
                  <div
                    key={booking.id}
                    onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                    style={{
                      padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                      border: '1.5px solid rgba(168,85,247,0.1)',
                      background: 'white',
                      boxShadow: '0 1px 4px rgba(168,85,247,0.05)',
                      transition: 'border-color 150ms, box-shadow 150ms, transform 150ms',
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.1)';
                      e.currentTarget.style.transform = 'translateX(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)';
                      e.currentTarget.style.boxShadow = '0 1px 4px rgba(168,85,247,0.05)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    {/* Row 1: time + status + arrow */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={12} style={{ color: '#a855f7', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a855f7' }}>
                          {time}{endTime ? ` – ${endTime}` : booking.duration_minutes ? ` (${booking.duration_minutes}min)` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BookingStatusBadge status={booking.status} size="sm" />
                        <ChevronRight size={13} style={{ color: '#d1d5db' }} />
                      </div>
                    </div>

                    {/* Row 2: service name */}
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {booking.service?.name ?? '—'}
                    </p>

                    {/* Row 3: customer + location */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                        <User size={11} style={{ color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {booking.customer?.first_name} {booking.customer?.last_name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <MapPin size={11} style={{ color: '#9ca3af' }} />
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'capitalize' }}>
                          {booking.location_type}
                        </span>
                      </div>
                    </div>

                    {/* Row 4: booking number */}
                    <p style={{ fontSize: '0.65rem', color: '#d1d5db', fontFamily: 'monospace', margin: 0 }}>
                      {booking.booking_number}
                    </p>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </>
  );
};

export default BookingDaySidebar;