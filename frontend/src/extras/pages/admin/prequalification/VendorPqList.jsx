import { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { vendorPrequalificationsAPI } from '../../../../_shared/api/index';
import { TextInput, SelectInput } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Crumbs, Heading, Loading, Empty, Table, StatusBadge, ErrorBanner } from '../../../components/procurement/ui';
import { td, fmtLongDate, CATEGORY_LABELS } from '../../../components/procurement/format';

export default function VendorPqList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [expiring, setExpiring] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      vendorPrequalificationsAPI.list({ search: search || undefined, category: category || undefined, expiring: expiring || undefined })
        .then(r => { setRows(r.rows || []); setError(null); }).catch(e => { setRows([]); setError(errMsg(e, 'Failed to load')); }).finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, category, expiring]);

  return (
    <AdminPage>
      <Crumbs items={[{ label: 'Vendors', to: '/admin/vendors' }, { label: 'Pre-qualification' }]} />
      <Heading title="Pre-qualification" description="Who is pre-qualified, for what, and until when. Decisions are made offline and recorded on the vendor (Vendors, then the vendor's Pre-qualification tab)." />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor" aria-label="Search vendor" style={{ maxWidth: 240 }} />
        <SelectInput value={category} onChange={e => setCategory(e.target.value)} aria-label="Category" style={{ maxWidth: 170 }}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
        <SelectInput value={expiring} onChange={e => setExpiring(e.target.value)} aria-label="Expiring" style={{ maxWidth: 200 }}>
          <option value="">Any expiry</option><option value="30">Expiring in 30 days</option><option value="90">Expiring in 90 days</option>
        </SelectInput>
      </div>
      <ErrorBanner message={error} />
      {loading ? <Loading /> : error ? null : rows.length === 0 ? <Empty icon={ClipboardCheck}>Nothing recorded</Empty> : (
        <Table head={['Vendor', 'Category', 'Status', 'From', 'Valid until', 'Reason', 'By']}>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ ...td, fontWeight: 600 }}>{r.vendor?.company_name}<div style={{ fontSize: '0.7rem', fontWeight: 400 }}>{r.vendor?.vendor_number}</div></td>
              <td style={td}>{CATEGORY_LABELS[r.category] || r.category}</td>
              <td style={td}><StatusBadge status={r.status === 'qualified' ? (r.current ? 'qualified' : 'closed') : r.status === 'refused' ? 'rejected' : 'cancelled'} label={r.status === 'qualified' && !r.current ? 'expired' : r.status} /></td>
              <td style={td}>{fmtLongDate(r.qualified_from)}</td>
              <td style={td}>{r.valid_until ? fmtLongDate(r.valid_until) : '—'}</td>
              <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 220 }}>{r.reason}</td>
              <td style={td}>{r.recorded_by}</td>
            </tr>
          ))}
        </Table>
      )}
    </AdminPage>
  );
}
