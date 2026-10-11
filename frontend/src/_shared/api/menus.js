import api from './axios';

/** Menus: ingredients (families of stock items), dishes, the Menus settings. Recipes are in stockOps.js. */
export const menusAPI = {
  ingredients: async (params) => (await api.get('/admin/menus/ingredients', { params })).data,
  saveIngredient: async (payload, id) => (id ? (await api.put(`/admin/menus/ingredients/${id}`, payload)) : (await api.post('/admin/menus/ingredients', payload))).data,
  removeIngredient: async (id) => (await api.delete(`/admin/menus/ingredients/${id}`)).data,
  suggestUnits: async (variantId, unitId) => (await api.post('/admin/menus/ingredients/suggest', { variant_id: variantId, unit_id: unitId })).data,
  dishes: async (params) => (await api.get('/admin/menus/dishes', { params })).data,
  saveDish: async (payload, id) => (id ? (await api.put(`/admin/menus/dishes/${id}`, payload)) : (await api.post('/admin/menus/dishes', payload))).data,
  soldOut: async (id, soldOut) => (await api.post(`/admin/menus/dishes/${id}/sold-out`, { sold_out: soldOut })).data,
  removeDish: async (id) => (await api.delete(`/admin/menus/dishes/${id}`)).data,
  menus: async () => (await api.get('/admin/menus/menus')).data,
  saveMenu: async (payload, id) => (id ? (await api.put(`/admin/menus/menus/${id}`, payload)) : (await api.post('/admin/menus/menus', payload))).data,
  removeMenu: async (id) => (await api.delete(`/admin/menus/menus/${id}`)).data,
  dishOptions: async (dishId) => (await api.get(`/admin/menus/dishes/${dishId}/options`)).data,
  saveDishOptions: async (dishId, groups) => (await api.put(`/admin/menus/dishes/${dishId}/options`, { groups })).data,
  orders: async (params) => (await api.get('/admin/menus/orders', { params })).data,
  setOrderStatus: async (id, to, reason) => (await api.post(`/admin/menus/orders/${id}/status`, { to, reason })).data,
  payOrder: async (id, tenders) => (await api.post(`/admin/menus/orders/${id}/pay`, { tenders })).data,
  channels: async () => (await api.get('/admin/menus/channels')).data,
  saveChannel: async (id, payload) => (await api.put(`/admin/menus/channels/${id}`, payload)).data,
  settings: async () => (await api.get('/admin/menus/settings')).data,
  saveSettings: async (payload) => (await api.put('/admin/menus/settings', payload)).data,
};

export default menusAPI;
