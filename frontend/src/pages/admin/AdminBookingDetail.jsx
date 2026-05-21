import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, MapPin, User, Calendar, FileText, Users,
  Activity, Plus, RefreshCw, Loader2, CheckCircle, XCircle,
  AlertTriangle, ExternalLink, ClipboardList,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import BookingStatusBadge from '../../components/admin/bookings/BookingStatusBadge';
import StaffAssignModal from '../../components/admin/bookings/StaffAssignModal';
import DisqualifyModal from '../../components/admin/bookings/DisqualifyModal';
import { bookingsAPI, usersAPI } from '../../api';
import toast from 'react-hot-toast';

const Section = ({ title, icon: Icon, children, action }) => (
  <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', overflow: 'hidden' }}>
    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={15} style={{ color: '#a855f7' }} />
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{title}</span>
      </div>
      {action}
    </div>
    <div style={{ padding: '16px 18px' }}>{children}</div>
  </div>
);

const Field = ({ label, value, mono = false }) => (
  <div>
    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
    <p style={{ fontSize: '0.82rem', color: '#111827', margin: 0, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-word' }}>{value ?? '—'}</p>
  </div>
);

const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'no_show'];
const ROLE_META = {
  lead:     { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
  support:  { color: '#2563eb', bg: 'rgba(37,99,235,0.08)'  },
  observer: { color: '#6b7280', bg: 'rgba(107,114,128,0.08)'},
};

const AdminBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking,       setBooking]       = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [showStaff,     setShowStaff]     = useState(false);
  const [showDisqualify, setShowDisqualify] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirming,    setConfirming]    = useState(false);
  const [cancelling,    setCancelling]    = useState(false);
  const [cancelReason,  setCancelReason]  = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  const staffAPI = useMemo(() => ({
    searchStaff: (params) => usersAPI.getUsers(params)
  }), []);

  const fetchBooking = async () => {
    try {
      setLoading(true);
      const res = await bookingsAPI.getAdminBooking(id);
      setBooking(res.booking ?? res);
    } catch { toast.error('Failed to load booking'); navigate('/admin/bookings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBooking(); }, [id]);

  const handleStatusChange = async (status) => {
    setUpdatingStatus(true);
    try {
      await bookingsAPI.updateStatus(id, status);
      await fetchBooking();
      toast.success('Status updated');
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Failed'); }
    finally { setUpdatingStatus(false); }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try { await bookingsAPI.confirm(id); await fetchBooking(); toast.success('Booking confirmed'); }
    catch (e) { toast.error(e?.response?.data?.message ?? 'Failed'); }
    finally { setConfirming(false); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a reason'); return; }
    setCancelling(true);
    try { await bookingsAPI.adminCancel(id, { reason: cancelReason }); await fetchBooking(); setShowCancelForm(false); toast.success('Booking cancelled'); }
    catch (e) { toast.error(e?.response?.data?.message ?? 'Failed'); }
    finally { setCancelling(false); }
  };

  const handleStaffAssigned = async (data) => {
    await bookingsAPI.assignStaff(id, data);
    await fetchBooking();
    toast.success('Staff assigned');
  };

  const handleRemoveStaff = async (staffId) => {
    try { await bookingsAPI.removeStaff(id, staffId); await fetchBooking(); toast.success('Staff removed'); }
    catch { toast.error('Failed to remove staff'); }
  };

  const handleDisqualify = async (data) => {
    try {
      if (booking?.is_disqualified) {
        await bookingsAPI.reactivate(id, data);
        toast.success('Customer reactivated');
      } else {
        await bookingsAPI.disqualify(id, data);
        toast.success('Customer disqualified');
      }
      await fetchBooking();
    } catch (e) {
      toast.error(e?.response?.data?.message ?? 'Action failed');
    }
  };

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0', gap: 10, color: '#9ca3af', fontSize: '0.82rem' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
        Loading booking…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  if (!booking) return null;

  const time    = booking.scheduled_at ? new Date(booking.scheduled_at).toLocaleString('en-KE') : '—';
  const endTime = booking.scheduled_end_at ? new Date(booking.scheduled_end_at).toLocaleString('en-KE') : null;
  const isDisqualified = booking.is_disqualified;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* Back + header */}
        <div>
          <button onClick={() => navigate('/admin/bookings')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', fontFamily: 'inherit' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          >
            <ArrowLeft size={14} /> Back to bookings
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                  {booking.service?.name}
                </h1>
                <BookingStatusBadge status={booking.status} />
              </div>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
                {booking.booking_number}
              </p>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={fetchBooking} style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600 }}>
                <RefreshCw size={12} /> Refresh
              </button>
              {booking.status === 'pending' && (
                <button onClick={handleConfirm} disabled={confirming} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700 }}>
                  {confirming ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
                  Confirm
                </button>
              )}
              {!booking.isCancelled && booking.status !== 'cancelled' && booking.status !== 'completed' && (
                <button onClick={() => setShowCancelForm(p => !p)} style={{ padding: '7px 14px', borderRadius: 9, border: '1.5px solid rgba(220,38,38,0.25)', background: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700 }}>
                  <XCircle size={12} /> Cancel
                </button>
              )}
            </div>
          </div>

          {/* Cancel form */}
          {showCancelForm && (
            <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.02)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#dc2626', display: 'block', marginBottom: 5 }}>Cancellation reason *</label>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation…"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: '0.8rem', border: '1.5px solid rgba(220,38,38,0.25)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <button onClick={handleCancel} disabled={cancelling} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {cancelling ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Confirm Cancel
              </button>
              <button onClick={() => setShowCancelForm(false)} style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(168,85,247,0.18)', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Status stepper */}
        {booking.status !== 'cancelled' && booking.status !== 'no_show' && (
          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', marginRight: 4 }}>Set status:</span>
            {STATUSES.map(s => (
              <button key={s} onClick={() => handleStatusChange(s)} disabled={updatingStatus || booking.status === s}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                  cursor: (updatingStatus || booking.status === s) ? 'not-allowed' : 'pointer',
                  border: `1.5px solid ${booking.status === s ? '#a855f7' : 'rgba(168,85,247,0.18)'}`,
                  background: booking.status === s ? 'rgba(168,85,247,0.08)' : 'none',
                  color: booking.status === s ? '#7c3aed' : '#9ca3af', fontFamily: 'inherit',
                  transition: 'all 120ms', opacity: updatingStatus ? 0.6 : 1,
                }}>
                {s.replace(/_/g, ' ')}
              </button>
            ))}
            {updatingStatus && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />}
          </div>
        )}

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Booking details */}
            <Section title="Booking Details" icon={Calendar}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Service"       value={booking.service?.name} />
                <Field label="Booking ref"   value={booking.booking_number} mono />
                <Field label="Scheduled"     value={time} />
                <Field label="End time"      value={endTime ?? (booking.duration_minutes ? `${booking.duration_minutes} min duration` : '—')} />
                <Field label="Location type" value={booking.location_type} />
                <Field label="Location"      value={booking.location_address} />
                <Field label="Scheduled type"value={booking.scheduled_type?.replace(/_/g,' ')} />
                <Field label="Recurring"     value={booking.is_recurring ? 'Yes' : 'No'} />
                {booking.customer_notes && <div style={{ gridColumn: '1/-1' }}><Field label="Customer notes" value={booking.customer_notes} /></div>}
                {booking.admin_notes    && <div style={{ gridColumn: '1/-1' }}><Field label="Admin notes"    value={booking.admin_notes} /></div>}
              </div>
            </Section>

            {/* Staff */}
            <Section title="Assigned Staff" icon={Users} action={
              <button onClick={() => setShowStaff(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, border: '1.5px dashed rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)', color: '#7c3aed', cursor: 'pointer' }}>
                <Plus size={11} /> Assign
              </button>
            }>
              {!booking.staff?.length ? (
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, textAlign: 'center', padding: '16px 0' }}>No staff assigned yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {booking.staff.map(s => {
                    const m = ROLE_META[s.role] ?? ROLE_META.support;
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(168,85,247,0.1)', background: 'white' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, flexShrink: 0 }}>
                          {s.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0 }}>{s.user?.name}</p>
                          {s.task_description && <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.task_description}</p>}
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: m.bg, color: m.color }}>{s.role}</span>
                        <button onClick={() => handleRemoveStaff(s.id)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.background = 'none'; }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Worksheets */}
            <Section title="Worksheets" icon={ClipboardList} action={
              <button onClick={() => navigate(`/admin/bookings/${id}/worksheets/new`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, border: '1.5px dashed rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)', color: '#7c3aed', cursor: 'pointer' }}>
                <Plus size={11} /> New worksheet
              </button>
            }>
              {!booking.worksheets?.length ? (
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, textAlign: 'center', padding: '16px 0' }}>No worksheets yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {booking.worksheets.map(ws => (
                    <div key={ws.id} onClick={() => navigate(`/admin/bookings/${id}/worksheets/${ws.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(168,85,247,0.1)', cursor: 'pointer', transition: 'border-color 150ms, box-shadow 150ms' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(168,85,247,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <FileText size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                          Worksheet #{ws.id} · {ws.currency_code}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>
                          By {ws.filled_by?.name ?? 'Unknown'} · {ws.status}
                        </p>
                      </div>
                      {ws.grand_total && (
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed' }}>
                          {ws.currency_code} {parseFloat(ws.grand_total).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <ExternalLink size={12} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Linked orders */}
            {booking.orders?.length > 0 && (
              <Section title="Linked Orders" icon={FileText}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {booking.orders.map(o => (
                    <div key={o.id} onClick={() => navigate(`/admin/orders/${o.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(168,85,247,0.1)', cursor: 'pointer', transition: 'border-color 120ms' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', flex: 1 }}>{o.order_number}</span>
                      <ExternalLink size={12} style={{ color: '#c4b5fd' }} />
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Customer */}
            <Section title="Customer" icon={User} action={
              <button onClick={() => setShowDisqualify(true)} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: `1.5px solid ${isDisqualified ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.25)'}`, background: isDisqualified ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.04)', color: isDisqualified ? '#16a34a' : '#dc2626', cursor: 'pointer' }}>
                {isDisqualified ? 'Reactivate' : 'Disqualify'}
              </button>
            }>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {isDisqualified && (
                  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={12} style={{ color: '#dc2626', flexShrink: 0 }} />
                    <p style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 600, margin: 0 }}>Customer is disqualified</p>
                  </div>
                )}
                <Field label="Name"  value={`${booking.customer?.first_name ?? ''} ${booking.customer?.last_name ?? ''}`} />
                <Field label="Email" value={booking.customer?.email} />
                <Field label="Phone" value={booking.customer?.phone} />
                <Field label="Type"  value={booking.customer?.customer_type} />
              </div>
            </Section>

            {/* Policy acceptance */}
            <Section title="Legal" icon={FileText}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {booking.policy_accepted
                    ? <CheckCircle size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                    : <XCircle    size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />}
                  <span style={{ fontSize: '0.78rem', color: booking.policy_accepted ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                    {booking.policy_accepted ? 'Policy accepted' : 'Policy not accepted'}
                  </span>
                </div>
                {booking.policy_accepted_at && <Field label="Accepted at" value={new Date(booking.policy_accepted_at).toLocaleString('en-KE')} />}
                {booking.policy_version     && <Field label="Policy version" value={booking.policy_version} mono />}
              </div>
            </Section>

            {/* Activity log */}
            <Section title="Activity" icon={Activity}>
              {!booking.activity_logs?.length ? (
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>No activity yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {booking.activity_logs.slice(0, 10).map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0, marginTop: 6 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#374151', margin: 0 }}>
                          {log.action?.replace(/_/g, ' ')}
                        </p>
                        <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>
                          {log.performed_by?.name ?? 'System'} · {new Date(log.created_at).toLocaleString('en-KE')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showStaff && (
        <StaffAssignModal
          bookingId={id}
          existingStaff={booking.staff ?? []}
          onClose={() => setShowStaff(false)}
          onAssigned={handleStaffAssigned}
          staffAPI={staffAPI}
        />
      )}

      {showDisqualify && (
        <DisqualifyModal
          booking={booking}
          isDisqualified={isDisqualified}
          onClose={() => setShowDisqualify(false)}
          onSubmit={handleDisqualify}
        />
      )}
    </AdminLayout>
  );
};

export default AdminBookingDetail;