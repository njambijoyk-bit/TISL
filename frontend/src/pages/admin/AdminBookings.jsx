import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Filter, Loader2, CalendarDays, UserX, AlertTriangle } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import BookingCalendar from '../../components/admin/bookings/BookingCalendar';
import BookingDaySidebar from '../../components/admin/bookings/BookingDaySidebar';
import BookingStatusBadge from '../../components/admin/bookings/BookingStatusBadge';
import DisqualifyModal from '../../components/admin/bookings/DisqualifyModal';
import { bookingsAPI } from '../../api';
import toast from 'react-hot-toast';

const STATUSES = ['', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];

const AdminBookings = () => {
  const navigate = useNavigate();

  const [bookings,     setBookings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedDay,  setSelectedDay]  = useState(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [filters,      setFilters]      = useState({ status: '', service_id: '' });
  const [showFilters,  setShowFilters]  = useState(false);
  const [showDisqualified, setShowDisqualified] = useState(false);

  // Reactivation modal state
  const [reactivateTarget, setReactivateTarget] = useState(null); // booking object

  // Stats
  const todayStr      = new Date().toISOString().split('T')[0];
  const todayBookings = bookings.filter(b => b.scheduled_at?.startsWith(todayStr));
  const pendingCount  = bookings.filter(b => b.status === 'pending').length;
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;

  // Disqualified customers — deduplicated by customer id, showing latest booking per customer
  const disqualifiedBookings = bookings.filter(b => b.is_disqualified);
  const disqualifiedByCustomer = Object.values(
    disqualifiedBookings.reduce((acc, b) => {
      const cid = b.customer?.id ?? b.customer_id;
      if (!cid) return acc;
      if (!acc[cid] || new Date(b.scheduled_at) > new Date(acc[cid].scheduled_at)) {
        acc[cid] = b;
      }
      return acc;
    }, {})
  );

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

  const handleDayClick = (day) => { setSelectedDay(day); setSidebarOpen(true); };
  const handleBookingClick = (booking) => { navigate(`/admin/bookings/${booking.id}`); };

  const handleReactivate = async (data) => {
    if (!reactivateTarget) return;
    try {
      await bookingsAPI.reactivate(reactivateTarget.id, data);
      toast.success('Customer reactivated');
      setReactivateTarget(null);
      await fetchBookings();
    } catch (e) {
      toast.error(e?.response?.data?.message ?? 'Reactivation failed');
    }
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Disqualified toggle */}
            <button
              onClick={() => setShowDisqualified(f => !f)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                background: showDisqualified ? 'rgba(220,38,38,0.08)' : 'white',
                border: `1.5px solid ${showDisqualified ? 'rgba(220,38,38,0.4)' : 'rgba(220,38,38,0.2)'}`,
                color: showDisqualified ? '#dc2626' : '#ef4444',
                position: 'relative',
              }}
            >
              <UserX size={13} />
              Disqualified
              {disqualifiedByCustomer.length > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  background: '#dc2626', color: 'white',
                  fontSize: '0.6rem', fontWeight: 800,
                  borderRadius: 20, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {disqualifiedByCustomer.length}
                </span>
              )}
            </button>

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
            { label: "Today's bookings", value: todayBookings.length,        color: '#a855f7', bg: 'rgba(168,85,247,0.06)' },
            { label: 'Pending',          value: pendingCount,                color: '#f59e0b', bg: 'rgba(245,158,11,0.06)'  },
            { label: 'Confirmed',        value: confirmedCount,              color: '#2563eb', bg: 'rgba(37,99,235,0.06)'   },
            { label: 'Total',            value: bookings.length,             color: '#374151', bg: 'rgba(107,114,128,0.06)' },
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

        {/* Disqualified customers panel */}
        {showDisqualified && (
          <div style={{ borderRadius: 14, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.02)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(220,38,38,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserX size={14} style={{ color: '#dc2626' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>Disqualified Customers</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '2px 8px', borderRadius: 20 }}>
                {disqualifiedByCustomer.length} customer{disqualifiedByCustomer.length !== 1 ? 's' : ''}
              </span>
            </div>

            {disqualifiedByCustomer.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, textAlign: 'center', padding: '24px 0' }}>
                No disqualified customers
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {disqualifiedByCustomer.map((booking, i) => {
                  const customer = booking.customer ?? {};
                  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—';
                  return (
                    <div
                      key={booking.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 18px',
                        borderTop: i === 0 ? 'none' : '1px solid rgba(220,38,38,0.08)',
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(220,38,38,0.08)', color: '#dc2626',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 800,
                      }}>
                        {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>

                      {/* Customer info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 20, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
                            <AlertTriangle size={9} style={{ color: '#dc2626' }} />
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#dc2626' }}>Disqualified</span>
                          </div>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                          {customer.email ?? '—'}
                          {booking.booking_number ? ` · ${booking.booking_number}` : ''}
                          {booking.service?.name ? ` · ${booking.service.name}` : ''}
                        </p>
                        {booking.disqualification_reason && (
                          <p style={{ fontSize: '0.68rem', color: '#b91c1c', margin: '3px 0 0', fontStyle: 'italic' }}>
                            "{booking.disqualification_reason}"
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                          style={{ padding: '5px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(168,85,247,0.2)', background: 'none', color: '#7c3aed', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => setReactivateTarget(booking)}
                          style={{ padding: '5px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid rgba(22,163,74,0.3)', background: 'rgba(22,163,74,0.06)', color: '#16a34a', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,163,74,0.12)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,163,74,0.06)'; }}
                        >
                          Reactivate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

      {/* Reactivation modal — reuses DisqualifyModal in reactivate mode */}
      {reactivateTarget && (
        <DisqualifyModal
          booking={reactivateTarget}
          isDisqualified={true}
          onClose={() => setReactivateTarget(null)}
          onSubmit={handleReactivate}
        />
      )}
    </AdminLayout>
  );
};

export default AdminBookings;