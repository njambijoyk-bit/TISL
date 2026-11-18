import { Navigate, Route, Routes } from 'react-router-dom';
import ProjectsList from '/src/projects/pages/admin/ProjectsList.jsx';
import ProjectForm from '/src/projects/pages/admin/ProjectForm.jsx';
import ProjectDetail from '/src/projects/pages/admin/ProjectDetail.jsx';
import ProjectConfiguration from '/src/projects/pages/admin/ProjectConfiguration.jsx';
import ProjectsLog from '/src/projects/pages/admin/ProjectsLog.jsx';
import ProjectsTrash from '/src/projects/pages/admin/ProjectsTrash.jsx';
import ProjectsApprovals from '/src/projects/pages/admin/ProjectsApprovals.jsx';
import ProjectsSecurity from '/src/projects/pages/admin/ProjectsSecurity.jsx';
import ProjectsLeads from '/src/projects/pages/admin/ProjectsLeads.jsx';
import LeadDetail from '/src/projects/pages/admin/LeadDetail.jsx';
import ProjectsPipeline from '/src/projects/pages/admin/ProjectsPipeline.jsx';
import ProjectsFollowUps from '/src/projects/pages/admin/ProjectsFollowUps.jsx';
import ProjectsClients from '/src/projects/pages/admin/ProjectsClients.jsx';
import ClientDetail from '/src/projects/pages/admin/ClientDetail.jsx';
import ProjectsDirectory from '/src/projects/pages/admin/ProjectsDirectory.jsx';
import VoucherForm from '/src/core/pages/admin/books/VoucherForm.jsx';
import ProjectsClientMoney from '/src/projects/pages/admin/ProjectsClientMoney.jsx';
import ProjectsTimesheet from '/src/projects/pages/admin/ProjectsTimesheet.jsx';
import ProjectsMyWork from '/src/projects/pages/admin/ProjectsMyWork.jsx';
import ProjectsInbox from '/src/projects/pages/admin/ProjectsInbox.jsx';
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
      <Route path="/admin/projects/leads" element={<ProjectsLeads />} />
      <Route path="/admin/projects/pipeline" element={<ProjectsPipeline />} />
      <Route path="/admin/projects/follow-ups" element={<ProjectsFollowUps />} />
      <Route path="/admin/projects/clients" element={<ProjectsClients />} />
      <Route path="/admin/projects/clients/:id" element={<ClientDetail />} />
      <Route path="/admin/projects/directory" element={<ProjectsDirectory />} />
      <Route path="/admin/books/vouchers/new" element={<VoucherForm />} />
      <Route path="/admin/projects/client-money" element={<ProjectsClientMoney />} />
      <Route path="/admin/projects/timesheet" element={<ProjectsTimesheet />} />
      <Route path="/admin/projects/my-work" element={<ProjectsMyWork />} />
      <Route path="/admin/projects/inbox" element={<ProjectsInbox />} />
      <Route path="/admin/projects/leads/:id" element={<LeadDetail />} />
      <Route path="/admin/projects/new" element={<ProjectForm />} />
      <Route path="/admin/projects/:id" element={<ProjectDetail />} />
      <Route path="/admin/projects/:id/edit" element={<ProjectForm />} />
    </Routes>
    </>
  );
}
