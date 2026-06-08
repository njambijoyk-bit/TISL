import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, MapPin, Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import BookingStatusBadge from '../../components/admin/bookings/BookingStatusBadge';
import Header from '../../components/layout/Header';
import { bookingsAPI } from '../../api';
import toast from 'react-hot-toast';

const TABS = [
  { key: '',          label: 'All'       },
  { key: 'pending',   label: 'Pending'   },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const MyBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('');
  const [page,     setPage]     = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = { per_page: 100, page, ...(tab ? { status: tab } : {}) };
        const res = await bookingsAPI.getCustomerBookings(params);

        // Laravel paginator: { data: [...], current_page, last_page, total }
        const list = Array.isArray(res) ? res : (res.data ?? []);

        // Client-side filter as fallback in case API ignores status param
        const filtered = tab ? list.filter(b => b.status === tab) : list;

        setBookings(filtered);
        setPagination({
          current_page: res.current_page ?? 1,
          last_page:    res.last_page    ?? 1,
          total:        res.total        ?? filtered.length,
        });
      } catch { toast.error('Failed to load bookings'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [tab, page]);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 16px 60px', fontFamily: 'inherit' }}>
    <Header />
      {/* Header */}
      {/* Back */}
      <button onClick={() => navigate('/home')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 16px', fontFamily: 'inherit' }}
        onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
      ><ArrowLeft size={14} /> Home</button>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>My Bookings</h1>
        <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Track and manage your service bookings</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(168,85,247,0.1)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }} style={{
            padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: tab === t.key ? '#7c3aed' : '#9ca3af',
            borderBottom: `2px solid ${tab === t.key ? '#a855f7' : 'transparent'}`,
            marginBottom: -1, transition: 'color 120ms, border-color 120ms',
          }}>{t.label}</button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10, color: '#9ca3af', fontSize: '0.82rem' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : bookings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', gap: 12, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarDays size={24} style={{ color: '#a855f7' }} />
          </div>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151', margin: 0 }}>No bookings yet</p>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Browse our services to make a booking</p>
          <button onClick={() => navigate('/services')} style={{ marginTop: 8, padding: '9px 20px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', cursor: 'pointer' }}>
            Browse services
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bookings.map(b => {
            const time = b.scheduled_at ? new Date(b.scheduled_at).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'TBC';
            const timeShort = b.scheduled_at ? new Date(b.scheduled_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : null;
            return (
              <div key={b.id} onClick={() => navigate(`/bookings/${b.id}`)} style={{
                background: 'white', borderRadius: 14, padding: '16px 18px',
                border: '1.5px solid rgba(168,85,247,0.1)',
                boxShadow: '0 1px 4px rgba(168,85,247,0.05)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
                transition: 'box-shadow 150ms, border-color 150ms',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(168,85,247,0.05)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.service?.name}
                    </p>
                    <p style={{ fontSize: '0.65rem', color: '#c4b5fd', fontFamily: 'monospace', margin: 0 }}>{b.booking_number}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <BookingStatusBadge status={b.status} size="sm" />
                    <ChevronRight size={14} style={{ color: '#d1d5db' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CalendarDays size={12} style={{ color: '#a855f7', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>{time}</span>
                    {timeShort && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{timeShort}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'capitalize' }}>{b.location_type}</span>
                  </div>
                  {b.duration_minutes && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{b.duration_minutes} min</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {pagination && pagination.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                style={{ padding: '7px 16px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#7c3aed', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
                ← Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', color: '#9ca3af' }}>
                {page} / {pagination.last_page}
              </span>
              <button disabled={page === pagination.last_page} onClick={() => setPage(p => p + 1)}
                style={{ padding: '7px 16px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#7c3aed', cursor: page === pagination.last_page ? 'not-allowed' : 'pointer', opacity: page === pagination.last_page ? 0.4 : 1 }}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MyBookings;