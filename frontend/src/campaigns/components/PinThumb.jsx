import { Link2, Play, ShoppingBag, StickyNote } from 'lucide-react';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { colors } from '../../_shared/theme/tokens';

/** A pin's picture (or an icon for a link or note) at the pin's own proportions, with a play mark on videos. */
export default function PinThumb({ p, ratio }) {
  const src = p.thumb_path || p.media_path || p.video?.poster || p.video?.poster_remote || p.item?.image;
  const shape = ratio ?? (p.media_width && p.media_height ? `${p.media_width} / ${p.media_height}` : '4 / 3');
  const bg = 'var(--surface-input, rgba(148,163,184,0.15))';
  if (src) {
    return (
      <div style={{ position: 'relative', aspectRatio: shape, background: bg }}>
        <img src={storageUrl(src)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {p.kind === 'video' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={16} fill="#fff" /></span></span>}
      </div>
    );
  }
  const Icon = { video: Play, item: ShoppingBag, link: Link2, note: StickyNote }[p.kind] ?? StickyNote;

  return <div style={{ aspectRatio: ratio ?? '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textFaint, background: bg }}><Icon size={28} /></div>;
}
