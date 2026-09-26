import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import BookingStatusBadge from './BookingStatusBadge';

// ── Date utils ────────────────────────────────────────────────────────────────
const toYMD = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const addDays      = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const startOfWeek  = (date) => { const d = new Date(date); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d; };
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth   = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const fmtMonthYear = (d) => d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
const fmtShort     = (d) => d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
const fmtFull      = (d) => d.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const WEEKDAYS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Status → dot color for compact chips
const STATUS_DOT = {
  pending:     '#f59e0b',
  confirmed:   '#3b82f6',
  in_progress: '#a855f7',
  completed:   '#10b981',
  cancelled:   '#ef4444',
  no_show:     '#9ca3af',
};

const navBtn = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
  color: '#7c3aed', cursor: 'pointer', transition: 'background 120ms', flexShrink: 0,
};

// ── BookingChip ───────────────────────────────────────────────────────────────
function BookingChip({ booking }) {
  const dot = STATUS_DOT[booking.status] ?? '#9ca3af';
  const time = booking.scheduled_at
    ? new Date(booking.scheduled_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div title={`${booking.booking_number} · ${booking.service?.name}`} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '2px 6px', borderRadius: 5, fontSize: '0.6rem', fontWeight: 600,
      background: 'rgba(168,85,247,0.06)', color: '#374151',
      border: '1px solid rgba(168,85,247,0.12)',
      overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'pointer',
      transition: 'background 100ms',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.12)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {time && <span style={{ color: '#9ca3af', flexShrink: 0 }}>{time}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {booking.customer?.first_name} — {booking.service?.name}
      </span>
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────
function MonthView({ anchor, bookingsByDate, isToday, onDayClick }) {
  const monthStart = startOfMonth(anchor);
  const monthEnd   = endOfMonth(anchor);
  const gridStart  = startOfWeek(monthStart);
  const thisMonth  = anchor.getMonth();

  const weeks = [];
  let cur = new Date(gridStart);
  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur = addDays(cur, 1); }
    weeks.push(week);
    if (cur > monthEnd && weeks.length >= 4) break;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
          {week.map((day, di) => {
            const ymd      = toYMD(day);
            const bookings = bookingsByDate[ymd] ?? [];
            const inMonth  = day.getMonth() === thisMonth;
            const today    = isToday(day);
            return (
              <div key={di} onClick={() => onDayClick(day)} style={{
                minHeight: 90, padding: '5px 5px 3px',
                borderRight: di < 6 ? '1px solid rgba(168,85,247,0.05)' : 'none',
                background: today ? 'rgba(168,85,247,0.03)' : 'transparent',
                cursor: 'pointer', transition: 'background 100ms',
              }}
                onMouseEnter={e => { if (!today) e.currentTarget.style.background = 'rgba(168,85,247,0.025)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = today ? 'rgba(168,85,247,0.03)' : 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: today ? 800 : 500,
                    background: today ? '#a855f7' : 'transparent',
                    color: today ? 'white' : inMonth ? '#374151' : '#d1d5db',
                  }}>{day.getDate()}</span>
                  {bookings.length > 0 && (
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.08)', borderRadius: 10, padding: '1px 5px' }}>
                      {bookings.length}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {bookings.slice(0, 2).map((b, i) => <BookingChip key={i} booking={b} />)}
                  {bookings.length > 2 && (
                    <span style={{ fontSize: '0.58rem', color: '#9ca3af', fontWeight: 600, paddingLeft: 3 }}>
                      +{bookings.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────
function WeekView({ anchor, bookingsByDate, isToday, onDayClick }) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
        {days.map((day, i) => {
          const today = isToday(day);
          return (
            <div key={i} onClick={() => onDayClick(day)} style={{
              padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
              borderRight: i < 6 ? '1px solid rgba(168,85,247,0.05)' : 'none',
              background: today ? 'rgba(168,85,247,0.04)' : 'transparent',
              transition: 'background 100ms',
            }}
              onMouseEnter={e => { if (!today) e.currentTarget.style.background = 'rgba(168,85,247,0.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = today ? 'rgba(168,85,247,0.04)' : 'transparent'; }}
            >
              <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: today ? '#a855f7' : '#9ca3af', margin: '0 0 4px' }}>
                {WEEKDAYS[i]}
              </p>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.82rem', fontWeight: 800,
                background: today ? '#a855f7' : 'transparent',
                color: today ? 'white' : '#374151',
              }}>{day.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', flex: 1, overflowY: 'auto' }}>
        {days.map((day, i) => {
          const ymd = toYMD(day);
          const bookings = bookingsByDate[ymd] ?? [];
          const today = isToday(day);
          return (
            <div key={i} onClick={() => onDayClick(day)} style={{
              padding: '8px 5px', minHeight: 160, cursor: 'pointer',
              borderRight: i < 6 ? '1px solid rgba(168,85,247,0.05)' : 'none',
              background: today ? 'rgba(168,85,247,0.015)' : 'transparent',
              display: 'flex', flexDirection: 'column', gap: 3,
              transition: 'background 100ms',
            }}
              onMouseEnter={e => { if (!today) e.currentTarget.style.background = 'rgba(168,85,247,0.025)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = today ? 'rgba(168,85,247,0.015)' : 'transparent'; }}
            >
              {bookings.length === 0
                ? <span style={{ fontSize: '0.6rem', color: '#e5e7eb', textAlign: 'center', marginTop: 12 }}>—</span>
                : bookings.map((b, bi) => <BookingChip key={bi} booking={b} />)
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────
function DayView({ anchor, bookingsByDate, onBookingClick }) {
  const ymd      = toYMD(anchor);
  const bookings = bookingsByDate[ymd] ?? [];

  if (bookings.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: 10 }}>
        <CalendarDays size={32} style={{ color: 'rgba(168,85,247,0.18)' }} />
        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No bookings for this day</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bookings.map((b, i) => {
        const time = b.scheduled_at
          ? new Date(b.scheduled_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
          : '—';
        return (
          <div key={i} onClick={() => onBookingClick?.(b)} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
            background: 'white', border: '1.5px solid rgba(168,85,247,0.12)',
            boxShadow: '0 1px 4px rgba(168,85,247,0.06)',
            transition: 'box-shadow 120ms, border-color 120ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(168,85,247,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.12)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(168,85,247,0.06)'; }}
          >
            <div style={{ textAlign: 'center', minWidth: 46, flexShrink: 0 }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{time}</p>
              <p style={{ fontSize: '0.6rem', color: '#9ca3af', margin: 0 }}>{b.duration_minutes ? `${b.duration_minutes}min` : ''}</p>
            </div>
            <div style={{ width: 1, height: 36, background: 'rgba(168,85,247,0.12)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.service?.name}
              </p>
              <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>
                {b.customer?.first_name} {b.customer?.last_name} · {b.booking_number}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{b.location_type}</span>
              <BookingStatusBadge status={b.status} size="sm" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom range view ─────────────────────────────────────────────────────────
function CustomRangeView({ from, to, bookingsByDate, onDayClick }) {
  if (!from || !to) return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>
      Select a from and to date above to view bookings.
    </div>
  );

  const start = new Date(from);
  const end   = new Date(to);
  const days  = [];
  let cur = new Date(start);
  while (cur <= end) { days.push(new Date(cur)); cur = addDays(cur, 1); }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {days.map((day, i) => {
        const ymd = toYMD(day);
        const bookings = bookingsByDate[ymd] ?? [];
        return (
          <div key={i}>
            <div onClick={() => onDayClick(day)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer',
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', minWidth: 110 }}>
                {day.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              {bookings.length === 0
                ? <span style={{ fontSize: '0.68rem', color: '#e5e7eb' }}>No bookings</span>
                : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {bookings.map((b, bi) => <BookingChip key={bi} booking={b} />)}
                  </div>
              }
            </div>
            {i < days.length - 1 && <div style={{ height: 1, background: 'rgba(168,85,247,0.06)' }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main BookingCalendar ──────────────────────────────────────────────────────
export default function BookingCalendar({ bookings = [], onDayClick, onBookingClick }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [view,      setView]      = useState('week');
  const [anchor,    setAnchor]    = useState(today);
  const [jumpDate,  setJumpDate]  = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach(b => {
      if (!b.scheduled_at) return;
      const key = toYMD(b.scheduled_at);
      (map[key] ??= []).push(b);
    });
    // Sort each day by time
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
    return map;
  }, [bookings]);

  const isToday = (date) => toYMD(date) === toYMD(today);

  const navigate = (dir) => {
    setAnchor(prev => {
      const d = new Date(prev);
      if (view === 'day')   d.setDate(d.getDate() + dir);
      if (view === 'week')  d.setDate(d.getDate() + dir * 7);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const periodLabel = useMemo(() => {
    if (view === 'custom') return customFrom && customTo ? `${customFrom} → ${customTo}` : 'Custom range';
    if (view === 'day')    return fmtFull(anchor);
    if (view === 'week') {
      const s = startOfWeek(anchor);
      const e = addDays(s, 6);
      return `${fmtShort(s)} – ${fmtShort(e)}, ${e.getFullYear()}`;
    }
    return fmtMonthYear(anchor);
  }, [view, anchor, customFrom, customTo]);

  const handleDayClick = (day) => {
    if (view !== 'day') { setAnchor(day); setView('day'); }
    onDayClick?.(day);
  };

  return (
    <div style={{
      background: 'white', borderRadius: 16,
      border: '1px solid rgba(168,85,247,0.12)',
      boxShadow: '0 2px 16px rgba(168,85,247,0.06)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: 8, border: '1.5px solid rgba(168,85,247,0.18)', overflow: 'hidden', flexShrink: 0 }}>
            {['day', 'week', 'month', 'custom'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 12px', fontSize: '0.72rem', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', border: 'none',
                background: view === v ? '#a855f7' : 'white',
                color: view === v ? 'white' : '#9ca3af',
                textTransform: 'capitalize', transition: 'all 120ms',
              }}>{v}</button>
            ))}
          </div>

          {/* Prev / Today / Next — hidden on custom */}
          {view !== 'custom' && <>
            <button onClick={() => navigate(-1)} style={navBtn}><ChevronLeft size={14} /></button>
            <button onClick={() => { setAnchor(new Date(today)); setJumpDate(''); }}
              style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: '0.72rem', fontWeight: 700 }}>
              Today
            </button>
            <button onClick={() => navigate(1)} style={navBtn}><ChevronRight size={14} /></button>

            {/* Period label */}
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#111827', flex: 1, textAlign: 'center', minWidth: 160 }}>
              {periodLabel}
            </span>

            {/* Jump to date */}
            <input type="date" value={jumpDate}
              onChange={e => { setJumpDate(e.target.value); if (e.target.value) setAnchor(new Date(e.target.value)); }}
              style={{
                padding: '5px 8px', borderRadius: 8, fontSize: '0.72rem',
                border: '1.5px solid rgba(168,85,247,0.18)', color: '#374151',
                outline: 'none', fontFamily: 'inherit', background: 'rgba(168,85,247,0.03)',
              }}
            />
          </>}

          {/* Custom range pickers */}
          {view === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, fontSize: '0.72rem', border: '1.5px solid rgba(168,85,247,0.18)', outline: 'none', fontFamily: 'inherit' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, fontSize: '0.72rem', border: '1.5px solid rgba(168,85,247,0.18)', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Calendar body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'month' && <MonthView anchor={anchor} bookingsByDate={bookingsByDate} isToday={isToday} onDayClick={handleDayClick} />}
        {view === 'week'  && <WeekView  anchor={anchor} bookingsByDate={bookingsByDate} isToday={isToday} onDayClick={handleDayClick} />}
        {view === 'day'   && <DayView   anchor={anchor} bookingsByDate={bookingsByDate} onBookingClick={onBookingClick} />}
        {view === 'custom'&& <CustomRangeView from={customFrom} to={customTo} bookingsByDate={bookingsByDate} onDayClick={handleDayClick} />}
      </div>
    </div>
  );
}