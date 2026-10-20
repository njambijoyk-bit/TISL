import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Eye } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft:      { bg: '#f3f4f6', text: '#374151' },
  submitted:  { bg: '#dbeafe', text: '#1e40af' },
  under_review: { bg: '#fef3c7', text: '#92400e' },
  awarded:    { bg: '#dcfce7', text: '#166534' },
  rejected:   { bg: '#fee2e2', text: '#991b1b' },
  withdrawn:  { bg: '#f3f4f6', text: '#6b7280' },
};

export default function VendorBids() {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorPortalAPI.myBids()
      .then(r => setBids(r.rows || []))
      .catch(() => toast.error('Failed to load bids'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }} className="text-gray-900 dark:text-white">My Bids</h1>
      <p style={{ fontSize: '0.82rem', marginBottom: 20 }} className="text-gray-500 dark:text-gray-400">Track the status of your submitted bids</p>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : bids.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <FileText size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }} className="text-gray-500 dark:text-gray-400">No bids yet</p>
          <Link to="/vendor-portal/tenders" style={{ color: 'var(--color-primary-500)', fontSize: '0.82rem', fontWeight: 600 }}>Browse open tenders</Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {['Bid #', 'Tender', 'Amount', 'Status', 'Submitted'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bids.map(b => {
                const sc = STATUS_COLORS[b.status] || STATUS_COLORS.draft;
                return (
                  <tr key={b.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.78rem' }} className="text-gray-700 dark:text-gray-300">{b.bid_number}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }} className="text-gray-800 dark:text-gray-200">{b.tender?.title || '—'}</td>
                    <td style={{ padding: '12px 14px' }} className="text-gray-700 dark:text-gray-300">KES {Number(b.total_amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', background: sc.bg, color: sc.text }}>
                        {b.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '0.78rem' }} className="text-gray-500 dark:text-gray-400">{b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : 'Draft'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
