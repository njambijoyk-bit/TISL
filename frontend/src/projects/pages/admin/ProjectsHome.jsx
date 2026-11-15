import { Hammer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import { hasPermission } from '../../../_shared/lib/roles';
import { useAuthStore } from '../../../_shared/store/index';
import { useProjectNames } from '../../lib/names';
import { Btn, Notice, Panel } from '../../components/ui';

/**
 * Projects is being rebuilt from nothing (docs/PROJECTS_STAGE1_SPEC.md). The old screens are gone and the new ones arrive build by build;
 * until the list of work lands, this page says so plainly and leads to what is already there.
 */
const STEPS = [
  'Your industry and its own words for things (ready: open Configuration)',
  'Work with stages, phases and a cost centre in the books',
  'People on each piece of work and what each may do',
  'A record of every action, and a trash you can recover from',
];

export default function ProjectsHome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { t, ready, loaded } = useProjectNames();
  const canConfigure = hasPermission(user, 'projects.config.view');

  return (
    <AdminLayout>
      <PageHeader
        title={t('project', true)}
        subtitle="Being rebuilt"
        actions={canConfigure ? <Btn onClick={() => navigate('/admin/projects/configuration')}>Configuration</Btn> : null}
      />
      {loaded && !ready && (
        <Notice status="warning" style={{ marginBottom: 16, maxWidth: 640 }}>
          The database for the new module is not in place yet. Run scripts 256 and 257, then load the permissions.
        </Notice>
      )}
      <Panel style={{ maxWidth: 640, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', color: 'var(--color-primary-500)' }}>
            <Hammer size={20} aria-hidden="true" />
          </span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>The new module is on its way</h2>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          The old screens have been removed. The new module is built in stages. The first stage brings:
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          {STEPS.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </Panel>
    </AdminLayout>
  );
}
