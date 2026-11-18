import api from '../api/axios';

/**
 * Starting a record from a piece of work (docs/PROJECTS_STAGE7_SPEC.md, build 7.5). The work's Links tab opens a module's own "new" form with
 * ?for_project=ID; the form keeps its own rules, and after saving calls linkForWork so the new record comes back linked to the work.
 */
export const forWork = () => Number(new URLSearchParams(window.location.search).get('for_project')) || null;

/** Link the record just saved to the work it was started from. @return {Promise<number|null>} the work's id, or null when there was none or it failed */
export async function linkForWork(type, id) {
  const projectId = forWork();
  if (!projectId || !id) return null;
  try {
    await api.post('/admin/projects/linked', { type, id, project_id: projectId });
    return projectId;
  } catch {
    return null;   // saved, not linked: the form says so and the person can link it from the work
  }
}
