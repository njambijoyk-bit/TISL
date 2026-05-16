import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  X, ChevronLeft, ChevronRight, CalendarClock,
  FolderOpen, FileText, CheckSquare, Milestone,
  ShoppingBag, MessageSquareQuote, Ticket, Activity as ActivityIcon,
  Users, AlertTriangle,
} from 'lucide-react';

// ── Date utilities ────────────────────────────────────────────────────────────

const toYMD = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-anchored
  d.setDate(d.getDate() + diff);
  return d;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth   = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const fmtMonthYear = (d) => d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
const fmtShort     = (d) => d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
const fmtFull      = (d) => d.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_CONFIG = {
  deadline:   { label: 'Deadlines',  color: '#ef4444', bg: 'rgba(239,68,68,0.09)',   icon: CalendarClock  },
  unassigned: { label: 'Unassigned', color: '#f59e0b', bg: 'rgba(245,158,11,0.09)',  icon: AlertTriangle  },
  activity:   { label: 'Activity',   color: '#3b82f6', bg: 'rgba(59,130,246,0.09)',  icon: ActivityIcon   },
  team_load:  { label: 'Team Load',  color: '#a855f7', bg: 'rgba(168,85,247,0.09)',  icon: Users          },
};

const SUBTYPE_LABELS = {
  project:      'Project',
  milestone:    'Milestone',
  quote:        'Quote',
  task:         'Task',
  order:        'Order',
  quoteRequest: 'Quote Req.',
  ticket:       'Ticket',
};

// ── Flatten all data sources into event objects ───────────────────────────────

function buildEvents(data) {
  if (!data) return [];
  const events = [];

  // Deadlines — placed on their deadline date
  const dl = data.deadlines ?? {};
  (dl.projects   ?? []).forEach(p =>  p.deadline   && events.push({ date: toYMD(p.deadline),   label: p.label,          url: p.url,                              source: 'deadline',   subtype: 'project',      status: p.status,  priority: null        }));
  (dl.milestones ?? []).forEach(m =>  m.deadline   && events.push({ date: toYMD(m.deadline),   label: m.label,          url: m.url,                              source: 'deadline',   subtype: 'milestone',    status: m.status,  priority: null        }));
  (dl.quotes     ?? []).forEach(q =>  q.deadline   && events.push({ date: toYMD(q.deadline),   label: q.label,          url: q.url,                              source: 'deadline',   subtype: 'quote',        status: q.status,  priority: null        }));
  (dl.tasks      ?? []).forEach(t =>  t.deadline   && events.push({ date: toYMD(t.deadline),   label: t.label,          url: t.url,                              source: 'deadline',   subtype: 'task',         status: t.status,  priority: t.priority  }));

  // Unassigned — placed on created_at
  const ua = data.unassigned ?? {};
  (ua.orders         ?? []).forEach(o => o.created_at && events.push({ date: toYMD(o.created_at), label: o.order_number,   url: `/admin/orders/${o.id}`,            source: 'unassigned', subtype: 'order',        status: o.status,  priority: null        }));
  (ua.quotes         ?? []).forEach(q => q.created_at && events.push({ date: toYMD(q.created_at), label: q.quote_number,   url: `/admin/quotes/${q.id}`,            source: 'unassigned', subtype: 'quote',        status: q.status,  priority: null        }));
  (ua.quoteRequests  ?? []).forEach(r => r.created_at && events.push({ date: toYMD(r.created_at), label: r.request_number, url: `/admin/quote-requests/${r.id}`,    source: 'unassigned', subtype: 'quoteRequest', status: r.status,  priority: r.priority  }));
  (ua.tasks          ?? []).forEach(t => t.created_at && events.push({ date: toYMD(t.created_at), label: t.title,          url: `/admin/projects/${t.project_id}`,  source: 'unassigned', subtype: 'task',         status: t.status,  priority: t.priority  }));
  (ua.tickets        ?? []).forEach(t => t.created_at && events.push({ date: toYMD(t.created_at), label: t.ticket_number,  url: `/admin/tickets/${t.id}`,           source: 'unassigned', subtype: 'ticket',       status: t.status,  priority: t.priority  }));

  // Activity — placed on updated_at
  (data.activity ?? []).forEach(item => item.updated_at && events.push({ date: toYMD(item.updated_at), label: item.reference, url: item.url, source: 'activity', subtype: item.type, status: item.status, priority: null }));

  return events;
}

// ── Shared component styles ───────────────────────────────────────────────────

const navBtn = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
  color: '#7c3aed', cursor: 'pointer', transition: 'background 120ms', flexShrink: 0,
};

// ── EventChip — used in month + week views ────────────────────────────────────

function EventChip({ event }) {
  const cfg = SOURCE_CONFIG[event.source];
  return (
    <Link
      to={event.url}
      title={`${SUBTYPE_LABELS[event.subtype] ?? event.subtype} · ${event.label}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '2px 5px', borderRadius: 4, fontSize: '0.6rem', fontWeight: 600,
        background: cfg.bg, color: cfg.color,
        textDecoration: 'none', overflow: 'hidden', whiteSpace: 'nowrap',
        maxWidth: '100%', transition: 'opacity 120ms',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {SUBTYPE_LABELS[event.subtype] && <span style={{ opacity: 0.65 }}>{SUBTYPE_LABELS[event.subtype]}: </span>}
        {event.label}
      </span>
    </Link>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ anchor, eventsByDate, isToday, onDayClick }) {
  const monthStart = startOfMonth(anchor);
  const monthEnd   = endOfMonth(anchor);
  const gridStart  = startOfWeek(monthStart);
  const thisMonth  = anchor.getMonth();

  // Build week rows until we've covered the whole month
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
      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
          {week.map((day, di) => {
            const ymd       = toYMD(day);
            const dayEvents = eventsByDate[ymd] ?? [];
            const inMonth   = day.getMonth() === thisMonth;
            const todayDay  = isToday(day);

            return (
              <div
                key={di}
                onClick={() => onDayClick(day)}
                style={{
                  minHeight: 88, padding: '5px 5px 3px',
                  borderRight: di < 6 ? '1px solid rgba(168,85,247,0.05)' : 'none',
                  background: todayDay ? 'rgba(168,85,247,0.03)' : 'transparent',
                  cursor: 'pointer', transition: 'background 100ms',
                }}
                onMouseEnter={e => { if (!todayDay) e.currentTarget.style.background = 'rgba(168,85,247,0.025)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = todayDay ? 'rgba(168,85,247,0.03)' : 'transparent'; }}
              >
                {/* Date number */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: todayDay ? 800 : 500,
                    background: todayDay ? '#a855f7' : 'transparent',
                    color: todayDay ? 'white' : inMonth ? '#374151' : '#d1d5db',
                  }}>
                    {day.getDate()}
                  </span>
                </div>

                {/* Event chips — max 3 + overflow count */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayEvents.slice(0, 3).map((ev, ei) => <EventChip key={ei} event={ev} />)}
                  {dayEvents.length > 3 && (
                    <span style={{ fontSize: '0.58rem', color: '#9ca3af', fontWeight: 600, paddingLeft: 3 }}>
                      +{dayEvents.length - 3} more
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

function WeekView({ anchor, eventsByDate, isToday, onDayClick }) {
  const weekStart = startOfWeek(anchor);
  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
        {days.map((day, i) => {
          const todayDay = isToday(day);
          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              style={{
                padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                borderRight: i < 6 ? '1px solid rgba(168,85,247,0.05)' : 'none',
                background: todayDay ? 'rgba(168,85,247,0.04)' : 'transparent',
                transition: 'background 100ms',
              }}
              onMouseEnter={e => { if (!todayDay) e.currentTarget.style.background = 'rgba(168,85,247,0.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = todayDay ? 'rgba(168,85,247,0.04)' : 'transparent'; }}
            >
              <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: todayDay ? '#a855f7' : '#9ca3af', margin: '0 0 4px' }}>
                {WEEKDAYS[i]}
              </p>
              <span style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 800,
                background: todayDay ? '#a855f7' : 'transparent',
                color: todayDay ? 'white' : '#374151',
              }}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Day columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', flex: 1, overflowY: 'auto' }}>
        {days.map((day, i) => {
          const ymd       = toYMD(day);
          const dayEvents = eventsByDate[ymd] ?? [];
          const todayDay  = isToday(day);
          return (
            <div key={i} style={{
              padding: '8px 5px', minHeight: 160,
              borderRight: i < 6 ? '1px solid rgba(168,85,247,0.05)' : 'none',
              background: todayDay ? 'rgba(168,85,247,0.015)' : 'transparent',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {dayEvents.length === 0
                ? <span style={{ fontSize: '0.6rem', color: '#e5e7eb', textAlign: 'center', marginTop: 12 }}>—</span>
                : dayEvents.map((ev, ei) => <EventChip key={ei} event={ev} />)
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ anchor, eventsByDate }) {
  const ymd       = toYMD(anchor);
  const dayEvents = eventsByDate[ymd] ?? [];

  // Group by source
  const grouped = dayEvents.reduce((acc, ev) => {
    (acc[ev.source] ??= []).push(ev);
    return acc;
  }, {});

  if (dayEvents.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: 10 }}>
        <CalendarClock size={32} style={{ color: 'rgba(168,85,247,0.18)' }} />
        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No items for this day</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {Object.entries(grouped).map(([source, events]) => {
        const cfg = SOURCE_CONFIG[source];
        return (
          <div key={source}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <cfg.icon size={13} style={{ color: cfg.color }} />
              <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', margin: 0 }}>{cfg.label}</h3>
              <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>({events.length})</span>
            </div>

            {/* Event rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events.map((ev, i) => (
                <Link
                  key={i}
                  to={ev.url}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: cfg.bg, border: `1px solid ${cfg.color}22`,
                    textDecoration: 'none', transition: 'opacity 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.label}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: 0 }}>
                      {SUBTYPE_LABELS[ev.subtype] ?? ev.subtype}
                      {ev.status   && ` · ${ev.status.replace(/_/g, ' ')}`}
                      {ev.priority && ` · ${ev.priority}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function WorkTimetable({ data, onClose }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [view,     setView]     = useState('week');
  const [anchor,   setAnchor]   = useState(today);
  const [filters,  setFilters]  = useState({ deadline: true, unassigned: true, activity: true, team_load: true });
  const [jumpDate, setJumpDate] = useState('');

  const allEvents = useMemo(() => buildEvents(data), [data]);

  const eventsByDate = useMemo(() => {
    const map = {};
    allEvents.filter(e => filters[e.source]).forEach(e => {
      (map[e.date] ??= []).push(e);
    });
    return map;
  }, [allEvents, filters]);

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
    if (view === 'day')   return fmtFull(anchor);
    if (view === 'week') {
      const s = startOfWeek(anchor);
      const e = addDays(s, 6);
      return `${fmtShort(s)} – ${fmtShort(e)}, ${e.getFullYear()}`;
    }
    return fmtMonthYear(anchor);
  }, [view, anchor]);

  const sortedTeamLoad = useMemo(() =>
    [...(data?.team_load ?? [])].sort((a, b) =>
      Object.values(b.counts).reduce((s,v)=>s+v,0) - Object.values(a.counts).reduce((s,v)=>s+v,0)
    ),
  [data]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'white', borderRadius: 16,
        border: '1px solid rgba(168,85,247,0.1)',
        boxShadow: '0 8px 40px rgba(168,85,247,0.12)',
        width: '100%', maxWidth: 980, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>

          {/* Row 1: title + controls + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                <CalendarClock size={15} />
              </div>
              <div>
                <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#111827', margin: 0 }}>Work Timetable</p>
                <p style={{ fontSize: '0.67rem', color: '#9ca3af', margin: 0 }}>Deadlines, activity &amp; assignments</p>
              </div>
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', borderRadius: 8, border: '1.5px solid rgba(168,85,247,0.18)', overflow: 'hidden' }}>
              {['day', 'week', 'month'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '5px 13px', fontSize: '0.72rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', border: 'none',
                    background: view === v ? '#a855f7' : 'white',
                    color: view === v ? 'white' : '#9ca3af',
                    textTransform: 'capitalize', transition: 'all 120ms',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Prev / Today / Next */}
            <button onClick={() => navigate(-1)} style={navBtn}><ChevronLeft size={14} /></button>
            <button
              onClick={() => { setAnchor(new Date(today)); setJumpDate(''); }}
              style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed' }}
            >
              Today
            </button>
            <button onClick={() => navigate(1)} style={navBtn}><ChevronRight size={14} /></button>

            {/* Period label */}
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#111827', minWidth: 170, textAlign: 'center' }}>
              {periodLabel}
            </span>

            {/* Jump-to date */}
            <input
              type="date"
              value={jumpDate}
              onChange={e => { setJumpDate(e.target.value); if (e.target.value) setAnchor(new Date(e.target.value)); }}
              style={{
                padding: '5px 8px', borderRadius: 8, fontSize: '0.72rem',
                border: '1.5px solid rgba(168,85,247,0.18)',
                color: '#374151', outline: 'none', fontFamily: 'inherit',
                background: 'rgba(168,85,247,0.03)', cursor: 'pointer',
              }}
            />

            {/* Close */}
            <button
              onClick={onClose}
              style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <X size={16} />
            </button>
          </div>

          {/* Row 2: filter chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Show:</span>
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => {
              const active = filters[key];
              return (
                <button
                  key={key}
                  onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', transition: 'all 120ms',
                    border: `1.5px solid ${active ? cfg.color : 'rgba(156,163,175,0.25)'}`,
                    background: active ? cfg.bg : 'transparent',
                    color: active ? cfg.color : '#9ca3af',
                  }}
                >
                  <cfg.icon size={11} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Team Load strip — shown when filter is active ── */}
        {filters.team_load && sortedTeamLoad.length > 0 && (
          <div style={{
            padding: '7px 20px', borderBottom: '1px solid rgba(168,85,247,0.08)',
            background: 'rgba(168,85,247,0.015)', flexShrink: 0,
            display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              Team load:
            </span>
            {sortedTeamLoad.map((member, i) => {
              const total = Object.values(member.counts).reduce((s, v) => s + v, 0);
              const dotColor = total > 10 ? '#dc2626' : total > 5 ? '#ea580c' : '#059669';
              return (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600,
                  background: 'white', border: '1px solid rgba(168,85,247,0.1)', color: '#374151',
                }}>
                  <span style={{
                    width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.55rem', fontWeight: 800,
                  }}>
                    {member.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  {member.user?.name?.split(' ')[0]}
                  <span style={{ fontWeight: 800, color: dotColor }}>{total}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* ── Calendar body ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {view === 'month' && (
            <MonthView
              anchor={anchor}
              eventsByDate={eventsByDate}
              isToday={isToday}
              onDayClick={d => { setAnchor(d); setView('day'); }}
            />
          )}
          {view === 'week' && (
            <WeekView
              anchor={anchor}
              eventsByDate={eventsByDate}
              isToday={isToday}
              onDayClick={d => { setAnchor(d); setView('day'); }}
            />
          )}
          {view === 'day' && (
            <DayView anchor={anchor} eventsByDate={eventsByDate} />
          )}
        </div>

      </div>
    </div>
  );
}