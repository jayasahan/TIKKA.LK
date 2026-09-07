const state = {
  customer: null,
  services: [],
  requests: [],
  selectedRequestId: null,
  filter: "active",
  loading: true
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  loading: $("[data-loading-state]"),
  authShell: $("[data-auth-shell]"),
  dashboardShell: $("[data-dashboard-shell]"),
  authForm: $("[data-auth-form]"),
  requestForm: $("[data-request-form]"),
  requestList: $("[data-request-list]"),
  requestDetail: $("[data-request-detail]"),
  authMessage: $("[data-auth-message]"),
  requestMessage: $("[data-request-message]"),
  logoutButton: $("[data-logout]"),
  customerGreeting: $("[data-customer-greeting]"),
  requestSummary: $("[data-request-summary]"),
  activeRequests: $("[data-active-requests]"),
  upcomingRequests: $("[data-upcoming-requests]"),
  completedRequests: $("[data-completed-requests]"),
  customerServices: $("[data-customer-services]"),
  serviceSelect: $("[data-service-select]"),
  profileSummary: $("[data-profile-summary]")
};

const statusLabels = {
  NEW: "Request Received",
  REVIEWING: "Under Review",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Technician Assigned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected"
};
const normalLifecycle = ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"];
const activeStatuses = ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"];
const completedStatuses = ["COMPLETED", "CONFIRMED"];
const closedStatuses = ["CANCELLED", "REJECTED"];

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setMessage(element, text, tone = "neutral") {
  if (!element) return;
  element.textContent = text;
  element.dataset.tone = tone;
}

function describeErrors(error) {
  if (error.payload && error.payload.errors) {
    return Object.values(error.payload.errors).join(" ");
  }
  return error.message;
}

function formatDate(value, empty = "Not set yet") {
  return value ? new Date(value).toLocaleString() : empty;
}

function statusLabel(status) {
  return statusLabels[status] || status || "Unknown";
}

function setAuthenticatedView() {
  elements.loading.hidden = !state.loading;
  elements.authShell.hidden = state.loading || Boolean(state.customer);
  elements.dashboardShell.hidden = state.loading || !state.customer;
  if (elements.logoutButton) {
    elements.logoutButton.hidden = !state.customer;
  }
}

function syncCustomerFields() {
  if (!state.customer || !elements.requestForm) return;
  elements.requestForm.customerName.value = state.customer.name || "";
  elements.requestForm.phone.value = state.customer.phone || "";
  elements.requestForm.email.value = state.customer.email || "";
}

function renderServices() {
  if (elements.serviceSelect) {
    elements.serviceSelect.innerHTML = '<option value="">Choose a service</option>' +
      state.services.map((service) => `<option value="${escapeHtml(service.name)}">${escapeHtml(service.name)}</option>`).join("");
  }
  if (elements.customerServices) {
    elements.customerServices.innerHTML = state.services.map((service) => `
      <article class="customer-service-pill">
        <span>${escapeHtml(service.icon || service.code)}</span>
        <div>
          <strong>${escapeHtml(service.name)}</strong>
          <p>${escapeHtml(service.description)}</p>
        </div>
        <button class="text-action" type="button" data-service-request="${escapeHtml(service.name)}">Request</button>
      </article>
    `).join("");
  }
}

function counts() {
  return {
    active: state.requests.filter((request) => activeStatuses.includes(request.status)).length,
    scheduled: state.requests.filter((request) => request.scheduledAt && ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(request.status)).length,
    completed: state.requests.filter((request) => completedStatuses.includes(request.status)).length,
    closed: state.requests.filter((request) => closedStatuses.includes(request.status)).length,
    total: state.requests.length
  };
}

function renderDashboard() {
  if (!state.customer) return;
  elements.customerGreeting.textContent = `Hi ${state.customer.name}, what can TIKKA help with today?`;
  const summary = counts();
  elements.requestSummary.innerHTML = [
    summaryCard("Active", summary.active),
    summaryCard("Scheduled", summary.scheduled),
    summaryCard("Completed", summary.completed),
    summaryCard("Total", summary.total)
  ].join("");
  renderActiveRequests();
  renderUpcomingRequests();
  renderCompletedRequests();
  renderRequestHistory();
  renderRequestDetails();
  renderProfile();
}

function summaryCard(label, value) {
  return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function requestCard(request, compact = false) {
  return `<article class="customer-request-card" data-request-id="${escapeHtml(request.id)}">
    <div class="customer-request-card__top">
      <div>
        <p class="eyebrow">${escapeHtml(request.reference)}</p>
        <h3>${escapeHtml(request.title)}</h3>
      </div>
      <span class="status-badge">${escapeHtml(statusLabel(request.status))}</span>
    </div>
    ${progressMarkup(request)}
    <dl class="request-meta">
      <div><dt>Service</dt><dd>${escapeHtml(request.service)}</dd></div>
      <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(request.submittedAt))}</dd></div>
      <div><dt>Scheduled</dt><dd>${escapeHtml(formatDate(request.scheduledAt))}</dd></div>
      ${compact ? "" : `<div><dt>Address</dt><dd>${escapeHtml(request.address || "Recorded with request")}</dd></div>`}
      <div><dt>Assigned Technician</dt><dd>${escapeHtml(technicianName(request))}</dd></div>
    </dl>
    <button class="button button--secondary" type="button" data-view-request="${escapeHtml(request.id)}">View details</button>
  </article>`;
}

function smallRequestRow(request) {
  return `<article class="customer-mini-card" data-request-id="${escapeHtml(request.id)}">
    <div>
      <p class="eyebrow">${escapeHtml(request.reference)}</p>
      <strong>${escapeHtml(request.title)}</strong>
      <span>${escapeHtml(statusLabel(request.status))} - ${escapeHtml(formatDate(request.scheduledAt, "No schedule yet"))}</span>
    </div>
    <button class="text-action" type="button" data-view-request="${escapeHtml(request.id)}">Details</button>
  </article>`;
}

function renderActiveRequests() {
  const active = state.requests.filter((request) => activeStatuses.includes(request.status));
  elements.activeRequests.innerHTML = active.length
    ? active.slice(0, 4).map((request) => requestCard(request, true)).join("")
    : emptyState("No active jobs", "Request a service when you are ready. TIKKA will take it from there.");
}

function renderUpcomingRequests() {
  const upcoming = state.requests.filter((request) => request.scheduledAt && ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(request.status));
  elements.upcomingRequests.innerHTML = upcoming.length
    ? upcoming.slice(0, 5).map(smallRequestRow).join("")
    : emptyState("No scheduled visits", "Scheduled job details will appear here after TIKKA reviews your request.");
}

function renderCompletedRequests() {
  const completed = state.requests.filter((request) => completedStatuses.includes(request.status));
  elements.completedRequests.innerHTML = completed.length
    ? completed.slice(0, 5).map(smallRequestRow).join("")
    : emptyState("No completed jobs yet", "Completed and confirmed jobs will appear here.");
}

function filteredRequests() {
  if (state.filter === "completed") return state.requests.filter((request) => completedStatuses.includes(request.status));
  if (state.filter === "closed") return state.requests.filter((request) => closedStatuses.includes(request.status));
  if (state.filter === "all") return state.requests;
  return state.requests.filter((request) => activeStatuses.includes(request.status));
}

function renderRequestHistory() {
  const requests = filteredRequests();
  elements.requestList.innerHTML = requests.length
    ? requests.map((request) => requestCard(request)).join("")
    : emptyState("No matching requests", "Try another filter or submit a new service request.");
}

function renderRequestDetails() {
  const request = state.requests.find((item) => item.id === state.selectedRequestId) || state.requests[0];
  if (!request) {
    elements.requestDetail.innerHTML = `<p class="muted">Select a request to view details.</p>`;
    return;
  }
  state.selectedRequestId = request.id;
  elements.requestDetail.innerHTML = `<p class="eyebrow">${escapeHtml(request.reference)}</p>
    <h2>${escapeHtml(request.title)}</h2>
    <p class="status-badge">${escapeHtml(statusLabel(request.status))}</p>
    ${progressMarkup(request)}
    <section class="customer-detail-section">
      <h3>Request</h3>
      <dl class="request-meta">
        <div><dt>Service</dt><dd>${escapeHtml(request.service)}</dd></div>
        <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(request.submittedAt))}</dd></div>
        <div><dt>Preferred</dt><dd>${escapeHtml([request.preferredDate, request.preferredTime].filter(Boolean).join(" ") || "Not recorded")}</dd></div>
      </dl>
      <p>${escapeHtml(request.description)}</p>
    </section>
    <section class="customer-detail-section">
      <h3>Location</h3>
      <p>${escapeHtml(request.address || "Recorded with your submitted request.")}</p>
    </section>
    <section class="customer-detail-section">
      <h3>Scheduling</h3>
      <p>${escapeHtml(formatDate(request.scheduledAt, "TIKKA has not scheduled this job yet."))}</p>
    </section>
    <section class="customer-detail-section">
      <h3>Assigned TIKKA technician/team</h3>
      ${technicianMarkup(request)}
    </section>
    ${completionMarkup(request)}
    ${reviewMarkup(request)}`;
}

function renderProfile() {
  elements.profileSummary.innerHTML = `
    <div><dt>Name</dt><dd>${escapeHtml(state.customer.name)}</dd></div>
    <div><dt>Email</dt><dd>${escapeHtml(state.customer.email)}</dd></div>
    <div><dt>Phone</dt><dd>${escapeHtml(state.customer.phone)}</dd></div>
  `;
}

function progressMarkup(request) {
  if (closedStatuses.includes(request.status)) {
    return `<div class="customer-progress customer-progress--closed"><strong>${escapeHtml(statusLabel(request.status))}</strong></div>`;
  }
  const currentIndex = Math.max(normalLifecycle.indexOf(request.status), 0);
  return `<ol class="customer-progress" aria-label="Request progress">
    ${normalLifecycle.map((status, index) => `<li class="${index <= currentIndex ? "is-done" : ""} ${status === request.status ? "is-current" : ""}">${escapeHtml(statusLabel(status))}</li>`).join("")}
  </ol>`;
}

function technicianName(request) {
  const worker = request.assignedWorker;
  if (!worker) return "Not assigned yet";
  return worker.name || "TIKKA Team";
}

function technicianMarkup(request) {
  const worker = request.assignedWorker;
  if (!worker) return `<p class="muted">TIKKA has not assigned a technician yet.</p>`;
  return `<div class="technician-card">
    <strong>${escapeHtml(worker.name || "TIKKA Team")}</strong>
    ${worker.phone ? `<p>${escapeHtml(worker.phone)}</p>` : ""}
    ${worker.serviceArea ? `<p>${escapeHtml(worker.serviceArea)}</p>` : ""}
    ${(worker.skills || []).length ? `<p>${escapeHtml(worker.skills.join(", "))}</p>` : ""}
  </div>`;
}

function completionMarkup(request) {
  if (request.status !== "COMPLETED") return "";
  return `<section class="customer-action-panel">
    <h3>The work has been marked complete by TIKKA.</h3>
    <p>Please confirm only after you are satisfied that the job is complete.</p>
    <button class="button button--primary" type="button" data-confirm-request="${escapeHtml(request.id)}">Confirm Completion</button>
  </section>`;
}

function reviewMarkup(request) {
  if (request.review) {
    return `<section class="customer-action-panel"><h3>Your review</h3><p>${escapeHtml(request.review.rating)}/5 - ${escapeHtml(request.review.comment)}</p></section>`;
  }
  if (request.status !== "CONFIRMED") return "";
  return `<form class="review-form customer-action-panel" data-review-form data-request-id="${escapeHtml(request.id)}">
    <h3>Review your TIKKA service</h3>
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
      <span>Comment <em>required</em></span>
      <textarea name="comment" rows="3" required maxlength="600"></textarea>
    </label>
    <button class="button button--secondary" type="submit">Submit review</button>
  </form>`;
}

function emptyState(title, copy) {
  return `<div class="customer-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div>`;
}

async function loadCurrentUser() {
  try {
    const sessionPayload = await api("/api/auth/me");
    state.customer = sessionPayload.customer;
  } catch (error) {
    state.customer = null;
  }
}

async function loadRequests() {
  if (!state.customer) {
    state.requests = [];
    return;
  }
  const payload = await api("/api/requests");
  state.requests = payload.requests || [];
}

async function submitServiceRequest(event) {
  event.preventDefault();
  const submitButton = elements.requestForm.querySelector("[data-request-submit]");
  const body = formValues(elements.requestForm);
  const files = elements.requestForm.photos.files ? Array.from(elements.requestForm.photos.files) : [];
  body.photos = files.map((file) => file.name);

  setMessage(elements.requestMessage, "Submitting request...");
  submitButton.disabled = true;
  try {
    const payload = await api("/api/requests", {
      method: "POST",
      body: JSON.stringify(body)
    });
    elements.requestForm.reset();
    syncCustomerFields();
    await loadRequests();
    state.selectedRequestId = payload.request.id;
    renderDashboard();
    setMessage(elements.requestMessage, `${payload.message} Reference: ${payload.request.reference}`, "success");
    activatePanel("requests");
  } catch (error) {
    setMessage(elements.requestMessage, describeErrors(error), "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function confirmCompletion(requestId) {
  if (!window.confirm("Confirm that this TIKKA job is complete?")) return;
  await api(`/api/requests/${requestId}/confirm`, { method: "POST" });
  await loadRequests();
  state.selectedRequestId = requestId;
  renderDashboard();
  setMessage(elements.requestMessage, "Completion confirmed.", "success");
}

async function submitReview(event) {
  const form = event.target.closest("[data-review-form]");
  if (!form) return;
  event.preventDefault();
  const submitButton = form.querySelector("button");
  submitButton.disabled = true;
  try {
    await api(`/api/requests/${form.dataset.requestId}/review`, {
      method: "POST",
      body: JSON.stringify(formValues(form))
    });
    await loadRequests();
    state.selectedRequestId = form.dataset.requestId;
    renderDashboard();
  } catch (error) {
    submitButton.disabled = false;
    setMessage(elements.requestMessage, describeErrors(error), "error");
  }
}

function activatePanel(panel) {
  $$("[data-customer-tab]").forEach((link) => link.classList.toggle("is-active", link.dataset.customerTab === panel));
  if (panel === "request") {
    elements.requestForm.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (panel === "requests") {
    $("#requests").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (panel === "profile") {
    $("#profile").scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    $("#overview").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindEvents() {
  $$("[data-customer-tab]").forEach((link) => {
    link.addEventListener("click", () => activatePanel(link.dataset.customerTab));
  });

  if (elements.authForm) {
    elements.authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const mode = submitter && submitter.value === "register" ? "register" : "login";
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      setMessage(elements.authMessage, mode === "login" ? "Logging in..." : "Creating account...");
      submitter.disabled = true;
      try {
        const payload = await api(endpoint, {
          method: "POST",
          body: JSON.stringify(formValues(elements.authForm))
        });
        state.customer = payload.customer;
        await loadRequests();
        state.loading = false;
        setAuthenticatedView();
        syncCustomerFields();
        renderDashboard();
        setMessage(elements.authMessage, mode === "login" ? "Logged in." : "Account created.", "success");
      } catch (error) {
        setMessage(elements.authMessage, describeErrors(error), "error");
      } finally {
        submitter.disabled = false;
      }
    });
  }

  if (elements.requestForm) {
    elements.requestForm.addEventListener("submit", submitServiceRequest);
  }

  document.addEventListener("click", async (event) => {
    const serviceButton = event.target.closest("[data-service-request]");
    if (serviceButton && elements.serviceSelect) {
      elements.serviceSelect.value = serviceButton.dataset.serviceRequest;
      activatePanel("request");
      return;
    }

    const requestButton = event.target.closest("[data-view-request]");
    if (requestButton) {
      state.selectedRequestId = requestButton.dataset.viewRequest;
      state.filter = "all";
      renderDashboard();
      activatePanel("requests");
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      state.filter = filterButton.dataset.filter;
      $$("[data-filter]").forEach((button) => button.classList.toggle("is-active", button === filterButton));
      renderRequestHistory();
      return;
    }

    const confirmButton = event.target.closest("[data-confirm-request]");
    if (confirmButton) {
      confirmButton.disabled = true;
      try {
        await confirmCompletion(confirmButton.dataset.confirmRequest);
      } catch (error) {
        confirmButton.disabled = false;
        setMessage(elements.requestMessage, describeErrors(error), "error");
      }
      return;
    }
  });

  document.addEventListener("submit", submitReview);

  if (elements.logoutButton) {
    elements.logoutButton.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST" });
      state.customer = null;
      state.requests = [];
      state.selectedRequestId = null;
      state.loading = false;
      setAuthenticatedView();
    });
  }
}

async function bootstrap() {
  bindEvents();
  try {
    const servicesPayload = await api("/api/services");
    state.services = servicesPayload.services || [];
    renderServices();
    await loadCurrentUser();
    await loadRequests();
    syncCustomerFields();
    state.loading = false;
    setAuthenticatedView();
    renderDashboard();
  } catch (error) {
    state.loading = false;
    setAuthenticatedView();
    setMessage(elements.authMessage, error.message, "error");
  }
}

bootstrap();
