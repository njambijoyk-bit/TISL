import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Globe, Mail, Phone, MapPin } from 'lucide-react';
import useContentStore from '../../store/contentStore';

// ── Social icon resolver ───────────────────────────────────────────────────────
const SOCIAL_ICONS = {
  facebook:  Facebook,
  twitter:   Twitter,
  instagram: Instagram,
  linkedin:  Linkedin,
  youtube:   Youtube,
};

const SocialLink = ({ item }) => {
  const key  = (item.icon ?? item.label ?? '').toLowerCase();
  const Icon = SOCIAL_ICONS[key] ?? Globe;
  return (
    <a
      href={item.url ?? '#'}
      target={item.url && item.url !== '#' ? '_blank' : undefined}
      rel="noopener noreferrer"
      aria-label={item.label ?? item.icon}
      style={{
        width: 34, height: 34, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)',
        boxShadow: '0 0 8px color-mix(in srgb, var(--color-primary-500) 8%, transparent)',
        color: '#9ca3af', transition: 'all 150ms ease',
        textDecoration: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-primary-500)';
        e.currentTarget.style.color = 'var(--color-primary-500)';
        e.currentTarget.style.boxShadow = '0 0 16px color-mix(in srgb, var(--color-primary-500) 35%, transparent)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)';
        e.currentTarget.style.color = '#9ca3af';
        e.currentTarget.style.boxShadow = '0 0 8px color-mix(in srgb, var(--color-primary-500) 8%, transparent)';
      }}
    >
      <Icon size={15} />
    </a>
  );
};

// ── Skeletons ──────────────────────────────────────────────────────────────────
const Skel = ({ w, h = 12, r = 4 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', animation: 'skel-pulse 1.8s ease-in-out infinite' }} />
);

// ── Flexible section matcher ───────────────────────────────────────────────────
// Checks BOTH section_type AND section_key to catch CMS variations
const matchesSection = (section, type, key) => {
  if (!section?.is_active) return false;
  if (type && section.section_type === type) return true;
  if (key && section.section_key === key) return true;
  // Fallback: check if either field contains the keyword (case-insensitive)
  const st = (section.section_type ?? '').toLowerCase();
  const sk = (section.section_key ?? '').toLowerCase();
  const t = (type ?? '').toLowerCase();
  const k = (key ?? '').toLowerCase();
  return st.includes(t) || sk.includes(k) || st.includes(k) || sk.includes(t);
};

// ── Footer ─────────────────────────────────────────────────────────────────────
export default function Footer() {
  const { footerPage, loading, fetchFooterPage } = useContentStore();

  useEffect(() => { fetchFooterPage(); }, [fetchFooterPage]);

  const sections = useMemo(() => {
    const raw = footerPage?.active_sections ?? footerPage?.activeSections ?? [];
    return raw.filter(s => s.is_active !== false); // keep active or undefined
  }, [footerPage]);

  // 🔍 Flexible matching: brand section (checks type OR key)
  const brandSection = useMemo(() => 
    sections.find(s => matchesSection(s, 'custom', 'brand_info')),
    [sections]
  );

  // 🔍 Flexible matching: link columns (checks type 'links' OR key containing 'footer')
  const linkColumns = useMemo(() => 
    sections.filter(s => matchesSection(s, 'links', 'footer_links')),
    [sections]
  );

  // 🔍 Flexible matching: copyright (checks type OR key)
  const copyrightSection = useMemo(() => 
    sections.find(s => matchesSection(s, 'text', 'copyright_text')),
    [sections]
  );

  const logoText    = brandSection?.title       ?? 'TISL';
  const subtitle    = brandSection?.subtitle    ?? null;
  const tagline     = brandSection?.content     ?? 'Quality products & professional services in Nairobi.';
  const logoImage   = brandSection?.image_url   ?? null;
  const buttonText  = brandSection?.button_text ?? null;
  const buttonLink  = brandSection?.button_link ?? null;
  const socials     = brandSection?.items       ?? [];

  const copyright = copyrightSection?.content
    ?? `© ${new Date().getFullYear()} Target Industrial Suppliers Limited. All rights reserved.`;

  const isLoading = loading.footer && sections.length === 0;

  return (
    <footer style={{ background: '#0d0d12', color: 'var(--text-secondary)', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', boxShadow: '0 -4px 40px color-mix(in srgb, var(--color-primary-500) 6%, transparent)' }}>
      
      <style>{`
        @keyframes skel-pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        .footer-outer {
          max-width: 1200px;
          margin: 0 auto;
          padding: 56px 24px 40px;
          display: grid;
          grid-template-columns: minmax(200px, 280px) 1fr;
          gap: 40px;
          align-items: start;
        }
        .footer-links-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 40px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .footer-outer {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ── Main grid ── */}
      <div className="footer-outer">

        {/* ── Brand block ── */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skel w={52} h={32} r={8} />
            <Skel w={200} />
            <Skel w={160} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {[0,1,2,3].map(i => <Skel key={i} w={34} h={34} r={99} />)}
            </div>
          </div>
        ) : (
          <div>
            {/* Logo */}
            {logoImage ? (
              <img
                src={logoImage}
                alt={logoText}
                style={{ height: 40, objectFit: 'contain', marginBottom: 16 }}
              />
            ) : (
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                color: 'white', fontWeight: 900, fontSize: '1.3rem',
                padding: '6px 14px', borderRadius: 10, letterSpacing: '-0.02em',
                boxShadow: '0 4px 18px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
                marginBottom: 16,
              }}>
                {logoText}
              </div>
            )}

            {/* Subtitle */}
            {subtitle && (
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-primary-300)', marginBottom: 6, letterSpacing: '0.02em' }}>
                {subtitle}
              </p>
            )}

            {/* Tagline / content */}
            {tagline && (
              <p style={{ fontSize: '0.82rem', lineHeight: 1.7, marginBottom: 20, color: '#6b7280', maxWidth: 220 }}>
                {tagline}
              </p>
            )}

            {/* Quick contact hints */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {[
                { Icon: Mail,   text: 'web@targetisl.co.ke' },
                { Icon: Phone,  text: '+254 700 000 000' },
                { Icon: MapPin, text: 'Nairobi, Kenya' },
              ].map(({ Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#6b7280' }}>
                  <Icon size={13} style={{ color: 'var(--color-primary-300)', flexShrink: 0 }} />
                  {text}
                </div>
              ))}
            </div>

            {/* CTA button */}
            {buttonText && buttonLink && (
              <Link
                to={buttonLink}
                style={{
                  display: 'inline-block', marginBottom: 20,
                  padding: '7px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                  color: 'white', textDecoration: 'none',
                  boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                {buttonText}
              </Link>
            )}

            {/* Socials */}
            {socials.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {socials.map((item, i) => <SocialLink key={i} item={item} />)}
              </div>
            )}
          </div>
        )}

        {/* ── CMS link columns ── */}
        <div className="footer-links-grid">
        {isLoading
          ? [0,1,2].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Skel w={90} h={14} />
                {[0,1,2,3].map(j => <Skel key={j} w={`${100 + j * 10}px`} />)}
              </div>
            ))
          : linkColumns.length > 0 
            ? linkColumns.map(section => (
                <div key={section.id}>
                  <h3 style={{ color: 'var(--color-primary-300)', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20, margin: '0 0 20px' }}>
                    {section.title}
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(section.items ?? []).map((item, i) => (
                      <li key={i}>
                        <Link
                          to={item.url}
                          style={{ fontSize: '0.82rem', color: '#6b7280', textDecoration: 'none', transition: 'color 150ms ease' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary-300)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            : /* Fallback: show default link columns if CMS has none */
              [
                { title: 'Products', items: [{ label: 'All Products', url: '/products' }, { label: 'Deals', url: '/specials' }, { label: 'New Arrivals', url: '/products?is_new=true' }] },
                { title: 'Company', items: [{ label: 'About', url: '/about' }, { label: 'Contact', url: '/contact' }, { label: 'Request Quote', url: '/request-quote' }] },
                { title: 'Support', items: [{ label: 'FAQ', url: '/faq' }, { label: 'Shipping', url: '/shipping' }, { label: 'Returns', url: '/returns' }] },
              ].map((col, idx) => (
                <div key={idx}>
                  <h3 style={{ color: 'var(--color-primary-300)', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20, margin: '0 0 20px' }}>
                    {col.title}
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {col.items.map((item, i) => (
                      <li key={i}>
                        <Link
                          to={item.url}
                          style={{ fontSize: '0.82rem', color: '#6b7280', textDecoration: 'none', transition: 'color 150ms ease' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary-300)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
        }
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)', padding: '18px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.75rem', color: '#4b5563', margin: 0 }}>
            {isLoading
              ? <span style={{ display: 'inline-block', height: 12, width: 280, background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', borderRadius: 4, animation: 'skel-pulse 1.8s ease-in-out infinite' }} />
              : copyright
            }
          </p>
          <p style={{ fontSize: '0.75rem', color: '#4b5563', margin: 0, textAlign: 'center', flex: '1 1 auto' }}>
            App Version 2.1.9. Made with <span role="img" aria-label="love" style={{ color: '#ef4444' }}>♥</span> by Mimi
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms'], ['Cookie Policy', '/cookies']].map(([label, to]) => (
              <Link key={to} to={to} style={{ fontSize: '0.75rem', color: '#4b5563', textDecoration: 'none', transition: 'color 150ms ease' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-primary-300)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#4b5563'; }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}