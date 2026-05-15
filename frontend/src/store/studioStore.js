import { create } from 'zustand';
import axios from 'axios';

// API base URL - adjust if needed
const API_URL = '/api';

const useStudioStore = create((set, get) => ({
    publications: [],
    activePublication: null,
    loading: false,
    error: null,

    // --- Admin Actions ---
    
    fetchPublications: async (type = '') => {
        set({ loading: true });
        try {
            const res = await axios.get(`${API_URL}/admin/publications?type=${type}`);
            // Handle potential pagination wrap
            const data = Array.isArray(res.data) ? res.data : (res.data.data ?? []);
            set({ publications: data, loading: false });
        } catch (err) {
            set({ error: err.message, loading: false });
        }
    },

    fetchPublication: async (id) => {
        set({ loading: true });
        try {
            const res = await axios.get(`${API_URL}/admin/publications/${id}`);
            const data = res.data.data ?? res.data;
            set({ activePublication: data, loading: false });
            return data;
        } catch (err) {
            set({ error: err.message, loading: false });
        }
    },

    createPublication: async (data) => {
        set({ loading: true });
        try {
            const res = await axios.post(`${API_URL}/admin/publications`, data);
            const newItem = res.data.data ?? res.data;
            set(state => ({ 
                publications: [newItem, ...state.publications],
                loading: false 
            }));
            return newItem;
        } catch (err) {
            set({ error: err.message, loading: false });
            throw err;
        }
    },

    updatePublication: async (id, data) => {
        set({ loading: true });
        try {
            const res = await axios.put(`${API_URL}/admin/publications/${id}`, data);
            const updatedItem = res.data.data ?? res.data;
            set(state => ({
                activePublication: updatedItem,
                publications: state.publications.map(p => p.id === id ? updatedItem : p),
                loading: false
            }));
            return updatedItem;
        } catch (err) {
            set({ error: err.message, loading: false });
            throw err;
        }
    },

    deletePublication: async (id) => {
        try {
            await axios.delete(`${API_URL}/admin/publications/${id}`);
            set(state => ({
                publications: state.publications.filter(p => p.id !== id),
                activePublication: state.activePublication?.id === id ? null : state.activePublication
            }));
        } catch (err) {
            set({ error: err.message });
        }
    },

    // --- Editor Actions ---
    
    setBlocks: (blocks) => {
        set(state => ({
            activePublication: { ...state.activePublication, blocks }
        }));
    },

    addBlock: (type, content = {}, style = {}) => {
        const newBlock = {
            id: 'new-' + Date.now(),
            type,
            content,
            style
        };
        set(state => ({
            activePublication: {
                ...state.activePublication,
                blocks: [...(state.activePublication.blocks || []), newBlock]
            }
        }));
    },

    removeBlock: (blockId) => {
        set(state => ({
            activePublication: {
                ...state.activePublication,
                blocks: (state.activePublication.blocks || []).filter(b => (b.id || b._id) !== blockId)
            }
        }));
    },

    updateBlock: (blockId, data) => {
        set(state => ({
            activePublication: {
                ...state.activePublication,
                blocks: (state.activePublication.blocks || []).map(b => 
                    (b.id || b._id) === blockId ? { ...b, ...data } : b
                )
            }
        }));
    },

    // --- Public Actions ---
    
    fetchPublicPublications: async (type = '') => {
        set({ loading: true });
        try {
            const res = await axios.get(`${API_URL}/publications?type=${type}`);
            return res.data; // Component handles data.data or data
        } catch (err) {
            set({ error: err.message, loading: false });
        } finally {
            set({ loading: false });
        }
    },

    fetchPublicPublication: async (slug) => {
        set({ loading: true });
        try {
            const res = await axios.get(`${API_URL}/publications/${slug}`);
            return res.data.data ?? res.data;
        } catch (err) {
            set({ error: err.message, loading: false });
        } finally {
            set({ loading: false });
        }
    }
}));

export default useStudioStore;
