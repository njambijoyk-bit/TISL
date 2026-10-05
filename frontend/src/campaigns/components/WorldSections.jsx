import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import worldAPI from '../../_shared/api/world';
import moodboardsAPI from '../../_shared/api/moodboards';
import { storageUrl } from '../../_shared/lib/storageUrl';
import Moodboard from './Moodboard';

const heading = (text) => (text ? <h2 style={{ margin: '0 0 14px', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{text}</h2> : null);
const more = { display: 'inline-block', marginTop: 14, fontWeight: 700, fontSize: '0.88rem', color: 'var(--campaign-accent)', textDecoration: 'none' };

/** Loads once per change of `key`; a failure just leaves the section empty (the rest of the page must still show). */
function useLoad(key, fn) {
  const [state, setState] = useState({ key: null, data: null, failed: false });
  useEffect(() => {
    let live = true;
    fn().then((data) => { if (live) setState({ key, data, failed: false }); }).catch(() => { if (live) setState({ key, data: null, failed: true }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return state.key === key ? state : { data: null, failed: false, loading: true };
}

function Tile({ p, preview }) {
  const src = p.thumb_path || p.media_path || p.video?.poster || p.item?.image;
  const ratio = p.media_width && p.media_height ? `${p.media_width} / ${p.media_height}` : '4 / 3';
  const title = p.title || p.item?.name || '';
  const body = (
    <>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--line)' }}>
        {src ? <img src={storageUrl(src)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: ratio, objectFit: 'cover', display: 'block' }} /> : <div style={{ padding: '26px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{p.caption || title}</div>}
        {p.kind === 'video' && src && <span style={{ position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={12} color="#fff" fill="#fff" /></span>}
      </div>
      {title && src && <div style={{ padding: '5px 3px 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>}
    </>
  );
  const box = { display: 'block', marginBottom: 14, breakInside: 'avoid', textDecoration: 'none', color: 'inherit' };

  return preview ? <div style={box}>{body}</div> : <Link to={`/pins/${p.id}`} style={box}>{body}</Link>;
}

function Grid({ pins, preview }) {
  return <div style={{ columnWidth: 200, columnGap: 14 }}>{pins.map((p) => <Tile key={p.id} p={p} preview={preview} />)}</div>;
}

/** A pin grid: the pins of one public board, or the newest public pins with a tag. */
export function PinsSection({ s, preview }) {
  const st = s.settings;
  const count = st.count ?? 12;
  const board = st.source !== 'tag';
  const key = board ? `b${st.board_id}` : `t${st.tag}`;
  const { data, failed, loading } = useLoad(key, () => (board
    ? (st.board_id ? worldAPI.board(st.board_id) : Promise.reject(new Error('none')))
    : (st.tag ? worldAPI.pins({ tag: st.tag }) : Promise.reject(new Error('none')))));
  const pins = (board ? data?.pins : data?.data) ?? [];

  return (
    <div>
      {heading(st.heading)}
      {loading && <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>}
      {(failed || (!loading && pins.length === 0)) && <p style={{ color: 'var(--text-tertiary)' }}>{preview ? (board ? 'Choose a public, approved board to show its pins here.' : 'Type a tag to show the pins that have it.') : 'No pins to show yet.'}</p>}
      {pins.length > 0 && <Grid pins={pins.slice(0, count)} preview={preview} />}
      {!preview && pins.length > 0 && (board ? <Link to={`/boards/${data.slug_path}`} style={more}>See the whole board ›</Link> : <Link to={`/world?tag=${encodeURIComponent(st.tag)}`} style={more}>See more #{st.tag} ›</Link>)}
    </div>
  );
}

/** A moodboard, drawn large; it links to its own page. */
export function MoodboardSection({ s, preview }) {
  const st = s.settings;
  const { data, failed, loading } = useLoad(`m${st.moodboard_id}`, () => (st.moodboard_id ? moodboardsAPI.publicGet(st.moodboard_id) : Promise.reject(new Error('none'))));
  const body = data ? <Moodboard board={data} radius={16} /> : null;

  return (
    <div>
      {heading(st.heading)}
      {loading && <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>}
      {failed && <p style={{ color: 'var(--text-tertiary)' }}>{preview ? 'Choose an approved moodboard to show it here.' : 'This moodboard is not available.'}</p>}
      {body && <div style={{ maxWidth: 760, margin: '0 auto' }}>{preview ? body : <Link to={`/moodboards/${data.slug_path}`} style={{ display: 'block' }}>{body}</Link>}</div>}
    </div>
  );
}

/** The community gallery: pins customers shared with a tag (on their public boards). */
export function GallerySection({ s, preview }) {
  const st = s.settings;
  const { data, failed, loading } = useLoad(`g${st.tag}`, () => (st.tag ? worldAPI.pins({ tag: st.tag, source: 'customer' }) : Promise.reject(new Error('none'))));
  const pins = data?.data ?? [];

  return (
    <div>
      {heading(st.heading)}
      {loading && <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>}
      {(failed || (!loading && pins.length === 0)) && <p style={{ color: 'var(--text-tertiary)' }}>{preview && !st.tag ? 'Type the tag customers will use.' : `Nothing shared yet. Save a pin to a public board with the tag #${st.tag ?? ''} and it shows here.`}</p>}
      {pins.length > 0 && <Grid pins={pins.slice(0, st.count ?? 12)} preview={preview} />}
      {!preview && st.tag && <Link to="/my/boards" style={more}>Share yours with #{st.tag} ›</Link>}
    </div>
  );
}
