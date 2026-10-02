let csrfToken = null;

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export function updateCsrfFromPayload(payload) {
  if (payload && payload.csrfToken) setCsrfToken(payload.csrfToken);
  return payload;
}
