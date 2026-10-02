import { api } from "./api.js";

export const adminService = {
  login: (body) => api.post("/api/admin/login", body),
  logout: () => api.post("/api/admin/logout", {}),
  session: () => api.get("/api/admin/me"),
  dashboard: () => api.get("/api/admin/dashboard"),
  requests: (query = "") => api.get(`/api/admin/requests${query}`),
  workers: () => api.get("/api/admin/workers"),
  customers: () => api.get("/api/admin/customers"),
  reviews: () => api.get("/api/admin/reviews"),
  categories: () => api.get("/api/admin/categories"),
  schedule: (id, scheduledAt) => api.post(`/api/admin/requests/${id}/schedule`, { scheduledAt }),
  assign: (id, workerId) => api.post(`/api/admin/requests/${id}/assign-worker`, { workerId }),
  status: (id, status) => api.post(`/api/admin/requests/${id}/status`, { status }),
  worker: (id, body) => api.post(id ? `/api/admin/workers/${id}` : "/api/admin/workers", body),
  toggleWorker: (id) => api.post(`/api/admin/workers/${id}/toggle-active`),
  availability: (id, availabilityStatus) => api.post(`/api/admin/workers/${id}/availability`, { availabilityStatus }),
  moderate: (id, action) => api.post(`/api/admin/reviews/${id}/moderate`, { action }),
  category: (id, body) => api.post(id ? `/api/admin/categories/${id}` : "/api/admin/categories", body)
};
