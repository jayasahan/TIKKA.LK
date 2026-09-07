require("dotenv").config({ path: require("node:path").resolve(__dirname, "..", "..", ".env"), quiet: true });

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const {
  adminSessionCookie,
  clearAdminSessionCookie,
  clearSessionCookie,
  clearProviderSessionCookie,
  createAdminSession,
  createProviderSession,
  createSession,
  destroySession,
  getAdminSession,
  getProviderSession,
  getSession,
  hashPassword,
  providerSessionCookie,
  sessionCookie,
  verifyPassword
} = require("./lib/auth");
const {
  CUSTOMER_CONFIRMABLE_STATUS,
  CUSTOMER_REVIEWABLE_STATUS,
  OPERATOR_TRANSITIONS,
  PROVIDER_STATE_TRANSITIONS
} = require("./lib/constants");
const { createStorage } = require("./lib/storage");
const {
  hasErrors,
  validateAssignment,
  validateCategory,
  validateLogin,
  validateModeration,
  validateProviderRegistration,
  validateProviderState,
  validateRegistration,
  validateRequest,
  validateReview,
  validateStatus
} = require("./lib/validation");

const publicRoot = path.resolve(__dirname);
const protectedAdminAssets = new Set(["/admin.html", "/admin.js"]);
let adminConfigWarningShown = false;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sanitizeCustomer(customer) {
  if (!customer) {
    return null;
  }
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    createdAt: customer.createdAt || null
  };
}

function sanitizeAdmin(admin) {
  if (!admin) {
    return null;
  }
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role || "admin"
  };
}

function sanitizeProvider(provider) {
  if (!provider) {
    return null;
  }
  return {
    id: provider.id,
    name: provider.name,
    profilePhoto: provider.profilePhoto || provider.profileImage,
    skills: provider.skills,
    services: provider.services || [],
    serviceArea: provider.serviceArea,
    description: provider.description,
    experienceYears: provider.experienceYears,
    qualifications: provider.qualifications,
    state: provider.state || "REGISTERED",
    verificationStatus: provider.verificationStatus,
    rating: provider.rating || null,
    completedJobs: provider.completedJobs || 0
  };
}

function sanitizeAdminProvider(provider) {
  if (!provider) {
    return null;
  }
  return {
    ...sanitizeProvider(provider),
    phone: provider.phone,
    email: provider.email,
    verificationSubmittedAt: provider.verificationSubmittedAt || null,
    reviewedAt: provider.reviewedAt || null,
    reviewedByAdminId: provider.reviewedByAdminId || null,
    disabledAt: provider.disabledAt || null
  };
}

function exposeProvider(provider) {
  if (!provider) {
    return null;
  }
  return {
    id: provider.id,
    name: provider.name,
    profileImage: provider.profileImage,
    skills: provider.skills,
    serviceArea: provider.serviceArea,
    verificationStatus: provider.verificationStatus,
    rating: provider.rating
  };
}

function publicReview(review) {
  if (!review) {
    return null;
  }
  return {
    rating: review.rating,
    comment: review.comment,
    submittedAt: review.submittedAt
  };
}

function exposeRequest(request, database) {
  const provider = database.providers.find((item) => item.id === request.providerId);
  const review = database.reviews.find((item) => item.requestId === request.id);

  return {
    id: request.id,
    reference: request.reference,
    service: request.service,
    title: request.title,
    description: request.description,
    submittedAt: request.submittedAt,
    status: request.status,
    scheduledAt: request.scheduledAt || null,
    preferredDate: request.preferredDate,
    preferredTime: request.preferredTime,
    assignedProvider: exposeProvider(provider),
    review: publicReview(review)
  };
}

function exposeAdminRequest(request, database) {
  const provider = database.providers.find((item) => item.id === request.providerId);
  const admin = database.admins.find((item) => item.id === request.assignedByAdminId);
  const customer = database.customers.find((item) => item.id === request.customerId);
  const review = database.reviews.find((item) => item.requestId === request.id);

  return {
    ...exposeRequest(request, database),
    customerId: request.customerId,
    customer: sanitizeCustomer(customer),
    customerName: request.customerName,
    phone: request.phone,
    email: request.email,
    address: request.address,
    photos: request.photos || [],
    assignment: {
      provider: sanitizeAdminProvider(provider),
      assignedBy: sanitizeAdmin(admin),
      assignedAt: request.assignedAt || null,
      scheduledAt: request.scheduledAt || null
    },
    review: review ? exposeAdminReview(review, database) : null
  };
}

function exposeAdminReview(review, database) {
  const request = database.requests.find((item) => item.id === review.requestId);
  return {
    id: review.id,
    requestId: review.requestId,
    reference: request ? request.reference : null,
    customerId: review.customerId,
    providerId: review.providerId,
    rating: review.rating,
    comment: review.comment,
    submittedAt: review.submittedAt,
    hidden: Boolean(review.hidden),
    moderation: review.moderation || []
  };
}

function exposeProviderJob(request) {
  return {
    id: request.id,
    reference: request.reference,
    service: request.service,
    title: request.title,
    description: request.description,
    address: request.address,
    preferredDate: request.preferredDate,
    preferredTime: request.preferredTime,
    scheduledAt: request.scheduledAt || null,
    status: request.status,
    customerContact: {
      name: request.customerName,
      phone: request.phone,
      email: request.email
    }
  };
}

async function exposeRequestWithStore(request, store) {
  const [provider, review] = await Promise.all([
    request.providerId ? store.findProviderById(request.providerId) : null,
    store.findReviewByRequestId(request.id)
  ]);
  return exposeRequest(request, {
    providers: provider ? [provider] : [],
    reviews: review ? [review] : []
  });
}

async function exposeAdminRequestWithStore(request, store) {
  const [provider, admin, customer, review] = await Promise.all([
    request.providerId ? store.findProviderById(request.providerId) : null,
    request.assignedByAdminId ? store.findAdminById(request.assignedByAdminId) : null,
    request.customerId ? store.findCustomerById(request.customerId) : null,
    store.findReviewByRequestId(request.id)
  ]);
  return exposeAdminRequest(request, {
    providers: provider ? [provider] : [],
    admins: admin ? [admin] : [],
    customers: customer ? [customer] : [],
    reviews: review ? [review] : []
  });
}

async function exposeAdminReviewWithStore(review, store) {
  const request = await store.findRequestById(review.requestId);
  return exposeAdminReview(review, {
    requests: request ? [request] : []
  });
}

async function mapAsync(items, mapper) {
  return Promise.all(items.map(mapper));
}

function exposeCategory(category) {
  return {
    id: category.id,
    name: category.name,
    code: category.code,
    icon: category.icon || category.code,
    description: category.description,
    enabled: category.enabled !== false
  };
}

function getAdminCredentials() {
  const email = (process.env.TIKKA_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.TIKKA_ADMIN_PASSWORD || "";

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function warnAdminUnavailable() {
  if (adminConfigWarningShown) {
    return;
  }
  console.warn(
    "TIKKA admin authentication is unavailable. Set TIKKA_ADMIN_EMAIL and TIKKA_ADMIN_PASSWORD to enable admin access."
  );
  adminConfigWarningShown = true;
}

async function ensureConfiguredAdmin(store) {
  const credentials = getAdminCredentials();
  if (!credentials) {
    warnAdminUnavailable();
    return;
  }

  await store.ensureConfiguredAdmin(credentials, { hashPassword, verifyPassword });
}

async function requireCustomer(request, response, store) {
  const session = getSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Please log in to continue." });
    return null;
  }

  const customer = await store.findCustomerById(session.customerId);
  if (!customer) {
    sendJson(response, 401, { error: "Please log in to continue." });
    return null;
  }

  return { customer, session };
}

async function requireProvider(request, response, store) {
  const session = getProviderSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Please log in as a service provider." });
    return null;
  }

  const provider = await store.findProviderById(session.providerId);
  if (!provider) {
    sendJson(response, 401, { error: "Please log in as a service provider." });
    return null;
  }

  return { provider, session };
}

async function requireAdmin(request, response, store) {
  if (!getAdminCredentials()) {
    sendJson(response, 503, { error: "Admin authentication is not configured." });
    return null;
  }

  const session = getAdminSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Please log in as an admin." });
    return null;
  }

  const admin = await store.findAdminById(session.adminId);
  if (!admin) {
    sendJson(response, 401, { error: "Please log in as an admin." });
    return null;
  }

  return { admin, session };
}

function matchesSearch(request, query) {
  if (!query) {
    return true;
  }
  const haystack = [
    request.reference,
    request.title,
    request.service,
    request.status,
    request.customerName,
    request.email,
    request.phone,
    request.address
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

async function handleApi(request, response, store, url) {
  try {
    // TODO: Add CSRF protection and login rate limiting before public launch.
    if (request.method === "GET" && url.pathname === "/api/services") {
      const categories = await store.listCategories({ enabledOnly: true });
      sendJson(response, 200, { services: categories.map(exposeCategory) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(request);
      const { errors, value } = validateRegistration(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      let customer;
      try {
        customer = await store.createCustomer({
          name: value.name,
          phone: value.phone,
          email: value.email,
          passwordHash: hashPassword(value.password)
        });
      } catch (error) {
        if (error.code !== "DUPLICATE") {
          throw error;
        }
        sendJson(response, 409, { errors: { email: "An account already exists for this email." } });
        return;
      }

      const sessionId = createSession(customer.id);
      sendJson(response, 201, { customer: sanitizeCustomer(customer) }, {
        "Set-Cookie": sessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      const { errors, value } = validateLogin(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const customer = await store.findCustomerByEmail(value.email);
      if (!customer || !verifyPassword(value.password, customer.passwordHash)) {
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      const sessionId = createSession(customer.id);
      sendJson(response, 200, { customer: sanitizeCustomer(customer) }, {
        "Set-Cookie": sessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const session = getSession(request);
      if (session) {
        destroySession(session.id);
      }
      sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      const credentials = getAdminCredentials();
      if (!credentials) {
        sendJson(response, 503, { error: "Admin authentication is not configured." });
        return;
      }

      const body = await readJsonBody(request);
      const { errors, value } = validateLogin(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const admin = await store.findAdminByEmail(credentials.email);
      if (value.email !== credentials.email) {
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }
      if (!admin || !verifyPassword(value.password, admin.passwordHash)) {
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      const sessionId = createAdminSession(admin.id);
      sendJson(response, 200, { admin: sanitizeAdmin(admin) }, {
        "Set-Cookie": adminSessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      const session = getAdminSession(request);
      if (session) {
        destroySession(session.id);
      }
      sendJson(response, 200, { ok: true }, { "Set-Cookie": clearAdminSessionCookie() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/me") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { admin: sanitizeAdmin(auth.admin) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/dashboard") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { metrics: await store.dashboardMetrics() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/customers") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        customers: (await store.listCustomers()).map(sanitizeCustomer)
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/providers") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        providers: (await store.listProviders()).map(sanitizeAdminProvider)
      });
      return;
    }

    const adminProviderMatch = url.pathname.match(/^\/api\/admin\/providers\/([^/]+)$/);
    if (request.method === "GET" && adminProviderMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const provider = await store.findProviderById(adminProviderMatch[1]);
      if (!provider) {
        sendJson(response, 404, { error: "Provider not found." });
        return;
      }
      sendJson(response, 200, { provider: sanitizeAdminProvider(provider) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/requests") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const status = url.searchParams.get("status") || "";
      const query = (url.searchParams.get("q") || "").trim().toLowerCase();
      const requests = await mapAsync(
        await store.listRequests({ status, query }),
        (item) => exposeAdminRequestWithStore(item, store)
      );
      sendJson(response, 200, { requests });
      return;
    }

    const adminRequestMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)$/);
    if (request.method === "GET" && adminRequestMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const serviceRequest = await store.findRequestById(adminRequestMatch[1]);
      if (!serviceRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      sendJson(response, 200, { request: await exposeAdminRequestWithStore(serviceRequest, store) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/reviews") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const reviews = await mapAsync(await store.listReviews(), (review) => exposeAdminReviewWithStore(review, store));
      sendJson(response, 200, {
        reviews
      });
      return;
    }

    const moderateMatch = url.pathname.match(/^\/api\/admin\/reviews\/([^/]+)\/moderate$/);
    if (request.method === "POST" && moderateMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateModeration(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      let review;
      try {
        review = await store.moderateReview(moderateMatch[1], value.action, value.note, auth.admin.id);
      } catch (error) {
        if (error.code !== "NOT_FOUND") {
          throw error;
        }
        sendJson(response, 404, { error: "Review not found." });
        return;
      }
      sendJson(response, 200, { review: await exposeAdminReviewWithStore(review, store) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/categories") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        categories: (await store.listCategories()).map(exposeCategory)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/categories") {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateCategory(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      let category;
      try {
        category = await store.createCategory(value);
      } catch (error) {
        if (error.code !== "DUPLICATE") {
          throw error;
        }
        sendJson(response, 409, { errors: { [error.field || "name"]: "This category already exists." } });
        return;
      }
      sendJson(response, 201, { category: exposeCategory(category) });
      return;
    }

    const categoryMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (request.method === "POST" && categoryMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateCategory({ ...body, enabled: body.enabled });
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      let category;
      try {
        category = await store.updateCategory(categoryMatch[1], value, {
          hasEnabled: Object.prototype.hasOwnProperty.call(body, "enabled")
        });
      } catch (error) {
        if (error.code === "NOT_FOUND") {
          sendJson(response, 404, { error: "Category not found." });
          return;
        }
        if (error.code === "DUPLICATE") {
          sendJson(response, 409, { errors: { [error.field || "name"]: "This category already exists." } });
          return;
        }
        throw error;
      }
      sendJson(response, 200, { category: exposeCategory(category) });
      return;
    }

    const categoryToggleMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)\/toggle$/);
    if (request.method === "POST" && categoryToggleMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      let category;
      try {
        category = await store.toggleCategory(categoryToggleMatch[1]);
      } catch (error) {
        if (error.code !== "NOT_FOUND") {
          throw error;
        }
        sendJson(response, 404, { error: "Category not found." });
        return;
      }
      sendJson(response, 200, { category: exposeCategory(category) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/providers/register") {
      const body = await readJsonBody(request);
      const categories = await store.listCategories();
      const { errors, value } = validateProviderRegistration(body, categories);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      let provider;
      try {
        provider = await store.createProvider({
          name: value.name,
          phone: value.phone,
          email: value.email,
          passwordHash: hashPassword(value.password),
          profileImage: value.profilePhoto,
          profilePhoto: value.profilePhoto,
          skills: value.skills,
          services: value.services,
          serviceArea: value.serviceArea,
          description: value.description,
          experienceYears: value.experienceYears,
          qualifications: value.qualifications
        });
      } catch (error) {
        if (error.code !== "DUPLICATE") {
          throw error;
        }
        sendJson(response, 409, { errors: { email: "A provider account already exists for this email." } });
        return;
      }

      const sessionId = createProviderSession(provider.id);
      sendJson(response, 201, { provider: sanitizeProvider(provider) }, {
        "Set-Cookie": providerSessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/providers/login") {
      const body = await readJsonBody(request);
      const { errors, value } = validateLogin(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const provider = await store.findProviderByEmail(value.email);
      if (!provider || !provider.passwordHash || !verifyPassword(value.password, provider.passwordHash)) {
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      const sessionId = createProviderSession(provider.id);
      sendJson(response, 200, { provider: sanitizeProvider(provider) }, {
        "Set-Cookie": providerSessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/providers/verification") {
      const auth = await requireProvider(request, response, store);
      if (!auth) {
        return;
      }
      let provider;
      try {
        provider = await store.submitProviderVerification(auth.provider.id);
      } catch (error) {
        if (error.code !== "CONFLICT") {
          throw error;
        }
        sendJson(response, 409, { error: "Verification has already been submitted." });
        return;
      }

      sendJson(response, 200, { provider: sanitizeProvider(provider) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/providers/logout") {
      const session = getProviderSession(request);
      if (session) {
        destroySession(session.id);
      }
      sendJson(response, 200, { ok: true }, { "Set-Cookie": clearProviderSessionCookie() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/providers/me") {
      const auth = await requireProvider(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { provider: sanitizeProvider(auth.provider) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/providers/jobs") {
      const auth = await requireProvider(request, response, store);
      if (!auth) {
        return;
      }
      const jobs = (await store.listProviderJobs(auth.provider.id)).map(exposeProviderJob);
      sendJson(response, 200, { jobs });
      return;
    }

    const providerJobMatch = url.pathname.match(/^\/api\/providers\/jobs\/([^/]+)\/(accept|decline|start|complete)$/);
    if (request.method === "POST" && providerJobMatch) {
      const auth = await requireProvider(request, response, store);
      if (!auth) {
        return;
      }

      const action = providerJobMatch[2];
      let job;
      try {
        job = await store.providerJobAction(providerJobMatch[1], auth.provider.id, action);
      } catch (error) {
        if (error.code === "NOT_FOUND") {
          sendJson(response, 404, { error: "Assigned job not found." });
          return;
        }
        if (error.code === "CONFLICT") {
          sendJson(response, 409, { error: "Invalid job transition for this provider." });
          return;
        }
        throw error;
      }
      sendJson(response, 200, { job: exposeProviderJob(job) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { customer: sanitizeCustomer(auth.customer) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests") {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }

      const body = await readJsonBody(request);
      const categories = await store.listCategories();
      const { errors, value } = validateRequest(body, categories);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const created = await store.createRequest({
        customerId: auth.customer.id,
        service: value.service,
        title: value.title,
        description: value.description,
        customerName: value.customerName,
        phone: value.phone,
        email: value.email,
        address: value.address,
        preferredDate: value.preferredDate,
        preferredTime: value.preferredTime,
        photos: value.photos
      });

      sendJson(response, 201, {
        message: "Request received.",
        explanation: "TIKKA will review the request and arrange a suitable skilled person.",
        request: await exposeRequestWithStore(created, store)
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/requests") {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const requests = await mapAsync(
        await store.listCustomerRequests(auth.customer.id),
        (item) => exposeRequestWithStore(item, store)
      );
      sendJson(response, 200, { requests });
      return;
    }

    const requestMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
    if (request.method === "GET" && requestMatch) {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const serviceRequest = await store.findCustomerRequestById(requestMatch[1], auth.customer.id);
      if (!serviceRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      sendJson(response, 200, { request: await exposeRequestWithStore(serviceRequest, store) });
      return;
    }

    const confirmMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/confirm$/);
    if (request.method === "POST" && confirmMatch) {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const existingRequest = await store.findCustomerRequestById(confirmMatch[1], auth.customer.id);
      if (!existingRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (existingRequest.status !== CUSTOMER_CONFIRMABLE_STATUS) {
        sendJson(response, 409, {
          error: "Completion can only be confirmed after the provider marks the job completed."
        });
        return;
      }
      const serviceRequest = await store.confirmRequest(confirmMatch[1], auth.customer.id);
      sendJson(response, 200, { request: await exposeRequestWithStore(serviceRequest, store) });
      return;
    }

    const reviewMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/review$/);
    if (request.method === "POST" && reviewMatch) {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateReview(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const serviceRequest = await store.findCustomerRequestById(reviewMatch[1], auth.customer.id);
      if (!serviceRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (serviceRequest.status !== CUSTOMER_REVIEWABLE_STATUS) {
        sendJson(response, 409, { error: "Reviews are available after completion is confirmed." });
        return;
      }
      try {
        const review = await store.createReview({
          requestId: serviceRequest.id,
          customerId: auth.customer.id,
          rating: value.rating,
          comment: value.comment
        });
        sendJson(response, 201, { review });
      } catch (error) {
        if (error.code !== "DUPLICATE") {
          throw error;
        }
        sendJson(response, 409, { error: "This request already has a review." });
        return;
      }
      return;
    }

    const assignMatch = url.pathname.match(/^\/api\/(?:admin|operator)\/requests\/([^/]+)\/assign$/);
    if (request.method === "POST" && assignMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const currentDatabase = { providers: await store.listProviders() };
      const { errors, value } = validateAssignment(body, currentDatabase);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const existingRequest = await store.findRequestById(assignMatch[1]);
      const provider = await store.findProviderById(value.providerId);
      if (!existingRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (!provider || provider.state !== "APPROVED") {
        sendJson(response, 409, { error: "Only approved providers can be assigned jobs." });
        return;
      }
      if (!["NEW", "REVIEWING"].includes(existingRequest.status)) {
        sendJson(response, 409, { error: "This request cannot be assigned from its current status." });
        return;
      }
      const serviceRequest = await store.assignProvider(assignMatch[1], value.providerId, value.scheduledAt, auth.admin.id);
      sendJson(response, 200, { request: await exposeAdminRequestWithStore(serviceRequest, store) });
      return;
    }

    const providerStateMatch = url.pathname.match(/^\/api\/(?:admin|operator)\/providers\/([^/]+)\/state$/);
    if (request.method === "POST" && providerStateMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateProviderState(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const existingProvider = await store.findProviderById(providerStateMatch[1]);
      if (!existingProvider) {
        sendJson(response, 404, { error: "Provider not found." });
        return;
      }
      const allowed = PROVIDER_STATE_TRANSITIONS[existingProvider.state] || [];
      if (!allowed.includes(value.state)) {
        sendJson(response, 409, { error: "Invalid provider verification transition." });
        return;
      }
      const provider = await store.updateProviderState(providerStateMatch[1], value.state, auth.admin.id);
      sendJson(response, 200, { provider: sanitizeAdminProvider(provider) });
      return;
    }

    const statusMatch = url.pathname.match(/^\/api\/(?:admin|operator)\/requests\/([^/]+)\/status$/);
    if (request.method === "POST" && statusMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateStatus(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const existingRequest = await store.findRequestById(statusMatch[1]);
      if (!existingRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      const allowed = OPERATOR_TRANSITIONS[existingRequest.status] || [];
      if (value.status === "ASSIGNED" && !existingRequest.providerId) {
        sendJson(response, 409, { error: "Assign an approved provider before setting ASSIGNED." });
        return;
      }
      if (!allowed.includes(value.status)) {
        sendJson(response, 409, { error: "Invalid status transition." });
        return;
      }
      const serviceRequest = await store.updateRequestStatus(statusMatch[1], value.status, auth.admin.id);
      sendJson(response, 200, { request: await exposeAdminRequestWithStore(serviceRequest, store) });
      return;
    }

    sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Request failed." });
  }
}

async function hasValidAdminSession(request, store) {
  const session = getAdminSession(request);
  if (!session) {
    return false;
  }
  return Boolean(await store.findAdminById(session.adminId));
}

async function serveStatic(request, response, url, store) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicRoot, safePath);

  if (protectedAdminAssets.has(url.pathname) && !(await hasValidAdminSession(request, store))) {
    response.writeHead(302, { Location: "/admin-login.html" });
    response.end();
    return;
  }

  if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
  });
  fs.createReadStream(filePath).pipe(response);
}

function createApp(options = {}) {
  const store = options.store || createStorage({
    dbPath: options.dbPath,
    driver: options.storageDriver
  });
  const ready = ensureConfiguredAdmin(store);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    await ready;
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, store, url);
      return;
    }
    await serveStatic(request, response, url, store);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => {
    console.log(`TIKKA server running at http://localhost:${port}`);
  });
}

module.exports = {
  createApp
};
