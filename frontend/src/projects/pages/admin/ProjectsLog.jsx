import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useProjectNames } from '../../lib/names';
import ActivityPanel from '../../components/ActivityPanel';
import { Btn } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

/** The log of the whole module (build 1.6), for people who hold "read the activity log". It never shows a line of work the reader could not open. */
export default function ProjectsLog() {
  const navigate = useNavigate();
  const { t } = useProjectNames();
  const fetch = useCallback((params) => projectsAPI.logAll(params), []);
  const describe = (what) => what.replace(/^Project\b/, t('project')).replace(/^Phase\b/, t('phase'));
  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title={`${t('project', true)} activity log`} subtitle="Who did what, and what was refused" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
      <ActivityPanel fetch={fetch} showProject describe={describe} title="Everything" hint={`Across every ${t('project', false, true)} you may open, and the settings. Lines are only ever added.`} />
    </AdminLayout>
  );
}
