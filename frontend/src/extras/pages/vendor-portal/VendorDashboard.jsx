import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Lock, ClipboardCheck, Package, Building, ArrowRight } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { card, colors } from '../../../_shared/theme/tokens';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { SitePage, Heading, Loading, StatusBadge, ErrorBanner } from '../../components/procurement/ui';

function StatCard({ icon: Icon, label, value, to }) {
  return (
    <Link to={to} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: 18, textDecoration: 'none' }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.tint(0.1) }}>
        <Icon size={19} style={{ color: colors.primary }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1, color: colors.text }}>{value}</div>
        <div style={{ fontSize: '0.76rem', marginTop: 2, color: colors.textMuted }}>{label}</div>
      </div>
      <ArrowRight size={15} style={{ color: colors.textFaint }} />
    </Link>
  );
}

export default function VendorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    vendorPortalAPI.dashboard().then(setData).catch(e => setError(errMsg(e, 'Failed to load dashboard'))).finally(() => setLoading(false));
  }, []);

  if (loading) return <SitePage width={900}><Loading /></SitePage>;
  if (!data) return <SitePage width={900}><ErrorBanner message={error} /></SitePage>;
  const v = data.vendor;

  return (
    <SitePage width={900}>
      <Heading title="Vendor portal"
        description={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Building size={14} />{v.company_name} <StatusBadge status={v.status} /></span>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={Gavel} label="Open tenders" value={data.open_tenders} to="/vendor-portal/tenders" />
        <StatCard icon={Lock} label="Restricted tenders for you" value={data.restricted_tenders} to="/vendor-portal/tenders" />
        <StatCard icon={ClipboardCheck} label="Pre-qualified categories" value={(data.prequalifications || []).length} to="/vendor-portal/pq" />
        <StatCard icon={Package} label="Vendor orders" value={data.vendor_orders} to="/vendor-portal/orders" />
      </div>
      {(data.prequalifications || []).filter(p => p.valid_until && (new Date(p.valid_until) - Date.now()) / 86400000 <= 30).map(p => (
        <div key={p.category} style={{ padding: 14, borderRadius: 10, fontSize: '0.85rem', marginBottom: 12, background: colors.warningBg, color: colors.warningText, border: `1px solid ${colors.warning}` }}>
          <strong>Your {p.category} pre-qualification expires on {new Date(p.valid_until).toLocaleDateString()}.</strong> Send us your renewal documents to stay pre-qualified.
        </div>
      ))}
      {v.status === 'pending_approval' && (
        <div style={{ padding: 16, borderRadius: 10, fontSize: '0.85rem', background: colors.warningBg, color: colors.warningText, border: `1px solid ${colors.warning}` }}>
          <strong>Account pending approval.</strong> An administrator will review your registration.
        </div>
      )}
    </SitePage>
  );
}
