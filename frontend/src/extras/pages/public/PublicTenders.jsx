import { Link } from 'react-router-dom';
import { publicTendersAPI } from '../../../_shared/api/index';
import { colors } from '../../../_shared/theme/tokens';
import { Page, Heading } from '../../components/procurement/ui';
import { linkStyle } from '../../components/procurement/format';
import TenderBoard from '../../components/procurement/TenderBoard';
import { useAuthStore } from '../../../_shared/store/index';

const fetchList = (p) => publicTendersAPI.list(p);
const exportList = (p) => publicTendersAPI.exportXlsx(p);

export default function PublicTenders() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <Page width={1280}>
      <Heading title="Tenders" description="Tender notices and their documents. Bidding and awards are handled directly with our procurement office; this page tells you what is open." />
      <TenderBoard fetchList={fetchList} exportList={exportList} basePath="/tenders" />
      <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: 22, color: colors.textMuted }}>
        {isAuthenticated
          ? <>Some tenders are only for vendors. <Link to="/vendor-portal/tenders" style={linkStyle}>Open the vendor portal</Link>.</>
          : <>Some tenders are only for registered vendors. <Link to="/vendor-register" style={linkStyle}>Register as a vendor</Link> or <Link to="/login" style={linkStyle}>sign in</Link>.</>}
      </p>
    </Page>
  );
}
