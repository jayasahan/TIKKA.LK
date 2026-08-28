const providerState = {
  provider: null,
  services: [],
  jobs: []
};

const providerAuthForm = document.querySelector("[data-provider-auth-form]");
const providerAuthMessage = document.querySelector("[data-provider-auth-message]");
const providerProfileMessage = document.querySelector("[data-provider-profile-message]");
const providerProfile = document.querySelector("[data-provider-profile]");
const providerJobs = document.querySelector("[data-provider-jobs]");
const providerServices = document.querySelector("[data-provider-services]");
const providerSessionTitle = document.querySelector("[data-provider-session-title]");
const providerSessionCopy = document.querySelector("[data-provider-session-copy]");
const providerLogoutButton = document.querySelector("[data-provider-logout]");
const submitVerificationButton = document.querySelector("[data-submit-verification]");

async function providerApi(path, options = {}) {
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

function escapeProviderHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
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

function providerFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function providerMessage(element, text, tone = "neutral") {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.dataset.tone = tone;
}

function providerErrors(error) {
  if (error.payload && error.payload.errors) {
    return Object.values(error.payload.errors).join(" ");
  }
  return error.message;
}

function renderProviderServices() {
  if (!providerServices) {
    return;
  }
  providerServices.innerHTML = `
    <legend>Services <em>required</em></legend>
    <div class="checkbox-grid">
      ${providerState.services
        .map(
          (service) => `
            <label>
              <input type="checkbox" name="services" value="${escapeProviderHtml(service.name)}">
              <span>${escapeProviderHtml(service.name)}</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;
}

function renderProviderSession() {
  if (!providerSessionTitle || !providerSessionCopy || !providerLogoutButton) {
    return;
  }
  if (!providerState.provider) {
    providerSessionTitle.textContent = "Register or log in";
    providerSessionCopy.textContent = "Providers are reviewed before they can receive assigned jobs.";
    providerLogoutButton.hidden = true;
    return;
  }
  providerSessionTitle.textContent = `${providerState.provider.name} · ${providerState.provider.state}`;
  providerSessionCopy.textContent =
    providerState.provider.state === "APPROVED"
      ? "You are approved to receive and manage assigned jobs."
      : "TIKKA must approve your verification before jobs can be assigned.";
  providerLogoutButton.hidden = false;
}

function renderProfile() {
  if (!providerProfile || !submitVerificationButton) {
    return;
  }
  if (!providerState.provider) {
    providerProfile.innerHTML = '<p class="muted">Log in to see your profile summary.</p>';
    submitVerificationButton.hidden = true;
    return;
  }

  const provider = providerState.provider;
  providerProfile.innerHTML = `
    <div class="provider-card provider-card--large">
      <img src="${escapeProviderHtml(provider.profilePhoto)}" alt="" width="96" height="96">
      <div>
        <h3>${escapeProviderHtml(provider.name)}</h3>
        <p>${escapeProviderHtml(provider.verificationStatus)}</p>
        <p>${escapeProviderHtml(provider.serviceArea)}</p>
      </div>
    </div>
    <dl class="request-meta profile-meta">
      <div><dt>Services</dt><dd>${escapeProviderHtml(provider.services.join(", "))}</dd></div>
      <div><dt>Skills</dt><dd>${escapeProviderHtml(provider.skills.join(", "))}</dd></div>
      <div><dt>Experience</dt><dd>${escapeProviderHtml(provider.experienceYears)} years</dd></div>
      <div><dt>Rating</dt><dd>${provider.rating ? escapeProviderHtml(provider.rating) : "No rating yet"}</dd></div>
      <div><dt>Completed</dt><dd>${escapeProviderHtml(provider.completedJobs)} jobs</dd></div>
    </dl>
    <p>${escapeProviderHtml(provider.description)}</p>
  `;
  submitVerificationButton.hidden = provider.state !== "REGISTERED";
}

function jobsByStatus(status) {
  return providerState.jobs.filter((job) => job.status === status);
}

function actionMarkup(job) {
  if (job.status === "ASSIGNED") {
    return `
      <button class="button button--primary" type="button" data-provider-action="accept">Accept</button>
      <button class="button button--secondary" type="button" data-provider-action="decline">Decline</button>
    `;
  }
  if (job.status === "ACCEPTED") {
    return '<button class="button button--primary" type="button" data-provider-action="start">Start Job</button>';
  }
  if (job.status === "IN_PROGRESS") {
    return '<button class="button button--primary" type="button" data-provider-action="complete">Mark Completed</button>';
  }
  return "";
}

function jobCard(job) {
  return `
    <article class="request-card" data-provider-job-id="${escapeProviderHtml(job.id)}">
      <div class="request-card__header">
        <div>
          <p class="eyebrow">${escapeProviderHtml(job.reference)}</p>
          <h3>${escapeProviderHtml(job.title)}</h3>
        </div>
        <span class="status-badge">${escapeProviderHtml(job.status)}</span>
      </div>
      <dl class="request-meta">
        <div><dt>Service</dt><dd>${escapeProviderHtml(job.service)}</dd></div>
        <div><dt>Preferred</dt><dd>${escapeProviderHtml(job.preferredDate)} ${escapeProviderHtml(job.preferredTime)}</dd></div>
        <div><dt>Scheduled</dt><dd>${job.scheduledAt ? escapeProviderHtml(new Date(job.scheduledAt).toLocaleString()) : "Not scheduled"}</dd></div>
      </dl>
      <p>${escapeProviderHtml(job.description)}</p>
      <div class="contact-panel">
        <h4>Customer contact</h4>
        <p>${escapeProviderHtml(job.customerContact.name)}</p>
        <p>${escapeProviderHtml(job.customerContact.phone)}</p>
        <p>${escapeProviderHtml(job.customerContact.email)}</p>
        <p>${escapeProviderHtml(job.address)}</p>
      </div>
      <div class="form-actions">${actionMarkup(job)}</div>
    </article>
  `;
}

function renderJobs() {
  if (!providerJobs) {
    return;
  }
  if (!providerState.provider) {
    providerJobs.innerHTML = '<p class="muted">Log in to view jobs.</p>';
    return;
  }

  const groups = [
    ["Assigned jobs", jobsByStatus("ASSIGNED")],
    ["Accepted jobs", jobsByStatus("ACCEPTED")],
    ["Active jobs", jobsByStatus("IN_PROGRESS")],
    ["Completed jobs", jobsByStatus("COMPLETED")]
  ];

  providerJobs.innerHTML = groups
    .map(
      ([title, jobs]) => `
        <section class="job-column" aria-label="${escapeProviderHtml(title)}">
          <h3>${escapeProviderHtml(title)}</h3>
          ${jobs.length ? jobs.map(jobCard).join("") : '<p class="muted">No jobs here.</p>'}
        </section>
      `
    )
    .join("");
}

async function loadProviderJobs() {
  if (!providerState.provider) {
    renderJobs();
    return;
  }
  const payload = await providerApi("/api/providers/jobs");
  providerState.jobs = payload.jobs;
  renderJobs();
}

async function providerBootstrap() {
  const servicesPayload = await providerApi("/api/services");
  providerState.services = servicesPayload.services;
  renderProviderServices();
  try {
    const providerPayload = await providerApi("/api/providers/me");
    providerState.provider = providerPayload.provider;
  } catch (error) {
    providerState.provider = null;
  }
  renderProviderSession();
  renderProfile();
  await loadProviderJobs();
}

if (providerAuthForm) {
  providerAuthForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const mode = submitter && submitter.value === "login" ? "login" : "register";
    const body = providerFormValues(providerAuthForm);
    const selectedServices = Array.from(providerAuthForm.querySelectorAll('input[name="services"]:checked'))
      .map((input) => input.value);
    body.services = selectedServices;
    body.skills = body.skills || "";
    const file = providerAuthForm.profilePhotoFile.files[0];
    body.profilePhoto = file ? file.name : "public/brand/tikka-logo.jpg";

    providerMessage(providerAuthMessage, mode === "login" ? "Logging in..." : "Creating provider profile...");
    submitter.disabled = true;
    try {
      const payload = await providerApi(mode === "login" ? "/api/providers/login" : "/api/providers/register", {
        method: "POST",
        body: JSON.stringify(body)
      });
      providerState.provider = payload.provider;
      renderProviderSession();
      renderProfile();
      await loadProviderJobs();
      providerMessage(providerAuthMessage, mode === "login" ? "Logged in." : "Profile created.", "success");
    } catch (error) {
      providerMessage(providerAuthMessage, providerErrors(error), "error");
    } finally {
      submitter.disabled = false;
    }
  });
}

if (submitVerificationButton) {
  submitVerificationButton.addEventListener("click", async () => {
    submitVerificationButton.disabled = true;
    providerMessage(providerProfileMessage, "Submitting verification...");
    try {
      const payload = await providerApi("/api/providers/verification", { method: "POST" });
      providerState.provider = payload.provider;
      renderProviderSession();
      renderProfile();
      providerMessage(providerProfileMessage, "Verification submitted. TIKKA will review your profile.", "success");
    } catch (error) {
      providerMessage(providerProfileMessage, providerErrors(error), "error");
    } finally {
      submitVerificationButton.disabled = false;
    }
  });
}

if (providerJobs) {
  providerJobs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-provider-action]");
    if (!button) {
      return;
    }
    const card = button.closest("[data-provider-job-id]");
    button.disabled = true;
    try {
      await providerApi(`/api/providers/jobs/${card.dataset.providerJobId}/${button.dataset.providerAction}`, {
        method: "POST"
      });
      const profilePayload = await providerApi("/api/providers/me");
      providerState.provider = profilePayload.provider;
      renderProviderSession();
      renderProfile();
      await loadProviderJobs();
    } catch (error) {
      button.disabled = false;
      alert(providerErrors(error));
    }
  });
}

if (providerLogoutButton) {
  providerLogoutButton.addEventListener("click", async () => {
    await providerApi("/api/providers/logout", { method: "POST" });
    providerState.provider = null;
    providerState.jobs = [];
    renderProviderSession();
    renderProfile();
    renderJobs();
  });
}

providerBootstrap().catch((error) => {
  providerMessage(providerAuthMessage, error.message, "error");
});
