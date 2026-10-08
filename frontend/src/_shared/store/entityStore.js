import { create } from 'zustand';
import entitiesAPI from '../api/entities';

/**
 * The company (legal entity) this browser TAB is looking at, like the Viewing chip in Tally. It is kept in sessionStorage, not localStorage,
 * so two tabs can show two companies at once; api/axios.js sends it as X-Entity. While there is one company nothing is shown or sent.
 */
const KEY = 'entity-in-tab';

export const chosenEntityId = () => {
  try {
    const v = sessionStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};

const useEntityStore = create((set, get) => ({
  entities: [],
  currentId: chosenEntityId(),
  loaded: false,

  isMulti: () => get().entities.length > 1,

  current: () => {
    const { entities, currentId } = get();
    return entities.find((e) => e.id === currentId) || entities.find((e) => e.is_default) || entities[0] || null;
  },

  fetch: async () => {
    try {
      const res = await entitiesAPI.list();
      const stillThere = res.data.some((e) => e.id === get().currentId);
      set({ entities: res.data, loaded: true, currentId: stillThere ? get().currentId : null });
    } catch {
      set({ loaded: true });
    }
  },

  /** Switch this tab to another company and reload, so every screen asks again. */
  choose: (id) => {
    try { sessionStorage.setItem(KEY, String(id)); } catch { /* the tab keeps the default company */ }
    window.location.reload();
  },
}));

export default useEntityStore;
