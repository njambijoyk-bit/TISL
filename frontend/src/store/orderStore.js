import { create } from 'zustand';
import ordersAPI from '../api/orders';

const useOrderStore = create((set, get) => ({
  // State
  orders: [],
  currentOrder: null,
  statistics: null,
  loading: false,
  error: null,

  // ========================================
  // CUSTOMER ACTIONS
  // ========================================

  /**
   * Fetch customer's orders
   */
  fetchMyOrders: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.getMyOrders(params);
      
      // Extract items (handles both paginated and flat responses)
      const items = response?.data && Array.isArray(response.data)
        ? response.data
        : Array.isArray(response) ? response : [];

      // ✅ Extract pagination from meta (Laravel standard)
      const meta = response?.meta || response;
      const pagination = meta?.current_page ? {
        current_page: meta.current_page,
        last_page:    meta.last_page,
        total:        meta.total,
        per_page:     meta.per_page,
      } : null;

      set({ 
        orders: items, 
        pagination,  // ✅ Store pagination for customer orders too
        loading: false 
      });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch orders', 
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Fetch single order
   */
  fetchOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.getOrder(id);
      set({ 
        currentOrder: response.order,
        loading: false 
      });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch order',
        loading: false 
      });
      throw error;
    }
  },

  trashMyOrder: async (id) => {
    set({ loading: true });
    try {
      const res = await ordersAPI.deleteMyOrder(id);
      return res;
    } finally {
      set({ loading: false });
    }
  },

  /**
   * Create new order (checkout)
   */
  createOrder: async (orderData) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.createOrder(orderData);
      set({ 
        currentOrder: response.order,
        loading: false 
      });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to create order',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Cancel order
   */
  cancelOrder: async (id, reason) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.cancelOrder(id, reason);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = orders.map(order => 
        order.id === id ? response.order : order
      );
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to cancel order',
        loading: false 
      });
      throw error;
    }
  },

  restoreCustomerOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.restoreCustomerOrder(id);

      const orders = get().orders;
      const updatedOrders = Array.isArray(orders)
        ? orders.map(order => order.id === id ? response.order : order)
        : orders?.data
          ? {
              ...orders,
              data: orders.data.map(order => order.id === id ? response.order : order),
            }
          : orders;

      set({
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false,
      });

      return response;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to restore order',
        loading: false,
      });
      throw error;
    }
  },


  // ========================================
  // ADMIN ACTIONS
  // ========================================
  // add pagination to state (top of store):
  pagination: null,

  /**
   * Fetch all orders (admin)
   */
  fetchAllOrders: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.getAllOrders(params);
      
      // Safely extract items
      const items = response?.data && Array.isArray(response.data)
        ? response.data
        : Array.isArray(response) ? response : [];

      // Laravel pagination can live in meta, pagination, or root
      const meta = response?.meta || response?.pagination || response;
      
      // Only build pagination object if we actually have page data
      const pagination = (meta?.current_page !== undefined) ? {
        current_page: meta.current_page,
        last_page:    meta.last_page,
        total:        meta.total,
        per_page:     meta.per_page,
      } : null;

      set({ orders: items, pagination, loading: false });
      return response;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch orders', loading: false });
      throw error;
    }
  },

// ADMIN: fetch single order (for /admin/orders/:id)
fetchAdminOrder: async (id) => {
  set({ loading: true, error: null });

  try {
    const response = await ordersAPI.getAdminOrder(id); // { order: {...} }
    set({
      currentOrder: response.order,
      loading: false,
    });
    return response;
  } catch (error) {
    set({
      error: error.response?.data?.message || 'Failed to fetch order',
      loading: false,
    });
    throw error;
  }
},

// orderStore.js
updateAdminOrder: async (id, data) => {
  set({ loading: true, error: null });
  try {
    const response = await ordersAPI.updateAdminOrder(id, data);
    const orders = get().orders;

    const updatedOrders = Array.isArray(orders)
      ? orders.map(o => (o.id === id ? response.order : o))
      : orders?.data
        ? {
            ...orders,
            data: orders.data.map(o => (o.id === id ? response.order : o)),
          }
        : orders;

    set({
      orders: updatedOrders,
      currentOrder: response.order,
      loading: false,
    });

    return response;
  } catch (error) {
    set({
      error: error.response?.data?.message || 'Failed to update order',
      loading: false,
    });
    throw error;
  }
},

adminUpdateOrder: async (orderId, payload) => {
  set({ loading: true, error: null });
  try {
    const response = await ordersAPI.adminUpdateOrder(orderId, payload);
    const orders = get().orders;
    const updatedOrders = Array.isArray(orders)
      ? orders.map(o => (o.id === orderId ? response.order : o))
      : orders?.data
        ? { ...orders, data: orders.data.map(o => (o.id === orderId ? response.order : o)) }
        : orders;
    set({ orders: updatedOrders, currentOrder: response.order, loading: false });
    return response;
  } catch (error) {
    set({ error: error.response?.data?.message || 'Failed to update order', loading: false });
    throw error;
  }
},

  /**
   * Fetch order statistics (admin)
   */
  fetchStatistics: async () => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.getOrderStatistics();
      set({ 
        statistics: response,
        loading: false 
      });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch statistics',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Update order status (admin)
   */
  updateOrderStatus: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.updateOrderStatus(id, data);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = orders.map(order => 
        order.id === id ? response.order : order
      );
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to update status',
        loading: false 
      });
      throw error;
    }
  },

updateMyOrder: async (id, data) => {
  set({ loading: true, error: null });
  try {
    const response = await ordersAPI.updateMyOrder(id, data);
    const orders = get().orders;
    const updatedOrders = Array.isArray(orders)
      ? orders.map(o => (o.id === id ? response.order : o))
      : orders?.data
        ? {
            ...orders,
            data: orders.data.map(o => (o.id === id ? response.order : o)),
          }
        : orders;

    set({
      orders: updatedOrders,
      currentOrder: response.order,
      loading: false,
    });
    return response;
  } catch (error) {
    set({
      error: error.response?.data?.message || 'Failed to update order',
      loading: false,
    });
    throw error;
  }
},

/**
 * Rate order (customer - only delivered orders)
 */
rateOrder: async (id, rating, feedback) => {
  set({ loading: true, error: null });
  try {
    const response = await ordersAPI.rateOrder(id, { rating, feedback });
    
    // Update orders list
    const orders = get().orders;
    const updatedOrders = Array.isArray(orders)
      ? orders.map(o => (o.id === id ? response.order : o))
      : orders?.data
        ? {
            ...orders,
            data: orders.data.map(o => (o.id === id ? response.order : o)),
          }
        : orders;
    
    set({ 
      orders: updatedOrders,
      currentOrder: response.order,
      loading: false 
    });
    
    return response;
  } catch (error) {
    set({ 
      error: error.response?.data?.message || 'Failed to submit rating',
      loading: false 
    });
    throw error;
  }
},

  /**
   * Confirm order (admin)
   */
  confirmOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.confirmOrder(id);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = orders.map(order => 
        order.id === id ? response.order : order
      );
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to confirm order',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Ship order (admin)
   */
  shipOrder: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.shipOrder(id, data);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = orders.map(order => 
        order.id === id ? response.order : order
      );
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to ship order',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Mark order as delivered (admin)
   */
  deliverOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.deliverOrder(id);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = orders.map(order => 
        order.id === id ? response.order : order
      );
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to deliver order',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Cancel order with refund (admin)
   */
  adminCancelOrder: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.adminCancelOrder(id, data);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = Array.isArray(orders)
        ? orders.map(o => (o.id === id ? response.order : o))
        : orders?.data
          ? {
              ...orders,
              data: orders.data.map(o => (o.id === id ? response.order : o)),
            }
          : orders;
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to cancel order',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Bulk cancel orders (admin)
   */
  bulkCancelOrders: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.bulkCancelOrders(data);
      
      // Refresh orders list
      await get().fetchAllOrders();
      
      set({ loading: false });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to bulk cancel',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Get refund preview (admin)
   */
  getRefundPreview: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.getRefundPreview(id);
      set({ loading: false });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to get refund preview',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Restore cancelled order (admin)
   */
  restoreOrder: async (id, restoreReason = '') => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.restoreOrder(id, { restore_reason: restoreReason });
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = Array.isArray(orders)
        ? orders.map(o => (o.id === id ? response.order : o))
        : orders?.data
          ? {
              ...orders,
              data: orders.data.map(o => (o.id === id ? response.order : o)),
            }
          : orders;
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to restore order',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Bulk restore orders (admin)
   */
  bulkRestoreOrders: async (orderIds, restoreReason = '') => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.bulkRestoreOrders({
        order_ids: orderIds,
        restore_reason: restoreReason,
      });
      
      // Refresh orders list
      await get().fetchAllOrders();
      
      set({ loading: false });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to bulk restore',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Get net total (admin)
   */
  getNetTotal: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.getNetTotal(id);
      set({ loading: false });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to get net total',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Generate invoice (admin)
   */
  // orderStore.js
generateInvoice: async (id) => {
  set({ loading: true, error: null });
  try {
    const response = await ordersAPI.generateInvoice(id); // { message, invoice_number, order? }

    if (response.order) {
      set({
        currentOrder: response.order,
        loading: false,
      });
    } else {
      // If no order in response (e.g. "already generated"), just stop loading
      set({ loading: false });
    }

    return response;
  } catch (error) {
    set({
      error: error.response?.data?.message || 'Failed to generate invoice',
      loading: false,
    });
    throw error;
  }
},

  /**
   * Update payment status (admin)
   */
  updatePaymentStatus: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.updatePaymentStatus(id, data);
      
      // Update orders list
      const orders = get().orders;
      const updatedOrders = orders.map(order => 
        order.id === id ? response.order : order
      );
      
      set({ 
        orders: updatedOrders,
        currentOrder: response.order,
        loading: false 
      });
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to update payment status',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * 🗑️ Move order to trash (SOFT DELETE) - for admins AND superadmin
   */
  trashOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.trashOrder(id); // ✅ soft delete

      // Remove from current list UI (since it's now trashed)
      const orders = get().orders;
      const updatedOrders = Array.isArray(orders)
        ? orders.filter(o => o.id !== id)
        : orders?.data
          ? { ...orders, data: orders.data.filter(o => o.id !== id) }
          : orders;

      set({
        orders: updatedOrders,
        currentOrder: null,
        loading: false,
      });

      return response;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to move order to trash',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * ☠️ PERMANENT delete (ONLY from trash, superadmin)
   * Use this in Trash UI, not OrderDetail
   */
  forceDeleteOrder: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.forceDeleteOrder(id);

      // If you maintain a trash list somewhere, remove it there (optional)
      set({ loading: false });
      return response;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to permanently delete order',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * 📝 Create order for customer (admin)
   */
  adminCreateOrder: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await ordersAPI.adminCreateOrder(data);
      
      // Add to orders list if we have one
      const orders = get().orders;
      if (Array.isArray(orders)) {
        set({ 
          orders: [response.order, ...orders],
          currentOrder: response.order,
          loading: false 
        });
      } else if (orders?.data) {
        set({ 
          orders: {
            ...orders,
            data: [response.order, ...orders.data],
          },
          currentOrder: response.order,
          loading: false 
        });
      } else {
        set({ 
          currentOrder: response.order,
          loading: false 
        });
      }
      
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to create order',
        loading: false 
      });
      throw error;
    }
  },

  // ========================================
  // UTILITY ACTIONS
  // ========================================

  /**
   * Clear current order
   */
  clearCurrentOrder: () => {
    set({ currentOrder: null });
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Reset store
   */
  reset: () => {
    set({
      orders: [],
      currentOrder: null,
      statistics: null,
      loading: false,
      error: null,
    });
  },
}));

export default useOrderStore;