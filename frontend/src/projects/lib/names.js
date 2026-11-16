import { useEffect } from 'react';
import { create } from 'zustand';
import projectsAPI from '../../_shared/api/projects';

/**
 * What things are called on this person's screens. One structure serves every industry and only the words differ, so no Projects screen ever
 * types "Project", "Matter" or "Contract" itself: it asks `t('project')`. The words are loaded once and shared by every screen.
 */
const useNamesStore = create((set, get) => ({
  ready: false,       // the module's database is in place
  loaded: false,
  loading: false,
  failed: false,
  industry: null,     // the industry whose words this person sees
  companyIndustry: null,
  names: {},
  keys: {},           // this person's shortcut keys: { go_list: 'P', act_edit: 'E', ... }

  apply: (data) => set({ ready: !!data.ready, industry: data.industry, companyIndustry: data.company_industry, names: data.names || {}, keys: data.keys || {}, loaded: true, loading: false, failed: false }),

  load: async (force = false) => {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true });
    try {
      get().apply(await projectsAPI.names());
    } catch {
      set({ loading: false, loaded: true, failed: true });
    }
  },
}));

/** A term nobody has named yet still reads as words: scope_line -> "Scope line". */
const fallback = (key) => {
  const words = String(key).replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * const { t } = useProjectNames();
 * t('project')            -> "Matter"
 * t('project', true)      -> "Matters"
 * t('project', false, 1)  -> "matter"   (inside a sentence)
 */
export function useProjectNames() {
  const { names, loaded, ready, failed, industry, companyIndustry, load, apply } = useNamesStore();
  useEffect(() => { load(); }, [load]);

  const t = (key, plural = false, lower = false) => {
    const n = names[key];
    const word = n ? (plural ? n.plural : n.name) : fallback(key);
    return lower ? word.charAt(0).toLowerCase() + word.slice(1) : word;
  };

  return { t, loaded, ready, failed, industry, companyIndustry, reload: () => load(true), apply };
}

export default useNamesStore;
