/** Everything a moodboard is dressed with: text styles, background patterns, emoji stickers and drawn (line-art) stickers. The server keeps the same lists to check what is saved. */

// Text styles: key -> label and how it is drawn. Web fonts load on demand (see useMoodboardFonts) and fall back to system fonts.
export const FONT_STYLES = {
  sans: { label: 'Plain', family: 'system-ui, -apple-system, "Segoe UI", sans-serif', weight: 700 },
  serif: { label: 'Classic', family: 'Georgia, "Times New Roman", serif', weight: 700 },
  script: { label: 'Handwritten', family: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', weight: 700 },
  mono: { label: 'Typewriter', family: 'ui-monospace, "SF Mono", Menlo, monospace', weight: 700 },
  display: { label: 'Bold poster', family: 'Impact, "Arial Black", "Helvetica Neue", sans-serif', weight: 400 },
  elegant: { label: 'Elegant serif', family: '"Cormorant Garamond", "Playfair Display", Georgia, serif', weight: 500 },
  signature: { label: 'Signature', family: '"Great Vibes", "Segoe Script", "Brush Script MT", cursive', weight: 400 },
  brush: { label: 'Brush script', family: '"Dancing Script", "Segoe Script", "Brush Script MT", cursive', weight: 700 },
  wide: { label: 'Wide capitals', family: 'Montserrat, system-ui, sans-serif', weight: 500, spacing: '0.32em', upper: true },
  headline: { label: 'Headline serif', family: '"Playfair Display", Georgia, serif', weight: 800, spacing: '0.14em', upper: true },
  poster: { label: 'Soft poster', family: '"Abril Fatface", "Playfair Display", Georgia, serif', weight: 400 },
};
export const FONT_LIST = Object.entries(FONT_STYLES).map(([k, v]) => [k, v.label]);
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Cormorant+Garamond:wght@500;700&family=Dancing+Script:wght@700&family=Great+Vibes&family=Montserrat:wght@500;700&family=Playfair+Display:wght@700;800&display=swap';

/** Loads the web fonts once, the first time a moodboard is drawn. */
export function loadMoodboardFonts() {
  if (typeof document === 'undefined' || document.getElementById('moodboard-fonts')) return;
  const l = document.createElement('link');
  l.id = 'moodboard-fonts'; l.rel = 'stylesheet'; l.href = FONT_URL;
  document.head.appendChild(l);
}

// Background patterns, drawn over the background colour.
export const PATTERNS = [['none', 'Plain'], ['grid', 'Grid lines'], ['dots', 'Dots'], ['lines', 'Ruled lines'], ['paper', 'Paper texture']];
const lum = (hex) => { const n = parseInt((hex || '#ffffff').slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** CSS for a pattern over a colour, in step with the artboard ratio so grid cells come out square. */
export function patternStyle(pattern, background, ratio) {
  const ink = lum(background) > 0.5 ? '0,0,0' : '255,255,255';
  const w = 3.2; const h = +(w * ratio[0] / ratio[1]).toFixed(3);
  if (pattern === 'grid') return { backgroundImage: `linear-gradient(rgba(${ink},0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(${ink},0.09) 1px, transparent 1px)`, backgroundSize: `${w}% ${h}%` };
  if (pattern === 'dots') return { backgroundImage: `radial-gradient(circle, rgba(${ink},0.22) 1.2px, transparent 1.6px)`, backgroundSize: `${w}% ${h}%` };
  if (pattern === 'lines') return { backgroundImage: `linear-gradient(transparent calc(100% - 1px), rgba(${ink},0.14) 0)`, backgroundSize: `100% ${h * 1.4}%` };
  if (pattern === 'paper') {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    return { backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundSize: '160px 160px' };
  }
  return {};
}

// Emoji stickers.
export const STICKERS = [
  '⭐', '❤️', '✨', '🌿', '🌸', '🔥', '🎁', '🛍️', '📍', '☀️', '🌙', '🎨', '💎', '🏷️', '👑', '🍃',
  '🎀', '🎗️', '🦋', '🌺', '🌷', '🌼', '🌹', '🪻', '🍀', '🍂', '💐', '🕊️', '☁️', '🌈', '💫', '🤍',
  '🖤', '💗', '🧸', '🕯️', '☕', '🍓', '🍒', '🍋', '📌', '📎', '✂️', '🧵', '📷', '🎞️', '🎧', '🎵',
  '💄', '👗', '👜', '👠', '🕶️', '💍', '🪞', '🛋️', '🏡', '✈️', '🌊', '🏔️', '🌴', '🥂', '🎂', '🧿',
];

// Drawn stickers: simple line art in a 100x100 box. They take a colour (default black), so they can be black, white or any colour.
const P = (d, extra = {}) => ({ d, ...extra });
export const SVG_STICKERS = {
  'arrow-curve': { label: 'Curved arrow', paths: [P('M10 80 C 20 20, 60 10, 88 30'), P('M74 18 L 90 31 L 72 40')] },
  'arrow-curve-back': { label: 'Curved arrow 2', paths: [P('M90 85 C 80 30, 40 20, 14 38'), P('M28 24 L 12 39 L 30 48')] },
  'arrow-dashed': { label: 'Dashed arrow', paths: [P('M10 20 C 60 5, 95 40, 60 60 S 30 90, 88 88', { dash: '5 6' }), P('M74 76 L 90 88 L 72 98')] },
  'arrow-straight': { label: 'Straight arrow', paths: [P('M8 50 L 88 50'), P('M72 34 L 90 50 L 72 66')] },
  leaf: { label: 'Leaf', paths: [P('M20 90 C 10 40, 50 10, 90 12 C 92 55, 60 88, 20 90 Z'), P('M20 90 C 40 60, 60 40, 84 18')] },
  branch: { label: 'Branch', paths: [P('M12 94 C 30 60, 50 40, 90 8'), P('M30 70 C 18 64, 14 52, 18 44 C 28 46, 34 58, 30 70 Z', { fill: true }), P('M44 52 C 34 44, 34 32, 40 26 C 48 32, 50 44, 44 52 Z', { fill: true }), P('M58 38 C 66 32, 76 34, 82 40 C 76 48, 64 48, 58 38 Z', { fill: true }), P('M50 62 C 60 58, 70 62, 74 70 C 66 76, 54 74, 50 62 Z', { fill: true })] },
  sprig: { label: 'Sprig', paths: [P('M50 96 L 50 10'), P('M50 70 C 30 66, 22 52, 26 42 C 40 44, 50 56, 50 70 Z', { fill: true }), P('M50 50 C 68 46, 76 34, 72 24 C 58 26, 50 38, 50 50 Z', { fill: true }), P('M50 28 C 38 24, 34 14, 38 8 C 48 10, 52 18, 50 28 Z', { fill: true })] },
  flower: { label: 'Flower', paths: [P('M50 40 C 40 20, 60 20, 50 40 C 70 30, 70 50, 50 44 C 66 60, 46 66, 48 46 C 34 62, 26 44, 46 44 C 28 36, 40 22, 50 40 Z'), P('M50 46 L 50 94'), P('M50 78 C 38 74, 32 66, 34 58 C 44 60, 50 68, 50 78 Z')] },
  butterfly: { label: 'Butterfly', paths: [P('M50 30 L 50 78'), P('M50 46 C 30 10, 6 22, 14 44 C 18 56, 36 56, 50 50', { fill: true }), P('M50 46 C 70 10, 94 22, 86 44 C 82 56, 64 56, 50 50', { fill: true }), P('M50 54 C 34 60, 22 78, 36 84 C 46 86, 50 70, 50 60'), P('M50 54 C 66 60, 78 78, 64 84 C 54 86, 50 70, 50 60'), P('M46 28 C 42 16, 36 12, 32 12'), P('M54 28 C 58 16, 64 12, 68 12')] },
  star: { label: 'Star', paths: [P('M50 8 L 61 38 L 93 40 L 68 60 L 77 91 L 50 73 L 23 91 L 32 60 L 7 40 L 39 38 Z')] },
  heart: { label: 'Heart', paths: [P('M50 88 C 6 56, 14 14, 38 16 C 46 17, 50 24, 50 28 C 50 24, 54 17, 62 16 C 86 14, 94 56, 50 88 Z')] },
  sparkle: { label: 'Sparkle', paths: [P('M50 6 C 52 34, 66 48, 94 50 C 66 52, 52 66, 50 94 C 48 66, 34 52, 6 50 C 34 48, 48 34, 50 6 Z', { fill: true })] },
  squiggle: { label: 'Squiggle', paths: [P('M6 50 C 14 20, 24 20, 30 50 S 46 80, 54 50 S 70 20, 78 50 S 90 70, 96 50')] },
  underline: { label: 'Underline', paths: [P('M6 60 C 30 50, 70 70, 94 52'), P('M14 78 C 40 70, 66 82, 88 72')] },
  scribble: { label: 'Scribble circle', paths: [P('M52 12 C 20 10, 6 40, 14 66 C 24 94, 76 96, 90 62 C 100 36, 70 8, 40 16 C 28 20, 22 28, 22 30')] },
  bow: { label: 'Bow', paths: [P('M50 50 C 30 26, 8 28, 10 50 C 12 72, 32 74, 50 50 Z', { fill: true }), P('M50 50 C 70 26, 92 28, 90 50 C 88 72, 68 74, 50 50 Z', { fill: true }), P('M50 50 C 44 66, 36 82, 28 92'), P('M50 50 C 56 66, 64 82, 72 92')] },
  paperclip: { label: 'Paperclip', paths: [P('M62 22 L 62 70 C 62 84, 38 84, 38 70 L 38 24 C 38 8, 70 8, 70 26 L 70 66')] },
  pin: { label: 'Push pin', paths: [P('M36 14 L 64 14 L 60 44 C 72 50, 74 58, 74 62 L 26 62 C 26 58, 28 50, 40 44 Z', { fill: true }), P('M50 62 L 50 92')] },
  tape: { label: 'Tape strip', tape: true, paths: [P('M4 24 L 96 20 L 94 80 L 6 76 Z', { fill: true })] },
};
export const SVG_LIST = Object.entries(SVG_STICKERS).map(([k, v]) => [`svg:${k}`, v.label]);

/** What a new moodboard starts with: each slot's default (tape, a paper colour). Used to draw layout previews. */
export function seedContents(layout) {
  return Object.fromEntries((layout?.slots ?? []).filter((x) => x.default).map((x) => [x.id, x.default]));
}

// A paper note with a torn top and bottom edge.
export const TORN = 'polygon(0 3%,4% 0,9% 2%,15% 0,21% 3%,28% 1%,35% 3%,42% 0,50% 2%,58% 0,66% 3%,74% 1%,82% 3%,90% 0,96% 2%,100% 1%,100% 97%,95% 100%,88% 98%,80% 100%,72% 97%,64% 100%,56% 98%,47% 100%,38% 97%,30% 100%,22% 98%,13% 100%,6% 97%,0 99%)';
