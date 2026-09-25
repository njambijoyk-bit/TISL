import { storageUrl } from '../../../../lib/storageUrl';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, FileText, CheckCircle2, XCircle, Pencil, Trash2, X } from 'lucide-react';
import useTaxCertificateStore from '../../../../store/taxCertificateStore';
import useAuthStore from '../../../../store/authStore';
import { canWriteFinance } from '../../../../lib/roles';
import SimpleTable from '../../ui/SimpleTable';
import { Toolbar } from '../../ui/HubHeader';
import { SelectInput } from '../../ui/Form';
import ConfirmModal from '../../ui/ConfirmModal';
import StatusBadge from '../../../common/StatusBadge';
import AdminPagination from '../../../common/AdminPagination';
import TaxCertificateForm from './TaxCertificateForm';
import { customerName } from './customerName';
import { colors, card, btnPrimary, btnGhost, radius } from '../../../../theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);
const effectiveStatus = (c) =>
  c.status === 'verified' && c.valid_until && c.valid_until.slice(0, 10) < today() ? 'expired' : c.status;

/**
 * Tax legitimacy certificates of one type, with a detail drawer.
 * Used by Tax & Compliance (exemption) and Withholding & Compliance (withholding_agent).
 */
export default function CertificatesPanel({ certificateType }) {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const {
    certificates, pagination, current, loading, actionLoading, filters,
    setFilters, fetchCertificates, fetchCertificate, verifyCertificate, revokeCertificate, deleteCertificate, clearCurrent,
  } = useTaxCertificateStore();

  const [editing, setEditing] = useState(null);     // certificate | 'new' | null
  const [confirm, setConfirm] = useState(null);     // { kind, cert }

  useEffect(() => {
    setFilters({ certificate_type: certificateType, status: '', holder_id: '', holder_type: '', page: 1 });
    fetchCertificates({ certificate_type: certificateType, page: 1 }).catch(() => {});
    return () => clearCurrent();
  }, [certificateType]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = (patch = {}) => {
    setFilters(patch);
    fetchCertificates({ ...patch }).catch(() => {});
  };

  const open = (c) => fetchCertificate(c.id).catch(() => toast.error('Could not open the certificate'));

  const runConfirm = async (reason) => {
    const { kind, cert } = confirm;
    try {
      if (kind === 'verify') { await verifyCertificate(cert.id); toast.success('Certificate verified'); }
      if (kind === 'revoke') { await revokeCertificate(cert.id, reason); toast.success('Certificate revoked'); }
      if (kind === 'delete') { await deleteCertificate(cert.id); toast.success('Certificate deleted'); }
      setConfirm(null);
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'That action failed');
    }
  };

  const columns = [
    { key: 'certificate_number', label: 'Number', render: (c) => <span style={{ fontFamily: 'monospace', color: colors.text }}>{c.certificate_number}</span> },
    { key: 'holder', label: 'Customer', render: (c) => customerName(c.holder) },
    { key: 'issued_at', label: 'Issued', render: (c) => c.issued_at?.slice(0, 10) ?? '—' },
    { key: 'valid_until', label: 'Valid until', render: (c) => c.valid_until?.slice(0, 10) ?? 'No expiry' },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={effectiveStatus(c)} /> },
  ];

  const cur = current && current.certificate_type === certificateType ? current : null;

  return (
    <div>
      <Toolbar right={canWrite && (
        <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> Add certificate</button>
      )}>
        <div style={{ minWidth: 190 }}>
          <SelectInput aria-label="Filter by status" value={filters.status} onChange={(e) => reload({ status: e.target.value, page: 1 })}>
            <option value="">All statuses</option>
            <option value="pending_verification">Pending verification</option>
            <option value="verified">Verified</option>
            <option value="revoked">Revoked</option>
          </SelectInput>
        </div>
      </Toolbar>

      <SimpleTable
        columns={columns}
        rows={certificates}
        loading={loading.list}
        onRowClick={open}
        empty={filters.status ? 'No certificates with that status.' : 'No certificates yet. Add one when a customer sends theirs in.'}
      />
      <div style={{ marginTop: 12 }}>
        <AdminPagination pagination={pagination} onPageChange={(page) => reload({ page })} />
      </div>

      {/* ── Detail drawer ── */}
      {cur && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) clearCurrent(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,10,30,0.35)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <aside role="dialog" aria-label={`Certificate ${cur.certificate_number}`} style={{
            ...card, borderRadius: 0, width: '100%', maxWidth: 440, height: '100%', overflowY: 'auto', padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: colors.text }}>{cur.certificate_number}</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: colors.textMuted }}>{customerName(cur.holder)}</p>
              </div>
              <button type="button" onClick={clearCurrent} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><X size={16} /></button>
            </div>

            <div style={{ margin: '16px 0' }}><StatusBadge status={effectiveStatus(cur)} /></div>

            <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', margin: 0, fontSize: '0.8rem' }}>
              {[
                ['Issued by', cur.issuing_authority ?? '—'],
                ['Issued on', cur.issued_at?.slice(0, 10) ?? '—'],
                ['Valid until', cur.valid_until?.slice(0, 10) ?? 'No expiry'],
                ['Classification', cur.classification ?? 'All'],
                ['Verified by', cur.verified_by?.name ? `${cur.verified_by.name}, ${cur.verified_at?.slice(0, 10)}` : '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: colors.textFaint }}>{k}</dt>
                  <dd style={{ margin: 0, color: colors.textBody }}>{v}</dd>
                </div>
              ))}
            </dl>

            {cur.document_path && (
              <a href={storageUrl(cur.document_path)} target="_blank" rel="noreferrer" style={{
                ...btnGhost, marginTop: 18, textDecoration: 'none', color: colors.primaryDeep,
              }}>
                <FileText size={14} /> Open the scanned copy
              </a>
            )}

            {certificateType === 'exemption' && (cur.applicability?.length ?? 0) > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700, color: colors.primaryDeep }}>Used by {cur.applicability.length} tax override{cur.applicability.length > 1 ? 's' : ''}</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>Revoking it ends those exemptions immediately.</p>
              </div>
            )}
            {certificateType === 'withholding_agent' && (cur.withholding_certificates?.length ?? 0) > 0 && (
              <p style={{ marginTop: 20, fontSize: '0.75rem', color: colors.textMuted }}>
                Authorised {cur.withholding_certificates.length} withholding deduction{cur.withholding_certificates.length > 1 ? 's' : ''}.
              </p>
            )}

            {canWrite && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 24, paddingTop: 16, borderTop: `1px solid ${colors.tint(0.08)}` }}>
                {cur.status === 'pending_verification' && (
                  <button type="button" onClick={() => setConfirm({ kind: 'verify', cert: cur })} style={btnPrimary}>
                    <CheckCircle2 size={14} /> Verify
                  </button>
                )}
                {cur.status === 'verified' && (
                  <button type="button" onClick={() => setConfirm({ kind: 'revoke', cert: cur })}
                    style={{ ...btnGhost, color: colors.dangerText, borderColor: colors.dangerBg }}>
                    <XCircle size={14} /> Revoke
                  </button>
                )}
                {cur.status !== 'revoked' && (
                  <button type="button" onClick={() => setEditing(cur)} style={btnGhost}><Pencil size={14} /> Edit</button>
                )}
                {cur.status !== 'verified' && (
                  <button type="button" onClick={() => setConfirm({ kind: 'delete', cert: cur })}
                    style={{ ...btnGhost, color: colors.dangerText }}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            )}
            {canWrite && cur.status === 'verified' && (
              <p style={{ margin: '10px 0 0', fontSize: '0.7rem', color: colors.textFaint, background: colors.tint(0.03), padding: '8px 10px', borderRadius: radius.md }}>
                Verified certificates can't be deleted, so the history stays intact. Revoke it instead.
              </p>
            )}
          </aside>
        </div>
      )}

      {editing && (
        <TaxCertificateForm
          certificateType={certificateType}
          certificate={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => { if (editing !== 'new') fetchCertificate(c.id).catch(() => {}); else fetchCertificates().catch(() => {}); }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={{ verify: 'Verify certificate', revoke: 'Revoke certificate', delete: 'Delete certificate' }[confirm.kind]}
          message={{
            verify: `You've checked ${confirm.cert.certificate_number} against the original and it's genuine. It takes effect straight away.`,
            revoke: `${confirm.cert.certificate_number} stops applying immediately. Anything relying on it (exemptions or withholding) stops too.`,
            delete: `Delete ${confirm.cert.certificate_number} and its uploaded document? This can't be undone.`,
          }[confirm.kind]}
          confirmLabel={{ verify: 'Verify', revoke: 'Revoke', delete: 'Delete' }[confirm.kind]}
          busyLabel={{ verify: 'Verifying…', revoke: 'Revoking…', delete: 'Deleting…' }[confirm.kind]}
          danger={confirm.kind !== 'verify'}
          withReason={confirm.kind === 'revoke'}
          busy={actionLoading}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
