import React from 'react';

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     bg: 'rgba(245,158,11,0.1)',  color: '#b45309',  border: 'rgba(245,158,11,0.25)'  },
  confirmed:   { label: 'Confirmed',   bg: 'rgba(59,130,246,0.1)',  color: '#1d4ed8',  border: 'rgba(59,130,246,0.25)'  },
  in_progress: { label: 'In Progress', bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed',  border: 'rgba(168,85,247,0.25)'  },
  completed:   { label: 'Completed',   bg: 'rgba(16,185,129,0.1)',  color: '#065f46',  border: 'rgba(16,185,129,0.25)'  },
  cancelled:   { label: 'Cancelled',   bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c',  border: 'rgba(239,68,68,0.25)'   },
  no_show:     { label: 'No Show',     bg: 'rgba(107,114,128,0.1)', color: '#374151',  border: 'rgba(107,114,128,0.25)' },
};

const BookingStatusBadge = ({ status, size = 'md' }) => {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'rgba(107,114,128,0.1)', color: '#374151', border: 'rgba(107,114,128,0.25)' };
  const fontSize = size === 'sm' ? '0.6rem' : size === 'lg' ? '0.78rem' : '0.68rem';
  const padding  = size === 'sm' ? '2px 7px'  : size === 'lg' ? '5px 12px' : '3px 9px';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding, borderRadius: 20, fontSize, fontWeight: 700,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

export default BookingStatusBadge;
export { STATUS_CONFIG };