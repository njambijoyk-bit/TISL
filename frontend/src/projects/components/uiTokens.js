/** The named theme values the Projects building blocks share. No colour is written here either: only the names of the theme's own. */

export const tint = (token, percent) => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`;

/** Which theme colour stands for a state. The names are stored (a stage is 'good', never a colour). */
export const STATUS_TOKEN = {
  info: '--status-info',
  good: '--status-success',
  warning: '--status-warning',
  problem: '--status-error',
  neutral: '--text-secondary',
  brand: '--color-primary-500',
};

/** Table cells. */
export const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--line)' };
export const td = { padding: '8px 10px', fontSize: 13.5, color: 'var(--text-primary)', borderBottom: '1px solid var(--line)', verticalAlign: 'middle' };
