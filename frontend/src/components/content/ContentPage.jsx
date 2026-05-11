import { useEffect, useMemo } from 'react';
import useContentStore from '../../store/contentStore';
import SectionRenderer from './SectionRenderer';
import { HeroCarousel, MissionVisionSection, FeaturesSection, StatsSection, CtaSection, GallerySection, ValuesSection, TeamSection, ContactInfoSection, FaqSection, LinksSection, RichTextSection, TextSection, CustomSection } from './sections';
import Header from '../layout/Header';
import Footer from '../layout/Footer';

const MULTI_RENDERERS = {
  mission_vision: MissionVisionSection,
  cta:            CtaSection,
  stats:          StatsSection,
  features:       FeaturesSection,
  gallery:        GallerySection,
  values:         ValuesSection,
  team:           TeamSection,
  faq:            FaqSection,
};

export default function ContentPage({ slug, loadingRows = 3 }) {
  const { publicPage, loading, fetchPublicPage, clearPublicPage } = useContentStore();

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchPublicPage(slug);
    return () => clearPublicPage();
  }, [slug]);

  const pageType = publicPage?.page_type ?? null;

  const { heroSections, otherSections } = useMemo(() => {
    const raw    = publicPage?.active_sections ?? publicPage?.activeSections ?? [];
    const sorted = [...raw].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      heroSections:  sorted.filter(s => s.section_type === 'hero'),
      otherSections: sorted.filter(s => s.section_type !== 'hero'),
    };
  }, [publicPage]);

  const groupedSections = useMemo(() => {
    // Group ALL sections of the same type together, preserving
    // the position of the FIRST occurrence of each type
    const typeOrder = [];
    const typeMap = {};

    otherSections.forEach(section => {
        const type = section.section_type;
        if (!typeMap[type]) {
        typeMap[type] = [];
        typeOrder.push(type);
        }
        typeMap[type].push(section);
    });

    return typeOrder.map(type => ({
        type,
        sections: typeMap[type],
        id: typeMap[type][0].id,
    }));
    }, [otherSections]);

  if (loading.public && !publicPage) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <Header />
        <div className="h-[480px] bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="max-w-6xl mx-auto px-6 py-16 space-y-10">
          {Array.from({ length: loadingRows }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <Footer />
      </div>
    );
  }

  if (!loading.public && !publicPage) {
    return (
      <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-6xl font-black text-gray-200 dark:text-gray-800 mb-4">404</p>
            <p className="text-[15px] text-gray-400 dark:text-gray-500">
              This page is not available right now.
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header />

      {heroSections.length > 0 && (
        <HeroCarousel sections={heroSections} pageType={pageType} />
      )}

      {groupedSections.map(group => {
        const Component = MULTI_RENDERERS[group.type];
        if (group.sections.length > 1 && Component) {
          return <Component key={group.id} section={group.sections} />;
        }
        return <SectionRenderer key={group.id} section={group.sections[0]} />;
      })}

      <Footer />
    </div>
  );
}