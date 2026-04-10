// src/components/admin/TicketStatusBadge.jsx
import Badge from '../common/Badge';

const STATUS_MAP = {
  open:             { label: 'Open',             variant: 'info'    },
  in_progress:      { label: 'In Progress',      variant: 'warning' },
  waiting_customer: { label: 'Waiting Customer', variant: 'default' },
  resolved:         { label: 'Resolved',         variant: 'success' },
  closed:           { label: 'Closed',           variant: 'danger'  },
};

const PRIORITY_MAP = {
  low:    { label: 'Low',    variant: 'default'  },
  medium: { label: 'Medium', variant: 'info'     },
  high:   { label: 'High',   variant: 'warning'  },
  urgent: { label: 'Urgent', variant: 'danger'   },
};

export function TicketStatusBadge({ status }) {
  const cfg = STATUS_MAP[status] ?? { label: status, variant: 'default' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function TicketPriorityBadge({ priority }) {
  const cfg = PRIORITY_MAP[priority] ?? { label: priority, variant: 'default' };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
