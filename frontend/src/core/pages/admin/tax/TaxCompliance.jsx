import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import TaxTypesSection from '../../../components/admin/tax/sections/TaxTypesSection';
import TaxRatesSection from '../../../components/admin/tax/sections/TaxRatesSection';
import TaxRulesSection from '../../../components/admin/tax/sections/TaxRulesSection';
import TaxDistrictsSection from '../../../components/admin/tax/sections/TaxDistrictsSection';
import TaxApplicationsSection from '../../../components/admin/tax/sections/TaxApplicationsSection';
import CertificatesPanel from '../../../components/admin/tax/certificates/CertificatesPanel';
import useTaxStore from '../../../../_shared/store/taxStore';
import useCurrencyStore from '../../../../_shared/store/currencyStore';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';

const TABS = [
  { id: 'rates',        label: 'Rates' },
  { id: 'rules',        label: 'Rules' },
  { id: 'types',        label: 'Tax types' },
  { id: 'districts',    label: 'Districts' },
  { id: 'certificates', label: 'Exemption certificates' },
  { id: 'log',          label: 'Tax charged' },
];

/**
 * Tax & Compliance — additive tax setup (VAT, excise…) plus the exemption
 * certificates that let customers skip it. Tab lives in ?tab= so it can be linked.
 */
export default function TaxCompliance() {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'rates';

  const { types, rates, rules, fetchTypes, fetchRates, fetchRules, fetchDistricts, error, clearError } = useTaxStore();
  const fetchAdminCurrencies = useCurrencyStore((s) => s.fetchAdminCurrencies);

  useEffect(() => {
    if (!canRead) return;
    // Everything but the log is small reference data — load it once for all tabs.
    Promise.all([fetchTypes(), fetchRates(), fetchRules(), fetchDistricts(), fetchAdminCurrencies()]).catch(() => {});
    return () => clearError();
  }, [canRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = { rates: rates.length, rules: rules.length, types: types.length };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canRead ? <NoAccess what="tax settings" /> : (
          <>
            <HubHeader
              title="Tax & Compliance"
              description="What tax is charged, when, and which customers hold exemption certificates."
            />
            {error && (
              <p role="alert" style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#991b1b' }}>{error}</p>
            )}
            <Tabs
              tabs={TABS.map((t) => ({ ...t, count: counts[t.id] }))}
              active={tab}
              onChange={(id) => setParams({ tab: id }, { replace: true })}
            />
            {tab === 'rates'        && <TaxRatesSection canWrite={canWrite} />}
            {tab === 'rules'        && <TaxRulesSection canWrite={canWrite} />}
            {tab === 'types'        && <TaxTypesSection canWrite={canWrite} />}
            {tab === 'districts'    && <TaxDistrictsSection canWrite={canWrite} />}
            {tab === 'certificates' && <CertificatesPanel certificateType="exemption" />}
            {tab === 'log'          && <TaxApplicationsSection />}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
