import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, FormStack, TextInput } from '../../../core/components/admin/ui/Form';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card } from '../../../_shared/theme/tokens';
import CoursesNav from '../../components/CoursesNav';

export default function CoursesSettings() {
  const user = useAuthStore((s) => s.user);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { coursesAPI.meta().then((m) => setS(m.settings)).catch((e) => toast.error(errMsg(e, 'Could not load'))); }, []);
  if (!hasPermission(user, 'courses.manage')) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Courses settings" /></div></AdminLayout>;
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await coursesAPI.saveSettings({ live_open_minutes: Number(s.live_open_minutes), live_grace_minutes: Number(s.live_grace_minutes), download_minutes: Number(s.download_minutes), max_file_mb: Number(s.max_file_mb), default_access_days: s.default_access_days === '' || s.default_access_days == null ? null : Number(s.default_access_days) });
      setS(r.settings); toast.success('Saved.');
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 760, margin: '0 auto' }} data-testid="courses-settings">
        <CoursesNav />
        <HubHeader title="Courses settings" description="When live links show, how long download links last, and how big a file can be." />
        {s && (
          <section style={{ ...card, padding: 16 }}>
            <FormStack>
              <Field label="Show the join link this many minutes before a live session starts" htmlFor="cs-open"><TextInput id="cs-open" inputMode="numeric" value={s.live_open_minutes} onChange={set('live_open_minutes')} /></Field>
              <Field label="…and keep showing it this many minutes after it ends" htmlFor="cs-grace"><TextInput id="cs-grace" inputMode="numeric" value={s.live_grace_minutes} onChange={set('live_grace_minutes')} /></Field>
              <Field label="A download link works for (minutes)" htmlFor="cs-dl"><TextInput id="cs-dl" inputMode="numeric" value={s.download_minutes} onChange={set('download_minutes')} /></Field>
              <Field label="Largest file (MB)" htmlFor="cs-mb"><TextInput id="cs-mb" inputMode="numeric" value={s.max_file_mb} onChange={set('max_file_mb')} /></Field>
              <Field label="Access lasts (days) when an offering does not say" htmlFor="cs-days" hint="Empty: for ever."><TextInput id="cs-days" inputMode="numeric" value={s.default_access_days ?? ''} onChange={set('default_access_days')} /></Field>
              <div><button type="button" style={btnPrimary} onClick={save} disabled={busy}>Save</button></div>
            </FormStack>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
