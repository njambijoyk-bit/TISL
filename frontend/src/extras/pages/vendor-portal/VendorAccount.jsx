import { Receipt, FileText, ClipboardList, Clock } from 'lucide-react';
import { SitePage, Heading } from '../../components/procurement/ui';
import { card, colors } from '../../../_shared/theme/tokens';

const SOON = [
  { icon: <ClipboardList size={18} style={{ color: colors.primary }} />, title: 'Purchase orders', text: 'Orders we place with your company, and where each one stands.' },
  { icon: <Receipt size={18} style={{ color: colors.primary }} />, title: 'Invoices and payments', text: 'What you have invoiced us, what has been paid and what is still due.' },
  { icon: <FileText size={18} style={{ color: colors.primary }} />, title: 'Quotes', text: 'Requests for quotation from us, and your replies.' },
];

export default function VendorAccount() {
  return (
    <SitePage width={900} crumbs={[['Home', '/'], ['Vendor portal', '/vendor-portal'], ['My account', null]]}>
      <Heading title="My account" description="Your orders, invoices and quotes with us will live here." />
      <div style={{ ...card, padding: '36px 24px', textAlign: 'center', marginBottom: 18 }}>
        <Clock size={34} style={{ color: colors.primary, display: 'block', margin: '0 auto 10px' }} />
        <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: colors.text }}>Coming soon</p>
        <p style={{ margin: '6px auto 0', maxWidth: 460, fontSize: '0.85rem', color: colors.textMuted, lineHeight: 1.6 }}>We are building this part of the portal. In the meantime, tenders and pre-qualification are available from the vendor portal home.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {SOON.map(({ icon, title, text }) => (
          <div key={title} style={{ ...card, padding: 18, opacity: 0.85 }}>
            {icon}
            <p style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: '0.9rem', color: colors.text }}>{title}</p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted, lineHeight: 1.5 }}>{text}</p>
          </div>
        ))}
      </div>
    </SitePage>
  );
}
