import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { Page, Heading, Loading, Empty, Table, StatusBadge } from '../../components/vendor/ui';
import { td, mono, kes, fmtDate } from '../../components/vendor/format';

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
    <Page width={900}>
      <Heading title="Vendor orders" description="Orders placed with your company." />
      {loading ? <Loading /> : orders.length === 0 ? <Empty icon={Package}>No orders yet</Empty> : (
        <Table head={['Order', 'Date', 'Total', 'Status']}>
          {orders.map(o => (
            <tr key={o.id}>
              <td style={{ ...td, ...mono, fontWeight: 600 }}>{o.po_number}</td>
              <td style={td}>{fmtDate(o.created_at)}</td>
              <td style={td}>{kes(o.total)}</td>
              <td style={td}><StatusBadge status={o.status} /></td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
