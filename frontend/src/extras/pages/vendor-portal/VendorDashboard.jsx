import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Gavel, ClipboardCheck, Package, Building, ArrowRight } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

function StatCard({ icon: Icon, label, value, to, color }) {
  return (
    <Link to={to} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 12, textDecoration: 'none', transition: 'border-color 150ms' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }} className="text-gray-900 dark:text-white">{value}</div>
        <div style={{ fontSize: '0.78rem', marginTop: 2 }} className="text-gray-500 dark:text-gray-400">{label}</div>
      </div>
      <ArrowRight size={16} className="text-gray-300 dark:text-gray-600" />
    </Link>
  );
}

export default function VendorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorPortalAPI.dashboard().then(setData).catch(() => toast.error('Failed to load dashboard')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>;
  if (!data) return null;

  const v = data.vendor;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }} className="text-gray-900 dark:text-white">Vendor Portal</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem' }} className="text-gray-500 dark:text-gray-400">
            <Building size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />{v.company_name}
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
            background: v.status === 'active' ? '#dcfce7' : v.status === 'pending_approval' ? '#fef3c7' : '#fee2e2',
            color: v.status === 'active' ? '#166534' : v.status === 'pending_approval' ? '#92400e' : '#991b1b' }}>
            {v.status?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 32 }}>
        <StatCard icon={Gavel}          label="Open tenders"       value={data.open_tenders}  to="/vendor-portal/tenders"  color="#6366f1" />
        <StatCard icon={FileText}       label="My bids"            value={data.my_bids}       to="/vendor-portal/bids"     color="#0ea5e9" />
        <StatCard icon={ClipboardCheck} label="Active PQs"         value={data.active_pqs}    to="/vendor-portal/pq"       color="#10b981" />
        <StatCard icon={Package}        label="Vendor orders"      value={data.vendor_orders} to="/vendor-portal/orders"   color="#f59e0b" />
      </div>

      {v.status === 'pending_approval' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" style={{ padding: 16, borderRadius: 10, fontSize: '0.85rem' }}>
          <strong>Account pending approval.</strong> An administrator will review your registration. Once approved you can browse tenders and submit bids.
        </div>
      )}
    </div>
  );
}
