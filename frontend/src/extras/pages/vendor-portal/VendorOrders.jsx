import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Eye } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

export default function VendorOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vendorPortalAPI.orders()
      .then(r => setOrders(r.rows || []))
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }} className="text-gray-900 dark:text-white">Vendor Orders</h1>
      <p style={{ fontSize: '0.82rem', marginBottom: 20 }} className="text-gray-500 dark:text-gray-400">Orders placed with your company</p>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Package size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }} className="text-gray-500 dark:text-gray-400">No orders yet</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {['Order #', 'Date', 'Total', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.78rem' }} className="text-gray-700 dark:text-gray-300">{o.po_number}</td>
                  <td style={{ padding: '12px 14px', fontSize: '0.78rem' }} className="text-gray-500 dark:text-gray-400">{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }} className="text-gray-700 dark:text-gray-300">KES {Number(o.total || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase',
                      background: o.status === 'delivered' ? '#dcfce7' : o.status === 'cancelled' ? '#fee2e2' : '#dbeafe',
                      color: o.status === 'delivered' ? '#166534' : o.status === 'cancelled' ? '#991b1b' : '#1e40af' }}>
                      {o.status?.replace(/_/g, ' ') || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
