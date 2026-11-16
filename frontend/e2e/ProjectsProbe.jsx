import { Navigate, Route, Routes } from 'react-router-dom';
import ProjectsList from '/src/projects/pages/admin/ProjectsList.jsx';
import ProjectForm from '/src/projects/pages/admin/ProjectForm.jsx';
import ProjectDetail from '/src/projects/pages/admin/ProjectDetail.jsx';
import ProjectConfiguration from '/src/projects/pages/admin/ProjectConfiguration.jsx';
import ProjectsLog from '/src/projects/pages/admin/ProjectsLog.jsx';
import ProjectsTrash from '/src/projects/pages/admin/ProjectsTrash.jsx';
import ProjectsApprovals from '/src/projects/pages/admin/ProjectsApprovals.jsx';
import ProjectsSecurity from '/src/projects/pages/admin/ProjectsSecurity.jsx';
import KeyboardShortcuts from '/src/_shared/components/common/KeyboardShortcuts.jsx';

/** The Projects screens with their own addresses, so moving between them works as in the app. Starts at ?at=/admin/projects/... */
export default function ProjectsProbe() {
  const at = new URLSearchParams(window.location.search).get('at') || '/admin/projects';
  return (
    <>
    <KeyboardShortcuts />
    <Routes>
      <Route path="/e2e/*" element={<Navigate to={at} replace />} />
      <Route path="/admin/projects" element={<ProjectsList />} />
      <Route path="/admin/projects/configuration" element={<ProjectConfiguration />} />
      <Route path="/admin/projects/log" element={<ProjectsLog />} />
      <Route path="/admin/projects/trash" element={<ProjectsTrash />} />
      <Route path="/admin/projects/approvals" element={<ProjectsApprovals />} />
      <Route path="/admin/projects/security" element={<ProjectsSecurity />} />
      <Route path="/admin/projects/new" element={<ProjectForm />} />
      <Route path="/admin/projects/:id" element={<ProjectDetail />} />
      <Route path="/admin/projects/:id/edit" element={<ProjectForm />} />
    </Routes>
    </>
  );
}
