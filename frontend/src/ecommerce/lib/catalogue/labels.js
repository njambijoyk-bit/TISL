export const TYPE_LABELS = { product: 'Products', service: 'Services', hamper: 'Hampers', auction: 'Auctions' };
export const TYPE_ONE = { product: 'Product', service: 'Service', hamper: 'Hamper', auction: 'Auction' };

/** What each section is, in words for the screens (the server holds which sections each type may use). */
export const SECTION_LABELS = {
  hero: 'Hero: picture, name and short description',
  gallery: 'Gallery: more pictures',
  story: 'Story: the description',
  features: 'Features: a bullet list',
  specs: 'Specifications: a table',
  prices: 'Prices: every variant and unit, with tax',
  packages: 'Packages: each package and its price, with tax',
  charges: 'Extra charges: deposit, surcharges, service charge',
  details: 'Details: code, barcode, category, brand',
  inside: "What's inside: the contents",
  price: 'Price: the price with tax (an auction also shows what the winner pays)',
  lot: 'The lot: description and bidding steps',
  schedule: 'Schedule: starts and ends',
  terms: 'Terms and good to know',
};

export const SIZE_LABELS = { full: 'Full page (one item a page)', half: 'Half page (two to a page)', card: 'Card (six to a page)' };
