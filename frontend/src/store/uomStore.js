import { create } from 'zustand';
import unitsOfMeasureAPI from '../api/unitsOfMeasure';
import { createRunners, upsertById, removeById, cleanParams } from './helpers/apiState';

/**
 * Units of measure + locale defaults. Units are small reference data, so the
 * full list is loaded once and filtered client-side.
 */
const useUomStore = create((set, get) => {
  const { act, load } = createRunners(set, get);

  return {
    units: [],
    localeDefaults: [],
    loaded: false,

    loading: { units: false, localeDefaults: false },
    actionLoading: false,
    error: null,

    // ── Selectors ────────────────────────────────────────────────────────
    activeUnits: () => get().units.filter((u) => u.is_active),
    unitsByDimension: (dimension) => get().units.filter((u) => u.dimension === dimension && u.is_active),
    dimensions: () => [...new Set(get().units.map((u) => u.dimension))].sort(),
    unitById: (id) => get().units.find((u) => u.id === Number(id)) ?? null,
    /** Base unit of a dimension (to_base_factor === 1), if configured. */
    baseUnitFor: (dimension) =>
      get().units.find((u) => u.dimension === dimension && Number(u.to_base_factor) === 1) ?? null,

    /**
     * Client-side conversion — same maths as UnitOfMeasure::convertTo().
     * Returns null across dimensions.
     */
    convertLocal: (fromId, toId, quantity) => {
      const from = get().unitById(fromId);
      const to = get().unitById(toId);
      if (!from || !to || from.dimension !== to.dimension || Number(to.to_base_factor) === 0) return null;
      return (Number(quantity) * Number(from.to_base_factor)) / Number(to.to_base_factor);
    },

    // ── Units ────────────────────────────────────────────────────────────
    /** Loads all units once; pass { force: true } to reload. */
    fetchUnits: ({ force = false, ...params } = {}) => {
      if (get().loaded && !force && !Object.keys(params).length) return Promise.resolve(get().units);
      return load('units', async () => {
        const res = await unitsOfMeasureAPI.getUnits(cleanParams(params));
        set({ units: res.units ?? [], loaded: !Object.keys(params).length });
        return res.units;
      }, 'Failed to load units');
    },

    /** data: { code, name, dimension, unit_system?, to_base_factor, is_active? } */
    createUnit: (data) => act(async () => {
      const res = await unitsOfMeasureAPI.createUnit(data);
      set({ units: upsertById(get().units, res.unit) });
      return res.unit;
    }, 'Failed to create unit'),

    /** 422 if changing dimension / to_base_factor on a unit that's in use. */
    updateUnit: (id, data) => act(async () => {
      const res = await unitsOfMeasureAPI.updateUnit(id, data);
      set({ units: upsertById(get().units, res.unit) });
      return res.unit;
    }, 'Failed to update unit'),

    deleteUnit: (id) => act(async () => {
      await unitsOfMeasureAPI.deleteUnit(id);
      set({ units: removeById(get().units, id) });
    }, 'Failed to delete unit'),

    /** Server-side conversion (authoritative). */
    convert: (fromId, toId, quantity) => unitsOfMeasureAPI.convert(fromId, toId, quantity),

    // ── Locale defaults ──────────────────────────────────────────────────
    fetchLocaleDefaults: (params = {}) => load('localeDefaults', async () => {
      const res = await unitsOfMeasureAPI.getLocaleDefaults(cleanParams(params));
      set({ localeDefaults: res.locale_defaults ?? [] });
      return res.locale_defaults;
    }, 'Failed to load locale defaults'),

    defaultUnitFor: (locale, dimension) =>
      get().localeDefaults.find((d) => d.locale === locale && d.dimension === dimension)?.unit ?? null,

    /** Upsert { locale, dimension, unit_id } */
    setLocaleDefault: (data) => act(async () => {
      const res = await unitsOfMeasureAPI.setLocaleDefault(data);
      const rest = get().localeDefaults.filter(
        (d) => !(d.locale === data.locale && d.dimension === data.dimension)
      );
      set({ localeDefaults: [...rest, res.locale_default] });
      return res.locale_default;
    }, 'Failed to save locale default'),

    deleteLocaleDefault: (id) => act(async () => {
      await unitsOfMeasureAPI.deleteLocaleDefault(id);
      set({ localeDefaults: removeById(get().localeDefaults, id) });
    }, 'Failed to remove locale default'),

    clearError: () => set({ error: null }),
  };
});

export default useUomStore;
