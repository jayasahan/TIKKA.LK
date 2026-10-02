import { getCsrfToken, updateCsrfFromPayload } from "./csrf.js";

export class ApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrfToken = getCsrfToken();
  if (csrfToken && !["GET", "HEAD"].includes(method) && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const body = options.body && typeof options.body !== "string" && !(options.body instanceof FormData)
    ? JSON.stringify(options.body)
    : options.body;

  let response;
  try {
    response = await fetch(path, {
      ...options,
      method,
      headers,
      body,
      credentials: "include"
    });
  } catch (error) {
    throw new ApiError("Unable to reach TIKKA. Check your connection and try again.", { payload: { cause: error } });
  }

  const payload = await readPayload(response);
  updateCsrfFromPayload(payload);
  if (!response.ok) {
    const serverFailure = response.status >= 500;
    const message = serverFailure
      ? "TIKKA is temporarily unavailable. Please try again."
      : payload.error || `Request failed with status ${response.status}.`;
    // A proxy/server failure may contain HTML, SQL, or stack traces. Keep those
    // out of UI error summaries while preserving ordinary validation responses.
    throw new ApiError(message, {
      status: response.status,
      payload: serverFailure ? { error: message } : payload
    });
  }
  return payload;
}

export const api = {
  get: (path, options = {}) => apiFetch(path, { ...options, method: "GET" }),
  post: (path, body, options = {}) => apiFetch(path, { ...options, method: "POST", body }),
  put: (path, body, options = {}) => apiFetch(path, { ...options, method: "PUT", body }),
  patch: (path, body, options = {}) => apiFetch(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => apiFetch(path, { ...options, method: "DELETE" })
};
