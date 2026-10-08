import api from './axios';

const entitiesAPI = {
  /** The companies the person may open: { data, current_id, multi } */
  list: () => api.get('/admin/entities').then((r) => r.data),
};

export default entitiesAPI;
