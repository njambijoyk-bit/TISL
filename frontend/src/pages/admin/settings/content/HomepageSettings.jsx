import { Home } from 'lucide-react';
import SettingsLayout from '../../../../components/layout/SettingsLayout';
import ContentPageEditor from '../../../../components/settings/ContentPageEditor';

export default function HomepageSettings() {
  return (
    <SettingsLayout>
      <ContentPageEditor
        pageType="homepage"
        title="Homepage"
        subtitle="Hero banner, featured sections and CTAs"
        icon={Home}
        iconBg="bg-green-500"
      />
    </SettingsLayout>
  );
}