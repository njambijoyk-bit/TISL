import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import ReportFrame from '../../../components/admin/reports/ReportFrame';
import { StockSummaryView, StockQueryView } from '../../../components/admin/reports/StockReportViews';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance } from '../../../../_shared/lib/roles';

/**
 * Stock reports (Purchases page): the stock summary, the location summary and the stock query, for every kind of stocked item. They are the engine's reports,
 * framed like the others, so they filter, run and export the same way; the Reports page opens the same definitions.
 */
const TABS = [['summary', 'Stock summary', 'stock-summary'], ['location', 'Location summary', 'stock-location-summary'], ['query', 'Stock query', 'stock-query']];

export default function StockReports() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'summary';
  const [, , key] = TABS.find(([k]) => k === tab);

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the stock reports" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <HubHeader title="Stock reports" description="Stock by group and item, by branch, and one item at a time: products and the kitchen's stock." />
        <Tabs tabs={TABS.map(([k, l]) => ({ id: k, label: l }))} active={tab} onChange={(k) => setParams({ tab: k })} />
        <div style={{ marginTop: 14 }}>
          <ReportFrame key={key + (params.get('item') ?? '')} reportKey={key} initialOpts={key === 'stock-query' && params.get('item') ? { item: params.get('item') } : {}}>
            {(r, api) => (key === 'stock-query' ? <StockQueryView result={r} drill={api?.drill} /> : <StockSummaryView result={r} opts={api?.opts} />)}
          </ReportFrame>
        </div>
      </div>
    </AdminLayout>
  );
}
