import api from '../../_shared/api/axios';

/**
 * Serious actions (docs/PROJECTS_STAGE2_SPEC.md, build 2.4). When the server answers that an action needs a supervisor first (428, with
 * `serious`), the person is asked whether to send it for approval, and why; the same request is then sent again with that answer. No screen
 * has to know which actions are serious: the table in Configuration decides, and this catches the answer for all of them.
 * The dialog is SeriousDialog; it listens for the event below. Confirming identity is Core's own step (the shared API client handles it).
 */
export const SERIOUS_EVENT = 'tisl:projects-serious';
let installed = false;

export function installSerious() {
  if (installed) return;
  installed = true;
  api.interceptors.response.use(undefined, async (error) => {
    const info = error.response?.data?.serious;
    const cfg = error.config;
    if (error.response?.status !== 428 || info?.state !== 'ask' || !cfg || cfg._seriousAsked || !String(cfg.url || '').includes('/admin/projects')) throw error;
    let answer;
    try {
      answer = await new Promise((resolve, reject) => window.dispatchEvent(new CustomEvent(SERIOUS_EVENT, { detail: { info, resolve, reject } })));
    } catch {
      error.response.data.message = 'Not sent. Nothing has changed.';   // they chose not to ask
      throw error;
    }
    cfg._seriousAsked = true;
    cfg.headers = cfg.headers || {};
    cfg.headers['X-Projects-Ask'] = '1';
    if (answer.reason) cfg.headers['X-Projects-Reason'] = encodeURIComponent(answer.reason);
    return api.request(cfg);   // answers 409 "Sent to N people...", which the screen shows as it shows any refusal
  });
}
