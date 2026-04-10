import {
  FeaturesSection,
  StatsSection,
  CtaSection,
  GallerySection,
  MissionVisionSection,
  ValuesSection,
  TeamSection,
  ContactInfoSection,
  FaqSection,
  LinksSection,
  RichTextSection,
  TextSection,
  CustomSection,
} from './sections';

// NOTE: HeroSection is intentionally excluded here.
// All hero-type sections are grouped and rendered as HeroCarousel
// by ContentPage.jsx before non-hero sections are rendered.

const RENDERERS = {
  features:        FeaturesSection,
  stats:           StatsSection,
  cta:             CtaSection,
  gallery:         GallerySection,
  mission_vision:  MissionVisionSection,
  values:          ValuesSection,
  team:            TeamSection,
  contact_info:    ContactInfoSection,
  faq:             FaqSection,
  links:           LinksSection,
  rich_text:       RichTextSection,
  text:            TextSection,
  custom:          CustomSection,
};

/**
 * Resolves section_type to the correct renderer component.
 * Hero sections are handled upstream by ContentPage — silently ignored here.
 */
export default function SectionRenderer({ section }) {
  if (!section?.is_active) return null;

  const Component = RENDERERS[section.section_type];
  if (!Component) return null;

  return <Component section={section} />;
}