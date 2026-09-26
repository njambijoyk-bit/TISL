import { DEFAULT_LIGHT_TOKENS, DEFAULT_DARK_TOKENS } from './themeConstants';

/**
 * Injects CSS custom properties onto :root and sets the data-theme attribute.
 *
 * @param {object|null} colouring  - active Colouring row (with light_tokens / dark_tokens)
 * @param {'system'|'light'|'dark'} mode - user's mode override
 * @param {boolean} systemIsDark  - current OS dark-mode preference
 */
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

  Object.entries(tokens).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
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
    link.href = `https://fonts.googleapis.com/css2?family=${slug}:wght@300;400;500;600;700&display=swap`;
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
