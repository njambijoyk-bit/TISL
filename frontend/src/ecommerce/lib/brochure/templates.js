// The brochure layouts. A page is a canvas; every box is placed in percent of the page (x and w of its width, y and h of its height, as for moodboards), and the
// text and pictures in them come from the service. Kinds of box:
//   photo   { src: 'main' | 'other:0'.. | 'logo' }          a picture, in any moodboard shape
//   text    { field, font, color, size, align, upper? }       one field, shrunk to fit its box
//   chip    { field, bg, color, font, size }                  one field on a rounded coloured tag
//   stack   { items: [{ title, field, kind: 'bullets'|'text' }], titleFont, font, color, accent, size, bullet }   sections that stack and skip any that are empty
//   block   { fill, shape, border }                           a coloured area
//   sticker { value, color }                                  an emoji or a drawn sticker (moodboard kit)
//   rule    { color, width }                                  a line
// `need` on any box hides it when that field is empty. Sizes are percent of the page width.
const b = (x, y, w, h, o = {}) => ({ kind: 'block', x, y, w, h, ...o });
const t = (x, y, w, h, field, o = {}) => ({ kind: 'text', x, y, w, h, field, ...o });
const c = (x, y, w, h, field, o = {}) => ({ kind: 'chip', x, y, w, h, field, ...o });
const p = (x, y, w, h, src, o = {}) => ({ kind: 'photo', x, y, w, h, src, ...o });
const k = (x, y, w, h, value, o = {}) => ({ kind: 'sticker', x, y, w, h, value, ...o });
const r = (x, y, w, o = {}) => ({ kind: 'rule', x, y, w, h: 0, ...o });
const st = (x, y, w, h, items, o = {}) => ({ kind: 'stack', x, y, w, h, items, ...o });

const SECTION = {
  get: { title: 'What you get', field: 'features', kind: 'bullets' }, deliver: { title: 'What you receive', field: 'deliverables', kind: 'bullets' },
  need: { title: 'What we need from you', field: 'requirements', kind: 'bullets' }, how: { title: 'How it works', field: 'facts', kind: 'bullets' },
  tiers: { title: 'Options and pricing', field: 'tiers', kind: 'bullets' }, charges: { title: 'Other charges', field: 'charges', kind: 'bullets' },
  policy: { title: 'Booking policy', field: 'policy', kind: 'text' },
};

export const TEMPLATES = {
  // Warm paper, serif headings, thin rules: a traditional printed brochure.
  classic: {
    label: 'Classic', description: 'Cream paper, serif headings and thin rules.',
    pages: [
      { background: '#fbf8f2', pattern: 'paper', slots: [
        b(5, 3.5, 90, 93, { fill: 'transparent', border: { color: '#8a6d3b', width: 0.18 } }),
        t(8, 6, 50, 2.4, 'company', { font: 'wide', size: 1.5, color: '#8a6d3b' }), t(58, 6, 34, 2.4, 'category', { font: 'wide', size: 1.5, color: '#8a6d3b', align: 'right' }),
        r(8, 9.3, 84, { color: '#8a6d3b', width: 0.12 }),
        t(8, 11, 84, 8, 'name', { font: 'headline', size: 4.6, color: '#2b2118' }),
        c(8, 19.5, 22, 2.4, 'badge', { bg: '#8a6d3b', color: '#fff', font: 'wide', size: 1.3, need: 'badge' }),
        p(8, 23.5, 84, 30, 'main', { shape: 'rect' }),
        t(8, 55, 84, 5, 'tagline', { font: 'elegant', size: 2.7, color: '#4a3b2a', need: 'tagline' }),
        t(8, 61.5, 84, 15, 'description', { font: 'serif', size: 2.17, color: '#3a2e22', weight: 400 }),
        st(8, 77.5, 40, 10, [SECTION.how], { size: 2.11, color: '#3a2e22', accent: '#8a6d3b', titleFont: 'wide', font: 'serif', bullet: '·' }),
        b(52, 78, 40, 10, { fill: '#2b2118' }), t(55, 79, 34, 3, 'model', { font: 'wide', size: 1.2, color: '#d9c7a0' }),
        t(55, 82.2, 34, 5, 'price', { font: 'headline', size: 2.8, color: '#fff', need: 'price' }),
        t(8, 89, 84, 2.4, 'rating', { font: 'serif', size: 1.5, color: '#8a6d3b', need: 'rating' }),
        t(8, 92, 84, 3, 'contact', { font: 'wide', size: 1.1, color: '#8a6d3b', align: 'center' }),
      ] },
      { background: '#fbf8f2', pattern: 'paper', slots: [
        b(5, 3.5, 90, 93, { fill: 'transparent', border: { color: '#8a6d3b', width: 0.18 } }),
        t(8, 6, 60, 3, 'name', { font: 'headline', size: 2.2, color: '#2b2118' }), r(8, 10, 84, { color: '#8a6d3b', width: 0.12 }),
        p(8, 12, 26.6, 12, 'other:0', { shape: 'rect' }), p(36.7, 12, 26.6, 12, 'other:1', { shape: 'rect' }), p(65.4, 12, 26.6, 12, 'other:2', { shape: 'rect' }),
        st(8, 26, 40, 30, [SECTION.get, SECTION.deliver], { size: 2.05, color: '#3a2e22', accent: '#8a6d3b', titleFont: 'wide', font: 'serif', bullet: '✓' }),
        st(52, 26, 40, 30, [SECTION.need, SECTION.tiers], { size: 2.05, color: '#3a2e22', accent: '#8a6d3b', titleFont: 'wide', font: 'serif', bullet: '·' }),
        st(8, 57, 84, 12, [SECTION.charges], { size: 2.05, color: '#3a2e22', accent: '#8a6d3b', titleFont: 'wide', font: 'serif', bullet: '·' }),
        r(8, 70, 84, { color: '#8a6d3b', width: 0.08 }),
        st(8, 71.5, 84, 20, [SECTION.policy], { size: 1.52, color: '#5a4a38', accent: '#8a6d3b', titleFont: 'wide', font: 'serif' }),
        t(8, 92, 84, 3, 'contact', { font: 'wide', size: 1.1, color: '#8a6d3b', align: 'center' }),
      ] },
    ],
  },

  // A bold colour field, big type, dots and a few drawn stickers.
  modern: {
    label: 'Modern', description: 'A big cover picture, bold type, dots and drawn stickers.',
    pages: [
      { background: '#ffffff', pattern: 'dots', slots: [
        p(0, 0, 100, 44, 'main', { shape: 'rect' }),
        b(0, 36, 100, 12, { fill: '#10b981' }),
        t(6, 37.5, 62, 9, 'name', { font: 'poster', size: 4.4, color: '#fff' }),
        c(70, 39, 24, 5, 'price', { bg: '#fff', color: '#065f46', font: 'wide', size: 1.5, need: 'price' }),
        c(6, 4, 22, 3.2, 'badge', { bg: '#fde047', color: '#422006', font: 'wide', size: 1.2, need: 'badge' }),
        k(84, 6, 11, 7.8, 'svg:sparkle', { color: '#fde047' }),
        t(6, 51, 88, 7, 'tagline', { font: 'brush', size: 3.4, color: '#065f46', need: 'tagline' }),
        t(6, 59, 88, 18, 'description', { font: 'sans', size: 2.17, color: '#1f2937', weight: 400 }),
        b(6, 78.5, 88, 11, { fill: '#ecfdf5', shape: 'rounded' }),
        st(8, 79.5, 84, 9, [SECTION.how], { size: 2.05, color: '#064e3b', accent: '#059669', titleFont: 'wide', font: 'sans', bullet: '→' }),
        t(6, 90.5, 50, 2.6, 'rating', { font: 'sans', size: 1.5, color: '#065f46', need: 'rating' }),
        k(86, 88, 8, 5.7, 'svg:arrow-curve', { color: '#10b981' }),
        t(6, 94, 88, 3, 'contact', { font: 'wide', size: 1.1, color: '#047857' }),
      ] },
      { background: '#ffffff', pattern: 'dots', slots: [
        b(0, 0, 100, 9, { fill: '#10b981' }), t(6, 2, 70, 5, 'name', { font: 'poster', size: 2.6, color: '#fff' }),
        p(6, 11, 28, 14, 'other:0', { shape: 'rounded' }), p(36, 11, 28, 14, 'other:1', { shape: 'rounded' }), p(66, 11, 28, 14, 'other:2', { shape: 'rounded' }),
        st(6, 27, 42, 34, [SECTION.get, SECTION.deliver], { size: 2.05, color: '#1f2937', accent: '#059669', titleFont: 'wide', font: 'sans', bullet: '✓' }),
        st(52, 27, 42, 34, [SECTION.need, SECTION.tiers], { size: 2.05, color: '#1f2937', accent: '#059669', titleFont: 'wide', font: 'sans', bullet: '→' }),
        b(6, 62, 88, 12, { fill: '#fef9c3', shape: 'rounded' }), st(8, 63, 84, 10, [SECTION.charges], { size: 1.98, color: '#422006', accent: '#a16207', titleFont: 'wide', font: 'sans', bullet: '•' }),
        st(6, 76, 88, 16, [SECTION.policy], { size: 1.46, color: '#4b5563', accent: '#059669', titleFont: 'wide', font: 'sans' }),
        k(88, 92, 7, 5, 'svg:leaf', { color: '#10b981' }), t(6, 94, 76, 3, 'contact', { font: 'wide', size: 1.1, color: '#047857' }),
      ] },
    ],
  },

  // Lots of white, wide capitals, ruled lines.
  minimal: {
    label: 'Minimal', description: 'White space, wide capitals and ruled lines.',
    pages: [
      { background: '#ffffff', pattern: 'none', slots: [
        t(8, 6, 60, 2.4, 'company', { font: 'wide', size: 1.3, color: '#111827' }), t(60, 6, 32, 2.4, 'category', { font: 'wide', size: 1.3, color: '#6b7280', align: 'right' }),
        r(8, 9.5, 84, { color: '#111827', width: 0.15 }),
        t(8, 13, 84, 12, 'name', { font: 'elegant', size: 6.2, color: '#111827' }),
        t(8, 27, 84, 5, 'tagline', { font: 'wide', size: 1.5, color: '#6b7280', need: 'tagline' }),
        p(8, 34, 84, 34, 'main', { shape: 'rect' }),
        t(8, 71, 60, 15, 'description', { font: 'sans', size: 1.99, color: '#374151', weight: 400 }),
        t(72, 71, 20, 3, 'model', { font: 'wide', size: 1.1, color: '#6b7280', align: 'right' }), t(60, 74.5, 32, 6, 'price', { font: 'elegant', size: 3.4, color: '#111827', align: 'right', need: 'price' }),
        r(8, 88, 84, { color: '#d1d5db', width: 0.1 }),
        t(8, 90, 84, 2.6, 'rating', { font: 'sans', size: 1.4, color: '#6b7280', need: 'rating' }),
        t(8, 93, 84, 3, 'contact', { font: 'wide', size: 1.05, color: '#6b7280' }),
      ] },
      { background: '#ffffff', pattern: 'lines', slots: [
        t(8, 6, 84, 3, 'name', { font: 'wide', size: 1.5, color: '#111827' }), r(8, 9.5, 84, { color: '#111827', width: 0.15 }),
        p(8, 12, 40, 13, 'other:0', { shape: 'rect' }), p(52, 12, 40, 13, 'other:1', { shape: 'rect' }),
        st(8, 28, 40, 30, [SECTION.get, SECTION.deliver], { size: 1.98, color: '#374151', accent: '#111827', titleFont: 'wide', font: 'sans', bullet: '-' }),
        st(52, 28, 40, 30, [SECTION.need, SECTION.tiers], { size: 1.98, color: '#374151', accent: '#111827', titleFont: 'wide', font: 'sans', bullet: '-' }),
        r(8, 60, 84, { color: '#d1d5db', width: 0.1 }),
        st(8, 62, 40, 12, [SECTION.charges], { size: 1.98, color: '#374151', accent: '#111827', titleFont: 'wide', font: 'sans', bullet: '-' }),
        st(52, 62, 40, 12, [SECTION.how], { size: 1.98, color: '#374151', accent: '#111827', titleFont: 'wide', font: 'sans', bullet: '-' }),
        st(8, 75, 84, 18, [SECTION.policy], { size: 1.46, color: '#6b7280', accent: '#111827', titleFont: 'wide', font: 'sans' }),
        t(8, 94, 84, 3, 'contact', { font: 'wide', size: 1.05, color: '#6b7280' }),
      ] },
    ],
  },

  // Scrapbook: grid paper, polaroids, tape, emoji and a handwritten note.
  scrapbook: {
    label: 'Scrapbook', description: 'Grid paper, polaroids, tape, stickers and a handwritten note.',
    pages: [
      { background: '#f3efe6', pattern: 'grid', slots: [
        t(8, 5, 84, 8, 'name', { font: 'signature', size: 6.4, color: '#7c2d12' }),
        c(8, 14, 24, 3.2, 'badge', { bg: '#f97316', color: '#fff', font: 'wide', size: 1.2, need: 'badge' }),
        p(10, 20, 54, 33, 'main', { shape: 'polaroid', rot: -2 }), k(10, 18, 18, 4, 'svg:tape', { color: '#efe9dc' }),
        p(58, 30, 30, 20, 'other:0', { shape: 'polaroid', rot: 4 }),
        b(8, 56, 84, 17, { fill: '#fffdf8', shape: 'torn' }),
        t(11, 58.5, 78, 4, 'tagline', { font: 'brush', size: 2.9, color: '#9a3412', need: 'tagline' }),
        t(11, 63.5, 78, 8.5, 'description', { font: 'serif', size: 1.77, color: '#44403c', weight: 400 }),
        b(8, 76, 38, 14, { fill: '#fde68a', shape: 'blob' }), t(12, 78.5, 30, 3, 'model', { font: 'wide', size: 1.1, color: '#78350f' }),
        t(12, 82, 30, 5, 'price', { font: 'poster', size: 2.6, color: '#7c2d12', need: 'price' }),
        st(52, 76, 42, 14, [SECTION.how], { size: 1.91, color: '#44403c', accent: '#9a3412', titleFont: 'brush', font: 'sans', bullet: '✿' }),
        k(80, 90, 10, 7, '🎀'), k(6, 90, 8, 5.6, 'svg:arrow-curve', { color: '#9a3412' }),
        t(16, 92.5, 66, 3, 'contact', { font: 'wide', size: 1.05, color: '#7c2d12', align: 'center' }),
      ] },
      { background: '#f3efe6', pattern: 'grid', slots: [
        t(8, 5, 84, 5, 'name', { font: 'brush', size: 3.2, color: '#7c2d12' }),
        p(8, 12, 26, 15, 'other:0', { shape: 'polaroid', rot: -3 }), p(37, 11, 26, 15, 'other:1', { shape: 'polaroid', rot: 2 }), p(66, 12, 26, 15, 'other:2', { shape: 'polaroid', rot: -2 }),
        b(6, 31, 42, 28, { fill: '#fffdf8', shape: 'rounded' }), st(9, 32.5, 36, 26, [SECTION.get, SECTION.deliver], { size: 1.91, color: '#44403c', accent: '#9a3412', titleFont: 'brush', font: 'sans', bullet: '✓' }),
        b(52, 31, 42, 28, { fill: '#fffdf8', shape: 'rounded' }), st(55, 32.5, 36, 26, [SECTION.need, SECTION.tiers], { size: 1.91, color: '#44403c', accent: '#9a3412', titleFont: 'brush', font: 'sans', bullet: '✿' }),
        b(6, 62, 88, 11, { fill: '#fde68a', shape: 'torn' }), st(9, 63.5, 82, 9, [SECTION.charges], { size: 1.91, color: '#78350f', accent: '#7c2d12', titleFont: 'brush', font: 'sans', bullet: '•' }),
        st(8, 75, 84, 16, [SECTION.policy], { size: 1.46, color: '#57534e', accent: '#9a3412', titleFont: 'brush', font: 'sans' }),
        k(84, 91, 9, 6.3, '✨'), t(8, 93, 74, 3, 'contact', { font: 'wide', size: 1.05, color: '#7c2d12' }),
      ] },
    ],
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);
export const PAGE = { w: 210, h: 297 };   // A4, in millimetres
