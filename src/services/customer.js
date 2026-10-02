import { api } from "./api.js";

export const customerService = {
  session: () => api.get("/api/auth/me"),
  login: (body) => api.post("/api/auth/login", body),
  register: (body) => api.post("/api/auth/register", body),
  logout: () => api.post("/api/auth/logout", {}),
  services: () => api.get("/api/services"),
  requests: () => api.get("/api/requests"),
  createRequest: (body) => api.post("/api/requests", body),
  confirm: (requestId) => api.post(`/api/requests/${requestId}/confirm`, {}),
  review: (requestId, body) => api.post(`/api/requests/${requestId}/review`, body)
};
