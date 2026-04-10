// ─────────────────────────────────────────────────────────────────────────────
// Section type options per page_type
// Only shows valid section types in the "Add Section" dropdown.
// ─────────────────────────────────────────────────────────────────────────────

export const SECTION_TYPES_BY_PAGE = {
  homepage: [
    { value: 'hero',     label: 'Hero' },
    { value: 'features', label: 'Features' },
    { value: 'stats',    label: 'Stats' },
    { value: 'cta',      label: 'Call to Action' },
    { value: 'gallery',  label: 'Gallery' },
    { value: 'custom',   label: 'Custom' },
  ],
  about: [
    { value: 'hero',            label: 'Hero' },
    { value: 'mission_vision',  label: 'Mission & Vision' },
    { value: 'values',          label: 'Values' },
    { value: 'team',            label: 'Team' },
    { value: 'stats',           label: 'Stats' },
    { value: 'cta',             label: 'Call to Action' },
    { value: 'custom',          label: 'Custom' },
  ],
  contact: [
    { value: 'hero',          label: 'Hero' },
    { value: 'contact_info',  label: 'Contact Info' },
    { value: 'faq',           label: 'FAQ' },
    { value: 'cta',           label: 'Call to Action' },
    { value: 'custom',        label: 'Custom' },
  ],
  manual: [
    { value: 'rich_text', label: 'Rich Text' },
    { value: 'faq',       label: 'FAQ' },
    { value: 'links',     label: 'Links' },
    { value: 'text',      label: 'Text' },
    { value: 'custom',    label: 'Custom' },
  ],
  footer: [
    { value: 'links', label: 'Links' },
    { value: 'text',  label: 'Text' },
    { value: 'custom', label: 'Custom' },
  ],
};

// Fallback: all types (used for 'custom' page_type or unknown)
export const ALL_SECTION_TYPES = [
  { value: 'hero',           label: 'Hero' },
  { value: 'text',           label: 'Text' },
  { value: 'rich_text',      label: 'Rich Text' },
  { value: 'mission_vision', label: 'Mission & Vision' },
  { value: 'values',         label: 'Values' },
  { value: 'features',       label: 'Features' },
  { value: 'stats',          label: 'Stats' },
  { value: 'team',           label: 'Team' },
  { value: 'gallery',        label: 'Gallery' },
  { value: 'contact_info',   label: 'Contact Info' },
  { value: 'faq',            label: 'FAQ' },
  { value: 'cta',            label: 'Call to Action' },
  { value: 'links',          label: 'Links' },
  { value: 'custom',         label: 'Custom' },
];

export const getSectionTypes = (pageType) =>
  SECTION_TYPES_BY_PAGE[pageType] ?? ALL_SECTION_TYPES;

// ─────────────────────────────────────────────────────────────────────────────
// Field visibility rules
// Returns which fields are shown (and whether required) for a given
// section_type + page_type combination.
//
// Shape: { show: boolean, required: boolean }
// ─────────────────────────────────────────────────────────────────────────────

export const getFieldConfig = (sectionType, pageType) => {
  const on  = (required = true)  => ({ show: true,  required });
  const off = ()                  => ({ show: false, required: false });
  const opt = ()                  => ({ show: true,  required: false });

  const config = {
    // title is always shown and always required (enforced at DB level too)
    title: on(),
    subtitle:     off(),
    content:      off(),
    image_url:    off(),
    button_text:  off(),
    button_link:  off(),
    items:        off(),
    settings:     opt(), // always available but never required
  };

  switch (sectionType) {
    case 'hero':
      config.subtitle = on();
      if (pageType === 'homepage') {
        config.content     = on();
        config.image_url   = on();
        config.button_text = on();
        config.button_link = on();
      }
      if (pageType === 'about') {
        config.image_url = on();
        config.content     = opt(); // optional descriptive body
        config.button_text = opt(); // optional CTA
        config.button_link = opt();
      }
      // contact hero
      break;

    case 'mission_vision':
      config.subtitle = on();
      config.content  = on();
      config.image_url  = opt(); // optional illustration / banner per section
      break;

    case 'values':
    case 'features':
      config.subtitle = on();
      config.items    = on();
      break;

    case 'stats':
      config.items = on();
      break;

    case 'team':
      config.subtitle = on();
      config.items    = on();
      break;

    case 'gallery':
      config.items = on();
      break;

    case 'contact_info':
      config.subtitle = on();
      config.items    = on();
      break;

    case 'faq':
      config.subtitle = on();
      config.items    = on();
      break;

    case 'cta':
      config.subtitle    = on();
      config.content     = on();
      config.button_text = on();
      config.button_link = on();
      if (pageType === 'homepage') {
        config.image_url = on();
      }
      break;

    case 'links':
      if (pageType !== 'footer') {
        config.subtitle = on();
      }
      config.items = on();
      break;

    case 'rich_text':
      config.subtitle = on();
      config.content  = on();
      break;

    case 'text':
      config.content = on();
      break;

    case 'custom':
      // show everything as optional
      config.subtitle    = opt();
      config.content     = opt();
      config.image_url   = opt();
      config.button_text = opt();
      config.button_link = opt();
      config.items       = opt();
      break;

    default:
      break;
  }

  return config;
};

// ─────────────────────────────────────────────────────────────────────────────
// Items schema per section_type
// Drives the structured ItemsEditor column definitions.
// ─────────────────────────────────────────────────────────────────────────────

export const ITEMS_SCHEMA = {
  features: [
    { key: 'title',       label: 'Title',       type: 'text',     required: true },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'icon',        label: 'Icon',        type: 'text',     required: true, placeholder: 'e.g. star, check, shield' },
  ],
  values: [
    { key: 'title',       label: 'Title',       type: 'text',     required: true },
    { key: 'description', label: 'Description', type: 'textarea', required: true },
    { key: 'icon',        label: 'Icon',        type: 'text',     required: true, placeholder: 'e.g. star, check, shield' },
  ],
  stats: [
    { key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. Happy Clients' },
    { key: 'value', label: 'Value', type: 'text', required: true, placeholder: 'e.g. 1,200+' },
  ],
  team: [
    { key: 'name',      label: 'Name',      type: 'text',     required: true },
    { key: 'role',      label: 'Role',      type: 'text',     required: true },
    { key: 'image_url', label: 'Photo',     type: 'image',    required: true },
    { key: 'bio',       label: 'Bio',       type: 'textarea', required: true },
  ],
  gallery: [
    { key: 'url',     label: 'Image',   type: 'image', required: true },
    { key: 'caption', label: 'Caption', type: 'text',  required: true },
  ],
  faq: [
    { key: 'question', label: 'Question', type: 'text',     required: true },
    { key: 'answer',   label: 'Answer',   type: 'textarea', required: true },
  ],
  // links schema varies: icon is required for manual, optional for footer
  links: [
    { key: 'label', label: 'Label', type: 'text', required: true },
    { key: 'url',   label: 'URL',   type: 'text', required: true },
    { key: 'icon',  label: 'Icon',  type: 'text', required: false, placeholder: 'e.g. arrow-right' },
  ],
  contact_info: [
    {
      key: 'type', label: 'Type', type: 'select', required: true,
      options: ['email', 'phone', 'address', 'hours', 'social'],
    },
    { key: 'value', label: 'Value', type: 'text', required: true, placeholder: 'e.g. hello@company.com' },
    { key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. Support Email' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Type badge colours
// ─────────────────────────────────────────────────────────────────────────────

export const TYPE_COLORS = {
  hero:           'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  text:           'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  rich_text:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  mission_vision: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  values:         'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  features:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stats:          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  team:           'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  gallery:        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  contact_info:   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  faq:            'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  cta:            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  links:          'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  custom:         'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};