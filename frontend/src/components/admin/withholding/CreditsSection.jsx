import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, CircleDollarSign, Ban } from 'lucide-react';
import useWithholdingStore from '../../../store/withholdingStore';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import { SelectInput, CheckboxRow } from '../ui/Form';
import ConfirmModal from '../ui/ConfirmModal';
import StatusBadge from '../../common/StatusBadge';
import AdminPagination from '../../common/AdminPagination';
import ApplyClearanceModal from './ApplyClearanceModal';
import { customerName } from '../tax/certificates/customerName';
import { colors, card, btnPrimary, btnGhost, radius } from '../../../theme/tokens';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const remaining = (c) => Math.max(0, Number(c.amount) - Number(c.cleared_amount ?? 0));
const isOpen = (c) => c.status === 'held' || c.status === 'partially_cleared';

/**
 * Withholding credits: tax customers deducted from payments to TISL, which
 * TISL can claim back once remitted. Default view shows what's still open.
 */
export default function CreditsSection({ canWrite }) {
  const {
    credits, creditsPagination, currentCredit, clearances, loading, actionLoading,
    fetchCredits, fetchCredit, writeOff, clearCurrent,
  } = useWithholdingStore();
  const [filters, setFilters] = useState({ status: '', outstanding_only: true, page: 1 });
  const [clearing, setClearing] = useState(null);
  const [writingOff, setWritingOff] = useState(null);

  useEffect(() => { fetchCredits(filters).catch(() => {}); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearCurrent(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const outstandingTotal = credits.filter(isOpen).reduce((s, c) => s + remaining(c), 0);

  const doWriteOff = async (reason) => {
    try {
      await writeOff(writingOff.id, reason);
      toast.success('Credit written off');
      setWritingOff(null);
    } catch (err) { toast.error(err.response?.data?.message ?? 'Could not write it off'); }
  };

  const columns = [
    { key: 'customer', label: 'Customer', render: (c) => customerName(c.customer) },
    { key: 'certificate', label: 'Certificate', render: (c) => <span style={{ fontFamily: 'monospace' }}>{c.certificate?.certificate_number ?? '—'}</span> },
    { key: 'amount', label: 'Withheld', align: 'right', render: (c) => money(c.amount) },
    { key: 'left', label: 'Still to clear', align: 'right', render: (c) => <strong style={{ color: isOpen(c) ? colors.text : colors.textFaint }}>{money(remaining(c))}</strong> },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'created_at', label: 'Since', render: (c) => c.created_at?.slice(0, 10) },
  ];

  const cur = currentCredit;

  return (
    <div>
      <Toolbar right={
        <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>
          Open on this page: <strong style={{ color: colors.text }}>{money(outstandingTotal)}</strong>
        </span>
      }>
        <div style={{ minWidth: 170 }}>
          <SelectInput aria-label="Filter by status" value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, outstanding_only: e.target.value ? false : f.outstanding_only, page: 1 }))}>
            <option value="">Any status</option>
            <option value="held">Held</option>
            <option value="partially_cleared">Partially cleared</option>
            <option value="cleared">Cleared</option>
            <option value="written_off">Written off</option>
          </SelectInput>
        </div>
        <CheckboxRow checked={filters.outstanding_only} disabled={Boolean(filters.status)}
          onChange={(v) => setFilters((f) => ({ ...f, outstanding_only: v, page: 1 }))} label="Only credits still open" />
      </Toolbar>

      <SimpleTable columns={columns} rows={credits} loading={loading.credits}
        onRowClick={(c) => fetchCredit(c.id).catch(() => toast.error('Could not open the credit'))}
        empty={filters.outstanding_only ? 'Nothing outstanding — every withholding credit is cleared.' : 'No withholding credits yet.'} />
      <div style={{ marginTop: 12 }}>
        <AdminPagination pagination={creditsPagination} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>

      {cur && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) clearCurrent(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,10,30,0.35)', display: 'flex', justifyContent: 'flex-end' }}>
          <aside role="dialog" aria-label="Withholding credit" style={{ ...card, borderRadius: 0, width: '100%', maxWidth: 460, height: '100%', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>{customerName(cur.customer)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: 800, color: colors.text }}>{money(remaining(cur))}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: colors.textFaint }}>still to clear of {money(cur.amount)} withheld</p>
              </div>
              <button type="button" onClick={clearCurrent} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, alignSelf: 'flex-start' }}><X size={16} /></button>
            </div>

            <div style={{ margin: '16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusBadge status={cur.status} />
              {cur.certificate && <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>from certificate <span style={{ fontFamily: 'monospace' }}>{cur.certificate.certificate_number}</span></span>}
            </div>

            {canWrite && isOpen(cur) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button type="button" onClick={() => setClearing(cur)} style={btnPrimary}><CircleDollarSign size={14} /> Record clearance</button>
                <button type="button" onClick={() => setWritingOff(cur)} style={{ ...btnGhost, color: colors.dangerText }}><Ban size={14} /> Write off</button>
              </div>
            )}

            <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 700, color: colors.primaryDeep }}>Clearances</p>
            {clearances.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textFaint }}>None recorded yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clearances.map((cl) => (
                  <li key={cl.id} style={{ padding: '8px 10px', borderRadius: radius.md, border: `1px solid ${colors.tint(0.08)}`, fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ color: colors.text }}>{money(cl.amount)}</strong>
                      <span style={{ color: colors.textFaint }}>{cl.cleared_on?.slice(0, 10)}</span>
                    </div>
                    {(cl.reference || cl.cleared_by?.name) && (
                      <p style={{ margin: '3px 0 0', color: colors.textMuted }}>
                        {cl.reference && <>Ref {cl.reference}</>}{cl.reference && cl.cleared_by?.name && ' · '}{cl.cleared_by?.name}
                      </p>
                    )}
                    {cl.notes && <p style={{ margin: '3px 0 0', color: colors.textFaint }}>{cl.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {clearing && <ApplyClearanceModal credit={clearing} onClose={() => setClearing(null)} />}
      {writingOff && (
        <ConfirmModal
          title="Write off this credit"
          message={`${money(remaining(writingOff))} will be treated as unrecoverable and the credit closed. Use this when the agent never remitted the tax.`}
          confirmLabel="Write off" busyLabel="Writing off…" danger withReason reasonLabel="Why is it being written off?"
          busy={actionLoading} onConfirm={doWriteOff} onClose={() => setWritingOff(null)}
        />
      )}
    </div>
  );
}
