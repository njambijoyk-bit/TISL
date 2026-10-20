import { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { Page, Heading, Loading, Empty, Table, StatusBadge } from '../../components/procurement/ui';
import { td, fmtLongDate, CATEGORY_LABELS } from '../../components/procurement/format';

const today = () => new Date().toISOString().slice(0, 10);

export default function VendorPrequalification() {
  const [rows, setRows] = useState(null);

  useEffect(() => { vendorPortalAPI.prequalifications().then(r => setRows(r.rows || [])).catch(() => setRows([])); }, []);

  if (rows === null) return <Page width={900}><Loading /></Page>;

  return (
    <Page width={900}>
      <Heading title="Pre-qualification" description="Pre-qualification is done offline. When we call for it, download the form from the tender notice, fill it, scan it and send it to our procurement office. Our decision appears here." />
      {rows.length === 0 ? <Empty icon={ClipboardCheck}>No decision has been recorded for you yet</Empty> : (
        <Table head={['Category', 'Status', 'From', 'Valid until', 'Reason']}>
          {rows.map(r => {
            const expired = r.status === 'qualified' && r.valid_until && r.valid_until < today();
            return (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600 }}>{CATEGORY_LABELS[r.category] || r.category}</td>
                <td style={td}><StatusBadge status={expired ? 'closed' : r.status === 'qualified' ? 'qualified' : r.status === 'refused' ? 'rejected' : 'cancelled'} label={expired ? 'expired' : r.status} /></td>
                <td style={td}>{fmtLongDate(r.qualified_from)}</td>
                <td style={td}>{r.valid_until ? fmtLongDate(r.valid_until) : '—'}</td>
                <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{r.reason}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </Page>
  );
}
