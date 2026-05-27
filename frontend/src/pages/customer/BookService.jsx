import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, MapPin, Loader2, CheckSquare, ExternalLink, AlertTriangle } from 'lucide-react';
import PolicyConsentCheckbox from '../../components/legal/shared/PolicyConsentCheckbox';
import { bookingsAPI } from '../../api/bookings';
import { getServiceById } from '../../api/services';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 11, fontSize: '0.85rem',
  background: 'white', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const labelStyle = {
  fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: '#7c3aed', display: 'block', marginBottom: 6,
};
const focus = e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; };
const blur  = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const BookService = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [service, setService]   = useState(null);
  const [settings, setSettings] = useState(null);
  const [slots,    setSlots]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [step,     setStep]     = useState(1); // 1: form, 2: confirm

  const [form, setForm] = useState({
    scheduled_type:   'specific_time',
    scheduled_date:   '',
    scheduled_slot:   '',
    location_type:    'instore',
    location_address: '',
    customer_notes:   '',
    policy_accepted:  false,
  });

  const [policyAccepted,    setPolicyAccepted]    = useState(false);
  const [policyAcceptances, setPolicyAcceptances] = useState([]);

  useEffect(() => {
    Promise.all([
      getServiceById(id),
      bookingsAPI.getPublicPolicy(),
    ]).then(([sRes, pRes]) => {
      setService(sRes.service ?? sRes);
      setSettings(pRes);
    }).catch(() => { toast.error('Service not found'); navigate('/services'); })
    .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!form.scheduled_date || form.scheduled_type !== 'specific_time') { setSlots([]); return; }
    setLoadingSlots(true);
    bookingsAPI.getAvailableSlots({ date: form.scheduled_date, service_id: service?.id })
      .then(r => setSlots(r.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [form.scheduled_date, service?.id]);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleBook = async () => {
    if (!policyAccepted) {   // ← replace the old if block with this
      toast.error('Please accept the cancellation policy to continue'); return;
    }
    setSaving(true);
    try {
      const scheduledAt = form.scheduled_type === 'specific_time' && form.scheduled_date && form.scheduled_slot
        ? `${form.scheduled_date}T${form.scheduled_slot}:00`
        : null;

      const res = await bookingsAPI.customerCreateBooking({
        service_id:          service.id,
        location_type:       form.location_type,
        location_address:    form.location_address || undefined,
        scheduled_type:      form.scheduled_type,
        scheduled_at:        scheduledAt,
        customer_notes:      form.customer_notes || undefined,
        policy_acceptances:  policyAcceptances,
      });

      toast.success('Booking placed! We\'ll confirm shortly.');
      navigate(`/bookings/${res.booking?.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.message ?? 'Booking failed. Please try again.');
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 16px', gap: 10, color: '#9ca3af', fontSize: '0.82rem' }}>
      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const minDate = (() => {
    const d = new Date();
    d.setHours(d.getHours() + (settings?.lead_time_hours ?? 24));
    return d.toISOString().split('T')[0];
  })();

  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (settings?.max_advance_days ?? 90));
    return d.toISOString().split('T')[0];
  })();

  return (
    <div style={{ maxWidth: 580, margin: '0 auto', padding: '32px 16px 80px', fontFamily: 'inherit' }}>

      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 16px', fontFamily: 'inherit' }}
        onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
      ><ArrowLeft size={14} /> Back</button>

      {/* Bookings closed banner */}
      {settings && !settings.bookings_open && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.25)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0 }} />
          <p style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600, margin: 0 }}>
            Bookings are currently closed. Please check back later or contact us.
          </p>
        </div>
      )}

      {/* Service header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CalendarDays size={20} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: 0 }}>{service?.name}</h1>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>Book this service</p>
          </div>
        </div>
        {service?.short_description && (
          <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{service.short_description}</p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Scheduling type */}
        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '18px' }}>
          <label style={labelStyle}>When would you like this?</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['specific_time',  <><CalendarDays size={14} /> Specific date &amp; time</>],
              ['next_available', <><Clock size={14} /> Next available slot</>],
              ['before_eod',     <><Clock size={14} /> Before end of business today</>],
            ].map(([val, lbl]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${form.scheduled_type === val ? '#a855f7' : 'rgba(168,85,247,0.1)'}`, background: form.scheduled_type === val ? 'rgba(168,85,247,0.04)' : 'white', transition: 'all 150ms' }}>
                <input type="radio" name="scheduled_type" value={val} checked={form.scheduled_type === val}
                  onChange={() => set('scheduled_type', val)} style={{ accentColor: '#a855f7' }}
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: form.scheduled_type === val ? '#7c3aed' : '#374151', display: 'flex', alignItems: 'center', gap: 7 }}>
                  {lbl}
                </span>
              </label>
            ))}
          </div>

          {form.scheduled_type === 'specific_time' && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.scheduled_date}
                  onChange={e => { set('scheduled_date', e.target.value); set('scheduled_slot', ''); }}
                  min={minDate} max={maxDate}
                  style={inputStyle} onFocus={focus} onBlur={blur}
                />
              </div>
              {form.scheduled_date && (
                <div>
                  <label style={labelStyle}>Time slot</label>
                  {loadingSlots ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', color: '#9ca3af', fontSize: '0.78rem' }}>
                      <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Checking availability…
                    </div>
                  ) : slots.length === 0 ? (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.78rem', color: '#b45309' }}>
                      No slots available on this date. Please select a different date.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {slots.map(s => (
                        <button key={s.start} type="button" onClick={() => set('scheduled_slot', s.start)} style={{
                          padding: '9px 0', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
                          border: `1.5px solid ${form.scheduled_slot === s.start ? '#a855f7' : 'rgba(168,85,247,0.15)'}`,
                          background: form.scheduled_slot === s.start ? 'rgba(168,85,247,0.08)' : 'white',
                          color: form.scheduled_slot === s.start ? '#7c3aed' : '#374151',
                        }}>{s.start}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Location */}
        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '18px' }}>
          <label style={labelStyle}>Location</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: (form.location_type !== 'instore') ? 12 : 0 }}>
            {['instore','onsite','remote'].map(t => (
              <button key={t} type="button" onClick={() => set('location_type', t)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, fontSize: '0.75rem', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms', textTransform: 'capitalize',
                border: `1.5px solid ${form.location_type === t ? '#a855f7' : 'rgba(168,85,247,0.15)'}`,
                background: form.location_type === t ? 'rgba(168,85,247,0.08)' : 'transparent',
                color: form.location_type === t ? '#7c3aed' : '#9ca3af',
              }}>{t}</button>
            ))}
          </div>
          {form.location_type !== 'instore' && (
            <input value={form.location_address} onChange={e => set('location_address', e.target.value)}
              placeholder={form.location_type === 'remote' ? 'Meeting link or contact preference' : 'Your address'}
              style={inputStyle} onFocus={focus} onBlur={blur}
            />
          )}
        </div>

        {/* Notes */}
        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '18px' }}>
          <label style={labelStyle}>Notes <span style={{ color: '#d1d5db', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <textarea rows={3} value={form.customer_notes} onChange={e => set('customer_notes', e.target.value)}
            placeholder="Any special requirements, instructions, or context…"
            style={{ ...inputStyle, resize: 'none' }} onFocus={focus} onBlur={blur}
          />
        </div>

        {/* Policy acceptance */}
        <PolicyConsentCheckbox
          policyKeys={['booking_cancellation_policy']}
          actionContext="booking_checkout"
          onChange={(isChecked, acceptances) => {
            setPolicyAccepted(isChecked);
            setPolicyAcceptances(acceptances);
          }}
          disabled={saving}
        />

        {/* Submit */}
        <button
          onClick={handleBook}
          disabled={saving || !policyAccepted || (settings && !settings.bookings_open)}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12, fontSize: '0.9rem', fontWeight: 800,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 4px 16px rgba(168,85,247,0.3)',
            opacity: (saving || (settings && !settings.bookings_open) || !policyAccepted) ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'opacity 150ms',
          }}
        >
          {saving ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Placing booking…</>
          ) : (
            <><CalendarDays size={16} /> Book {service?.name}</>
          )}
        </button>

        <p style={{ fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', margin: 0 }}>
          You'll receive a confirmation email once your booking is reviewed.
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default BookService;