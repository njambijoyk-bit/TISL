import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Clock, FileText, Users, Loader2, XCircle, AlertCircle } from 'lucide-react';
import BookingStatusBadge from '../../components/admin/bookings/BookingStatusBadge';
import { bookingsAPI } from '../../api';
import toast from 'react-hot-toast';

const Field = ({ label, value }) => (
  <div>
    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 2px' }}>{label}</p>
    <p style={{ fontSize: '0.82rem', color: '#111827', margin: 0 }}>{value ?? '—'}</p>
  </div>
);

const Card = ({ title, icon: Icon, children }) => (
  <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', overflow: 'hidden' }}>
    <div style={{ padding: '13px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon size={14} style={{ color: '#a855f7' }} />
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{title}</span>
    </div>
    <div style={{ padding: '16px 18px' }}>{children}</div>
  </div>
);

const MyBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking,  setBooking]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    bookingsAPI.getCustomerBooking(id)
      .then(r => setBooking(r.booking ?? r))
      .catch(() => { toast.error('Booking not found'); navigate('/bookings'); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a reason'); return; }
    setCancelling(true);
    try {
      await bookingsAPI.customerCancel(id, { reason: cancelReason });
      toast.success('Booking cancelled');
      setBooking(p => ({ ...p, status: 'cancelled' }));
      setShowCancel(false);
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Could not cancel booking'); }
    finally { setCancelling(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 16px', gap: 10, color: '#9ca3af', fontSize: '0.82rem' }}>
      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
  if (!booking) return null;

  const time    = booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString('en-KE') : 'To be confirmed';
  const approvedWorksheets = booking.worksheets?.filter(ws => ws.status === 'approved') ?? [];
  const fmt = (n, code) => `${code ?? 'KES'} ${parseFloat(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px 60px', fontFamily: 'inherit' }}>

      {/* Back */}
      <button onClick={() => navigate('/bookings')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 16px', fontFamily: 'inherit' }}
        onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
      ><ArrowLeft size={14} /> My bookings</button>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>{booking.service?.name}</h1>
            <p style={{ fontSize: '0.65rem', color: '#c4b5fd', fontFamily: 'monospace', margin: 0 }}>{booking.booking_number}</p>
          </div>
          <BookingStatusBadge status={booking.status} size="lg" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Cancellation warning */}
        {booking.status === 'cancelled' && (
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertCircle size={14} style={{ color: '#dc2626' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>Booking cancelled</span>
            </div>
            {booking.cancellation_reason && <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Reason: {booking.cancellation_reason}</p>}
            {booking.cancellation_fee_applied > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '4px 0 0', fontWeight: 600 }}>
                Cancellation fee: {fmt(booking.cancellation_fee_applied)}
              </p>
            )}
          </div>
        )}

        {/* Details */}
        <Card title="Booking Details" icon={Calendar}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Calendar size={13} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
              <Field label="Scheduled" value={time} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin size={13} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
              <Field label="Location" value={`${booking.location_type}${booking.location_address ? ` — ${booking.location_address}` : ''}`} />
            </div>
            {booking.duration_minutes && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Clock size={13} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
                <Field label="Duration" value={`${booking.duration_minutes} minutes`} />
              </div>
            )}
          </div>
          {booking.customer_notes && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(168,85,247,0.08)' }}>
              <Field label="Your notes" value={booking.customer_notes} />
            </div>
          )}
        </Card>

        {/* Staff */}
        {booking.staff?.length > 0 && (
          <Card title="Your Team" icon={Users}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {booking.staff.filter(s => s.status !== 'declined').map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, flexShrink: 0 }}>
                    {s.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0 }}>{s.user?.name}</p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, textTransform: 'capitalize' }}>{s.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {approvedWorksheets.map((approvedWs, wsIdx) => (
          <Card key={approvedWs.id} title={approvedWorksheets.length > 1 ? `Service Report #${wsIdx + 1}` : 'Service Report'} icon={FileText}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {approvedWs.findings && (
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 4px' }}>Findings</p>
                  <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>{approvedWs.findings}</p>
                </div>
              )}

              {approvedWs.items?.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 8px' }}>Materials used</p>
                  <div style={{ border: '1px solid rgba(168,85,247,0.1)', borderRadius: 10, overflow: 'hidden' }}>
                    {approvedWs.items.map((item, i) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: i < approvedWs.items.length - 1 ? '1px solid rgba(168,85,247,0.06)' : 'none' }}>
                        <div>
                          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827', margin: 0 }}>{item.name}</p>
                          <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>{item.quantity} {item.unit_of_measure}</p>
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed' }}>{fmt(item.line_total, approvedWs.currency_code)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(168,85,247,0.04)', borderTop: '1px solid rgba(168,85,247,0.08)' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af' }}>Total</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#7c3aed' }}>{fmt(approvedWs.grand_total, approvedWs.currency_code)}</span>
                    </div>
                  </div>
                </div>
              )}

              <p style={{ fontSize: '0.65rem', color: '#d1d5db', margin: 0 }}>
                Report approved {approvedWs.approved_at ? new Date(approvedWs.approved_at).toLocaleDateString('en-KE') : ''}
              </p>
            </div>
          </Card>
        ))}

        {/* Cancel */}
        {['pending','confirmed'].includes(booking.status) && (
          <div>
            {!showCancel ? (
              <button onClick={() => setShowCancel(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 700, border: '1.5px solid rgba(220,38,38,0.25)', background: 'none', color: '#dc2626', cursor: 'pointer' }}>
                <XCircle size={14} /> Cancel this booking
              </button>
            ) : (
              <div style={{ padding: '16px', borderRadius: 14, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.02)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', margin: 0 }}>Cancel booking</p>
                <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>
                  Please tell us why you're cancelling. A cancellation fee may apply as per our policy.
                </p>
                <textarea rows={2} value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation…"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 9, fontSize: '0.8rem', border: '1.5px solid rgba(220,38,38,0.2)', outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCancel} disabled={cancelling} style={{ padding: '8px 16px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', cursor: cancelling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {cancelling && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                    Confirm cancel
                  </button>
                  <button onClick={() => setShowCancel(false)} style={{ padding: '8px 14px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(168,85,247,0.18)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                    Keep booking
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default MyBookingDetail;