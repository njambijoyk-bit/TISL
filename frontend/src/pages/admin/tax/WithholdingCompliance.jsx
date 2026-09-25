import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import CreditsSection from '../../../components/admin/withholding/CreditsSection';
import WhtCertificatesSection from '../../../components/admin/withholding/WhtCertificatesSection';
import ClassificationsSection from '../../../components/admin/withholding/ClassificationsSection';
import CertificatesPanel from '../../../components/admin/tax/certificates/CertificatesPanel';
import useWithholdingStore from '../../../store/withholdingStore';
import useAuthStore from '../../../store/authStore';
import { canReadFinance, canWriteFinance } from '../../../lib/roles';

const TABS = [
  { id: 'credits',         label: 'Credits' },
  { id: 'certificates',    label: 'Withholding certificates' },
  { id: 'agents',          label: 'Agent certificates' },
  { id: 'classifications', label: 'Classifications' },
];

/**
 * Withholding & Compliance — tax customers deduct when paying TISL:
 * what's still to be cleared, the certificate chase per deduction, which
 * customers are authorised agents, and the rate classifications.
 */
export default function WithholdingCompliance() {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user);
  const error = useWithholdingStore((s) => s.error);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'credits';

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canRead ? <NoAccess what="withholding" /> : (
          <>
            <HubHeader
              title="Withholding & Compliance"
              description="Tax customers deducted from their payments to TISL, the certificates proving it, and which customers are authorised to withhold."
            />
            {error && <p role="alert" style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#991b1b' }}>{error}</p>}
            <Tabs tabs={TABS} active={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} />
            {tab === 'credits'         && <CreditsSection canWrite={canWrite} />}
            {tab === 'certificates'    && <WhtCertificatesSection canWrite={canWrite} />}
            {tab === 'agents'          && <CertificatesPanel certificateType="withholding_agent" />}
            {tab === 'classifications' && <ClassificationsSection canWrite={canWrite} />}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
