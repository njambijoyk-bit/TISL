import { FileText } from 'lucide-react';
import SettingsLayout from '../../../../components/layout/SettingsLayout';
import ContentPageEditor from '../../../../components/settings/ContentPageEditor';

export default function AboutSettings() {
  return (
    <SettingsLayout>
      <ContentPageEditor
        pageType="about"
        title="About"
        subtitle="Company story, mission, team and values"
        icon={FileText}
        iconBg="bg-sky-500"
      />
    </SettingsLayout>
  );
}