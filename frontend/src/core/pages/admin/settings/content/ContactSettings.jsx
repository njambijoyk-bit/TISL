import { Phone } from 'lucide-react';
import SettingsLayout from '../../../../../_shared/components/layout/SettingsLayout';
import ContentPageEditor from '../../../../components/settings/ContentPageEditor';

export default function ContactSettings() {
  return (
    <SettingsLayout>
      <ContentPageEditor
        pageType="contact"
        title="Contact"
        subtitle="Contact details, address and enquiry settings"
        icon={Phone}
        iconBg="bg-teal-500"
      />
    </SettingsLayout>
  );
}