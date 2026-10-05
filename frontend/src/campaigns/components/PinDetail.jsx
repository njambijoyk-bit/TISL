import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import worldAPI from '../../_shared/api/world';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { errMsg } from '../../_shared/store/helpers/apiState';

const pill = { padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' };

function Media({ p }) {
  if (p.kind === 'video' && p.video?.embed_url) {
    return <div style={{ position: 'relative', aspectRatio: p.video.provider === 'tiktok' ? '9 / 16' : '16 / 9', maxHeight: '75vh', background: '#000' }}><iframe src={p.video.embed_url} title={p.title || 'Video'} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} /></div>;
  }
  if (p.kind === 'video' && p.video?.file) {
    return <video src={storageUrl(p.video.file)} poster={p.video.poster ? storageUrl(p.video.poster) : undefined} controls playsInline style={{ width: '100%', maxHeight: '75vh', background: '#000', display: 'block' }} />;
  }
  const src = p.media_path || p.thumb_path || p.item?.image || p.video?.poster;
  if (src) return <img src={storageUrl(src)} alt={p.title || ''} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', display: 'block', background: 'var(--surface-input, rgba(148,163,184,0.12))' }} />;
  if (p.kind === 'note') return <div style={{ padding: '48px 32px', fontSize: '1.2rem', fontWeight: 600, lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{p.caption}</div>;

  return null;
}

/** One pin in full: its picture or video, words, tags, the boards it is on, and a download button when the pin allows it. */
export default function PinDetail({ id, pin: given, onTag }) {
  const [p, setP] = useState(given ?? null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let live = true;
    setGone(false);
    worldAPI.pin(id).then((r) => { if (live) setP(r); }).catch(() => { if (live) setGone(true); });
    return () => { live = false; };
  }, [id]);

  if (gone) return <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>This pin is not available any more.</p>;
  if (!p) return <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</p>;
  const download = async () => { try { await worldAPI.download(p.id); } catch (e) { toast.error(errMsg(e, 'Could not download it')); } };
  const title = p.title || p.item?.name;
  const internal = (u) => typeof u === 'string' && u.startsWith('/');

  return (
    <div>
      <Media p={p} />
      <div style={{ padding: '18px 22px 24px', display: 'grid', gap: 10 }}>
        {title && p.kind !== 'note' && <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h2>}
        {p.kind === 'item' && p.item?.price != null && <div style={{ fontWeight: 800, color: 'var(--color-primary-500)' }}>{p.item.currency ? `${p.item.currency} ` : ''}{Number(p.item.price).toLocaleString()}</div>}
        {p.kind !== 'note' && p.caption && <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{p.caption}</p>}
        {p.credit && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Credit: {p.credit}</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {p.kind === 'item' && p.item?.link && (internal(p.item.link)
            ? <Link to={p.item.link} style={{ ...pill, background: 'var(--color-primary-500)', color: '#fff', border: 0 }}>View it</Link>
            : <a href={p.item.link} style={{ ...pill, background: 'var(--color-primary-500)', color: '#fff', border: 0 }}>View it</a>)}
          {p.kind === 'link' && p.link_url && <a href={p.link_url} target="_blank" rel="noopener noreferrer nofollow" style={{ ...pill, background: 'var(--color-primary-500)', color: '#fff', border: 0 }}><ExternalLink size={14} /> Open link</a>}
          {p.can_download && <button type="button" onClick={download} style={{ ...pill, background: 'transparent', color: 'var(--text-primary)', border: '1.5px solid var(--line)' }}><Download size={14} /> Download</button>}
        </div>
        {p.tags?.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{p.tags.map((t) => (onTag
          ? <button key={t} type="button" onClick={() => onTag(t)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', color: 'var(--color-primary-500)', fontWeight: 600, padding: 0 }}>#{t}</button>
          : <Link key={t} to={`/world?tag=${encodeURIComponent(t)}`} style={{ fontSize: '0.8rem', color: 'var(--color-primary-500)', fontWeight: 600 }}>#{t}</Link>))}</div>}
        {p.boards?.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>On {p.boards.map((b, i) => <span key={b.id}>{i > 0 && ', '}<Link to={`/boards/${b.slug_path}`} style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{b.title}</Link></span>)}</div>
        )}
      </div>
    </div>
  );
}
