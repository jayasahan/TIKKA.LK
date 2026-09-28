const state = {
  metrics: null,
  jobs: [],
  workers: [],
  customers: [],
  reviews: [],
  categories: [],
  selectedJobId: null,
  selectedWorkerId: null,
  csrfToken: null,
  loading: true,
  loadError: null,
  jobFilters: {}
};

const $ = (selector) => document.querySelector(selector);
const messageEl = $("[data-ops-message]");
const opsNavToggle = $("[data-ops-nav-toggle]");
const opsNavMenu = $("[data-ops-nav-menu]");
const opsStatus = document.createElement("p");
opsStatus.className = "sr-only";
opsStatus.setAttribute("role", "status");
$("[data-ops-panel='requests']")?.prepend(opsStatus);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));
const date = (value) => value ? new Date(value).toLocaleString() : "Not recorded";

function message(text, tone = "neutral") {
  if (tone === "success") {
    messageEl.hidden = true;
    messageEl.textContent = "";
    TikkaUI.toast(text, "success");
    return;
  }
  messageEl.textContent = text;
  messageEl.hidden = !text;
  messageEl.className = `alert alert--${tone === "error" ? "error" : tone === "warning" ? "warning" : "info"}`;
  if (tone === "error") messageEl.setAttribute("role", "alert");
  else messageEl.setAttribute("role", "status");
}

function errors(error) {
  return error.payload?.errors ? Object.values(error.payload.errors).join(" ") : error.message;
}

function formError(form, error) {
  const hasFieldErrors = TikkaForms.applyServerErrors(form, error.payload?.errors);
  message(hasFieldErrors ? "Please correct the highlighted fields." : errors(error), "error");
}

async function refreshAfterSuccess(successMessage) {
  try {
    await loadAll();
    message(successMessage, "success");
  } catch (error) {
    TikkaUI.toast(successMessage, "success");
    message("The change was saved, but the latest dashboard data could not be loaded. Refresh and try again.", "warning");
  }
}

function localDateTimeMinimum() {
  const now = new Date(Date.now() + 60000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

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

function table(headers, rows, empty, caption = "Operations data") {
  if (!rows.length) return TikkaUI.stateMarkup(empty);
  return `<table class="ops-table"><caption class="sr-only">${esc(caption)}</caption><thead><tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td data-column="${esc(headers[index].toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function tab(name, { updateHistory = false } = {}) {
  document.querySelectorAll("[data-ops-tab]").forEach((button) => {
    const active = button.dataset.opsTab === name;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "location");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-ops-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.opsPanel === name);
  });
  const current = $("[data-ops-current]");
  if (current) current.textContent = document.querySelector(`[data-ops-tab="${name}"]`)?.textContent || "Operations";
  if (updateHistory && window.location.hash !== `#${name}`) window.history.pushState(null, "", `#${name}`);
}

function metric(label, value, hint = "") {
  return `<article class="ops-metric card card--summary"><p>${esc(label)}</p><strong>${esc(value)}</strong>${hint ? `<small>${esc(hint)}</small>` : ""}</article>`;
}

function nextAction(job) {
  return ({
    NEW: "Begin review",
    REVIEWING: "Schedule",
    SCHEDULED: "Assign worker",
    ASSIGNED: "Start job",
    IN_PROGRESS: "Mark completed",
    COMPLETED: "Await confirmation",
    CONFIRMED: "Complete",
    CANCELLED: "Closed",
    REJECTED: "Closed"
  })[job.status] || "Review";
}

function renderOverview() {
  const counts = state.jobs.reduce((accumulator, job) => {
    accumulator[job.status] = (accumulator[job.status] || 0) + 1;
    return accumulator;
  }, {});
  const active = state.workers.filter((worker) => worker.active).length;
  $("[data-ops-metrics]").innerHTML = [
    metric("New requests", counts.NEW || 0, "Needs review"),
    metric("Under review", counts.REVIEWING || 0, "Needs scheduling"),
    metric("Scheduled jobs", counts.SCHEDULED || 0, "Ready for assignment"),
    metric("Jobs in progress", (counts.ASSIGNED || 0) + (counts.IN_PROGRESS || 0), "Assigned or underway"),
    metric("Awaiting confirmation", counts.COMPLETED || 0, "Customer action pending"),
    metric("Active workers", active, "Available internal team")
  ].join("");
  $("[data-overview-jobs]").innerHTML = table(
    ["Reference", "Customer", "Service", "Status", "Scheduled", "Next action"],
    state.jobs.slice(0, 8).map((job) => [
      esc(job.reference),
      esc(job.customerName),
      esc(job.service),
      TikkaUI.statusBadge(job.status),
      esc(date(job.scheduledAt)),
      esc(nextAction(job))
    ]),
    { heading: "No requests yet", body: "New customer requests will appear here." },
    "Recent customer requests"
  );
  $("[data-overview-workers]").innerHTML = table(
    ["Worker", "Availability", "Area"],
    state.workers
      .filter((worker) => !worker.active || worker.availabilityStatus !== "AVAILABLE")
      .map((worker) => [
        esc(worker.name),
        TikkaUI.statusBadge(worker.active ? worker.availabilityStatus : "INACTIVE"),
        esc(worker.serviceArea)
      ]),
    { heading: "Everyone is available", body: "No active workers are currently busy or inactive." },
    "Worker availability"
  );
}

function renderJobs() {
  const hasFilters = Boolean(state.jobFilters.q || state.jobFilters.status);
  $("[data-job-table]").innerHTML = table(
    ["Reference", "Customer", "Service", "Status", "Scheduled", "Worker", "Next action"],
    state.jobs.map((job) => [
      `<button class="text-action${job.id === state.selectedJobId ? " is-selected" : ""}" type="button" aria-pressed="${String(job.id === state.selectedJobId)}" aria-label="View details for request ${esc(job.reference)}" data-select-job="${esc(job.id)}">${esc(job.reference)}</button>`,
      esc(job.customerName),
      esc(job.service),
      TikkaUI.statusBadge(job.status),
      esc(date(job.scheduledAt)),
      esc(job.assignment?.worker?.name || "Unassigned"),
      esc(nextAction(job))
    ]),
    hasFilters
      ? { heading: "No matching requests", body: "Adjust or clear the current filters.", actionLabel: "Clear filters", actionAttribute: "data-clear-job-filters" }
      : { heading: "No requests yet", body: "New customer requests will appear here." },
    "Customer service requests"
  );
  renderJobDetail();
}

function statusButtons(job) {
  const next = {
    NEW: ["REVIEWING", "CANCELLED", "REJECTED"],
    REVIEWING: ["CANCELLED", "REJECTED"],
    SCHEDULED: ["CANCELLED", "REJECTED"],
    ASSIGNED: ["IN_PROGRESS", "CANCELLED", "REJECTED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"]
  }[job.status] || [];
  return next.map((status, index) => {
    const variant = ["CANCELLED", "REJECTED"].includes(status)
      ? "button--danger"
      : index === 0 ? "button--primary" : "button--secondary";
    const statusText = status.replaceAll("_", " ").toLowerCase();
    const label = status === "REVIEWING" ? "Start review" : `${statusText.charAt(0).toUpperCase()}${statusText.slice(1)}`;
    return `<button class="button ${variant}" type="button" data-job-status="${status}">${label}</button>`;
  }).join("");
}

function renderScheduleForm(job) {
  const canSchedule = ["REVIEWING", "SCHEDULED", "ASSIGNED"].includes(job.status);
  if (!canSchedule) return "";
  return `<form data-schedule-form novalidate>
    <div class="form-error-summary" data-error-summary role="alert" hidden></div>
    <label class="field"><span>${job.scheduledAt ? "Reschedule date and time" : "Schedule date and time"} <em>required</em></span><input name="scheduledAt" type="datetime-local" min="${localDateTimeMinimum()}" required><small class="field__hint">Sri Lanka local time. Past times are not allowed.</small></label>
    <button class="button button--primary" type="submit">${job.scheduledAt ? "Reschedule job" : "Schedule job"}</button>
  </form>`;
}

function renderAssignForm(job, workers) {
  if (job.status !== "SCHEDULED") return "";
  return `<form data-assign-form novalidate>
    <div class="form-error-summary" data-error-summary role="alert" hidden></div>
    <label class="field"><span>Assign active worker <em>required</em></span><select name="workerId" required><option value="">Choose worker</option>${workers.map((worker) => `<option value="${esc(worker.id)}">${esc(worker.name)} | ${esc(worker.availabilityStatus)} | ${esc(worker.serviceArea)}</option>`).join("")}</select></label>
    <button class="button button--primary" type="submit">Assign worker</button>
  </form>`;
}

function renderJobDetail() {
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  const target = $("[data-job-detail]");
  target.removeAttribute("aria-labelledby");
  target.setAttribute("aria-label", "Selected request details");
  if (!job) {
    target.innerHTML = `<p class="muted">Select a request to review, schedule, assign, or update.</p>`;
    return;
  }
  const workers = state.workers.filter((worker) => worker.active);
  target.setAttribute("aria-labelledby", "ops-job-detail-title");
  target.innerHTML = `<p class="eyebrow">${esc(job.reference)}</p>
    <h2 id="ops-job-detail-title">${esc(job.title)}</h2>
    ${TikkaUI.statusBadge(job.status)}
    <section class="ops-detail-section"><h3>Customer and service</h3><dl class="request-meta">
      <div><dt>Customer</dt><dd>${esc(job.customerName)}</dd></div>
      <div><dt>Phone</dt><dd><a href="tel:${esc(job.phone)}">${esc(job.phone)}</a></dd></div>
      <div><dt>Service</dt><dd>${esc(job.service)}</dd></div>
      <div><dt>Submitted</dt><dd>${esc(date(job.submittedAt))}</dd></div>
    </dl></section>
    <section class="ops-detail-section"><h3>Issue and location</h3><p>${esc(job.description)}</p><p><strong>Address</strong><br>${esc(job.address)}</p></section>
    <section class="ops-detail-section"><h3>Schedule and assignment</h3><dl class="request-meta">
      <div><dt>Preferred</dt><dd>${esc(job.preferredDate)} ${esc(job.preferredTime)}</dd></div>
      <div><dt>Scheduled</dt><dd>${esc(date(job.scheduledAt))}</dd></div>
      <div><dt>Worker</dt><dd>${esc(job.assignment?.worker?.name || "Not assigned")}</dd></div>
    </dl></section>
    ${renderScheduleForm(job)}
    ${renderAssignForm(job, workers)}
    <div class="ops-actions">${statusButtons(job)}</div>`;
}

function renderWorkers() {
  $("[data-worker-table]").innerHTML = table(
    ["Worker", "Phone", "Skills / services", "Availability", "Jobs", "Status"],
    state.workers.map((worker) => [
      `<button class="text-action" type="button" data-select-worker="${esc(worker.id)}">${esc(worker.name)}</button>`,
      `<a href="tel:${esc(worker.phone)}">${esc(worker.phone)}</a>`,
      esc([...(worker.skills || []), ...(worker.services || [])].join(", ")),
      TikkaUI.statusBadge(worker.availabilityStatus),
      esc(worker.completedJobs),
      TikkaUI.statusBadge(worker.active ? "ACTIVE" : "INACTIVE")
    ]),
    { heading: "No workers yet", body: "Add an internal worker to begin assigning scheduled jobs.", actionLabel: "Add worker", actionAttribute: "data-empty-add-worker" },
    "Internal workers"
  );
  renderWorkerDetail();
}

function renderWorkerDetail() {
  const worker = state.workers.find((item) => item.id === state.selectedWorkerId);
  const target = $("[data-worker-detail]");
  if (!worker) {
    target.innerHTML = `<p class="muted">Select a worker to edit their operational record.</p>`;
    return;
  }
  target.innerHTML = `<p class="eyebrow">Internal worker</p><h2>${esc(worker.name)}</h2>${TikkaUI.statusBadge(worker.active ? worker.availabilityStatus : "INACTIVE")}<dl class="request-meta"><div><dt>Phone</dt><dd>${esc(worker.phone)}</dd></div><div><dt>Area</dt><dd>${esc(worker.serviceArea)}</dd></div><div><dt>Completed jobs</dt><dd>${esc(worker.completedJobs)}</dd></div><div><dt>Rating</dt><dd>${esc(worker.rating || "Not rated")}</dd></div></dl><p><strong>Skills</strong><br>${esc((worker.skills || []).join(", ") || "None recorded")}</p><p><strong>Services</strong><br>${esc((worker.services || []).join(", ") || "None recorded")}</p><div class="ops-actions"><button class="button button--secondary" data-edit-worker type="button">Edit</button><button class="button button--secondary" data-toggle-worker type="button">${worker.active ? "Mark inactive" : "Mark active"}</button><button class="button button--secondary" data-availability="${worker.availabilityStatus === "AVAILABLE" ? "BUSY" : "AVAILABLE"}" type="button">Set ${worker.availabilityStatus === "AVAILABLE" ? "busy" : "available"}</button></div>`;
}

function renderCustomers() {
  const counts = state.jobs.reduce((accumulator, job) => {
    accumulator[job.customerId] = (accumulator[job.customerId] || 0) + 1;
    return accumulator;
  }, {});
  $("[data-customer-table]").innerHTML = table(
    ["Name", "Phone", "Email", "Requests", "Created"],
    state.customers.map((customer) => [esc(customer.name), `<a href="tel:${esc(customer.phone)}">${esc(customer.phone)}</a>`, `<a href="mailto:${esc(customer.email)}">${esc(customer.email)}</a>`, esc(counts[customer.id] || 0), esc(date(customer.createdAt))]),
    { heading: "No customers yet", body: "Customer accounts will appear here after registration." },
    "Customer accounts"
  );
}

function renderReviews() {
  $("[data-review-table]").innerHTML = table(
    ["Request", "Customer", "Worker", "Rating", "Comment", "Submitted", "Visibility"],
    state.reviews.map((review) => [
      `<span>${esc(review.reference || review.requestId)}</span>`,
      esc(state.customers.find((customer) => customer.id === review.customerId)?.name || "Unknown"),
      esc(state.jobs.find((job) => job.id === review.requestId)?.assignment?.worker?.name || "Not assigned"),
      `${esc(review.rating)}/5`,
      esc(review.comment),
      esc(date(review.submittedAt)),
      `<button class="text-action" data-moderate-review="${esc(review.id)}" data-moderation-action="${review.hidden ? "restore" : "hide"}" type="button">${review.hidden ? "Restore" : "Hide"}</button>`
    ]),
    { heading: "No reviews yet", body: "Submitted customer reviews will appear here." },
    "Customer reviews"
  );
}

function renderCategories() {
  $("[data-category-table]").innerHTML = table(
    ["Name", "Code", "Status", "Action"],
    state.categories.map((category) => [esc(category.name), esc(category.code), TikkaUI.statusBadge(category.enabled ? "ENABLED" : "DISABLED"), `<button class="text-action" data-edit-category="${esc(category.id)}" type="button">Edit</button>`]),
    { heading: "No categories yet", body: "Create a service category using the form." },
    "Service categories"
  );
}

const adminRegions = [
  "[data-ops-metrics]",
  "[data-overview-jobs]",
  "[data-overview-workers]",
  "[data-job-table]",
  "[data-job-detail]",
  "[data-worker-table]",
  "[data-worker-detail]",
  "[data-customer-table]",
  "[data-review-table]",
  "[data-category-table]"
];

function setAdminRegionsBusy(busy) {
  adminRegions.forEach((selector) => TikkaUI.setRegionBusy($(selector), busy));
}

function renderAdminLoading() {
  opsStatus.textContent = $("[data-ops-panel='requests']").classList.contains("is-active")
    ? "Loading customer requests and request details."
    : "";
  setAdminRegionsBusy(true);
  $(`[data-ops-metrics]`).innerHTML = TikkaUI.skeleton("summary", 8);
  ["[data-overview-jobs]", "[data-overview-workers]", "[data-job-table]", "[data-worker-table]", "[data-customer-table]", "[data-review-table]", "[data-category-table]"]
    .forEach((selector) => { $(selector).innerHTML = TikkaUI.skeleton("table", 1); });
  ["[data-job-detail]", "[data-worker-detail]"]
    .forEach((selector) => { $(selector).innerHTML = TikkaUI.skeleton("detail", 1); });
}

function renderAdminFailure() {
  opsStatus.textContent = "";
  setAdminRegionsBusy(false);
  const retry = TikkaUI.stateMarkup({
    kind: "error",
    heading: "Operations data could not be loaded",
    body: "Check the connection and try again. No operational data has been changed.",
    actionLabel: "Try again",
    actionAttribute: "data-retry-admin"
  });
  adminRegions.forEach((selector, index) => {
    $(selector).innerHTML = index === 0
      ? retry
      : TikkaUI.stateMarkup({ kind: "error", heading: "Data unavailable", body: "Try loading the operations dashboard again." });
  });
}

async function loadAll(filters = {}) {
  state.jobFilters = { q: filters.q || "", status: filters.status || "" };
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString() ? `?${params}` : "";
  const data = await Promise.all([
    api("/api/admin/dashboard"),
    api(`/api/admin/requests${query}`),
    api("/api/admin/workers"),
    api("/api/admin/customers"),
    api("/api/admin/categories"),
    api("/api/admin/reviews")
  ]);
  state.metrics = data[0].metrics;
  state.jobs = data[1].requests;
  state.workers = data[2].workers;
  state.customers = data[3].customers;
  state.categories = data[4].categories;
  state.reviews = data[5].reviews;
  state.loading = false;
  state.loadError = null;
  opsStatus.textContent = "";
  setAdminRegionsBusy(false);
  message("");
  renderOverview();
  renderJobs();
  renderWorkers();
  renderCustomers();
  renderReviews();
  renderCategories();
}

function workerForm(worker = {}) {
  const form = $("[data-worker-form]");
  form.hidden = false;
  TikkaForms.clear(form);
  form.id.value = worker.id || "";
  form.name.value = worker.name || "";
  form.phone.value = worker.phone || "";
  form.serviceArea.value = worker.serviceArea || "";
  form.skills.value = (worker.skills || []).join(", ");
  form.services.value = (worker.services || []).join(", ");
  form.notes.value = worker.notes || "";
  $("[data-worker-form-title]").textContent = worker.id ? "Edit worker" : "Add worker";
  form.name.focus();
}

[$("[data-job-filters]"), $("[data-worker-form]"), $("[data-category-form]")].forEach((form) => TikkaForms.bind(form));
TikkaUI.setupMenu(opsNavToggle, opsNavMenu, { desktopQuery: "(min-width: 1040px)", itemSelector: "[data-nav-item]" });

document.querySelectorAll("[data-ops-tab]").forEach((button) => {
  button.addEventListener("click", () => tab(button.dataset.opsTab, { updateHistory: true }));
});

const initialOpsTab = ["overview", "requests", "workers", "customers", "reviews", "categories"].includes(window.location.hash.slice(1))
  ? window.location.hash.slice(1)
  : "overview";
tab(initialOpsTab);
window.addEventListener("popstate", () => tab(["overview", "requests", "workers", "customers", "reviews", "categories"].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "overview"));

document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-empty-add-worker]")) {
    workerForm();
    return;
  }

  if (event.target.closest("[data-clear-job-filters]")) {
    const form = $("[data-job-filters]");
    form.reset();
    try {
      await loadAll();
    } catch (error) {
      message(errors(error), "error");
    }
    return;
  }

  if (event.target.closest("[data-retry-admin]")) {
    renderAdminLoading();
    message("");
    try {
      await loadAll();
    } catch (error) {
      state.loading = false;
      state.loadError = error;
      renderAdminFailure();
      message("The operations dashboard could not be loaded. Please try again.", "error");
    }
  }
});

$("[data-admin-logout]").addEventListener("click", async (event) => {
  TikkaForms.setBusy(event.currentTarget, true, "Logging out...");
  try {
    await api("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin-login.html");
  } catch (error) {
    message(errors(error), "error");
    TikkaForms.setBusy(event.currentTarget, false);
  }
});

$("[data-refresh]").addEventListener("click", async (event) => {
  TikkaForms.setBusy(event.currentTarget, true, "Refreshing...");
  try {
    await loadAll();
    message("Operations data refreshed.", "success");
  } catch (error) {
    message(errors(error), "error");
  } finally {
    TikkaForms.setBusy(event.currentTarget, false);
  }
});
$("[data-job-filters]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  TikkaForms.setBusy(submitButton, true, "Filtering...");
  try {
    await loadAll(Object.fromEntries(new FormData(event.target)));
  } catch (error) {
    message(errors(error), "error");
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
});
$("[data-job-table]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-job]");
  if (button) {
    state.selectedJobId = button.dataset.selectJob;
    $("[data-select-job][aria-pressed='true']")?.setAttribute("aria-pressed", "false");
    $("[data-select-job].is-selected")?.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "true");
    button.classList.add("is-selected");
    renderJobDetail();
    const job = state.jobs.find((item) => item.id === state.selectedJobId);
    opsStatus.textContent = job
      ? `Details updated for request ${job.reference}: ${job.title}. Status: ${TikkaUI.statusMeta(job.status).label}.`
      : "Request details updated.";
  }
});
$("[data-job-detail]").addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-schedule-form]")) return;
  event.preventDefault();
  TikkaForms.bind(event.target);
  if (!TikkaForms.validate(event.target)) return;
  const submitButton = event.submitter;
  const value = Object.fromEntries(new FormData(event.target));
  TikkaForms.setBusy(submitButton, true, "Scheduling...");
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: new Date(value.scheduledAt).toISOString() })
    });
    await refreshAfterSuccess("Job scheduled.");
  } catch (error) {
    formError(event.target, error);
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
});
$("[data-job-detail]").addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-assign-form]")) return;
  event.preventDefault();
  TikkaForms.bind(event.target);
  if (!TikkaForms.validate(event.target)) return;
  const submitButton = event.submitter;
  const value = Object.fromEntries(new FormData(event.target));
  TikkaForms.setBusy(submitButton, true, "Assigning...");
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/assign-worker`, {
      method: "POST",
      body: JSON.stringify({ workerId: value.workerId })
    });
    await refreshAfterSuccess("Worker assigned.");
  } catch (error) {
    formError(event.target, error);
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
});
$("[data-job-detail]").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-job-status]");
  if (!button) return;
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  const destructive = ["CANCELLED", "REJECTED"].includes(button.dataset.jobStatus);
  if (destructive) {
    const statusLabel = button.dataset.jobStatus === "CANCELLED" ? "Cancel" : "Reject";
    const confirmed = await TikkaUI.confirmAction({
      title: `${statusLabel} request ${job?.reference || ""}`.trim(),
      body: `This will mark the customer request as ${button.dataset.jobStatus.toLowerCase()}.`,
      confirmLabel: `${statusLabel} request`,
      trigger: button
    });
    if (!confirmed) return;
  }
  TikkaForms.setBusy(button, true, "Updating...");
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.jobStatus })
    });
    await refreshAfterSuccess("Request status updated.");
  } catch (error) {
    message(errors(error), "error");
  } finally {
    TikkaForms.setBusy(button, false);
  }
});
$("[data-worker-table]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-worker]");
  if (button) {
    state.selectedWorkerId = button.dataset.selectWorker;
    renderWorkerDetail();
  }
});
$("[data-new-worker]").addEventListener("click", () => workerForm());
$("[data-cancel-worker]").addEventListener("click", () => {
  $("[data-worker-form]").hidden = true;
});
$("[data-worker-detail]").addEventListener("click", async (event) => {
  const worker = state.workers.find((item) => item.id === state.selectedWorkerId);
  if (!worker) return;
  const actionButton = event.target.closest("button");
  try {
    if (event.target.closest("[data-edit-worker]")) return workerForm(worker);
    if (!actionButton) return;
    if (event.target.closest("[data-toggle-worker]") && worker.active) {
      const confirmed = await TikkaUI.confirmAction({
        title: `Deactivate worker ${worker.name}`,
        body: "This worker will no longer be available for new assignments.",
        confirmLabel: "Deactivate worker",
        trigger: actionButton
      });
      if (!confirmed) return;
    }
    TikkaForms.setBusy(actionButton, true, "Updating...");
    if (event.target.closest("[data-toggle-worker]")) await api(`/api/admin/workers/${worker.id}/toggle-active`, { method: "POST" });
    const availability = event.target.closest("[data-availability]");
    if (availability) {
      await api(`/api/admin/workers/${worker.id}/availability`, {
        method: "POST",
        body: JSON.stringify({ availabilityStatus: availability.dataset.availability })
      });
    }
    await refreshAfterSuccess("Worker updated.");
  } catch (error) {
    message(errors(error), "error");
  } finally {
    TikkaForms.setBusy(actionButton, false);
  }
});
$("[data-worker-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!TikkaForms.validate(event.target)) return;
  const submitButton = event.submitter;
  const value = Object.fromEntries(new FormData(event.target));
  const body = {
    name: value.name,
    phone: value.phone,
    serviceArea: value.serviceArea,
    notes: value.notes,
    skills: value.skills.split(",").map((item) => item.trim()).filter(Boolean),
    services: value.services.split(",").map((item) => item.trim()).filter(Boolean)
  };
  TikkaForms.setBusy(submitButton, true, "Saving...");
  try {
    await api(value.id ? `/api/admin/workers/${value.id}` : "/api/admin/workers", {
      method: "POST",
      body: JSON.stringify(body)
    });
    event.target.hidden = true;
    await refreshAfterSuccess("Worker saved.");
  } catch (error) {
    formError(event.target, error);
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
});
$("[data-review-table]").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-moderate-review]");
  if (!button) return;
  if (button.dataset.moderationAction === "hide") {
    const confirmed = await TikkaUI.confirmAction({
      title: "Hide customer review",
      body: "This review will no longer be visible in the customer-facing experience.",
      confirmLabel: "Hide review",
      trigger: button
    });
    if (!confirmed) return;
  }
  TikkaForms.setBusy(button, true, button.dataset.moderationAction === "hide" ? "Hiding..." : "Restoring...");
  try {
    await api(`/api/admin/reviews/${button.dataset.moderateReview}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action: button.dataset.moderationAction })
    });
    await refreshAfterSuccess("Review moderation updated.");
  } catch (error) {
    message(errors(error), "error");
  } finally {
    TikkaForms.setBusy(button, false);
  }
});
$("[data-category-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!TikkaForms.validate(event.target)) return;
  const submitButton = event.submitter;
  const value = Object.fromEntries(new FormData(event.target));
  TikkaForms.setBusy(submitButton, true, "Saving...");
  try {
    await api(value.id ? `/api/admin/categories/${value.id}` : "/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: value.name, code: value.code, description: value.description, enabled: Boolean(value.enabled) })
    });
    event.target.reset();
    event.target.id.value = "";
    $("[data-category-form-title]").textContent = "Create category";
    await refreshAfterSuccess("Category saved.");
  } catch (error) {
    formError(event.target, error);
  } finally {
    TikkaForms.setBusy(submitButton, false);
  }
});
$("[data-category-table]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-category]");
  if (!button) return;
  const category = state.categories.find((item) => item.id === button.dataset.editCategory);
  const form = $("[data-category-form]");
  form.id.value = category.id;
  form.name.value = category.name;
  form.code.value = category.code;
  form.description.value = category.description;
  form.enabled.checked = category.enabled;
  TikkaForms.clear(form);
  $("[data-category-form-title]").textContent = "Edit category";
});

$("[data-category-reset]").addEventListener("click", () => {
  const form = $("[data-category-form]");
  form.reset();
  form.id.value = "";
  TikkaForms.clear(form);
  $("[data-category-form-title]").textContent = "Create category";
  form.name.focus();
});

async function bootstrap() {
  renderAdminLoading();
  try {
    const session = await api("/api/admin/me");
    $("[data-admin-name]").textContent = session.admin.name;
    state.csrfToken = session.csrfToken || null;
    await loadAll();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.location.replace("/admin-login.html");
      return;
    }
    state.loading = false;
    state.loadError = error;
    renderAdminFailure();
    message("The operations dashboard could not be loaded. Please try again.", "error");
  }
}

bootstrap();
