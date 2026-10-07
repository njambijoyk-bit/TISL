// Turns what the server sends for a brochure (BrochureData) into the ready-to-print text a template draws: strings and lists, already formatted for money.
const DELIVERY = { on_site: 'On site', remote: 'Remote', in_branch: 'In our branch', hybrid: 'On site or remote' };
const bullets = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

/**
 * @param {object} data     the server's brochure data
 * @param {object} deps     { money (the useMoney hook's value), company (the company profile) }
 */
export function brochureFields(data, { money, company = {} } = {}) {
  const s = data.service ?? {};
  const fmt = (n) => (money ? (money.itemAmount?.(n, s) ?? String(n)) : String(n));

  const pk = data.packages ?? [];
  const priced = pk.filter((p) => p.price != null);
  // one table row per package: its own price, the tax on it, the total and where it is offered
  const packageRows = pk.map((p) => ({
    name: [p.name, p.unit].filter(Boolean).join(' · '), offered: (p.branches ?? []).join(', '),
    price: p.price != null ? fmt(p.price) : '', tax: p.price != null && p.tax_amount != null ? `${fmt(p.tax_amount)}${p.tax_name ? ` ${p.tax_name}` : ''}` : '',
    total: p.price != null ? fmt(Number(p.price) + Number(p.tax_amount ?? 0)) : '',
  }));

  let price = null;
  if (data.price_mode === 'show' && priced.length) price = `${priced.length > 1 ? 'From ' : ''}${fmt(Math.min(...priced.map((p) => Number(p.price))))}`;   // the packages' own prices, not the service's general one
  else if (data.price_mode === 'show') price = data.negotiable ? 'Negotiable' : (money?.servicePrice(s) ?? null);
  else if (data.price_mode === 'on_request') price = 'Price on request';

  const facts = [
    s.estimated_duration && `Duration: ${s.estimated_duration}`,
    s.delivery_mode && DELIVERY[s.delivery_mode] && `Delivery: ${DELIVERY[s.delivery_mode]}`,
    s.lead_time && `Lead time: ${s.lead_time}`,
    s.service_area && `Area: ${s.service_area}`,
    s.is_remote_available && !s.requires_site_visit && 'Remote service available',
    s.requires_site_visit && 'A site visit is needed',
    s.booking_required && 'Booking is required',
  ].filter(Boolean);

  const requirements = (data.questions ?? []).map((q) => `You will be asked: ${q.label}${q.required ? ' (required)' : ''}`);
  const charges = (data.charges ?? []).map((c) => `${c.name}: ${c.basis === 'percent' ? `${c.amount}%` : fmt(c.amount)}${c.unit ? ` per ${c.unit}` : ''}${c.when ? ` ${c.when}` : ''}${c.refundable ? ' (refundable)' : ''}`);
  const contact = [company.phone, company.email, company.website, [company.address, company.city].filter(Boolean).join(', ')].filter(Boolean);

  return {
    name: s.name ?? '', tagline: s.short_description ?? '', description: (s.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    badge: s.badge ?? '', category: data.category ?? '', price: price ?? '', model: s.price_unit_label ?? '',
    rating: data.rating ? `${data.rating.value.toFixed(1)} out of 5, from ${data.rating.count} ${data.rating.count === 1 ? 'review' : 'reviews'}` : '',
    company: company.name ?? '', companyTagline: company.tagline ?? '', contact: contact.join('   '), contactLines: contact, url: data.url ?? '',
    facts, features: bullets(data.features), deliverables: bullets(data.deliverables), requirements, packageRows, charges,
    policy: data.policy?.text ?? '', policyTitle: data.policy?.title ?? '',
  };
}
