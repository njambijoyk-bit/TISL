import { storageUrl } from '../../../../_shared/lib/storageUrl';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useWithholdingStore from '../../../../_shared/store/withholdingStore';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import { SelectInput } from '../ui/Form';
import ConfirmModal from '../ui/ConfirmModal';
import StatusBadge from '../../../../_shared/components/common/StatusBadge';
import AdminPagination from '../../../../_shared/components/common/AdminPagination';
import MarkIssuedModal from './MarkIssuedModal';
import { customerName } from '../tax/certificates/customerName';
import { colors, btnGhost } from '../../../../_shared/theme/tokens';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * One certificate per deduction a withholding agent made. Chasing flow:
 * pending (we're waiting) → issued (they generated it) → received (we hold it).
 */
export default function WhtCertificatesSection({ canWrite }) {
  const { certificates, certificatesPagination, loading, actionLoading, fetchCertificates, markReceived } = useWithholdingStore();
  const [filters, setFilters] = useState({ status: '', page: 1 });
  const [issuing, setIssuing] = useState(null);
  const [receiving, setReceiving] = useState(null);

  useEffect(() => { fetchCertificates(filters).catch(() => {}); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const doReceive = async () => {
    try { await markReceived(receiving.id); toast.success('Marked as received'); setReceiving(null); }
    catch (err) { toast.error(err.response?.data?.message ?? 'Could not update the certificate'); }
  };

  const columns = [
    { key: 'certificate_number', label: 'Number', render: (c) => <span style={{ fontFamily: 'monospace', color: colors.text }}>{c.certificate_number}</span> },
    { key: 'customer', label: 'Customer', render: (c) => customerName(c.customer) },
    { key: 'gross_amount', label: 'Gross', align: 'right', render: (c) => money(c.gross_amount) },
    { key: 'withheld_amount', label: 'Withheld', align: 'right', render: (c) => <strong style={{ color: colors.text }}>{money(c.withheld_amount)}</strong> },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'doc', label: 'Copy', render: (c) => (c.document_path
      ? <a href={storageUrl(c.document_path)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: colors.primary, fontSize: '0.78rem' }}>Open</a>
      : '—') },
    ...(canWrite ? [{
      key: 'actions', label: '', align: 'right',
      render: (c) => (
        c.status === 'pending' ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setIssuing(c); }} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }}>Mark issued</button>
        ) : c.status === 'issued' ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); setReceiving(c); }} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }}>Mark received</button>
        ) : null
      ),
    }] : []),
  ];

  return (
    <div>
      <Toolbar>
        <div style={{ minWidth: 170 }}>
          <SelectInput aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters({ status: e.target.value, page: 1 })}>
            <option value="">Any status</option>
            <option value="pending">Pending — waiting on customer</option>
            <option value="issued">Issued</option>
            <option value="received">Received</option>
          </SelectInput>
        </div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textFaint }}>Created automatically whenever an agent withholds tax on a payment.</p>
      </Toolbar>
      <SimpleTable columns={columns} rows={certificates} loading={loading.certificates}
        empty={filters.status === 'pending' ? 'No certificates waiting on customers.' : 'No withholding deductions recorded yet.'} />
      <div style={{ marginTop: 12 }}>
        <AdminPagination pagination={certificatesPagination} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>

      {issuing && <MarkIssuedModal certificate={issuing} onClose={() => setIssuing(null)} />}
      {receiving && (
        <ConfirmModal title="Mark certificate received"
          message={`You now hold the customer's withholding certificate for ${receiving.certificate_number} (${money(receiving.withheld_amount)} withheld).`}
          confirmLabel="Mark received" busyLabel="Saving…" busy={actionLoading}
          onConfirm={doReceive} onClose={() => setReceiving(null)} />
      )}
    </div>
  );
}
