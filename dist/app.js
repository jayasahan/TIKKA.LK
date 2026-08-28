const state = {
  customer: null,
  services: [],
  requests: []
};

const customerServices = document.querySelector("[data-customer-services]");
const serviceSelect = document.querySelector("[data-service-select]");
const authForm = document.querySelector("[data-auth-form]");
const requestForm = document.querySelector("[data-request-form]");
const requestList = document.querySelector("[data-request-list]");
const authMessage = document.querySelector("[data-auth-message]");
const requestMessage = document.querySelector("[data-request-message]");
const sessionTitle = document.querySelector("[data-session-title]");
const sessionCopy = document.querySelector("[data-session-copy]");
const logoutButton = document.querySelector("[data-logout]");

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.payload = payload;
    throw error;
  }
  return payload;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setMessage(element, text, tone = "neutral") {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.dataset.tone = tone;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function describeErrors(error) {
  if (error.payload && error.payload.errors) {
    return Object.values(error.payload.errors).join(" ");
  }
  return error.message;
}

function renderSession() {
  if (!sessionTitle || !sessionCopy || !logoutButton) {
    return;
  }

  if (state.customer) {
    sessionTitle.textContent = `Signed in as ${state.customer.name}`;
    sessionCopy.textContent = "You can submit requests and track only the requests linked to this account.";
    logoutButton.hidden = false;
    if (requestForm) {
      requestForm.customerName.value = state.customer.name;
      requestForm.phone.value = state.customer.phone;
      requestForm.email.value = state.customer.email;
    }
    return;
  }

  sessionTitle.textContent = "Sign in or create an account";
  sessionCopy.textContent = "Your requests are protected and only visible to your account.";
  logoutButton.hidden = true;
}

function renderServices() {
  if (!customerServices || !serviceSelect) {
    return;
  }

  customerServices.innerHTML = state.services
    .map(
      (service) => `
        <article class="service-card">
          <span class="service-card__icon" aria-hidden="true">${escapeHtml(service.icon || service.code)}</span>
          <h3>${escapeHtml(service.name)}</h3>
          <p>${escapeHtml(service.description)}</p>
          <button class="text-action" type="button" data-service-request="${escapeHtml(service.name)}">
            Request ${escapeHtml(service.name)}
          </button>
        </article>
      `
    )
    .join("");

  serviceSelect.innerHTML = '<option value="">Choose a service</option>' +
    state.services
      .map((service) => `<option value="${escapeHtml(service.name)}">${escapeHtml(service.name)}</option>`)
      .join("");

  const selectedService = new URLSearchParams(window.location.search).get("service");
  if (selectedService && state.services.some((service) => service.name === selectedService)) {
    serviceSelect.value = selectedService;
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not scheduled yet";
}

function providerMarkup(provider) {
  if (!provider) {
    return '<p class="muted">TIKKA has not assigned a provider yet.</p>';
  }

  return `
    <div class="provider-card">
      <img src="${escapeHtml(provider.profileImage)}" alt="" width="96" height="96">
      <div>
        <h4>${escapeHtml(provider.name)}</h4>
        <p>${escapeHtml(provider.skills.join(", "))}</p>
        <p>${escapeHtml(provider.serviceArea)}</p>
        <p>${escapeHtml(provider.verificationStatus)}${provider.rating ? ` · ${escapeHtml(provider.rating)} rating` : ""}</p>
      </div>
    </div>
  `;
}

function renderRequests() {
  if (!requestList) {
    return;
  }

  if (!state.customer) {
    requestList.innerHTML = '<p class="muted">Log in to see your requests.</p>';
    return;
  }

  if (state.requests.length === 0) {
    requestList.innerHTML = '<p class="muted">No requests yet.</p>';
    return;
  }

  requestList.innerHTML = state.requests
    .map(
      (request) => `
        <article class="request-card" data-request-id="${request.id}">
          <div class="request-card__header">
            <div>
              <p class="eyebrow">${escapeHtml(request.reference)}</p>
              <h3>${escapeHtml(request.title)}</h3>
            </div>
            <span class="status-badge">${escapeHtml(request.status)}</span>
          </div>
          <dl class="request-meta">
            <div><dt>Service</dt><dd>${escapeHtml(request.service)}</dd></div>
            <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(request.submittedAt))}</dd></div>
            <div><dt>Scheduled</dt><dd>${escapeHtml(formatDate(request.scheduledAt))}</dd></div>
          </dl>
          <p>${escapeHtml(request.description)}</p>
          ${providerMarkup(request.assignedProvider)}
          ${request.status === "COMPLETED" ? '<button class="button button--primary" type="button" data-confirm-request>Confirm completion</button>' : ""}
          ${request.status === "CONFIRMED" && !request.review ? reviewFormMarkup() : ""}
          ${request.review ? `<p class="review-note">Reviewed: ${escapeHtml(request.review.rating)}/5 · ${escapeHtml(request.review.comment)}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function reviewFormMarkup() {
  return `
    <form class="review-form" data-review-form>
      <label>
        <span>Rating <em>required</em></span>
        <select name="rating" required>
          <option value="">Choose rating</option>
          <option value="5">5 stars</option>
          <option value="4">4 stars</option>
          <option value="3">3 stars</option>
          <option value="2">2 stars</option>
          <option value="1">1 star</option>
        </select>
      </label>
      <label>
        <span>Short review <em>required</em></span>
        <textarea name="comment" rows="3" required maxlength="600"></textarea>
      </label>
      <button class="button button--secondary" type="submit">Submit review</button>
    </form>
  `;
}

async function loadRequests() {
  if (!state.customer) {
    renderRequests();
    return;
  }
  const payload = await api("/api/requests");
  state.requests = payload.requests;
  renderRequests();
}

async function bootstrap() {
  const servicesPayload = await api("/api/services");
  state.services = servicesPayload.services;
  renderServices();

  try {
    const sessionPayload = await api("/api/auth/me");
    state.customer = sessionPayload.customer;
  } catch (error) {
    state.customer = null;
  }

  renderSession();
  await loadRequests();
}

if (customerServices) {
  customerServices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service-request]");
    if (!button || !serviceSelect) {
      return;
    }
    serviceSelect.value = button.dataset.serviceRequest;
    document.querySelector("#request").scrollIntoView({ behavior: "smooth" });
  });
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const mode = submitter && submitter.value === "login" ? "login" : "register";
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = formValues(authForm);

    setMessage(authMessage, mode === "login" ? "Logging in..." : "Creating account...");
    submitter.disabled = true;
    try {
      const payload = await api(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });
      state.customer = payload.customer;
      renderSession();
      await loadRequests();
      setMessage(authMessage, mode === "login" ? "Logged in." : "Account created.", "success");
    } catch (error) {
      setMessage(authMessage, describeErrors(error), "error");
    } finally {
      submitter.disabled = false;
    }
  });
}

if (requestForm) {
  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = requestForm.querySelector("[data-request-submit]");
    const body = formValues(requestForm);
    const files = requestForm.photos.files ? Array.from(requestForm.photos.files) : [];
    body.photos = files.map((file) => file.name);

    setMessage(requestMessage, "Submitting request...");
    submitButton.disabled = true;
    try {
      const payload = await api("/api/requests", {
        method: "POST",
        body: JSON.stringify(body)
      });
      requestForm.reset();
      renderSession();
      await loadRequests();
      setMessage(
        requestMessage,
        `${payload.message} ${payload.explanation} Reference: ${payload.request.reference}`,
        "success"
      );
    } catch (error) {
      setMessage(requestMessage, describeErrors(error), "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (requestList) {
  requestList.addEventListener("click", async (event) => {
    const confirmButton = event.target.closest("[data-confirm-request]");
    if (!confirmButton) {
      return;
    }
    const card = confirmButton.closest("[data-request-id]");
    confirmButton.disabled = true;
    try {
      await api(`/api/requests/${card.dataset.requestId}/confirm`, { method: "POST" });
      await loadRequests();
    } catch (error) {
      confirmButton.disabled = false;
      alert(describeErrors(error));
    }
  });

  requestList.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-review-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    const card = form.closest("[data-request-id]");
    const submitButton = form.querySelector("button");
    submitButton.disabled = true;
    try {
      await api(`/api/requests/${card.dataset.requestId}/review`, {
        method: "POST",
        body: JSON.stringify(formValues(form))
      });
      await loadRequests();
    } catch (error) {
      submitButton.disabled = false;
      alert(describeErrors(error));
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.customer = null;
    state.requests = [];
    renderSession();
    renderRequests();
  });
}

bootstrap().catch((error) => {
  setMessage(authMessage, error.message, "error");
});
