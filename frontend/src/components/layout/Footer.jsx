import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Globe } from 'lucide-react';
import useContentStore from '../../store/contentStore';

// ─────────────────────────────────────────────────────────────────────────────
// Social icon resolver
// Seeder stores: { label: 'Facebook', url: '#', icon: 'facebook' }
// ─────────────────────────────────────────────────────────────────────────────

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
      className="text-gray-400 hover:text-primary-500 transition-colors"
    >
      <Icon size={20} />
    </a>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────

const BrandSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-9 w-16 bg-gray-700 rounded" />
    <div className="h-3 w-52 bg-gray-800 rounded" />
    <div className="h-3 w-40 bg-gray-800 rounded" />
    <div className="flex gap-3 mt-3">
      {[0,1,2,3].map(i => <div key={i} className="w-5 h-5 bg-gray-700 rounded" />)}
    </div>
  </div>
);

const ColumnSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-4 w-24 bg-gray-700 rounded" />
    {[0,1,2,3].map(i => <div key={i} className="h-3 w-32 bg-gray-800 rounded" />)}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────
//
// Seeder creates these sections in the footer page:
//
//   section_key   section_type   contains
//   ─────────────────────────────────────────────────────────────
//   brand_info    custom         title  = logo text
//                                content = tagline
//                                items  = [{ label, url, icon }] (socials)
//
//   company_links links          title  = column heading
//   shop_links    links          items  = [{ label, url }]
//   account_links links
//
//   copyright_text text          content = copyright string
//
// All values are editable from the FooterSettings admin page.
// ─────────────────────────────────────────────────────────────────────────────

export default function Footer() {
  const { footerPage, loading, fetchFooterPage } = useContentStore();

  useEffect(() => {
    fetchFooterPage(); // no-op if already loaded
  }, []);

  // ── Parse sections ──────────────────────────────────────────────────────
  const sections = footerPage?.active_sections ?? footerPage?.activeSections ?? [];

  const brandSection     = sections.find(s => s.section_key  === 'brand_info'      && s.is_active);
  const linkColumns      = sections.filter(s => s.section_type === 'links'          && s.is_active);
  const copyrightSection = sections.find(s => s.section_key  === 'copyright_text'  && s.is_active);

  // ── Brand values ────────────────────────────────────────────────────────
  const logoText  = brandSection?.title   ?? 'TISL';
  const tagline   = brandSection?.content ?? '';
  const socials   = brandSection?.items   ?? [];   // [{ label, url, icon }]

  // ── Copyright ───────────────────────────────────────────────────────────
  const copyright = copyrightSection?.content
    ?? `© ${new Date().getFullYear()} Target Industrial Suppliers Limited. All rights reserved.`;

  const isLoading = loading.footer && sections.length === 0;

  return (
    <footer className="bg-gray-900 text-gray-300">

      {/* ── Main grid ── */}
      <div className="container mx-auto px-4 py-12">
        <div style={{
          display: 'grid',
          gridTemplateColumns: `2fr ${linkColumns.length > 0 ? `repeat(${linkColumns.length}, 1fr)` : ''}`,
          gap: '32px',
          alignItems: 'start',
        }}>

          {/* ── Brand block ── */}
          {isLoading ? <BrandSkeleton /> : (
            <div>
              {/* Logo pill */}
              <div className="inline-flex items-center mb-4">
                <div className="bg-primary-500 text-white font-bold text-2xl px-3 py-1 rounded">
                  {logoText}
                </div>
              </div>

              {/* Tagline */}
              {tagline && (
                <p className="text-sm leading-relaxed mb-5">{tagline}</p>
              )}

              {/* Social icons */}
              {socials.length > 0 && (
                <div className="flex items-center gap-4">
                  {socials.map((item, i) => (
                    <SocialLink key={i} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CMS link columns ── */}
          {isLoading
            ? [0,1,2].map(i => <ColumnSkeleton key={i} />)
            : linkColumns.map(section => (
                <div key={section.id}>
                  <h3 className="text-white font-semibold text-lg mb-4">
                    {section.title}
                  </h3>
                  <ul className="space-y-2">
                    {(section.items ?? []).map((item, i) => (
                      <li key={i}>
                        <Link
                          to={item.url}
                          className="text-sm hover:text-primary-500 transition-colors"
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
      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">

            {/* Copyright — from DB */}
            <p className="text-sm text-center md:text-left">
              {isLoading
                ? <span className="inline-block h-3 w-72 bg-gray-800 rounded animate-pulse" />
                : copyright
              }
            </p>

            {/* Legal links — static (rarely change, no need to CMS-ify) */}
            <div className="flex gap-6 text-sm flex-wrap justify-center">
              <Link to="/privacy" className="hover:text-primary-500 transition-colors">Privacy Policy</Link>
              <Link to="/terms"   className="hover:text-primary-500 transition-colors">Terms of Service</Link>
              <Link to="/cookies" className="hover:text-primary-500 transition-colors">Cookie Policy</Link>
            </div>

          </div>
        </div>
      </div>

    </footer>
  );
}