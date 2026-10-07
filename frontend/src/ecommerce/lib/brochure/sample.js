// A made-up service, used to draw the template previews on the Brochures tab.
const pic = (a, b) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='600' height='400' fill='url(#g)'/><circle cx='300' cy='170' r='80' fill='rgba(255,255,255,0.35)'/></svg>`)}`;

export const SAMPLE_DATA = {
  service: { is_remote_available: true, name: 'Home Deep Cleaning', short_description: 'A top-to-bottom clean for your whole home.', description: 'A thorough clean of every room, done by a trained and insured team with eco-friendly products. Most homes take between four and eight hours, and a supervisor checks every job before we leave.', badge: 'Popular', price_unit_label: 'per visit', estimated_duration: '4 to 8 hours', delivery_mode: 'on_site', lead_time: '2 days', service_area: 'Your city', booking_required: true },
  category: 'Home services', url: '', price_mode: 'on_request', negotiable: false,
  image_main: pic('#c9a27e', '#8aa1b8'), image_others: [pic('#7a9e8c', '#d6c3a1'), pic('#b4837a', '#a78bb0'), pic('#8aa1b8', '#7a9e8c')],
  features: ['All rooms cleaned', 'Kitchen and oven', 'Bathrooms descaled', 'Windows inside and out'], deliverables: ['A spotless home', 'A signed checklist'],
  questions: [{ label: 'Number of bedrooms', required: true }, { label: 'Is there clear access to every room?', required: false }],
  packages: [{ name: 'Studio', unit: null, price: null, branches: ['Main', 'North branch'] }, { name: 'Family home', unit: null, price: null, branches: ['Main'] }],
  charges: [{ name: 'Call-out fee', amount: 500, basis: 'fixed', unit: '', when: '', refundable: false }],
  policy: { title: 'Booking policy', text: 'You can cancel free of charge up to 24 hours before the start. After that a late cancellation fee applies.' },
  rating: { value: 4.8, count: 32 },
};
export const SAMPLE_COMPANY = { name: 'Your company', phone: '+000 000 000 000', email: 'hello@example.com', website: 'www.example.com', address: 'Your street', city: 'Your city' };
export const SAMPLE_MONEY = { servicePrice: () => 'From 5,000', itemAmount: (n) => String(n) };
