/** Small helpers the Projects screens share. */

export const message = (e, fallback) => e?.response?.data?.message || fallback;

/** 2026-11-14 -> 14 Nov 2026. A date is a calendar day here, never a moment, so no time zone can move it. */
export const day = (d) => {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** What a state is called and which theme status colour shows it. A stage carries its own status; these are the states outside the stages. */
export const STATE = {
  open: { label: 'Open', status: 'info' },
  on_hold: { label: 'On hold', status: 'warning' },
  closed: { label: 'Closed', status: 'good' },
  cancelled: { label: 'Cancelled', status: 'neutral' },
};

export const PRIORITY = {
  low: { label: 'Low', status: 'neutral' },
  medium: { label: 'Medium', status: 'neutral' },
  high: { label: 'High', status: 'warning' },
  urgent: { label: 'Urgent', status: 'problem' },
};

/** The chip a project shows for where it is: its stage, unless it is on hold or cancelled. */
export const where = (p) => (p.state === 'on_hold' || p.state === 'cancelled' || !p.stage
  ? STATE[p.state] || STATE.open
  : { label: p.stage.name, status: p.stage.status || 'info' });
