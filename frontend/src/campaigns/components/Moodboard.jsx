import { useEffect } from 'react';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { FONT_STYLES, SVG_STICKERS, loadMoodboardFonts, patternStyle } from '../lib/moodboardKit';

const dashed = 'color-mix(in srgb, #64748b 55%, transparent)';

const SHAPE_RADIUS = { circle: '50%', rounded: '3cqw', polaroid: '0.6cqw', arch: '50% 50% 0 0 / 28% 28% 0 0', corner: '0 16cqw 0 0', pill: '6cqw', blob: '58% 42% 55% 45% / 48% 56% 44% 52%' };
// A paper note with a torn top and bottom edge.
const TORN = 'polygon(0 3%,4% 0,9% 2%,15% 0,21% 3%,28% 1%,35% 3%,42% 0,50% 2%,58% 0,66% 3%,74% 1%,82% 3%,90% 0,96% 2%,100% 1%,100% 97%,95% 100%,88% 98%,80% 100%,72% 97%,64% 100%,56% 98%,47% 100%,38% 97%,30% 100%,22% 98%,13% 100%,6% 97%,0 99%)';

/** Line-art sticker (drawn, so it can be any colour); tape is see-through. */
export function Drawn({ value, color }) {
  const def = SVG_STICKERS[String(value).slice(4)];
  if (!def) return null;
  const c = color || '#222222';

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', overflow: 'visible' }} aria-hidden="true">
      {def.paths.map((p, i) => <path key={i} d={p.d} fill={def.tape || p.fill ? c : 'none'} fillOpacity={def.tape ? 0.55 : 1} stroke={def.tape ? 'none' : c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={p.dash} />)}
    </svg>
  );
}

function Slot({ slot, c, ratio, editing, selected, onSlot }) {
  const rh = ratio[1] / ratio[0];                       // artboard height as a share of its width
  const boxCqw = (slot.h * rh) / 100 * 100;             // slot height in cqw (1cqw = 1% of the artboard's width)
  const filled = Boolean(c) && Object.keys(c).length > 0;
  if (!filled && !editing) return null;
  const radius = SHAPE_RADIUS[slot.shape] ?? 0;
  const shadow = filled && (slot.type === 'photo') && (slot.rot || slot.shape === 'polaroid') ? '0 0.8cqw 2cqw rgba(0,0,0,0.28)' : 'none';
  const box = {
    position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.w}%`, height: `${slot.h}%`, transform: `rotate(${slot.rot || 0}deg)`, zIndex: slot.z || 1,
    boxSizing: 'border-box', overflow: slot.type === 'sticker' ? 'visible' : 'hidden', borderRadius: radius, clipPath: slot.shape === 'torn' ? TORN : undefined, boxShadow: shadow, padding: 0, margin: 0, border: 0, display: 'block', textAlign: 'left',
    outline: selected ? '0.5cqw solid var(--color-primary-500)' : 'none', outlineOffset: '0.3cqw', cursor: editing ? 'pointer' : 'default', font: 'inherit', background: 'transparent',
  };
  let inner = null;
  if (!filled) {
    inner = <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.4cqw dashed ${dashed}`, borderRadius: radius, color: '#64748b', fontSize: '2cqw', fontWeight: 600, textAlign: 'center', padding: '0 1cqw', background: 'rgba(148,163,184,0.12)' }}>{slot.hint}</span>;
  } else if (slot.type === 'photo') {
    const img = c.image ? <img src={storageUrl(c.image)} alt={c.title || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null;
    inner = slot.shape === 'polaroid'
      ? <span style={{ position: 'absolute', inset: 0, background: '#fff', padding: '4% 4% 16%', boxSizing: 'border-box' }}><span style={{ display: 'block', width: '100%', height: '100%', background: '#d6d3d1' }}>{img}</span></span>
      : img;
  } else if (slot.type === 'color') {
    inner = <span style={{ position: 'absolute', inset: 0, background: c.value, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{c.label && <span style={{ fontSize: `${Math.min(2, boxCqw * 0.18)}cqw`, fontWeight: 700, color: '#fff', textShadow: '0 0 0.6cqw rgba(0,0,0,0.6)', paddingBottom: '0.8cqw' }}>{c.label}</span>}</span>;
  } else if (slot.type === 'text') {
    const f = FONT_STYLES[c.font] ?? FONT_STYLES.sans;
    inner = <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', color: c.color, fontFamily: f.family, fontWeight: f.weight, letterSpacing: f.spacing, textTransform: f.upper ? 'uppercase' : undefined, fontSize: `${Math.max(1.6, boxCqw * 0.62)}cqw`, lineHeight: 1.1, overflow: 'hidden' }}>{c.text}</span>;
  } else if (slot.type === 'sticker') {
    inner = String(c.value).startsWith('svg:')
      ? <Drawn value={c.value} color={c.color} />
      : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${Math.min(slot.w, boxCqw) * 0.85}cqw`, lineHeight: 1 }}>{c.value}</span>;
  }
  const label = `${slot.hint}${filled ? '' : ' (empty)'}`;

  return editing
    ? <button type="button" aria-label={label} onClick={() => onSlot?.(slot)} style={box}>{inner}</button>
    : <div style={box}>{inner}</div>;
}

/**
 * Draws a moodboard: the artboard at its own ratio, each slot placed in percent, filled with a picture, a colour, words or a sticker.
 * `board` is { layout, contents }. In `editing` mode empty spots show as dashed boxes and each one can be clicked.
 */
export default function Moodboard({ board, editing = false, selected = null, onSlot, radius = 12 }) {
  const layout = board?.layout;
  useEffect(() => { loadMoodboardFonts(); }, []);
  if (!layout?.slots) return null;
  const ratio = layout.ratio ?? [4, 5];

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${ratio[0]} / ${ratio[1]}`, backgroundColor: layout.background || '#fff', ...patternStyle(layout.pattern, layout.background, ratio), overflow: 'hidden', borderRadius: radius, containerType: 'inline-size', boxShadow: '0 0 0 1px rgba(100,116,139,0.25) inset' }}>
      {layout.slots.map((s) => <Slot key={s.id} slot={s} c={board.contents?.[s.id]} ratio={ratio} editing={editing} selected={selected === s.id} onSlot={onSlot} />)}
    </div>
  );
}
