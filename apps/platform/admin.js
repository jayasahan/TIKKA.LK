const state = {
  metrics: null,
  jobs: [],
  workers: [],
  customers: [],
  reviews: [],
  categories: [],
  selectedJobId: null,
  selectedWorkerId: null,
  csrfToken: null
};

const $ = (selector) => document.querySelector(selector);
const messageEl = $("[data-ops-message]");
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));
const date = (value) => value ? new Date(value).toLocaleString() : "Not recorded";

function message(text, tone = "neutral") {
  messageEl.textContent = text;
  messageEl.dataset.tone = tone;
}

function errors(error) {
  return error.payload?.errors ? Object.values(error.payload.errors).join(" ") : error.message;
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

function table(headers, rows, empty) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<table class="ops-table"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function tab(name) {
  document.querySelectorAll("[data-ops-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.opsTab === name);
  });
  document.querySelectorAll("[data-ops-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.opsPanel === name);
  });
}

function metric(label, value) {
  return `<article class="ops-metric"><p>${esc(label)}</p><strong>${esc(value)}</strong></article>`;
}

function renderOverview() {
  const counts = state.jobs.reduce((accumulator, job) => {
    accumulator[job.status] = (accumulator[job.status] || 0) + 1;
    return accumulator;
  }, {});
  const active = state.workers.filter((worker) => worker.active).length;
  $("[data-ops-metrics]").innerHTML = [
    metric("New requests", counts.NEW || 0),
    metric("Under review", counts.REVIEWING || 0),
    metric("Scheduled jobs", counts.SCHEDULED || 0),
    metric("Assigned jobs", counts.ASSIGNED || 0),
    metric("Jobs in progress", counts.IN_PROGRESS || 0),
    metric("Completed", (counts.COMPLETED || 0) + (counts.CONFIRMED || 0)),
    metric("Active workers", active),
    metric("Total customers", state.customers.length)
  ].join("");
  $("[data-overview-jobs]").innerHTML = table(
    ["Reference", "Customer", "Service", "Status", "Scheduled"],
    state.jobs.slice(0, 8).map((job) => [
      esc(job.reference),
      esc(job.customerName),
      esc(job.service),
      `<span class="status-badge">${esc(job.status)}</span>`,
      esc(date(job.scheduledAt))
    ]),
    "No requests yet."
  );
  $("[data-overview-workers]").innerHTML = table(
    ["Worker", "Availability", "Area"],
    state.workers
      .filter((worker) => !worker.active || worker.availabilityStatus !== "AVAILABLE")
      .map((worker) => [
        esc(worker.name),
        `<span class="status-badge">${esc(worker.active ? worker.availabilityStatus : "INACTIVE")}</span>`,
        esc(worker.serviceArea)
      ]),
    "All active workers are available."
  );
}

function renderJobs() {
  $("[data-job-table]").innerHTML = table(
    ["Reference", "Customer", "Service", "Status", "Scheduled", "Worker"],
    state.jobs.map((job) => [
      `<button class="text-action" type="button" data-select-job="${esc(job.id)}">${esc(job.reference)}</button>`,
      esc(job.customerName),
      esc(job.service),
      `<span class="status-badge">${esc(job.status)}</span>`,
      esc(date(job.scheduledAt)),
      esc(job.assignment?.worker?.name || "Unassigned")
    ]),
    "No requests match this filter."
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
  return next.map((status) => `<button class="button button--secondary" type="button" data-job-status="${status}">${status === "REVIEWING" ? "Start review" : status.replaceAll("_", " ")}</button>`).join("");
}

function renderScheduleForm(job) {
  const canSchedule = ["REVIEWING", "SCHEDULED", "ASSIGNED"].includes(job.status);
  if (!canSchedule) return "";
  return `<form data-schedule-form>
    <label><span>${job.scheduledAt ? "Reschedule job" : "Scheduled at"}</span><input name="scheduledAt" type="datetime-local" required></label>
    <button class="button button--primary" type="submit">${job.scheduledAt ? "Reschedule Job" : "Schedule Job"}</button>
  </form>`;
}

function renderAssignForm(job, workers) {
  if (job.status !== "SCHEDULED") return "";
  return `<form data-assign-form>
    <label><span>Assign active worker</span><select name="workerId" required><option value="">Choose worker</option>${workers.map((worker) => `<option value="${esc(worker.id)}">${esc(worker.name)} | ${esc(worker.availabilityStatus)} | ${esc(worker.serviceArea)}</option>`).join("")}</select></label>
    <button class="button button--primary" type="submit">Assign Worker</button>
  </form>`;
}

function renderJobDetail() {
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  const target = $("[data-job-detail]");
  if (!job) {
    target.innerHTML = `<p class="muted">Select a request to review, schedule, assign, or update.</p>`;
    return;
  }
  const workers = state.workers.filter((worker) => worker.active);
  target.innerHTML = `<p class="eyebrow">${esc(job.reference)}</p>
    <h2>${esc(job.title)}</h2>
    <p class="status-badge">${esc(job.status)}</p>
    <dl class="request-meta">
      <div><dt>Customer</dt><dd>${esc(job.customerName)}</dd></div>
      <div><dt>Phone</dt><dd>${esc(job.phone)}</dd></div>
      <div><dt>Email</dt><dd>${esc(job.email)}</dd></div>
      <div><dt>Address</dt><dd>${esc(job.address)}</dd></div>
      <div><dt>Service</dt><dd>${esc(job.service)}</dd></div>
      <div><dt>Preferred</dt><dd>${esc(job.preferredDate)} ${esc(job.preferredTime)}</dd></div>
      <div><dt>Scheduled</dt><dd>${esc(date(job.scheduledAt))}</dd></div>
      <div><dt>Submitted</dt><dd>${esc(date(job.submittedAt))}</dd></div>
      <div><dt>Worker</dt><dd>${esc(job.assignment?.worker?.name || "Not assigned")}</dd></div>
    </dl>
    <p>${esc(job.description)}</p>
    ${renderScheduleForm(job)}
    ${renderAssignForm(job, workers)}
    <div class="ops-actions">${statusButtons(job)}</div>`;
}

function renderWorkers() {
  $("[data-worker-table]").innerHTML = table(
    ["Worker", "Phone", "Skills / services", "Availability", "Jobs", "Status"],
    state.workers.map((worker) => [
      `<button class="text-action" type="button" data-select-worker="${esc(worker.id)}">${esc(worker.name)}</button>`,
      esc(worker.phone),
      esc([...(worker.skills || []), ...(worker.services || [])].join(", ")),
      esc(worker.availabilityStatus),
      esc(worker.completedJobs),
      esc(worker.active ? "Active" : "Inactive")
    ]),
    "No workers created yet."
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
  target.innerHTML = `<p class="eyebrow">Internal worker</p><h2>${esc(worker.name)}</h2><p class="status-badge">${esc(worker.active ? worker.availabilityStatus : "INACTIVE")}</p><dl class="request-meta"><div><dt>Phone</dt><dd>${esc(worker.phone)}</dd></div><div><dt>Area</dt><dd>${esc(worker.serviceArea)}</dd></div><div><dt>Completed jobs</dt><dd>${esc(worker.completedJobs)}</dd></div><div><dt>Rating</dt><dd>${esc(worker.rating || "Not rated")}</dd></div></dl><p><strong>Skills</strong><br>${esc((worker.skills || []).join(", ") || "None recorded")}</p><p><strong>Services</strong><br>${esc((worker.services || []).join(", ") || "None recorded")}</p><div class="ops-actions"><button class="button button--secondary" data-edit-worker type="button">Edit</button><button class="button button--secondary" data-toggle-worker type="button">${worker.active ? "Mark inactive" : "Mark active"}</button><button class="button button--secondary" data-availability="${worker.availabilityStatus === "AVAILABLE" ? "BUSY" : "AVAILABLE"}" type="button">Set ${worker.availabilityStatus === "AVAILABLE" ? "busy" : "available"}</button></div>`;
}

function renderCustomers() {
  const counts = state.jobs.reduce((accumulator, job) => {
    accumulator[job.customerId] = (accumulator[job.customerId] || 0) + 1;
    return accumulator;
  }, {});
  $("[data-customer-table]").innerHTML = table(
    ["Name", "Phone", "Email", "Requests", "Created"],
    state.customers.map((customer) => [esc(customer.name), esc(customer.phone), esc(customer.email), esc(counts[customer.id] || 0), esc(date(customer.createdAt))]),
    "No customers yet."
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
    "No reviews yet."
  );
}

function renderCategories() {
  $("[data-category-table]").innerHTML = table(
    ["Name", "Code", "Status", "Action"],
    state.categories.map((category) => [esc(category.name), esc(category.code), esc(category.enabled ? "Enabled" : "Disabled"), `<button class="text-action" data-edit-category="${esc(category.id)}" type="button">Edit</button>`]),
    "No categories yet."
  );
}

async function loadAll(filters = {}) {
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

document.querySelectorAll("[data-ops-tab]").forEach((button) => {
  button.addEventListener("click", () => tab(button.dataset.opsTab));
});

$("[data-admin-logout]").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  window.location.replace("/admin-login.html");
});

$("[data-refresh]").addEventListener("click", () => loadAll().catch((error) => message(errors(error), "error")));
$("[data-job-filters]").addEventListener("submit", (event) => {
  event.preventDefault();
  loadAll(Object.fromEntries(new FormData(event.target))).catch((error) => message(errors(error), "error"));
});
$("[data-job-table]").addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-job]");
  if (button) {
    state.selectedJobId = button.dataset.selectJob;
    renderJobDetail();
  }
});
$("[data-job-detail]").addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-schedule-form]")) return;
  event.preventDefault();
  const value = Object.fromEntries(new FormData(event.target));
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: new Date(value.scheduledAt).toISOString() })
    });
    message("Job scheduled.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
  }
});
$("[data-job-detail]").addEventListener("submit", async (event) => {
  if (!event.target.matches("[data-assign-form]")) return;
  event.preventDefault();
  const value = Object.fromEntries(new FormData(event.target));
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/assign-worker`, {
      method: "POST",
      body: JSON.stringify({ workerId: value.workerId })
    });
    message("Worker assigned.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
  }
});
$("[data-job-detail]").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-job-status]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.jobStatus })
    });
    message("Request status updated.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
    button.disabled = false;
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
  try {
    if (event.target.closest("[data-edit-worker]")) return workerForm(worker);
    if (event.target.closest("[data-toggle-worker]")) await api(`/api/admin/workers/${worker.id}/toggle-active`, { method: "POST" });
    const availability = event.target.closest("[data-availability]");
    if (availability) {
      await api(`/api/admin/workers/${worker.id}/availability`, {
        method: "POST",
        body: JSON.stringify({ availabilityStatus: availability.dataset.availability })
      });
    }
    message("Worker updated.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
  }
});
$("[data-worker-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Object.fromEntries(new FormData(event.target));
  const body = {
    name: value.name,
    phone: value.phone,
    serviceArea: value.serviceArea,
    notes: value.notes,
    skills: value.skills.split(",").map((item) => item.trim()).filter(Boolean),
    services: value.services.split(",").map((item) => item.trim()).filter(Boolean)
  };
  try {
    await api(value.id ? `/api/admin/workers/${value.id}` : "/api/admin/workers", {
      method: "POST",
      body: JSON.stringify(body)
    });
    event.target.hidden = true;
    message("Worker saved.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
  }
});
$("[data-review-table]").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-moderate-review]");
  if (!button) return;
  try {
    await api(`/api/admin/reviews/${button.dataset.moderateReview}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action: button.dataset.moderationAction })
    });
    message("Review moderation updated.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
  }
});
$("[data-category-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Object.fromEntries(new FormData(event.target));
  try {
    await api(value.id ? `/api/admin/categories/${value.id}` : "/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: value.name, code: value.code, description: value.description, enabled: Boolean(value.enabled) })
    });
    event.target.reset();
    event.target.id.value = "";
    message("Category saved.", "success");
    await loadAll();
  } catch (error) {
    message(errors(error), "error");
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
  $("[data-category-form-title]").textContent = "Edit category";
});

async function bootstrap() {
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
    message("The operations dashboard could not be loaded. Please try again.", "error");
  }
}

bootstrap();
