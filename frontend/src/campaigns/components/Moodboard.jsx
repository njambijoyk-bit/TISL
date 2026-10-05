import { storageUrl } from '../../_shared/lib/storageUrl';

const FONT = {
  sans: 'system-ui, -apple-system, "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif', script: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace', display: 'Impact, "Arial Black", "Helvetica Neue", sans-serif',
};
const dashed = 'color-mix(in srgb, #64748b 55%, transparent)';

function Slot({ slot, c, ratio, editing, selected, onSlot }) {
  const rh = ratio[1] / ratio[0];                       // artboard height as a share of its width
  const boxCqw = (slot.h * rh) / 100 * 100;             // slot height in cqw (1cqw = 1% of the artboard's width)
  const filled = Boolean(c) && Object.keys(c).length > 0;
  if (!filled && !editing) return null;
  const radius = slot.shape === 'circle' ? '50%' : slot.shape === 'rounded' ? '3cqw' : slot.shape === 'polaroid' ? '0.6cqw' : 0;
  const shadow = filled && (slot.type === 'photo') && (slot.rot || slot.shape === 'polaroid') ? '0 0.8cqw 2cqw rgba(0,0,0,0.28)' : 'none';
  const box = {
    position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.w}%`, height: `${slot.h}%`, transform: `rotate(${slot.rot || 0}deg)`, zIndex: slot.z || 1,
    boxSizing: 'border-box', overflow: 'hidden', borderRadius: radius, boxShadow: shadow, padding: 0, margin: 0, border: 0, display: 'block', textAlign: 'left',
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
    inner = <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', color: c.color, fontFamily: FONT[c.font] ?? FONT.sans, fontSize: `${Math.max(1.6, boxCqw * 0.62)}cqw`, lineHeight: 1.1, fontWeight: c.font === 'display' ? 400 : 700, overflow: 'hidden' }}>{c.text}</span>;
  } else if (slot.type === 'sticker') {
    inner = <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${Math.min(slot.w, boxCqw) * 0.85}cqw`, lineHeight: 1 }}>{c.value}</span>;
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
  if (!layout?.slots) return null;
  const ratio = layout.ratio ?? [4, 5];

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${ratio[0]} / ${ratio[1]}`, background: layout.background || '#fff', overflow: 'hidden', borderRadius: radius, containerType: 'inline-size', boxShadow: '0 0 0 1px rgba(100,116,139,0.25) inset' }}>
      {layout.slots.map((s) => <Slot key={s.id} slot={s} c={board.contents?.[s.id]} ratio={ratio} editing={editing} selected={selected === s.id} onSlot={onSlot} />)}
    </div>
  );
}
