import useNamesStore from './names';

/**
 * The shortcut keys of Projects (docs/PROJECTS_STAGE1_SPEC.md, build 1.9). The letters are settings that come with the words (the company's, with
 * each person's own on top); this file only says where each key leads and which permission the place needs.
 */
export const GO = [
  { key: 'go_list', what: 'the list', path: '/admin/projects', perm: 'projects.use' },
  { key: 'go_new', what: 'start a new one', path: '/admin/projects/new', perm: 'projects.create' },
  { key: 'go_log', what: 'the activity log', path: '/admin/projects/log', perm: 'projects.log.view' },
  { key: 'go_trash', what: 'the trash', path: '/admin/projects/trash', perm: 'projects.delete' },
  { key: 'go_config', what: 'Configuration', path: '/admin/projects/configuration', perm: 'projects.config.view' },
  { key: 'go_mywork', what: 'My Work', path: '/admin/projects/my-work', perm: 'projects.use' },
  { key: 'go_inbox', what: 'the inbox', path: '/admin/projects/inbox', perm: 'projects.use' },
  { key: 'go_team', what: 'the team', path: '/admin/projects/team', perm: 'projects.team.view' },
];

/** On an open piece of work: each presses the control that carries this mark, if it is on the screen. */
export const ON = [
  { key: 'act_edit', what: 'Edit it', mark: 'edit' },
  { key: 'act_hold', what: 'Put it on hold, or resume it', mark: 'hold' },
  { key: 'act_next', what: 'Move it to the next stage', mark: 'next' },
  { key: 'act_delete', what: 'Delete it (asks first)', mark: 'delete' },
  { key: 'tab_overview', what: 'Open its Overview', mark: 'tab-overview' },
  { key: 'tab_phases', what: 'Open its phases', mark: 'tab-phases' },
  { key: 'tab_people', what: 'Open its People', mark: 'tab-people' },
  { key: 'tab_links', what: 'Open its Links', mark: 'tab-links' },
  { key: 'tab_activity', what: 'Open its Activity', mark: 'tab-activity' },
];

export const onOpenProject = (pathname) => /^\/admin\/projects\/\d+\/?$/.test(pathname);

/** The rows Projects adds to the key list (Shift+A), for the page being looked at. `may(permission)` says what this person can open. */
export function projectKeyRows(pathname, may) {
  if (!pathname.startsWith('/admin/projects')) return [];
  const { keys, names } = useNamesStore.getState();
  const many = names.project?.plural || 'Projects';
  const rows = GO.filter((g) => keys[g.key] && may(g.perm)).map((g) => ['G', keys[g.key], `Go to ${many}, ${g.what} (press G, then ${keys[g.key]})`]);
  if (onOpenProject(pathname)) ON.filter((o) => keys[o.key]).forEach((o) => rows.push(['Shift', keys[o.key], o.what]));
  return rows;
}
