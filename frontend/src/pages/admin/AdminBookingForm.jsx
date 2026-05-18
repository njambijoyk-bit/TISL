import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Loader2, Search } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { bookingsAPI } from '../../api';
import { servicesAPI } from '../../api';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: '0.83rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};
const focus = e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; };
const blur  = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const Section = ({ title, children }) => (
  <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', overflow: 'hidden' }}>
    <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
      <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', margin: 0 }}>{title}</p>
    </div>
    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
  </div>
);

const AdminBookingForm = () => {
  const navigate = useNavigate();

  const [saving,   setSaving]   = useState(false);
  const [services, setServices] = useState([]);
  const [slots,    setSlots]    = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Customer search
  const [customerSearch,  setCustomerSearch]  = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  const [form, setForm] = useState({
    customer_id:        '',
    customer_name:      '',
    service_id:         '',
    location_type:      'instore',
    location_address:   '',
    scheduled_type:     'specific_time',
    scheduled_date:     '',
    scheduled_slot:     '',
    duration_minutes:   '',
    is_recurring:       false,
    recurring_billing_mode: 'per_occurrence',
    admin_notes:        '',
    customer_notes:     '',
    project_id:         '',
  });

  useEffect(() => {
    servicesAPI.getAdminServices({ per_page: 200 })
      .then(r => setServices(r.data ?? r ?? []))
      .catch(() => {});
  }, []);

  // Fetch slots when date or service changes
  useEffect(() => {
    if (!form.scheduled_date || form.scheduled_type !== 'specific_time') { setSlots([]); return; }
    setLoadingSlots(true);
    bookingsAPI.getAvailableSlots({ date: form.scheduled_date, service_id: form.service_id || undefined })
      .then(r => setSlots(r.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [form.scheduled_date, form.service_id]);

  // Customer search
  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingCustomer(true);
      try {
        const res = await fetch(`/api/admin/customers?search=${encodeURIComponent(customerSearch)}&per_page=10`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        setCustomerResults(data.data ?? data ?? []);
      } catch {}
      finally { setSearchingCustomer(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    if (!form.customer_id) { toast.error('Please select a customer'); return; }
    if (!form.service_id)  { toast.error('Please select a service');  return; }
    if (form.scheduled_type === 'specific_time' && (!form.scheduled_date || !form.scheduled_slot)) {
      toast.error('Please select a date and time slot'); return;
    }

    setSaving(true);
    try {
      const scheduledAt = form.scheduled_type === 'specific_time' && form.scheduled_date && form.scheduled_slot
        ? `${form.scheduled_date}T${form.scheduled_slot}:00`
        : null;

      const payload = {
        customer_id:        form.customer_id,
        service_id:         form.service_id,
        location_type:      form.location_type,
        location_address:   form.location_address || undefined,
        scheduled_type:     form.scheduled_type,
        scheduled_at:       scheduledAt,
        duration_minutes:   form.duration_minutes ? parseInt(form.duration_minutes) : undefined,
        is_recurring:       form.is_recurring,
        recurring_billing_mode: form.is_recurring ? form.recurring_billing_mode : undefined,
        admin_notes:        form.admin_notes || undefined,
        customer_notes:     form.customer_notes || undefined,
        project_id:         form.project_id || undefined,
        policy_accepted:    true,
      };

      const res = await bookingsAPI.adminCreateBooking(payload);
      toast.success('Booking created!');
      navigate(`/admin/bookings/${res.booking?.id ?? ''}`);
    } catch (e) {
      toast.error(e?.response?.data?.message ?? 'Failed to create booking');
    } finally { setSaving(false); }
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* Header */}
        <div>
          <button onClick={() => navigate('/admin/bookings')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', fontFamily: 'inherit' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          ><ArrowLeft size={14} /> Back to bookings</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={18} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>New Booking</h1>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>Create a booking on behalf of a customer</p>
            </div>
          </div>
        </div>

        {/* Customer */}
        <Section title="Customer">
          <div>
            <label style={labelStyle}>Search customer *</label>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a855f7', pointerEvents: 'none' }} />
              <input value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); set('customer_id', ''); set('customer_name', ''); }}
                placeholder="Search by name or email…"
                style={{ ...inputStyle, paddingLeft: 30 }}
                onFocus={focus} onBlur={blur}
              />
            </div>
            {form.customer_id && (
              <p style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                ✓ {form.customer_name}
              </p>
            )}
            {(customerResults.length > 0 || searchingCustomer) && !form.customer_id && (
              <div style={{ marginTop: 4, border: '1.5px solid rgba(168,85,247,0.15)', borderRadius: 10, overflow: 'hidden' }}>
                {searchingCustomer ? (
                  <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#9ca3af', fontSize: '0.75rem' }}>
                    <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Searching…
                  </div>
                ) : customerResults.map((c, i) => (
                  <div key={c.id} onClick={() => { set('customer_id', c.id); set('customer_name', `${c.first_name} ${c.last_name} (${c.email})`); setCustomerSearch(`${c.first_name} ${c.last_name}`); setCustomerResults([]); }}
                    style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: i < customerResults.length - 1 ? '1px solid rgba(168,85,247,0.07)' : 'none', transition: 'background 100ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0 }}>{c.first_name} {c.last_name}</p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{c.email} · {c.customer_type}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Service */}
        <Section title="Service">
          <div>
            <label style={labelStyle}>Service *</label>
            <select value={form.service_id} onChange={e => set('service_id', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }} onFocus={focus} onBlur={blur}>
              <option value="">— Select service —</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </Section>

        {/* Schedule */}
        <Section title="Schedule">
          <div>
            <label style={labelStyle}>Scheduling type *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['specific_time','Specific time'],['next_available','Next available'],['before_eod','Before end of day']].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => set('scheduled_type', val)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: '0.72rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                  border: `1.5px solid ${form.scheduled_type === val ? '#a855f7' : 'rgba(168,85,247,0.15)'}`,
                  background: form.scheduled_type === val ? 'rgba(168,85,247,0.08)' : 'transparent',
                  color: form.scheduled_type === val ? '#7c3aed' : '#9ca3af',
                }}>{lbl}</button>
              ))}
            </div>
          </div>

          {form.scheduled_type === 'specific_time' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={form.scheduled_date} onChange={e => { set('scheduled_date', e.target.value); set('scheduled_slot', ''); }}
                  min={new Date().toISOString().split('T')[0]}
                  style={inputStyle} onFocus={focus} onBlur={blur}
                />
              </div>
              <div>
                <label style={labelStyle}>Time slot *</label>
                {loadingSlots ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 0', color: '#9ca3af', fontSize: '0.75rem' }}>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading slots…
                  </div>
                ) : (
                  <select value={form.scheduled_slot} onChange={e => set('scheduled_slot', e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }} onFocus={focus} onBlur={blur}>
                    <option value="">{form.scheduled_date ? (slots.length ? '— Pick a slot —' : 'No slots available') : '— Pick a date first —'}</option>
                    {slots.map(s => <option key={s.start} value={s.start}>{s.start} – {s.end}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Duration (minutes)</label>
            <input type="number" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)}
              placeholder="Leave blank to use service default" min={1}
              style={inputStyle} onFocus={focus} onBlur={blur}
            />
          </div>
        </Section>

        {/* Location */}
        <Section title="Location">
          <div>
            <label style={labelStyle}>Location type *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['instore','onsite','remote'].map(t => (
                <button key={t} type="button" onClick={() => set('location_type', t)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: '0.75rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms', textTransform: 'capitalize',
                  border: `1.5px solid ${form.location_type === t ? '#a855f7' : 'rgba(168,85,247,0.15)'}`,
                  background: form.location_type === t ? 'rgba(168,85,247,0.08)' : 'transparent',
                  color: form.location_type === t ? '#7c3aed' : '#9ca3af',
                }}>{t}</button>
              ))}
            </div>
          </div>
          {(form.location_type === 'onsite' || form.location_type === 'remote') && (
            <div>
              <label style={labelStyle}>Address / Location details</label>
              <input value={form.location_address} onChange={e => set('location_address', e.target.value)}
                placeholder="Enter address or meeting link"
                style={inputStyle} onFocus={focus} onBlur={blur}
              />
            </div>
          )}
        </Section>

        {/* Recurring */}
        <Section title="Recurring">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="is_recurring" checked={form.is_recurring}
              onChange={e => set('is_recurring', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#a855f7', cursor: 'pointer' }}
            />
            <label htmlFor="is_recurring" style={{ fontSize: '0.82rem', color: '#374151', cursor: 'pointer', fontWeight: 600 }}>
              This is a recurring booking
            </label>
          </div>
          {form.is_recurring && (
            <div>
              <label style={labelStyle}>Billing mode</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['per_occurrence','Bill per session'],['whole','Bill as whole']].map(([val, lbl]) => (
                  <button key={val} type="button" onClick={() => set('recurring_billing_mode', val)} style={{
                    flex: 1, padding: '7px 0', borderRadius: 9, fontSize: '0.75rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
                    border: `1.5px solid ${form.recurring_billing_mode === val ? '#a855f7' : 'rgba(168,85,247,0.15)'}`,
                    background: form.recurring_billing_mode === val ? 'rgba(168,85,247,0.08)' : 'transparent',
                    color: form.recurring_billing_mode === val ? '#7c3aed' : '#9ca3af',
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Notes */}
        <Section title="Notes">
          <div>
            <label style={labelStyle}>Admin notes</label>
            <textarea rows={2} value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)}
              placeholder="Internal notes (not visible to customer)"
              style={{ ...inputStyle, resize: 'none' }} onFocus={focus} onBlur={blur}
            />
          </div>
          <div>
            <label style={labelStyle}>Customer notes</label>
            <textarea rows={2} value={form.customer_notes} onChange={e => set('customer_notes', e.target.value)}
              placeholder="Notes on behalf of customer"
              style={{ ...inputStyle, resize: 'none' }} onFocus={focus} onBlur={blur}
            />
          </div>
        </Section>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => navigate('/admin/bookings')} style={{ padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            padding: '9px 22px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Creating…' : 'Create Booking'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );
};

export default AdminBookingForm;