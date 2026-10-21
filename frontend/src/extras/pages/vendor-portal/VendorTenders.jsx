import { vendorPortalAPI } from '../../../_shared/api/index';
import { SitePage, Heading } from '../../components/procurement/ui';
import TenderBoard from '../../components/procurement/TenderBoard';

const TABS = [['active', 'Active'], ['restricted', 'Restricted'], ['closed', 'Closed'], ['agpo', 'AGPO'], ['terminated', 'Terminated'], ['all', 'All']];
const fetchList = (p) => vendorPortalAPI.tenders(p);
const exportList = (p) => vendorPortalAPI.exportTenders(p);

export default function VendorTenders() {
  return (
    <SitePage width={1280} crumbs={[['Home', '/'], ['Vendor portal', '/vendor-portal'], ['Tenders', null]]}>
      <Heading title="Tenders and notices" description="Every notice you may see: public ones, and the Restricted tab holds those meant only for vendors, for pre-qualified vendors, or for you by invitation." />
      <TenderBoard fetchList={fetchList} exportList={exportList} basePath="/vendor-portal/tenders" tabs={TABS} />
    </SitePage>
  );
}
