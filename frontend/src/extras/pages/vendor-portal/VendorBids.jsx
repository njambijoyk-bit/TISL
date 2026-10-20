import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { Page, Heading, Loading, Empty, Table, StatusBadge } from '../../components/procurement/ui';
import { td, mono, linkStyle, kes, fmtDate } from '../../components/procurement/format';

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
    <Page width={900}>
      <Heading title="My bids" description="Track the status of the bids you have submitted." />
      {loading ? <Loading /> : bids.length === 0 ? (
        <Empty icon={FileText}>No bids yet. <Link to="/vendor-portal/tenders" style={linkStyle}>Browse open tenders</Link></Empty>
      ) : (
        <Table head={['Bid', 'Tender', 'Amount', 'Status', 'Submitted']}>
          {bids.map(b => (
            <tr key={b.id}>
              <td style={{ ...td, ...mono }}>{b.bid_number}</td>
              <td style={{ ...td, fontWeight: 600 }}>{b.tender?.title || '—'}</td>
              <td style={td}>{kes(b.total_amount)}</td>
              <td style={td}><StatusBadge status={b.status} /></td>
              <td style={td}>{b.submitted_at ? fmtDate(b.submitted_at) : 'Draft'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
