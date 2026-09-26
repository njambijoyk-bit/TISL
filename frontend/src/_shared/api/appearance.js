import api from './axios';

export const appearanceAPI = {
  // Public
  getOptions: ()                => api.get('/appearance/options'),

  // Auth
  getPreferences: ()            => api.get('/appearance/preferences'),
  savePreferences: (data)       => api.post('/appearance/preferences', data),

  // Admin — colourings
  adminGetColourings: ()        => api.get('/admin/appearance/colourings'),
  adminCreateColouring: (data)  => api.post('/admin/appearance/colourings', data),
  adminUpdateColouring: (id, d) => api.patch(`/admin/appearance/colourings/${id}`, d),

  // Admin — fonts
  adminGetFonts: ()             => api.get('/admin/appearance/fonts'),
  adminUpdateFont: (id, d)      => api.patch(`/admin/appearance/fonts/${id}`, d),

  // Admin — icon styles
  adminGetIconStyles: ()        => api.get('/admin/appearance/icon-styles'),
  adminUpdateIconStyle: (id, d) => api.patch(`/admin/appearance/icon-styles/${id}`, d),

  // Admin — component layouts
  adminGetLayouts: ()           => api.get('/admin/appearance/layouts'),
  adminUpdateLayout: (id, d)    => api.patch(`/admin/appearance/layouts/${id}`, d),
};
