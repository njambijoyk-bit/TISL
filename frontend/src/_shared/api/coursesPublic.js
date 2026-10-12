import api from './axios';

/** Courses (storefront): the catalogue, an offering's page, and a signed-in person enrolling and paying. */
export const coursesPublicAPI = {
  list: async (params) => (await api.get('/learn', { params })).data,
  offering: async (slug) => (await api.get(`/learn/${slug}`)).data,
  quote: async (id, optionalFeeIds) => (await api.post(`/courses/offerings/${id}/quote`, { optional_fee_ids: optionalFeeIds })).data,
  enrol: async (id, payload) => (await api.post(`/courses/offerings/${id}/enrol`, payload)).data,
  mine: async () => (await api.get('/courses/my/enrolments')).data,
  pay: async (id, payload) => (await api.post(`/courses/enrolments/${id}/pay`, payload)).data,
};

export default coursesPublicAPI;
