import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import { Toolbar } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import SimpleTable from '../../../components/admin/ui/SimpleTable';
import quotationsAPI from '../../../../_shared/api/quotations';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle } from '../../../components/admin/books/booksFmt';
import { DocChip } from './DocChip';

const TABS = [
  ['', 'All'], ['requested', 'To price'], ['quoted', 'Sent'], ['revision_requested', 'Changes asked'],
  ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired'],
];

export default function QuotationsPage() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await quotationsAPI.list({ doc_status: status || undefined, search: search || undefined });
      setRows(res.quotations.data ?? []);
      setCounts(res.counts ?? {});
    } catch (e) { toast.error(errMsg(e, 'Could not load quotations')); }
    finally { setLoading(false); }
  }, [status, search]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'n', label: 'Number', render: (v) => <strong style={{ fontFamily: 'monospace', color: colors.text }}>{v.voucher_number}</strong> },
    { key: 'c', label: 'Customer', render: (v) => v.customer ? `${v.customer.first_name ?? ''} ${v.customer.last_name ?? ''}`.trim() || v.customer.email : (v.party_ledger?.name ?? '—') },
    { key: 'r', label: 'Request', render: (v) => v.reference_no ?? '—' },
    { key: 's', label: 'Status', render: (v) => <DocChip status={v.status === 'cancelled' ? 'withdrawn' : v.doc_status} /> },
    { key: 'v', label: 'Valid until', render: (v) => v.valid_until ?? '—' },
    { key: 't', label: 'Total', align: 'right', render: (v) => (v.doc_status === 'requested' ? <span style={{ color: colors.textFaint }}>not priced</span> : `${v.currency?.code ?? ''} ${money(v.total_amount)}`) },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Quotations" description={<>Price them, send them, and an accepted quotation turns into a sales order.</>} />
        <Tabs tabs={TABS.map(([id, label]) => ({ id, label, count: id ? counts[id] : undefined }))} active={status} onChange={setStatus} />
        <Toolbar>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Number, request, text…" style={{ ...filterStyle, paddingLeft: 30, width: 240 }} />
          </div>
        </Toolbar>
        <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={(v) => nav(`/admin/quotes/${v.id}`)} empty="No quotations yet." />
      </div>
    </AdminLayout>
  );
}
