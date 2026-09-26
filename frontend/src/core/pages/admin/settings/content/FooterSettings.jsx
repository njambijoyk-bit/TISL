import { FootprintsIcon } from 'lucide-react';
import SettingsLayout from '../../../../../_shared/components/layout/SettingsLayout';
import ContentPageEditor from '../../../../components/settings/ContentPageEditor';

export default function FooterSettings() {
  return (
    <SettingsLayout>
      <ContentPageEditor
        pageType="footer"
        title="Footer"
        subtitle="Footer columns, links and copyright text"
        icon={FootprintsIcon}
        iconBg="bg-slate-500"
      />
    </SettingsLayout>
  );
}