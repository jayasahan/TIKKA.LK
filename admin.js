const state = {
  admin: null,
  metrics: null,
  jobs: [],
  providers: [],
  categories: [],
  reviews: [],
  selectedJobId: null,
  selectedProviderId: null
};

const messageEl = document.querySelector("[data-ops-message]");
const adminName = document.querySelector("[data-admin-name]");
const metricsEl = document.querySelector("[data-ops-metrics]");
const overviewJobs = document.querySelector("[data-overview-jobs]");
const overviewProviders = document.querySelector("[data-overview-providers]");
const jobTable = document.querySelector("[data-job-table]");
const jobDetail = document.querySelector("[data-job-detail]");
const jobFilters = document.querySelector("[data-job-filters]");
const providerTable = document.querySelector("[data-provider-table]");
const providerDetail = document.querySelector("[data-provider-detail]");
const categoryTable = document.querySelector("[data-category-table]");
const categoryForm = document.querySelector("[data-category-form]");
const reviewTable = document.querySelector("[data-review-table]");

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

function setMessage(text, tone = "neutral") {
  if (!messageEl) {
    return;
  }
  messageEl.textContent = text;
  messageEl.dataset.tone = tone;
}

function describeErrors(error) {
  if (error.payload && error.payload.errors) {
    return Object.values(error.payload.errors).join(" ");
  }
  return error.message;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function switchTab(tab) {
  document.querySelectorAll("[data-ops-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.opsTab === tab);
  });
  document.querySelectorAll("[data-ops-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.opsPanel === tab);
  });
}

function metricCard(label, value) {
  return `<article class="ops-metric"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong></article>`;
}

function renderMetrics() {
  if (!metricsEl || !state.metrics) {
    return;
  }
  const metrics = state.metrics;
  metricsEl.innerHTML = [
    metricCard("Customers", metrics.totalCustomers),
    metricCard("Providers", metrics.totalProviders),
    metricCard("Pending approvals", metrics.pendingProviderApprovals),
    metricCard("New requests", metrics.newJobRequests),
    metricCard("Active jobs", metrics.activeJobs),
    metricCard("Completed", metrics.completedJobs),
    metricCard("Cancelled", metrics.cancelledJobs)
  ].join("");
}

function renderOverview() {
  const newJobs = state.jobs.filter((job) => job.status === "NEW");
  const pending = state.providers.filter((provider) => provider.state === "PENDING_VERIFICATION");
  overviewJobs.innerHTML = tableMarkup(
    ["Reference", "Service", "Customer", "Submitted"],
    newJobs.map((job) => [
      job.reference,
      job.service,
      job.customerName,
      formatDate(job.submittedAt)
    ]),
    "No new job requests."
  );
  overviewProviders.innerHTML = tableMarkup(
    ["Name", "Area", "Submitted"],
    pending.map((provider) => [
      provider.name,
      provider.serviceArea,
      formatDate(provider.verificationSubmittedAt)
    ]),
    "No pending approvals."
  );
}

function tableMarkup(headers, rows, emptyText) {
  if (rows.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <table class="ops-table">
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderJobs() {
  const rows = state.jobs.map((job) => [
    `<button class="text-action" type="button" data-select-job="${escapeHtml(job.id)}">${escapeHtml(job.reference)}</button>`,
    escapeHtml(job.service),
    escapeHtml(job.customerName),
    `<span class="status-badge">${escapeHtml(job.status)}</span>`,
    escapeHtml(job.assignment.provider ? job.assignment.provider.name : "Unassigned")
  ]);
  jobTable.innerHTML = tableMarkup(
    ["Reference", "Service", "Customer", "Status", "Provider"],
    rows,
    "No jobs match this filter."
  );
  renderJobDetail();
}

function jobStatusActions(job) {
  const actions = {
    NEW: ["REVIEWING", "CANCELLED", "REJECTED"],
    REVIEWING: ["CANCELLED", "REJECTED"],
    ASSIGNED: ["CANCELLED", "REJECTED"],
    ACCEPTED: ["CANCELLED"],
    IN_PROGRESS: ["CANCELLED"],
    COMPLETED: [],
    CONFIRMED: [],
    CANCELLED: [],
    REJECTED: []
  };
  return (actions[job.status] || [])
    .map(
      (status) =>
        `<button class="button button--secondary" type="button" data-job-status="${status}">${status}</button>`
    )
    .join("");
}

function approvedProviders() {
  return state.providers.filter((provider) => provider.state === "APPROVED");
}

function renderJobDetail() {
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  if (!job) {
    jobDetail.innerHTML = '<p class="muted">Select a job to review, assign, or update status.</p>';
    return;
  }

  const assignable = ["NEW", "REVIEWING"].includes(job.status);
  const providerOptions = approvedProviders()
    .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)} · ${escapeHtml(provider.serviceArea)}</option>`)
    .join("");

  jobDetail.innerHTML = `
    <p class="eyebrow">${escapeHtml(job.reference)}</p>
    <h2>${escapeHtml(job.title)}</h2>
    <p class="status-badge">${escapeHtml(job.status)}</p>
    <dl class="request-meta">
      <div><dt>Service</dt><dd>${escapeHtml(job.service)}</dd></div>
      <div><dt>Customer</dt><dd>${escapeHtml(job.customerName)}</dd></div>
      <div><dt>Phone</dt><dd>${escapeHtml(job.phone)}</dd></div>
      <div><dt>Location</dt><dd>${escapeHtml(job.address)}</dd></div>
      <div><dt>Preferred</dt><dd>${escapeHtml(job.preferredDate)} ${escapeHtml(job.preferredTime)}</dd></div>
      <div><dt>Submitted</dt><dd>${escapeHtml(formatDate(job.submittedAt))}</dd></div>
    </dl>
    <p>${escapeHtml(job.description)}</p>
    <p><strong>Assignment</strong><br>
      Provider: ${escapeHtml(job.assignment.provider ? job.assignment.provider.name : "Not assigned")}<br>
      Operator: ${escapeHtml(job.assignment.assignedBy ? job.assignment.assignedBy.name : "—")}<br>
      Assigned: ${escapeHtml(formatDate(job.assignment.assignedAt))}
    </p>
    ${assignable ? `
      <form data-assign-form>
        <label>
          <span>Assign approved provider</span>
          <select name="providerId" required>
            <option value="">Choose provider</option>
            ${providerOptions}
          </select>
        </label>
        <label>
          <span>Scheduled at</span>
          <input name="scheduledAt" type="datetime-local">
        </label>
        <button class="button button--primary" type="submit">Assign provider</button>
      </form>
    ` : ""}
    <div class="ops-actions">${jobStatusActions(job)}</div>
  `;
}

function renderProviders() {
  const rows = state.providers.map((provider) => [
    `<button class="text-action" type="button" data-select-provider="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</button>`,
    escapeHtml(provider.serviceArea),
    `<span class="status-badge">${escapeHtml(provider.state)}</span>`,
    escapeHtml((provider.services || []).join(", "))
  ]);
  providerTable.innerHTML = tableMarkup(
    ["Name", "Area", "State", "Services"],
    rows,
    "No providers yet."
  );
  renderProviderDetail();
}

function providerActions(provider) {
  const buttons = [];
  if (provider.state === "PENDING_VERIFICATION") {
    buttons.push('<button class="button button--primary" type="button" data-provider-state="APPROVED">Approve</button>');
    buttons.push('<button class="button button--secondary" type="button" data-provider-state="REJECTED">Reject</button>');
  }
  if (provider.state === "REGISTERED") {
    buttons.push('<button class="button button--secondary" type="button" data-provider-state="REJECTED">Reject</button>');
  }
  if (provider.state === "APPROVED") {
    buttons.push('<button class="button button--secondary" type="button" data-provider-state="DISABLED">Disable</button>');
  }
  if (provider.state === "DISABLED") {
    buttons.push('<button class="button button--primary" type="button" data-provider-state="APPROVED">Enable</button>');
  }
  return buttons.join("");
}

function renderProviderDetail() {
  const provider = state.providers.find((item) => item.id === state.selectedProviderId);
  if (!provider) {
    providerDetail.innerHTML = '<p class="muted">Select a provider to review verification and approval.</p>';
    return;
  }
  providerDetail.innerHTML = `
    <p class="eyebrow">Provider profile</p>
    <h2>${escapeHtml(provider.name)}</h2>
    <p class="status-badge">${escapeHtml(provider.state)}</p>
    <dl class="request-meta">
      <div><dt>Phone</dt><dd>${escapeHtml(provider.phone)}</dd></div>
      <div><dt>Email</dt><dd>${escapeHtml(provider.email)}</dd></div>
      <div><dt>Area</dt><dd>${escapeHtml(provider.serviceArea)}</dd></div>
      <div><dt>Experience</dt><dd>${escapeHtml(provider.experienceYears)} years</dd></div>
      <div><dt>Verification submitted</dt><dd>${escapeHtml(formatDate(provider.verificationSubmittedAt))}</dd></div>
      <div><dt>Reviewed</dt><dd>${escapeHtml(formatDate(provider.reviewedAt))}</dd></div>
    </dl>
    <p><strong>Skills</strong><br>${escapeHtml((provider.skills || []).join(", "))}</p>
    <p><strong>Services</strong><br>${escapeHtml((provider.services || []).join(", "))}</p>
    <p><strong>Qualifications</strong><br>${escapeHtml(provider.qualifications)}</p>
    <p>${escapeHtml(provider.description)}</p>
    <div class="ops-actions">${providerActions(provider)}</div>
  `;
}

function renderCategories() {
  const rows = state.categories.map((category) => [
    escapeHtml(category.name),
    escapeHtml(category.code),
    category.enabled ? "Enabled" : "Disabled",
    `<button class="text-action" type="button" data-edit-category="${escapeHtml(category.id)}">Edit</button>
     <button class="text-action" type="button" data-toggle-category="${escapeHtml(category.id)}">${category.enabled ? "Disable" : "Enable"}</button>`
  ]);
  categoryTable.innerHTML = tableMarkup(
    ["Name", "Code", "Status", "Actions"],
    rows,
    "No categories yet."
  );
}

function renderReviews() {
  const rows = state.reviews.map((review) => [
    escapeHtml(review.reference || review.requestId),
    `${escapeHtml(review.rating)}/5`,
    escapeHtml(review.comment),
    review.hidden ? "Hidden" : "Visible",
    `<button class="text-action" type="button" data-moderate-review="${escapeHtml(review.id)}" data-moderation-action="${review.hidden ? "restore" : "hide"}">
      ${review.hidden ? "Restore" : "Hide"}
    </button>`
  ]);
  reviewTable.innerHTML = tableMarkup(
    ["Job", "Rating", "Comment", "Visibility", "Moderation"],
    rows,
    "No reviews yet."
  );
}

async function loadAll(jobQuery = {}) {
  const params = new URLSearchParams();
  if (jobQuery.q) {
    params.set("q", jobQuery.q);
  }
  if (jobQuery.status) {
    params.set("status", jobQuery.status);
  }
  const query = params.toString() ? `?${params}` : "";
  const [dashboard, jobs, providers, categories, reviews] = await Promise.all([
    api("/api/admin/dashboard"),
    api(`/api/admin/requests${query}`),
    api("/api/admin/providers"),
    api("/api/admin/categories"),
    api("/api/admin/reviews")
  ]);
  state.metrics = dashboard.metrics;
  state.jobs = jobs.requests;
  state.providers = providers.providers;
  state.categories = categories.categories;
  state.reviews = reviews.reviews;
  renderMetrics();
  renderOverview();
  renderJobs();
  renderProviders();
  renderCategories();
  renderReviews();
}

document.querySelectorAll("[data-ops-tab]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.opsTab));
});

document.querySelector("[data-admin-logout]").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  window.location.replace("/admin-login.html");
});

jobFilters.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(jobFilters).entries());
  await loadAll(values);
});

jobTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-job]");
  if (!button) {
    return;
  }
  state.selectedJobId = button.dataset.selectJob;
  renderJobDetail();
});

jobDetail.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-assign-form]");
  if (!form) {
    return;
  }
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/assign`, {
      method: "POST",
      body: JSON.stringify({
        providerId: values.providerId,
        scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : ""
      })
    });
    setMessage("Provider assigned.", "success");
    await loadAll(Object.fromEntries(new FormData(jobFilters).entries()));
  } catch (error) {
    setMessage(describeErrors(error), "error");
  }
});

jobDetail.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-job-status]");
  if (!button) {
    return;
  }
  try {
    await api(`/api/admin/requests/${state.selectedJobId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: button.dataset.jobStatus })
    });
    setMessage(`Status updated to ${button.dataset.jobStatus}.`, "success");
    await loadAll(Object.fromEntries(new FormData(jobFilters).entries()));
  } catch (error) {
    setMessage(describeErrors(error), "error");
  }
});

providerTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-provider]");
  if (!button) {
    return;
  }
  state.selectedProviderId = button.dataset.selectProvider;
  renderProviderDetail();
});

providerDetail.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-provider-state]");
  if (!button) {
    return;
  }
  try {
    await api(`/api/admin/providers/${state.selectedProviderId}/state`, {
      method: "POST",
      body: JSON.stringify({ state: button.dataset.providerState })
    });
    setMessage(`Provider set to ${button.dataset.providerState}.`, "success");
    await loadAll();
  } catch (error) {
    setMessage(describeErrors(error), "error");
  }
});

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(categoryForm).entries());
  const body = {
    name: values.name,
    code: values.code,
    description: values.description,
    enabled: Boolean(values.enabled)
  };
  const path = values.id ? `/api/admin/categories/${values.id}` : "/api/admin/categories";
  try {
    await api(path, { method: "POST", body: JSON.stringify(body) });
    categoryForm.reset();
    categoryForm.id.value = "";
    document.querySelector("[data-category-form-title]").textContent = "Create category";
    setMessage("Category saved.", "success");
    await loadAll();
  } catch (error) {
    setMessage(describeErrors(error), "error");
  }
});

document.querySelector("[data-category-reset]").addEventListener("click", () => {
  categoryForm.reset();
  categoryForm.id.value = "";
  document.querySelector("[data-category-form-title]").textContent = "Create category";
});

categoryTable.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-category]");
  const toggleButton = event.target.closest("[data-toggle-category]");
  if (editButton) {
    const category = state.categories.find((item) => item.id === editButton.dataset.editCategory);
    if (!category) {
      return;
    }
    categoryForm.id.value = category.id;
    categoryForm.name.value = category.name;
    categoryForm.code.value = category.code;
    categoryForm.description.value = category.description;
    categoryForm.enabled.checked = category.enabled;
    document.querySelector("[data-category-form-title]").textContent = "Edit category";
  }
  if (toggleButton) {
    try {
      await api(`/api/admin/categories/${toggleButton.dataset.toggleCategory}/toggle`, { method: "POST" });
      await loadAll();
    } catch (error) {
      setMessage(describeErrors(error), "error");
    }
  }
});

reviewTable.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-moderate-review]");
  if (!button) {
    return;
  }
  try {
    await api(`/api/admin/reviews/${button.dataset.moderateReview}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action: button.dataset.moderationAction })
    });
    setMessage("Moderation recorded. Original rating and comment are unchanged.", "success");
    await loadAll();
  } catch (error) {
    setMessage(describeErrors(error), "error");
  }
});

async function bootstrap() {
  try {
    const session = await api("/api/admin/me");
    state.admin = session.admin;
    adminName.textContent = session.admin.name;
    await loadAll();
  } catch (error) {
    window.location.replace("/admin-login.html");
  }
}

bootstrap();
