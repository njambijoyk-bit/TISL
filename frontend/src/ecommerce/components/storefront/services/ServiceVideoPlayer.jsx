import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

/** `video` is what the server sends for a service: { kind: 'upload'|'embed', url, embed_url, provider, thumb }. */

/** Can a short silent preview play when the pointer rests on a card? Uploads, YouTube and Vimeo can; TikTok and Facebook cannot autoplay. */
const canPreview = (video) => Boolean(video) && (video.kind === 'upload' || ['youtube', 'vimeo'].includes(video.provider));

const embedUrl = (video, { sound = false, controls = false } = {}) => {
  const sep = video.embed_url.includes('?') ? '&' : '?';
  if (video.provider === 'youtube') {
    const id = video.embed_url.split('/embed/')[1]?.split('?')[0];
    return `${video.embed_url}${sep}autoplay=1&mute=${sound ? 0 : 1}&loop=1&playlist=${id}&controls=${controls ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`;
  }
  if (video.provider === 'vimeo') return `${video.embed_url}${sep}autoplay=1&muted=${sound ? 0 : 1}&loop=1${controls ? '' : '&background=1'}`;

  return `${video.embed_url}${video.embed_url.includes('?') ? '&' : '?'}autoplay=1`;
};

const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#000' };

/**
 * A silent preview over a card's picture while the pointer is on it. It starts after a short pause (so passing across a grid starts nothing) and is gone the moment
 * the pointer leaves. Touch screens that cannot hover never start it.
 */
export function HoverVideo({ video, hovering }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!hovering || !canPreview(video)) { setOn(false); return undefined; }
    const t = setTimeout(() => setOn(true), 250);
    return () => clearTimeout(t);
  }, [hovering, video]);
  if (!on) return null;

  return video.kind === 'upload'
    ? <video src={video.url} autoPlay muted loop playsInline style={{ ...fill, objectFit: 'cover' }} />
    : <iframe title="Preview" src={embedUrl(video)} allow="autoplay; encrypted-media" style={{ ...fill, pointerEvents: 'none' }} />;
}

/**
 * The video in the detail gallery. It plays only while it is the chosen item, is at least half on screen and the browser tab is showing, so there is never sound
 * with nothing to see. It starts muted (browsers refuse sound before a tap); the player's own controls give sound.
 */
export function DetailVideo({ video, active, poster }) {
  const box = useRef(null);
  const vid = useRef(null);
  const [inView, setInView] = useState(false);
  const [tabOn, setTabOn] = useState(typeof document === 'undefined' ? true : document.visibilityState === 'visible');
  const [armed, setArmed] = useState(false);   // the visitor pressed play: an embed may start with sound
  const playing = active && inView && tabOn;

  useEffect(() => {
    if (!box.current || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(box.current);

    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const f = () => setTabOn(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', f);

    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (playing) v.play().catch(() => {}); else v.pause();
  }, [playing]);
  useEffect(() => { if (!active) setArmed(false); }, [active]);

  return (
    <div ref={box} style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {video.kind === 'upload' && <video ref={vid} src={video.url} poster={poster || undefined} muted loop playsInline controls preload="metadata" style={{ ...fill, objectFit: 'contain' }} />}
      {video.kind === 'embed' && playing && <iframe title="Service video" src={embedUrl(video, { sound: armed, controls: true })} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen style={fill} />}
      {video.kind === 'embed' && !playing && (
        <button type="button" onClick={() => { setArmed(true); setInView(true); }} aria-label="Play video" style={{ ...fill, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {(video.thumb || poster) && <img src={video.thumb || poster} alt="" style={{ ...fill, objectFit: 'cover', opacity: 0.85 }} />}
          <span style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={24} fill="#fff" /></span>
        </button>
      )}
    </div>
  );
}
