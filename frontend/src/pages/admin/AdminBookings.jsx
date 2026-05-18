import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Filter, Loader2, CalendarDays } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import BookingCalendar from '../../components/admin/bookings/BookingCalendar';
import BookingDaySidebar from '../../components/admin/bookings/BookingDaySidebar';
import BookingStatusBadge from '../../components/admin/bookings/BookingStatusBadge';
import { bookingsAPI } from '../../api';
import toast from 'react-hot-toast';

const STATUSES = ['', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];

const AdminBookings = () => {
  const navigate = useNavigate();

  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filters,    setFilters]    = useState({ status: '', service_id: '' });
  const [showFilters, setShowFilters] = useState(false);

  // Stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings   = bookings.filter(b => b.scheduled_at?.startsWith(todayStr));
  const pendingCount    = bookings.filter(b => b.status === 'pending').length;
  const confirmedCount  = bookings.filter(b => b.status === 'confirmed').length;

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = { per_page: 500, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await bookingsAPI.getAdminBookings(params);
      const list = res.data ?? res ?? [];
      setBookings(Array.isArray(list) ? list : list.data ?? []);
    } catch { toast.error('Failed to load bookings'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleDayClick = (day) => {
    setSelectedDay(day);
    setSidebarOpen(true);
  };

  const handleBookingClick = (booking) => {
    navigate(`/admin/bookings/${booking.id}`);
  };

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '0 0 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={18} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: 0 }}>Bookings</h1>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>
                {bookings.length} total · {todayBookings.length} today
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowFilters(f => !f)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              background: showFilters ? 'rgba(168,85,247,0.1)' : 'white',
              border: `1.5px solid ${showFilters ? '#a855f7' : 'rgba(168,85,247,0.2)'}`,
              color: showFilters ? '#7c3aed' : '#9ca3af',
            }}><Filter size={13} /> Filters</button>
            <button onClick={fetchBookings} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: 'white', border: '1.5px solid rgba(168,85,247,0.2)', color: '#9ca3af' }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => navigate('/admin/bookings/create')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', border: 'none',
              boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            }}><Plus size={14} /> New Booking</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { label: "Today's bookings", value: todayBookings.length, color: '#a855f7', bg: 'rgba(168,85,247,0.06)' },
            { label: 'Pending',          value: pendingCount,         color: '#f59e0b', bg: 'rgba(245,158,11,0.06)'  },
            { label: 'Confirmed',        value: confirmedCount,       color: '#2563eb', bg: 'rgba(37,99,235,0.06)'   },
            { label: 'Total',            value: bookings.length,      color: '#374151', bg: 'rgba(107,114,128,0.06)' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 12, background: s.bg, border: `1px solid ${s.color}22` }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 4px' }}>{s.label}</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        {showFilters && (
          <div style={{ padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.02)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed', display: 'block', marginBottom: 5 }}>Status</label>
              <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, fontSize: '0.78rem', border: '1.5px solid rgba(168,85,247,0.18)', background: 'white', color: '#374151', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>)}
              </select>
            </div>
            <button onClick={() => setFilters({ status: '', service_id: '' })} style={{ padding: '7px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(168,85,247,0.18)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
              Clear
            </button>
          </div>
        )}

        {/* Calendar */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10, color: '#9ca3af', fontSize: '0.82rem' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
            Loading bookings…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ minHeight: 500 }}>
            <BookingCalendar
              bookings={bookings}
              onDayClick={handleDayClick}
              onBookingClick={handleBookingClick}
            />
          </div>
        )}
      </div>

      {/* Day sidebar */}
      {sidebarOpen && (
        <BookingDaySidebar
          day={selectedDay}
          bookings={bookings}
          loading={false}
          onClose={() => setSidebarOpen(false)}
        />
      )}
    </AdminLayout>
  );
};

export default AdminBookings;