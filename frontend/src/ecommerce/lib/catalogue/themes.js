// The looks a brochure section can take. A theme is a set of colours, a heading font and a background pattern (the moodboard vocabulary); the keys match the server's list.
export const THEMES = {
  paper:  { label: 'Paper',  bg: '#fbf8f1', ink: '#2b2622', muted: '#7a6f64', accent: '#b45309', soft: '#efe7d6', head: 'serif',    pattern: 'paper' },
  blush:  { label: 'Blush',  bg: '#fdeef0', ink: '#4a2530', muted: '#8f6671', accent: '#c2415c', soft: '#f9d3da', head: 'elegant',  pattern: 'dots' },
  sage:   { label: 'Sage',   bg: '#eef3ea', ink: '#243326', muted: '#667a68', accent: '#4d7c4f', soft: '#d9e6d3', head: 'serif',    pattern: 'none' },
  ocean:  { label: 'Ocean',  bg: '#e8f2f8', ink: '#102a43', muted: '#52708a', accent: '#0b7285', soft: '#cde6f1', head: 'wide',     pattern: 'lines' },
  sunset: { label: 'Sunset', bg: '#fff1e4', ink: '#4a2208', muted: '#8f6a4c', accent: '#e8590c', soft: '#ffd9b8', head: 'poster',   pattern: 'none' },
  night:  { label: 'Night',  bg: '#16161d', ink: '#f2efe9', muted: '#a7a39a', accent: '#e0b64a', soft: '#272733', head: 'headline', pattern: 'grid' },
  sand:   { label: 'Sand',   bg: '#f3ebdd', ink: '#3a2f22', muted: '#85735c', accent: '#8d6e3f', soft: '#e6d9c0', head: 'elegant',  pattern: 'paper' },
  mono:   { label: 'Mono',   bg: '#f4f4f5', ink: '#18181b', muted: '#71717a', accent: '#52525b', soft: '#e4e4e7', head: 'mono',     pattern: 'grid' },
};

export const THEME_KEYS = Object.keys(THEMES);
export const themeOf = (key) => THEMES[key] ?? THEMES.paper;
