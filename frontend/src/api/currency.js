import api from './axios';

const currencyAPI = {
  // Get all currencies 
  getCurrencies: async () => {
    const response = await api.get('/api/admin/currencies');
    return response.data;
  },

  // Get current base currency 
  getBaseCurrency: async () => {
    const response = await api.get('/api/admin/currencies/base');
    return response.data;
  },

  // Set base currency 
  setBaseCurrency: async (currencyId) => {  // Changed: use ID, not code
    const response = await api.post('/api/admin/currencies/base', {
      currency_id: currencyId  // Matches controller validation
    });
    return response.data;
  },

  // Update currency (for rates, etc.) 
  updateCurrency: async (currencyId, data) => {
    const response = await api.put(`/api/admin/currencies/${currencyId}`, data);
    return response.data;
  },

  // Toggle status 
  toggleStatus: async (currencyId, isActive) => {
    const response = await api.patch(`/api/admin/currencies/${currencyId}/status`, {
      is_active: isActive 
    });
    return response.data;
  },

  updateAnchorRate: async (currencyId, anchorRate) => {
    const response = await api.patch(`/api/admin/currencies/${currencyId}/anchor-rate`, {
        anchor_rate: anchorRate
    });
    return response.data;
    },

  // Add currency 
  createCurrency: async (currencyData) => {
    const response = await api.post('/api/admin/currencies', currencyData);
    return response.data;
  },

  // Delete currency 
  deleteCurrency: async (currencyId) => {
    const response = await api.delete(`/api/admin/currencies/${currencyId}`);
    return response.data;
  },
};

export default currencyAPI;

