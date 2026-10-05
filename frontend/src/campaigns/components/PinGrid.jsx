import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Play, ShoppingBag, StickyNote } from 'lucide-react';
import { storageUrl } from '../../_shared/lib/storageUrl';

const ICON = { video: Play, item: ShoppingBag, link: Link2, note: StickyNote };

function Card({ p, onOpen }) {
  const src = p.thumb_path || p.media_path || p.video?.poster || p.item?.image;
  const ratio = p.media_width && p.media_height ? `${p.media_width} / ${p.media_height}` : '4 / 3';
  const Icon = ICON[p.kind] ?? StickyNote;
  const title = p.title || p.item?.name || (p.kind === 'note' ? p.caption : '') || '';

  return (
    <button type="button" onClick={() => onOpen(p)} aria-label={title || 'Open pin'} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', background: 'transparent', border: 0, marginBottom: 16, breakInside: 'avoid' }}>
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--line)' }}>
        {src
          ? <img src={storageUrl(src)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: ratio, objectFit: 'cover', display: 'block' }} />
          : <div style={{ padding: p.kind === 'note' ? '22px 18px' : '38px 18px', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', fontSize: '0.92rem' }}>{p.kind === 'note' ? p.caption : <Icon size={30} />}</div>}
        {p.kind === 'video' && src && <span style={{ position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={14} color="#fff" fill="#fff" /></span>}
        {p.kind === 'item' && p.item?.price != null && <span style={{ position: 'absolute', left: 10, bottom: 10, padding: '3px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.66)', color: '#fff', fontSize: '0.74rem', fontWeight: 700 }}>{p.item.currency ? `${p.item.currency} ` : ''}{Number(p.item.price).toLocaleString()}</span>}
      </div>
      {title && p.kind !== 'note' && <div style={{ padding: '6px 4px 0', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>}
    </button>
  );
}

/**
 * Endless masonry of pins. `load(after)` returns { data, next }; the grid asks for the next page as the bottom nears and starts over when
`resetKey` changes. `render(item)` draws something other than a pin (moodboards use it). Columns fill top to bottom, so new pins arrive below without moving the ones already on screen.
 */
export default function PinGrid({ load, resetKey, onOpen, render, empty = 'Nothing here yet.' }) {
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(undefined);   // undefined: not loaded yet, null: that was the end
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const gen = useRef(0);
  const sentinel = useRef(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const more = useCallback(async (after, g) => {
    setBusy(true); setError(false);
    try {
      const r = await loadRef.current(after);
      if (g !== gen.current) return;
      setRows((x) => (after ? [...x, ...r.data.filter((n) => !x.some((o) => o.id === n.id))] : r.data));
      setNext(r.next ?? null);
    } catch { if (g === gen.current) setError(true); } finally { if (g === gen.current) setBusy(false); }
  }, []);

  useEffect(() => { gen.current += 1; setRows([]); setNext(undefined); more(undefined, gen.current); }, [resetKey, more]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || busy || error) return undefined;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) more(next, gen.current); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [next, busy, error, more]);

  return (
    <div>
      <div style={{ columnWidth: 230, columnGap: 16 }}>{rows.map((p) => (render ? render(p) : <Card key={p.id} p={p} onOpen={onOpen} />))}</div>
      {next === null && rows.length === 0 && <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '40px 0' }}>{empty}</p>}
      {error && <p style={{ textAlign: 'center' }}><button type="button" onClick={() => more(next ?? undefined, gen.current)} style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit', fontWeight: 600 }}>Could not load. Try again</button></p>}
      {(busy || next) && !error && <div ref={sentinel} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24, fontSize: '0.8rem' }}>{busy ? 'Loading…' : ''}</div>}
    </div>
  );
}
