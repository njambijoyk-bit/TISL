import { useEffect, useState } from 'react';
import useTaxStore from '../../../../store/taxStore';
import SimpleTable from '../../ui/SimpleTable';
import { Toolbar } from '../../ui/HubHeader';
import { TextInput } from '../../ui/Form';
import AdminPagination from '../../../common/AdminPagination';
import { formatRate } from './TaxRatesSection';
import { colors } from '../../../../theme/tokens';

const num = (n) => (n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Read-only audit trail: every tax actually charged or withheld. */
export default function TaxApplicationsSection() {
  const { applications, applicationsPagination, loading, fetchApplications } = useTaxStore();
  const [orderId, setOrderId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => fetchApplications({ order_id: orderId || undefined, page }).catch(() => {}), orderId ? 350 : 0);
    return () => clearTimeout(t);
  }, [orderId, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'created_at', label: 'When', render: (a) => a.created_at?.slice(0, 16).replace('T', ' ') },
    { key: 'order', label: 'Order', render: (a) => (a.order_id ? `#${a.order_id}${a.order_item_id ? ` · line ${a.order_item_id}` : ''}` : '—') },
    { key: 'tax', label: 'Tax', render: (a) => `${a.tax_rule?.name ?? a.classification}` },
    { key: 'rate', label: 'Rate', render: (a) => (a.tax_rate ? formatRate(a.tax_rate) : '—') },
    { key: 'base_amount', label: 'Charged on', align: 'right', render: (a) => num(a.base_amount) },
    { key: 'tax_amount', label: 'Tax', align: 'right', render: (a) => <strong style={{ color: colors.text }}>{num(a.tax_amount)}</strong> },
  ];

  return (
    <div>
      <Toolbar>
        <div style={{ width: 200 }}>
          <TextInput type="search" inputMode="numeric" aria-label="Filter by order number" placeholder="Order number"
            value={orderId} onChange={(e) => { setOrderId(e.target.value.replace(/\D/g, '')); setPage(1); }} />
        </div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textFaint }}>Amounts are in each order's currency. This log can't be edited.</p>
      </Toolbar>
      <SimpleTable columns={columns} rows={applications} loading={loading.applications}
        empty={orderId ? 'No tax was recorded on that order.' : 'Nothing charged yet. Entries appear here as orders are taxed.'} />
      <div style={{ marginTop: 12 }}>
        <AdminPagination pagination={applicationsPagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
