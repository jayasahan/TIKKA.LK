const state = {
  customer: null,
  services: [],
  requests: [],
  selectedRequestId: null,
  filter: "active",
  csrfToken: null,
  loading: true,
  requestsLoading: false,
  requestLoadError: null,
  authMode: "login",
  intendedService: new URLSearchParams(window.location.search).get("service") || ""
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
  portalMessage: $("[data-portal-message]"),
  requestLoading: $("[data-request-loading]"),
  logoutButton: $("[data-logout]"),
  logoutMenu: $("[data-logout-menu]"),
  navToggle: $("[data-nav-toggle]"),
  navMenu: $("[data-nav-menu]"),
  requestNavCta: $(".customer-nav__desktop-request"),
  authTitle: $("[data-auth-title]"),
  authSubmit: $("[data-auth-submit]"),
  customerGreeting: $("[data-customer-greeting]"),
  requestSummary: $("[data-request-summary]"),
  activeRequests: $("[data-active-requests]"),
  upcomingRequests: $("[data-upcoming-requests]"),
  completedRequests: $("[data-completed-requests]"),
  customerServices: $("[data-customer-services]"),
  serviceSelect: $("[data-service-select]"),
  profileSummary: $("[data-profile-summary]")
};

const normalLifecycle = ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"];
const activeStatuses = ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"];
const completedStatuses = ["COMPLETED", "CONFIRMED"];
const closedStatuses = ["CANCELLED", "REJECTED"];

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(state.csrfToken && !["GET", "HEAD"].includes(method) ? { "X-CSRF-Token": state.csrfToken } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(path, {
    credentials: "same-origin",
    headers,
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  if (payload.csrfToken) {
    state.csrfToken = payload.csrfToken;
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
  if (text) element.dataset.tone = tone;
  else delete element.dataset.tone;
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
  return TikkaUI.statusMeta(status, "customer").label;
}

function setAuthenticatedView() {
  elements.loading.hidden = !state.loading;
  elements.loading.setAttribute("aria-busy", String(state.loading));
  elements.authShell.hidden = state.loading || Boolean(state.customer);
  elements.dashboardShell.hidden = state.loading || !state.customer;
  if (elements.navMenu) elements.navMenu.hidden = !state.customer;
  if (elements.navToggle) elements.navToggle.hidden = !state.customer;
  if (elements.requestNavCta) elements.requestNavCta.hidden = !state.customer;
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
    if (state.services.some((service) => service.name === state.intendedService)) {
      elements.serviceSelect.value = state.intendedService;
    }
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
  renderProfile();
  if (state.requestsLoading) {
    renderRequestLoading();
    return;
  }
  if (elements.requestLoading) elements.requestLoading.textContent = "";
  if (state.requestLoadError) {
    renderRequestFailure();
    return;
  }
  [elements.requestSummary, elements.activeRequests, elements.upcomingRequests, elements.completedRequests, elements.requestList, elements.requestDetail]
    .forEach((region) => TikkaUI.setRegionBusy(region, false));
  const summary = counts();
  elements.requestSummary.innerHTML = [
    summaryCard("Active requests", summary.active, "Needs attention or is in progress"),
    summaryCard("Scheduled visits", summary.scheduled, "A date has been arranged"),
    summaryCard("Completed jobs", summary.completed, "Ready to confirm or review"),
    summaryCard("All requests", summary.total, "Your TIKKA request history")
  ].join("");
  renderActiveRequests();
  renderUpcomingRequests();
  renderCompletedRequests();
  renderRequestHistory();
  renderRequestDetails();
}

function summaryCard(label, value, hint) {
  return `<article class="card card--summary"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
}

function requestCard(request, compact = false) {
  return `<article class="customer-request-card card card--standard" data-request-id="${escapeHtml(request.id)}">
    <div class="customer-request-card__top">
      <div>
        <p class="eyebrow">${escapeHtml(request.reference)}</p>
        <h3>${escapeHtml(request.title)}</h3>
      </div>
      ${TikkaUI.statusBadge(request.status, "customer")}
    </div>
    ${compact ? "" : progressMarkup(request)}
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
  return `<article class="customer-mini-card card card--standard" data-request-id="${escapeHtml(request.id)}">
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
    : emptyState("No active jobs", "Request a service when you are ready. TIKKA will take it from there.", "Request a service", "data-empty-request-service");
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
    : state.requests.length
      ? emptyState("No matching requests", "There are no requests in this view.", "View all requests", "data-clear-request-filter")
      : emptyState("No requests yet", "Submit a service request and TIKKA will coordinate the work.", "Request a service", "data-empty-request-service");
}

function renderRequestDetails() {
  const request = state.requests.find((item) => item.id === state.selectedRequestId) || state.requests[0];
  if (!request) {
    elements.requestDetail.innerHTML = emptyState("No request selected", "Request details will appear here when a request is available.");
    return;
  }
  state.selectedRequestId = request.id;
  elements.requestDetail.innerHTML = `<p class="eyebrow">${escapeHtml(request.reference)}</p>
    <h2 id="customer-request-detail-title" tabindex="-1">${escapeHtml(request.title)}</h2>
    ${TikkaUI.statusBadge(request.status, "customer")}
    <section class="customer-detail-section">
      <h3>Request</h3>
      <dl class="request-meta">
        <div><dt>Service</dt><dd>${escapeHtml(request.service)}</dd></div>
        <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(request.submittedAt))}</dd></div>
        <div><dt>Preferred</dt><dd>${escapeHtml([request.preferredDate, request.preferredTime].filter(Boolean).join(" ") || "Not recorded")}</dd></div>
      </dl>
      <p>${escapeHtml(request.description)}</p>
    </section>
    ${progressMarkup(request)}
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
    ${normalLifecycle.map((status, index) => `<li class="${index <= currentIndex ? "is-done" : ""} ${status === request.status ? "is-current" : ""}"${status === request.status ? ' aria-current="step"' : ""}>${escapeHtml(statusLabel(status))}</li>`).join("")}
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
  return `<div class="technician-card card card--standard">
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
    <button class="button button--primary" type="button" data-confirm-request="${escapeHtml(request.id)}">Confirm completion</button>
  </section>`;
}

function reviewMarkup(request) {
  if (request.review) {
    return `<section class="customer-action-panel"><h3>Your review</h3><p>${escapeHtml(request.review.rating)}/5 - ${escapeHtml(request.review.comment)}</p></section>`;
  }
  if (request.status !== "CONFIRMED") return "";
  return `<form class="review-form customer-action-panel" data-review-form data-request-id="${escapeHtml(request.id)}" novalidate>
    <h3>Review your TIKKA service</h3>
    <div class="form-error-summary" data-error-summary role="alert" hidden></div>
    <label class="field">
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
    <label class="field">
      <span>Comment <em>required</em></span>
      <textarea name="comment" rows="3" required maxlength="600"></textarea>
    </label>
    <button class="button button--secondary" type="submit">Submit review</button>
  </form>`;
}

function emptyState(title, copy, actionLabel, actionAttribute) {
  return TikkaUI.stateMarkup({ heading: title, body: copy, actionLabel, actionAttribute });
}

function renderRequestLoading() {
  if (elements.requestLoading) elements.requestLoading.textContent = "Loading your requests and request details.";
  [elements.requestSummary, elements.activeRequests, elements.upcomingRequests, elements.completedRequests, elements.requestList, elements.requestDetail]
    .forEach((region) => TikkaUI.setRegionBusy(region, true));
  elements.requestSummary.innerHTML = TikkaUI.skeleton("summary", 4);
  elements.activeRequests.innerHTML = TikkaUI.skeleton("card", 2);
  elements.upcomingRequests.innerHTML = TikkaUI.skeleton("row", 2);
  elements.completedRequests.innerHTML = TikkaUI.skeleton("row", 2);
  elements.requestList.innerHTML = TikkaUI.skeleton("card", 2);
  elements.requestDetail.innerHTML = TikkaUI.skeleton("detail", 1);
}

function renderRequestFailure() {
  if (elements.requestLoading) elements.requestLoading.textContent = "";
  [elements.requestSummary, elements.activeRequests, elements.upcomingRequests, elements.completedRequests, elements.requestList, elements.requestDetail]
    .forEach((region) => TikkaUI.setRegionBusy(region, false));
  const retry = TikkaUI.stateMarkup({
    kind: "error",
    heading: "Requests could not be loaded",
    body: "Check your connection and try again. Your existing requests have not been changed.",
    actionLabel: "Try again",
    actionAttribute: "data-retry-requests"
  });
  elements.requestSummary.innerHTML = retry;
  elements.activeRequests.innerHTML = TikkaUI.stateMarkup({ kind: "error", heading: "Active jobs unavailable", body: "Request information is temporarily unavailable." });
  elements.upcomingRequests.innerHTML = TikkaUI.stateMarkup({ kind: "error", heading: "Scheduled visits unavailable", body: "Request information is temporarily unavailable." });
  elements.completedRequests.innerHTML = TikkaUI.stateMarkup({ kind: "error", heading: "Completed jobs unavailable", body: "Request information is temporarily unavailable." });
  elements.requestList.innerHTML = retry;
  elements.requestDetail.innerHTML = TikkaUI.stateMarkup({ kind: "error", heading: "Request details unavailable", body: "Try loading your requests again." });
}

async function loadCurrentUser() {
  try {
    const sessionPayload = await api("/api/auth/me");
    state.customer = sessionPayload.customer;
    state.csrfToken = sessionPayload.csrfToken || null;
  } catch (error) {
    state.customer = null;
    state.csrfToken = null;
  }
}

async function loadRequests() {
  if (!state.customer) {
    state.requests = [];
    state.requestsLoading = false;
    state.requestLoadError = null;
    return;
  }
  state.requestsLoading = true;
  state.requestLoadError = null;
  try {
    const payload = await api("/api/requests");
    state.requests = payload.requests || [];
  } catch (error) {
    state.requestLoadError = error;
    throw error;
  } finally {
    state.requestsLoading = false;
  }
}

async function submitServiceRequest(event) {
  event.preventDefault();
  const submitButton = elements.requestForm.querySelector("[data-request-submit]");
  setMessage(elements.requestMessage, "");
  setMessage(elements.portalMessage, "");
  if (!TikkaForms.validate(elements.requestForm)) {
    setMessage(elements.requestMessage, "Please correct the highlighted fields.", "error");
    return;
  }
  const body = formValues(elements.requestForm);
  body.photos = [];

  setMessage(elements.requestMessage, "Submitting request...");
  TikkaForms.setBusy(submitButton, true, "Submitting...");
  try {
    const payload = await api("/api/requests", {
      method: "POST",
      body: JSON.stringify(body)
    });
    elements.requestForm.reset();
    syncCustomerFields();
    let refreshFailed = false;
    try {
      await loadRequests();
    } catch (requestError) {
      refreshFailed = true;
    }
    state.selectedRequestId = payload.request.id;
    renderDashboard();
    setMessage(elements.requestMessage, "");
    setMessage(elements.portalMessage, refreshFailed
      ? `${payload.message} Reference: ${payload.request.reference}. Refresh your requests to see the latest status.`
      : `${payload.message} Reference: ${payload.request.reference}`, "success");
    activatePanel("requests");
  } catch (error) {
    const hasFieldErrors = TikkaForms.applyServerErrors(elements.requestForm, error.payload?.errors);
    setMessage(elements.requestMessage, hasFieldErrors ? "Please correct the highlighted fields." : describeErrors(error), "error");
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
}

async function confirmCompletion(requestId, trigger) {
  const confirmed = await TikkaUI.confirmAction({
    title: "Confirm completed work",
    body: "Confirm only if the TIKKA job has been completed and you are satisfied with the work.",
    confirmLabel: "Confirm completion",
    trigger
  });
  if (!confirmed) return;
  await completeConfirmedRequest(requestId);
}

async function submitReview(event) {
  const form = event.target.closest("[data-review-form]");
  if (!form) return;
  event.preventDefault();
  const submitButton = form.querySelector("button");
  TikkaForms.bind(form);
  if (!TikkaForms.validate(form)) return;
  TikkaForms.setBusy(submitButton, true, "Submitting...");
  try {
    await api(`/api/requests/${form.dataset.requestId}/review`, {
      method: "POST",
      body: JSON.stringify(formValues(form))
    });
    try {
      await loadRequests();
    } catch (requestError) {
      // Review submission succeeded; the regional request state offers a retry.
    }
    state.selectedRequestId = form.dataset.requestId;
    renderDashboard();
    setMessage(elements.portalMessage, "Thank you. Your review was submitted.", "success");
  } catch (error) {
    const hasFieldErrors = TikkaForms.applyServerErrors(form, error.payload?.errors);
    setMessage(elements.portalMessage, hasFieldErrors ? "Please correct the highlighted fields." : describeErrors(error), "error");
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
}

function setAuthMode(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  const registering = state.authMode === "register";
  elements.authForm.mode.value = state.authMode;
  elements.authTitle.textContent = registering ? "Create an account" : "Sign in";
  elements.authSubmit.textContent = registering ? "Create account" : "Sign in";
  elements.authForm.password.autocomplete = registering ? "new-password" : "current-password";
  $$('[data-auth-mode]').forEach((button) => {
    const active = button.dataset.authMode === state.authMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $$('[data-register-field]').forEach((field) => {
    field.hidden = !registering;
    field.querySelector("input").disabled = !registering;
  });
  TikkaForms.clear(elements.authForm);
  setMessage(elements.authMessage, "");
}

function applyInitialDestination() {
  if (!state.customer) return;
  if (state.intendedService || window.location.hash === "#request") activatePanel("request");
  else if (window.location.hash === "#requests") activatePanel("requests");
  else if (window.location.hash === "#profile") activatePanel("profile");
  else activatePanel("overview");
}

function activatePanel(panel) {
  $$('[data-customer-tab]').forEach((link) => {
    const active = link.dataset.customerTab === panel;
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  if (state.customer && window.location.hash !== `#${panel}`) window.history.replaceState(null, "", `#${panel}`);
  $$("[data-customer-tab]").forEach((link) => link.classList.toggle("is-active", link.dataset.customerTab === panel));
  if (panel === "request") {
    TikkaUI.scrollIntoView(elements.requestForm, { block: "start" });
  } else if (panel === "requests") {
    TikkaUI.scrollIntoView($("#requests"), { block: "start" });
  } else if (panel === "profile") {
    TikkaUI.scrollIntoView($("#profile"), { block: "start" });
  } else {
    TikkaUI.scrollIntoView($("#overview"), { block: "start" });
  }
}

function bindEvents() {
  TikkaForms.bind(elements.authForm);
  TikkaForms.bind(elements.requestForm);
  TikkaUI.setupMenu(elements.navToggle, elements.navMenu, { desktopQuery: "(min-width: 1040px)", itemSelector: "[data-nav-item]" });

  $$("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });

  $$("[data-customer-tab]").forEach((link) => {
    link.addEventListener("click", () => activatePanel(link.dataset.customerTab));
  });

  if (elements.authForm) {
    elements.authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(elements.authMessage, "");
      if (!TikkaForms.validate(elements.authForm)) {
        setMessage(elements.authMessage, "Please correct the highlighted fields.", "error");
        return;
      }
      const submitter = elements.authSubmit;
      const modeButtons = $$('[data-auth-mode]');
      const mode = state.authMode;
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      setMessage(elements.authMessage, mode === "login" ? "Logging in..." : "Creating account...");
      modeButtons.forEach((button) => { button.disabled = true; });
      TikkaForms.setBusy(submitter, true, mode === "login" ? "Signing in..." : "Creating...");
      try {
        const payload = await api(endpoint, {
          method: "POST",
          body: JSON.stringify(formValues(elements.authForm))
        });
        state.customer = payload.customer;
        state.csrfToken = payload.csrfToken || null;
        try {
          await loadRequests();
        } catch (requestError) {
          // Authentication succeeded; request data receives its own retryable state.
        }
        state.loading = false;
        setAuthenticatedView();
        syncCustomerFields();
        renderDashboard();
        applyInitialDestination();
      } catch (error) {
        const hasFieldErrors = TikkaForms.applyServerErrors(elements.authForm, error.payload?.errors);
        setMessage(elements.authMessage, hasFieldErrors ? "Please correct the highlighted fields." : describeErrors(error), "error");
      } finally {
        TikkaForms.setBusy(submitter, false);
        modeButtons.forEach((button) => { button.disabled = false; });
      }
    });
  }

  if (elements.requestForm) {
    elements.requestForm.addEventListener("submit", submitServiceRequest);
  }

  document.addEventListener("click", async (event) => {
    const retryButton = event.target.closest("[data-retry-requests]");
    if (retryButton) {
      state.requestsLoading = true;
      state.requestLoadError = null;
      renderDashboard();
      try {
        await loadRequests();
      } catch (error) {
        // The regional state remains visible and offers another retry.
      } finally {
        renderDashboard();
      }
      return;
    }

    const requestServiceButton = event.target.closest("[data-empty-request-service]");
    if (requestServiceButton) {
      activatePanel("request");
      return;
    }

    const clearFilterButton = event.target.closest("[data-clear-request-filter]");
    if (clearFilterButton) {
      state.filter = "all";
      $$('[data-filter]').forEach((button) => {
        const active = button.dataset.filter === "all";
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderRequestHistory();
      return;
    }

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
      elements.requestDetail.querySelector("h2")?.focus({ preventScroll: true });
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      state.filter = filterButton.dataset.filter;
      $$("[data-filter]").forEach((button) => {
        const active = button === filterButton;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderRequestHistory();
      return;
    }

    const confirmButton = event.target.closest("[data-confirm-request]");
    if (confirmButton) {
      setMessage(elements.portalMessage, "");
      try {
        const confirmed = await TikkaUI.confirmAction({
          title: "Confirm completed work",
          body: "Confirm only if the TIKKA job has been completed and you are satisfied with the work.",
          confirmLabel: "Confirm completion",
          trigger: confirmButton
        });
        if (!confirmed) return;
        TikkaForms.setBusy(confirmButton, true, "Confirming...");
        await completeConfirmedRequest(confirmButton.dataset.confirmRequest);
      } catch (error) {
        setMessage(elements.portalMessage, describeErrors(error), "error");
      } finally {
        TikkaForms.setBusy(confirmButton, false);
      }
      return;
    }
  });

  document.addEventListener("submit", submitReview);

  if (elements.logoutButton) {
    const logout = async () => {
      TikkaForms.setBusy(elements.logoutButton, true, "Logging out...");
      try {
        await api("/api/auth/logout", { method: "POST" });
        state.customer = null;
        state.csrfToken = null;
        state.requests = [];
        state.selectedRequestId = null;
        state.loading = false;
        setAuthenticatedView();
        setAuthMode("login");
      } catch (error) {
        setMessage(elements.authMessage, describeErrors(error), "error");
      } finally {
        TikkaForms.setBusy(elements.logoutButton, false);
      }
    };
    elements.logoutButton.addEventListener("click", logout);
    elements.logoutMenu?.addEventListener("click", logout);
  }

  window.addEventListener("hashchange", () => {
    if (!state.customer) return;
    const panel = ["overview", "request", "requests", "profile"].includes(window.location.hash.slice(1))
      ? window.location.hash.slice(1)
      : "overview";
    activatePanel(panel);
  });
}

async function completeConfirmedRequest(requestId) {
  await api(`/api/requests/${requestId}/confirm`, { method: "POST" });
  try {
    await loadRequests();
  } catch (requestError) {
    // Completion succeeded; the regional request state offers a retry.
  }
  state.selectedRequestId = requestId;
  renderDashboard();
  setMessage(elements.portalMessage, "Completion confirmed. You can now review the service.", "success");
}

async function bootstrap() {
  bindEvents();
  setAuthMode("login");
  if (elements.requestForm?.preferredDate) {
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    elements.requestForm.preferredDate.min = localToday;
  }
  try {
    const servicesPayload = await api("/api/services");
    state.services = servicesPayload.services || [];
    renderServices();
    await loadCurrentUser();
    if (state.customer) {
      try {
        await loadRequests();
      } catch (requestError) {
        // Keep the portal usable and render regional request failures below.
      }
    }
    syncCustomerFields();
    state.loading = false;
    setAuthenticatedView();
    renderDashboard();
    applyInitialDestination();
  } catch (error) {
    state.loading = false;
    setAuthenticatedView();
    setMessage(elements.authMessage, error.message, "error");
  }
}

bootstrap();
