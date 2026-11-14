import { Hammer } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';

/**
 * Projects is being rebuilt from nothing (docs/PROJECTS_STAGE1_SPEC.md). The old screens are gone and the new ones arrive build by build;
 * until the first of them lands this page says so, plainly, instead of leaving a broken link.
 */
const STEPS = [
  'Your industry and its own words for things',
  'Projects with stages, phases and a cost centre in the books',
  'People on a project and what each may do',
  'A record of every action, and a trash you can recover from',
];

export default function ProjectsHome() {
  return (
    <AdminLayout>
      <PageHeader title="Projects" subtitle="Being rebuilt" />
      <div
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 28,
          maxWidth: 640,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)',
              color: 'var(--color-primary-500)',
            }}
          >
            <Hammer size={20} aria-hidden="true" />
          </span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-heading)' }}>The new Projects is on its way</h2>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          The old Projects screens have been removed. The new module is built in stages. The first stage brings:
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </AdminLayout>
  );
}
