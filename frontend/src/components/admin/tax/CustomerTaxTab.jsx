import { useEffect, useState } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import useTaxCertificateStore from '../../../store/taxCertificateStore';
import useWithholdingStore from '../../../store/withholdingStore';
import useAuthStore from '../../../store/authStore';
import { canReadFinance, canWriteFinance } from '../../../lib/roles';
import StatusBadge from '../../common/StatusBadge';
import TaxOverridesPanel from './TaxOverridesPanel';
import {
  colors, card, input, focusRing, label as labelStyle, hint as hintStyle, btnPrimary, radius,
} from '../../../theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);
const isCurrentlyValid = (c) =>
  c.status === 'verified' && (!c.valid_until || c.valid_until.slice(0, 10) >= today());

const TYPE_LABEL = { exemption: 'Tax exemption', withholding_agent: 'Withholding agent' };

/**
 * "Tax" tab on the admin customer page:
 *   1. Withholding profile — is this customer a withholding agent, and at what classification
 *   2. Their tax certificates (exemption / withholding agent)
 *   3. Tax overrides for this customer
 *
 * @param {object}   customer   the customer payload from CustomerDetail
 * @param {function} onUpdated  (patch) => void — merge the saved withholding fields back into the page
 */
export default function CustomerTaxTab({ customer, onUpdated }) {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user);

  const { certificates, loading: certLoading, fetchForHolder } = useTaxCertificateStore();
  const { classifications, fetchClassifications, updateCustomerProfile, actionLoading } = useWithholdingStore();

  const [isAgent, setIsAgent] = useState(Boolean(customer?.is_withholding_agent));
  const [classificationId, setClassificationId] = useState(customer?.withholding_classification_id ?? '');

  useEffect(() => {
    setIsAgent(Boolean(customer?.is_withholding_agent));
    setClassificationId(customer?.withholding_classification_id ?? '');
  }, [customer?.id, customer?.is_withholding_agent, customer?.withholding_classification_id]);

  useEffect(() => {
    if (!canRead || !customer?.id) return;
    fetchForHolder('customer', customer.id).catch(() => {});
    if (!classifications.length) fetchClassifications({ active: true }).catch(() => {});
  }, [customer?.id, canRead]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canRead) {
    return (
      <div style={{ ...card, padding: 20 }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>
          Tax details are visible to finance, manager, admin and super admin users.
        </p>
      </div>
    );
  }

  const agentCert = certificates.find((c) => c.certificate_type === 'withholding_agent' && isCurrentlyValid(c));
  const dirty = isAgent !== Boolean(customer?.is_withholding_agent)
    || String(classificationId || '') !== String(customer?.withholding_classification_id || '');

  const saveProfile = async () => {
    if (isAgent && !classificationId) { toast.error('Choose a withholding classification.'); return; }
    try {
      const saved = await updateCustomerProfile(customer.id, {
        is_withholding_agent: isAgent,
        withholding_classification_id: isAgent ? Number(classificationId) : null,
      });
      onUpdated?.(saved);
      toast.success('Withholding profile saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save the withholding profile');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── 1. Withholding profile ── */}
      <div style={{ ...card, padding: 20 }}>
        <p style={{ margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 700, color: colors.primaryDeep }}>Withholding tax</p>
        <p style={{ margin: '0 0 16px', fontSize: '0.75rem', color: colors.textFaint, maxWidth: 560 }}>
          Withholding agents deduct tax when they pay TISL and send us a certificate for the amount deducted.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canWrite ? 'pointer' : 'default' }}>
            <input
              type="checkbox"
              checked={isAgent}
              disabled={!canWrite}
              onChange={(e) => setIsAgent(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: colors.primary }}
            />
            <span>
              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: colors.text }}>This customer is a withholding agent</span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: colors.textFaint }}>e.g. government bodies and large companies appointed by KRA</span>
            </span>
          </label>

          {isAgent && (
            <div>
              <label htmlFor="wht-classification" style={labelStyle}>Classification</label>
              <select
                id="wht-classification"
                value={classificationId}
                disabled={!canWrite}
                onChange={(e) => setClassificationId(e.target.value)}
                style={{ ...input, cursor: canWrite ? 'pointer' : 'not-allowed' }}
                {...(canWrite ? focusRing : {})}
              >
                <option value="">Choose a classification</option>
                {classifications.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.code}){c.default_tax_rate ? ` — ${Number(c.default_tax_rate.rate_value)}%` : ''}
                  </option>
                ))}
              </select>
              <p style={hintStyle}>Sets the rate withheld from their payments.</p>
            </div>
          )}
        </div>

        {isAgent && !agentCert && (
          <div style={{
            marginTop: 16, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: radius.lg,
            background: colors.warningBg, color: colors.warningText, fontSize: '0.78rem', lineHeight: 1.5,
          }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Nothing will be withheld yet: this customer has no verified, in-date withholding-agent certificate.
              Add one and verify it for withholding to start.
            </span>
          </div>
        )}
        {isAgent && agentCert && (
          <p style={{ margin: '14px 0 0', fontSize: '0.78rem', color: colors.successText, display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status="verified" /> Authorised by certificate {agentCert.certificate_number}
            {agentCert.valid_until && <> until {agentCert.valid_until.slice(0, 10)}</>}
          </p>
        )}

        {canWrite && dirty && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={saveProfile} disabled={actionLoading} style={{ ...btnPrimary, opacity: actionLoading ? 0.6 : 1 }}>
              {actionLoading ? 'Saving…' : 'Save withholding profile'}
            </button>
          </div>
        )}
      </div>

      {/* ── 2. Certificates ── */}
      <div style={{ ...card, padding: 20 }}>
        <p style={{ margin: '0 0 14px', fontSize: '0.875rem', fontWeight: 700, color: colors.primaryDeep }}>Tax certificates</p>
        {certLoading.list ? (
          <div style={{ height: 56, borderRadius: radius.lg, background: colors.tint(0.06) }} />
        ) : certificates.length === 0 ? (
          <p style={{
            margin: 0, padding: '18px 16px', borderRadius: radius.lg, fontSize: '0.8rem',
            color: colors.textMuted, border: `1.5px dashed ${colors.tint(0.2)}`,
          }}>
            No certificates on file for this customer.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.tint(0.1)}` }}>
                  {['Type', 'Number', 'Issued', 'Valid until', 'Status', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => {
                  const expired = c.status === 'verified' && !isCurrentlyValid(c);
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${colors.tint(0.05)}` }}>
                      <td style={{ padding: '10px' }}>{TYPE_LABEL[c.certificate_type] ?? c.certificate_type}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: colors.text }}>{c.certificate_number}</td>
                      <td style={{ padding: '10px', color: colors.textMuted }}>{c.issued_at?.slice(0, 10) ?? '—'}</td>
                      <td style={{ padding: '10px', color: colors.textMuted }}>{c.valid_until?.slice(0, 10) ?? 'No expiry'}</td>
                      <td style={{ padding: '10px' }}><StatusBadge status={expired ? 'expired' : c.status} /></td>
                      <td style={{ padding: '10px' }}>
                        {c.document_path && (
                          <a href={c.document_path} target="_blank" rel="noreferrer" aria-label="Open document"
                            style={{ color: colors.primary, display: 'inline-flex' }}>
                            <FileText size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 3. Overrides ── */}
      <TaxOverridesPanel taxableType="customer" taxableId={customer?.id} />
    </div>
  );
}
