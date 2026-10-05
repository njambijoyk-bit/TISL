import { DEFAULT_LIGHT_TOKENS, DEFAULT_DARK_TOKENS } from './themeConstants';

/**
 * Injects CSS custom properties onto :root and sets the data-theme attribute.
 *
 * @param {object|null} colouring  - active Colouring row (with light_tokens / dark_tokens)
 * @param {'system'|'light'|'dark'} mode - user's mode override
 * @param {boolean} systemIsDark  - current OS dark-mode preference
 */
// Properties set by the previous call, so a Colouring that leaves a token out
// (or sets it to null) doesn't inherit the last Colouring's value.
let appliedProps = [];

export function applyTheme(colouring, mode, systemIsDark) {
  const useDark =
    mode === 'dark' ? true :
    mode === 'light' ? false :
    systemIsDark;

  const tokens = colouring
    ? (useDark ? colouring.dark_tokens : colouring.light_tokens)
    : (useDark ? DEFAULT_DARK_TOKENS : DEFAULT_LIGHT_TOKENS);

  const root = document.documentElement;
  root.setAttribute('data-theme', useDark ? 'dark' : 'light');

  appliedProps.forEach((prop) => root.style.removeProperty(prop));
  appliedProps = [];
  Object.entries(tokens).forEach(([prop, value]) => {
    if (value === null || value === undefined || value === '') return;
    root.style.setProperty(prop, value);
    appliedProps.push(prop);
  });
}

/**
 * Injects Google Fonts <link> tags for heading and body fonts.
 * Idempotent — won't add the same font twice.
 *
 * @param {string|null} headingSlug - google_slug of the heading font
 * @param {string|null} bodySlug    - google_slug of the body font
 */
export function applyFonts(headingSlug, bodySlug) {
  const root = document.documentElement;
  const slugs = [...new Set([headingSlug, bodySlug].filter(Boolean))];

  slugs.forEach((slug) => {
    const id = `gfont-${slug}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id   = id;
    link.rel  = 'stylesheet';
    // Google answers 400 when a family lacks one of the weights asked for (Pacifico, Bebas Neue, DM Serif Display have only the regular one,
    // Atkinson Hyperlegible only regular and bold). So try all five weights, then regular + bold, then the family as it comes.
    const attempts = [':wght@300;400;500;600;700', ':wght@400;700', ''];
    let tried = 0;
    const load = () => { link.href = `https://fonts.googleapis.com/css2?family=${slug}${attempts[tried]}&display=swap`; };
    link.onerror = () => { if (tried < attempts.length - 1) { tried += 1; load(); } };
    load();
    document.head.appendChild(link);
  });

  if (headingSlug) {
    const family = headingSlug.replace(/\+/g, ' ');
    root.style.setProperty('--font-heading', `'${family}', serif`);
  }
  if (bodySlug) {
    const family = bodySlug.replace(/\+/g, ' ');
    root.style.setProperty('--font-body', `'${family}', sans-serif`);
  }
}

/**
 * Writes the icon style slug to a CSS custom property and data attribute,
 * so icon components can read it.
 *
 * @param {string|null} iconSlug - e.g. 'outline', 'filled', 'rounded'
 */
export function applyIconStyle(iconSlug) {
  if (!iconSlug) return;
  const root = document.documentElement;
  root.setAttribute('data-icon-style', iconSlug);
  root.style.setProperty('--icon-style', iconSlug);
}
