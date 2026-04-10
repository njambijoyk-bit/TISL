import { BookOpen } from 'lucide-react';
import SettingsLayout from '../../../../components/layout/SettingsLayout';
import ContentPageEditor from '../../../../components/settings/ContentPageEditor';

export default function ManualSettings() {
  return (
    <SettingsLayout>
      <ContentPageEditor
        pageType="manual"
        title="Manual"
        subtitle="User guide sections and documentation"
        icon={BookOpen}
        iconBg="bg-indigo-500"
      />
    </SettingsLayout>
  );
}