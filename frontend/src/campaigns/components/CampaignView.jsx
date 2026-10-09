import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { itemKey } from '../lib/itemKey';
import { PinsSection, MoodboardSection, GallerySection } from './WorldSections';

const money = (n, code) => (n == null ? '' : `${code ?? ''} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim());
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
/** A link that stays inside the site (no page reload) when it is a path, and opens a new tab when it is an outside address. */
function A({ href, children, ...rest }) {
  return /^\//.test(href) ? <Link to={href} {...rest}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);

  return now;
}

const heading = (text) => (text ? <h2 style={{ margin: '0 0 14px', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{text}</h2> : null);
const button = (label, href) => (label && href ? <A href={href} style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 10, background: 'var(--campaign-accent)', color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: '0.9rem' }}>{label}</A> : null);

function Hero({ s, campaign }) {
  const img = s.settings.image || campaign.cover_media;
  const left = s.settings.align === 'left';

  return (
    <div style={{ position: 'relative', minHeight: 280, borderRadius: 16, overflow: 'hidden', background: 'var(--campaign-accent)', display: 'flex', alignItems: 'flex-end' }}>
      {img && <img src={storageUrl(img)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.05) 70%)' }} />
      <div style={{ position: 'relative', padding: '28px 26px', width: '100%', textAlign: left ? 'left' : 'center', color: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.7rem, 5vw, 2.8rem)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff' }}>{s.settings.headline || campaign.title}</h1>
        {s.settings.subheadline && <p style={{ margin: '10px 0 0', fontSize: '1.05rem', opacity: 0.92, color: '#fff' }}>{s.settings.subheadline}</p>}
        {s.settings.button_label && s.settings.button_link && <div style={{ marginTop: 16 }}>{button(s.settings.button_label, s.settings.button_link)}</div>}
      </div>
    </div>
  );
}

function Story({ s }) {
  const paras = String(s.settings.body ?? '').split(/\n{2,}/).filter((p) => p.trim());

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {heading(s.settings.heading)}
      {paras.length ? paras.map((p, i) => <p key={i} style={{ margin: '0 0 14px', lineHeight: 1.75, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontSize: '1rem' }}>{p}</p>) : <p style={{ color: 'var(--text-tertiary)' }}>Your story goes here.</p>}
    </div>
  );
}

function Countdown({ s, campaign }) {
  const t = s.settings.target ?? 'start';
  const target = t === 'end' ? campaign.ends_at : t === 'custom' ? s.settings.custom_at : campaign.starts_at;
  const now = useNow(true);
  const ms = target ? new Date(target).getTime() - now : null;
  const cell = (n, l) => <div key={l} style={{ textAlign: 'center', minWidth: 64 }}><div style={{ fontSize: 'clamp(1.6rem, 5vw, 2.4rem)', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'var(--campaign-accent)' }}>{String(n).padStart(2, '0')}</div><div style={{ fontSize: '0.66rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{l}</div></div>;

  return (
    <div style={{ textAlign: 'center' }}>
      {heading(s.settings.heading)}
      {ms == null ? <p style={{ color: 'var(--text-tertiary)' }}>Set a date for this countdown.</p>
        : ms <= 0 ? <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.settings.done_text || 'It is here'}</p>
          : <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>{[[Math.floor(ms / 864e5), 'days'], [Math.floor(ms / 36e5) % 24, 'hours'], [Math.floor(ms / 6e4) % 60, 'minutes'], [Math.floor(ms / 1e3) % 60, 'seconds']].map(([n, l]) => cell(n, l))}</div>}
    </div>
  );
}

function Video({ s }) {
  const [playing, setPlaying] = useState(false);
  const v = s.settings.video;
  const poster = s.settings.poster ? storageUrl(s.settings.poster) : v?.thumb;
  const upload = s.settings.source === 'upload' && s.settings.file;
  const frame = { position: 'relative', aspectRatio: v?.provider === 'tiktok' ? '9 / 14' : '16 / 9', maxWidth: v?.provider === 'tiktok' ? 340 : 860, margin: '0 auto', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-input, #111)' };

  return (
    <div>
      {heading(s.settings.heading)}
      {upload ? (
        <div style={{ ...frame, aspectRatio: '16 / 9' }}><video src={storageUrl(s.settings.file)} poster={poster || undefined} controls preload="metadata" playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
      ) : v ? (
        <div style={frame}>
          {playing
            ? <iframe src={v.embed_url} title={s.settings.heading || 'Video'} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            : <button type="button" onClick={() => setPlaying(true)} aria-label="Play the video" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', padding: 0, cursor: 'pointer', background: poster ? `center / cover url(${poster})` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={28} fill="#fff" /></span>
            </button>}
        </div>
      ) : <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Add a video link or upload a video.</p>}
    </div>
  );
}

function Products({ s, items, resolved }) {
  const list = s.settings.layout === 'list';
  const now = Date.now();

  return (
    <div>
      {heading(s.settings.heading)}
      {items.length === 0 ? <p style={{ color: 'var(--text-tertiary)' }}>No items chosen yet.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: list ? '1fr' : 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
          {items.map((it) => {
            const r = resolved[itemKey(it.item_type, it.item_id, it.variant_id)];
            const soon = it.available_from && new Date(it.available_from).getTime() > now;
            const live = r?.link && !soon;
            const Tag = live ? A : 'div';

            return (
              <Tag key={itemKey(it.item_type, it.item_id, it.variant_id)} {...(live ? { href: r.link, 'data-item': '1' } : {})} style={{ display: 'flex', flexDirection: list ? 'row' : 'column', gap: 12, textDecoration: 'none', color: 'inherit', background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', opacity: r?.available === false ? 0.5 : 1 }}>
                <div style={{ position: 'relative', width: list ? 120 : '100%', aspectRatio: list ? '1 / 1' : '4 / 5', background: 'var(--surface-input, rgba(148,163,184,0.15))', flexShrink: 0 }}>
                  {r?.image && <img src={storageUrl(r.image)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {soon && <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 9px', borderRadius: 999, background: 'var(--campaign-accent)', color: '#fff', fontSize: '0.66rem', fontWeight: 800 }}>COMING {when(it.available_from).toUpperCase()}</span>}
                </div>
                <div style={{ padding: list ? '10px 14px 10px 0' : '0 12px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{it.label_override || r?.name || 'No longer available'}</div>
                  {!it.label_override && r?.variant && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.variant}</div>}
                  {r?.price != null && <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{money(r.price, r.currency)}</div>}
                  <div style={{ fontSize: '0.66rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{it.item_type}</div>
                </div>
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Cta({ s }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      {heading(s.settings.heading)}
      {s.settings.text && <p style={{ margin: '0 auto 16px', maxWidth: 560, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{s.settings.text}</p>}
      {button(s.settings.button_label, s.settings.button_link) ?? <p style={{ color: 'var(--text-tertiary)' }}>Add a button label and link.</p>}
    </div>
  );
}

/**
 * A campaign page: its sections in order. Used for the live preview in the editor and (next) for the public page.
 * `sections` carry their own `items` (for products sections); `resolved` holds the live name, price and picture of each featured item, keyed "type:id".
 * `track(event, sectionId)`, when given (the public page), is told about clicks on buttons and on featured items.
 * In the preview, every section shows with a small note when it is scheduled; the public page leaves out sections that are not due.
 */
export default function CampaignView({ campaign, sections, resolved = {}, preview = false, track }) {
  return (
    <div style={{ '--campaign-accent': campaign.accent_color || 'var(--color-primary-500)', display: 'grid', gap: 34, color: 'var(--text-primary)' }}>
      {sections.map((s) => (
        <section key={s.key ?? s.id} onClick={track ? (e) => { const a = e.target.closest('a'); if (a) track(a.dataset.item ? 'item_click' : 'click', s.id); } : undefined}>
          {preview && (s.show_from || s.show_until) && <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', margin: '0 0 6px' }}>Scheduled: {s.show_from ? `from ${when(s.show_from)}` : ''} {s.show_until ? `until ${when(s.show_until)}` : ''}</div>}
          {s.type === 'hero' && <Hero s={s} campaign={campaign} />}
          {s.type === 'story' && <Story s={s} />}
          {s.type === 'countdown' && <Countdown s={s} campaign={campaign} />}
          {s.type === 'video' && <Video s={s} />}
          {s.type === 'products' && <Products s={s} items={s.items ?? []} resolved={resolved} />}
          {s.type === 'cta' && <Cta s={s} />}
          {s.type === 'pins' && <PinsSection s={s} preview={preview} />}
          {s.type === 'moodboard' && <MoodboardSection s={s} preview={preview} />}
          {s.type === 'gallery' && <GallerySection s={s} preview={preview} />}
        </section>
      ))}
      {sections.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>No sections yet.</p>}
    </div>
  );
}
