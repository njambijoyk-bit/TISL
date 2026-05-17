import React, { useEffect, useState } from 'react';
import { Settings, Loader2, Save, Clock, Calendar, AlertTriangle, Mail, FileText } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { bookingsAPI } from '../../api/bookings';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: '0.83rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms',
};
const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};
const focus = e => { e.currentTarget.style.borderColor = '#a855f7'; };
const blur  = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; };

const Section = ({ title, icon: Icon, children }) => (
  <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', overflow: 'hidden' }}>
    <div style={{ padding: '13px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon size={15} style={{ color: '#a855f7' }} />
      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: 0 }}>{title}</p>
    </div>
    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
  </div>
);

const Toggle = ({ label, hint, checked, onChange, disabled }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
    <div>
      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: 0 }}>{label}</p>
      {hint && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{hint}</p>}
    </div>
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? '#a855f7' : '#e5e7eb',
        position: 'relative', transition: 'background 200ms',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        transition: 'left 200ms', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </div>
  </div>
);

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const DEFAULT_WORKING_HOURS = Object.fromEntries(
  DAYS.map(d => [d, { open: '08:00', close: '17:00', enabled: !['sat','sun'].includes(d) }])
);

const BookingSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [settings, setSettings] = useState(null);
  const [policyPreview, setPolicyPreview] = useState('');

  useEffect(() => {
    bookingsAPI.getSettings()
      .then(r => {
        const s = r.settings ?? r;
        setSettings(s);
        if (!s.working_hours) s.working_hours = DEFAULT_WORKING_HOURS;
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  // Live policy preview
  useEffect(() => {
    if (!settings?.cancellation_policy_template) { setPolicyPreview(''); return; }
    const fee = settings.cancellation_fee_type === 'percent'
      ? `${settings.cancellation_fee}%`
      : `${settings.cancellation_currency_code} ${parseFloat(settings.cancellation_fee || 0).toFixed(2)}`;
    const preview = settings.cancellation_policy_template
      .replace(/{cancellation_fee}/g, fee)
      .replace(/{cancellation_window_hours}/g, settings.cancellation_window_hours ?? 24)
      .replace(/{currency}/g, settings.cancellation_currency_code ?? 'KES')
      .replace(/{currency_symbol}/g, settings.cancellation_currency_code ?? 'KES');
    setPolicyPreview(preview);
  }, [settings?.cancellation_policy_template, settings?.cancellation_fee, settings?.cancellation_fee_type, settings?.cancellation_window_hours, settings?.cancellation_currency_code]);

  const set = (key, val) => setSettings(p => ({ ...p, [key]: val }));

  const setWorkingHours = (day, field, val) => {
    setSettings(p => ({
      ...p,
      working_hours: { ...p.working_hours, [day]: { ...p.working_hours[day], [field]: val } },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await bookingsAPI.updateSettings(settings);
      toast.success('Settings saved');
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0', gap: 10, color: '#9ca3af' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings size={18} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>Booking Settings</h1>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>Configure slots, availability, cancellation policy and emails</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>

        {/* Global switches */}
        <Section title="Global Availability" icon={Calendar}>
          <Toggle label="Bookings open" hint="Master switch — turn off to block all new bookings immediately" checked={!!settings.bookings_open} onChange={v => set('bookings_open', v)} />
          <Toggle label="Allow weekend bookings" checked={!!settings.allow_weekend_bookings} onChange={v => set('allow_weekend_bookings', v)} />
          <Toggle label="Allow holiday bookings" checked={!!settings.allow_holiday_bookings} onChange={v => set('allow_holiday_bookings', v)} />
          <Toggle label="Override service booking_required" hint="Force all services to be bookable regardless of their individual setting" checked={!!settings.override_booking_required} onChange={v => set('override_booking_required', v)} />
        </Section>

        {/* Slot config */}
        <Section title="Slot Configuration" icon={Clock}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Slot duration (minutes)</label>
              <input type="number" value={settings.slot_duration_minutes ?? 60} onChange={e => set('slot_duration_minutes', parseInt(e.target.value))}
                min={15} step={15} style={inputStyle} onFocus={focus} onBlur={blur}
              />
            </div>
            <div>
              <label style={labelStyle}>Lead time (hours)</label>
              <input type="number" value={settings.booking_lead_time_hours ?? 24} onChange={e => set('booking_lead_time_hours', parseInt(e.target.value))}
                min={0} style={inputStyle} onFocus={focus} onBlur={blur}
              />
            </div>
            <div>
              <label style={labelStyle}>Max advance (days)</label>
              <input type="number" value={settings.max_advance_booking_days ?? 90} onChange={e => set('max_advance_booking_days', parseInt(e.target.value))}
                min={1} style={inputStyle} onFocus={focus} onBlur={blur}
              />
            </div>
          </div>
        </Section>

        {/* Working hours */}
        <Section title="Working Hours" icon={Clock}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DAYS.map(day => {
              const dh = settings.working_hours?.[day] ?? { open: '08:00', close: '17:00', enabled: false };
              return (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 80px', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: dh.enabled ? 'rgba(168,85,247,0.03)' : 'rgba(107,114,128,0.03)', border: `1px solid ${dh.enabled ? 'rgba(168,85,247,0.12)' : 'rgba(107,114,128,0.1)'}` }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: dh.enabled ? '#374151' : '#9ca3af' }}>{DAY_LABELS[day]}</span>
                  <div>
                    <input type="time" value={dh.open} onChange={e => setWorkingHours(day, 'open', e.target.value)}
                      disabled={!dh.enabled}
                      style={{ ...inputStyle, opacity: dh.enabled ? 1 : 0.5, cursor: dh.enabled ? 'pointer' : 'not-allowed' }}
                    />
                  </div>
                  <div>
                    <input type="time" value={dh.close} onChange={e => setWorkingHours(day, 'close', e.target.value)}
                      disabled={!dh.enabled}
                      style={{ ...inputStyle, opacity: dh.enabled ? 1 : 0.5, cursor: dh.enabled ? 'pointer' : 'not-allowed' }}
                    />
                  </div>
                  <Toggle label="" checked={!!dh.enabled} onChange={v => setWorkingHours(day, 'enabled', v)} />
                </div>
              );
            })}
          </div>

          <div>
            <label style={labelStyle}>Blackout dates</label>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0 0 8px' }}>Enter comma-separated dates e.g. 2025-12-25, 2026-01-01</p>
            <input
              value={(settings.blackout_dates ?? []).join(', ')}
              onChange={e => set('blackout_dates', e.target.value.split(',').map(d => d.trim()).filter(Boolean))}
              placeholder="2025-12-25, 2026-01-01"
              style={inputStyle} onFocus={focus} onBlur={blur}
            />
          </div>
        </Section>

        {/* Cancellation */}
        <Section title="Cancellation Policy" icon={AlertTriangle}>
          <Toggle label="Allow customers to cancel" hint="If off, only admins can cancel" checked={!!settings.customer_can_cancel} onChange={v => set('customer_can_cancel', v)} />

          {settings.customer_can_cancel && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Cancellation window (hours)</label>
                  <input type="number" value={settings.cancellation_window_hours ?? 24} onChange={e => set('cancellation_window_hours', parseInt(e.target.value))} min={0}
                    style={inputStyle} onFocus={focus} onBlur={blur}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Fee type</label>
                  <select value={settings.cancellation_fee_type ?? 'flat'} onChange={e => set('cancellation_fee_type', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="flat">Flat amount</option>
                    <option value="percent">Percentage</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fee amount {settings.cancellation_fee_type === 'percent' ? '(%)' : `(${settings.cancellation_currency_code ?? 'KES'})`}</label>
                  <input type="number" value={settings.cancellation_fee ?? 0} onChange={e => set('cancellation_fee', parseFloat(e.target.value))} min={0} step={0.01}
                    style={inputStyle} onFocus={focus} onBlur={blur}
                  />
                </div>
              </div>
            </>
          )}

          <Toggle label="Require policy acceptance" hint="Customer must check a box to accept the policy before booking" checked={!!settings.require_policy_acceptance} onChange={v => set('require_policy_acceptance', v)} />

          <div>
            <label style={labelStyle}>
              Cancellation policy template
              <span style={{ color: '#d1d5db', fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>
                use {'{cancellation_fee}'}, {'{cancellation_window_hours}'}, {'{currency}'}
              </span>
            </label>
            <textarea rows={4} value={settings.cancellation_policy_template ?? ''}
              onChange={e => set('cancellation_policy_template', e.target.value)}
              placeholder="A cancellation fee of {cancellation_fee} applies if cancelled within {cancellation_window_hours} hours of the scheduled time."
              style={{ ...inputStyle, resize: 'vertical' }} onFocus={focus} onBlur={blur}
            />
          </div>

          {policyPreview && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#a855f7', margin: '0 0 5px' }}>Live preview</p>
              <p style={{ fontSize: '0.78rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>{policyPreview}</p>
            </div>
          )}
        </Section>

        {/* Email */}
        <Section title="Email Notifications" icon={Mail}>
          <Toggle label="Email customer on booking placed"   checked={!!settings.email_customer_on_booking} onChange={v => set('email_customer_on_booking', v)} />
          <Toggle label="Email admin on booking placed"      checked={!!settings.email_admin_on_booking}    onChange={v => set('email_admin_on_booking', v)} />
          <Toggle label="Email customer on cancellation"     checked={!!settings.email_customer_on_cancel}  onChange={v => set('email_customer_on_cancel', v)} />
          <Toggle label="Email admin on customer cancellation" checked={!!settings.email_admin_on_cancel}   onChange={v => set('email_admin_on_cancel', v)} />
        </Section>

        {/* Save bottom */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 24px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );
};

export default BookingSettings;