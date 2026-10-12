import { api } from "./api.js";

export const formService = {
  publicForm: (token) => api.get(`/api/forms/${encodeURIComponent(token)}`),
  submit: (token, body) => api.post(`/api/forms/${encodeURIComponent(token)}`, body)
};
