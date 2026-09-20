require("dotenv").config({ path: require("node:path").resolve(__dirname, "..", "..", ".env"), quiet: true });

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { closePool } = require("./lib/postgres");
const {
  adminSessionCookie,
  clearAdminSessionCookie,
  clearSessionCookie,
  createAdminSession,
  createSession,
  destroySession,
  getAdminSession,
  getSession,
  hashPassword,
  sessionCookie,
  verifyPassword
} = require("./lib/auth");
const {
  CUSTOMER_CONFIRMABLE_STATUS,
  CUSTOMER_REVIEWABLE_STATUS,
  OPERATOR_TRANSITIONS
} = require("./lib/constants");
const { createStorage } = require("./lib/storage");
const {
  hasErrors,
  validateCategory,
  validateLogin,
  validateModeration,
  validateRegistration,
  validateRequest,
  validateReview,
  validateSchedule,
  validateStatus
} = require("./lib/validation");

const publicRoot = path.resolve(__dirname);
const protectedAdminAssets = new Set(["/admin.html", "/admin.js"]);
let adminConfigWarningShown = false;

const loginLimitWindowMs = Number(process.env.TIKKA_LOGIN_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const loginLimitMaxFailures = Number(process.env.TIKKA_LOGIN_LIMIT_MAX_FAILURES || 5);
// TODO: Move rate-limit state to shared storage before running multiple app instances.
const loginAttempts = new Map();
let lastLoginAttemptCleanup = 0;

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(text);
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

function clientIp(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || request.socket.remoteAddress || "unknown";
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function loginAttemptKeys(request, identifier, scope) {
  const ip = clientIp(request);
  const normalized = normalizeIdentifier(identifier) || "unknown";
  return [`${scope}:ip:${ip}`, `${scope}:account:${normalized}`];
}

function cleanupLoginAttempts(now = Date.now()) {
  if (now - lastLoginAttemptCleanup < loginLimitWindowMs) {
    return;
  }
  for (const [key, entry] of loginAttempts.entries()) {
    if (entry.resetAt <= now) {
      loginAttempts.delete(key);
    }
  }
  lastLoginAttemptCleanup = now;
}

function checkLoginRateLimit(request, identifier, scope) {
  cleanupLoginAttempts();
  const keys = loginAttemptKeys(request, identifier, scope);
  const now = Date.now();
  if (keys.some((key) => {
    const entry = loginAttempts.get(key);
    return entry && entry.count >= loginLimitMaxFailures && entry.resetAt > now;
  })) {
    return { limited: true, keys };
  }
  return { limited: false, keys };
}

function recordLoginFailure(keys) {
  const now = Date.now();
  for (const key of keys) {
    const entry = loginAttempts.get(key);
    if (!entry || entry.resetAt <= now) {
      loginAttempts.set(key, { count: 1, resetAt: now + loginLimitWindowMs });
    } else {
      entry.count += 1;
    }
  }
}

function resetLoginFailures(keys) {
  for (const key of keys) {
    loginAttempts.delete(key);
  }
}

function sendRateLimited(response) {
  sendJson(response, 429, { error: "Too many attempts. Please try again later." });
}

function isUnsafeMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function hasValidCsrf(request, session) {
  if (!isUnsafeMethod(request.method)) {
    return true;
  }
  const token = String(request.headers["x-csrf-token"] || "");
  if (!session || !session.csrfToken || !token || token.length !== session.csrfToken.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken));
}

function sendCsrfFailure(response) {
  sendJson(response, 403, { error: "Security check failed. Please refresh and try again." });
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

function exposeCustomerSession(customer, session) {
  return {
    customer: sanitizeCustomer(customer),
    csrfToken: session.csrfToken
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

function exposeAdminSession(admin, session) {
  return {
    admin: sanitizeAdmin(admin),
    csrfToken: session.csrfToken
  };
}

function sanitizeWorker(worker) {
  if (!worker) return null;
  return {
    id: worker.id, name: worker.name, phone: worker.phone, serviceArea: worker.serviceArea || null,
    notes: worker.notes || null, skills: worker.skills || [], services: worker.services || [],
    availabilityStatus: worker.availabilityStatus, active: worker.active,
    rating: worker.rating || null, completedJobs: worker.completedJobs || 0,
    createdAt: worker.createdAt || null, updatedAt: worker.updatedAt || null
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
  const worker = (database.workers || []).find((item) => item.id === request.assignedWorkerId);
  const review = (database.reviews || []).find((item) => item.requestId === request.id);

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
    address: request.address || null,
    assignedWorker: sanitizeWorker(worker),
    review: publicReview(review)
  };
}

function exposeAdminRequest(request, database) {
  const admin = (database.admins || []).find((item) => item.id === request.assignedByAdminId);
  const customer = (database.customers || []).find((item) => item.id === request.customerId);
  const review = (database.reviews || []).find((item) => item.requestId === request.id);

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
      worker: sanitizeWorker((database.workers || []).find((item) => item.id === request.assignedWorkerId)),
      assignedBy: sanitizeAdmin(admin),
      assignedAt: request.assignedAt || null,
      scheduledAt: request.scheduledAt || null
    },
    review: review ? exposeAdminReview(review, database) : null
  };
}

function exposeAdminReview(review, database) {
  const request = (database.requests || []).find((item) => item.id === review.requestId);
  return {
    id: review.id,
    requestId: review.requestId,
    reference: request ? request.reference : null,
    customerId: review.customerId,
    workerId: review.workerId || null,
    rating: review.rating,
    comment: review.comment,
    submittedAt: review.submittedAt,
    hidden: Boolean(review.hidden),
    moderation: review.moderation || []
  };
}

async function exposeRequestWithStore(request, store) {
  const [worker, review] = await Promise.all([
    request.assignedWorkerId ? store.findWorkerById(request.assignedWorkerId) : null,
    store.findReviewByRequestId(request.id)
  ]);
  return exposeRequest(request, {
    workers: worker ? [worker] : [],
    reviews: review ? [review] : []
  });
}

async function exposeAdminRequestWithStore(request, store) {
  const [worker, admin, customer, review] = await Promise.all([
    request.assignedWorkerId ? store.findWorkerById(request.assignedWorkerId) : null,
    request.assignedByAdminId ? store.findAdminById(request.assignedByAdminId) : null,
    request.customerId ? store.findCustomerById(request.customerId) : null,
    store.findReviewByRequestId(request.id)
  ]);
  return exposeAdminRequest(request, {
    workers: worker ? [worker] : [],
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

  if (!hasValidCsrf(request, session)) {
    sendCsrfFailure(response);
    return null;
  }

  const customer = await store.findCustomerById(session.customerId);
  if (!customer) {
    sendJson(response, 401, { error: "Please log in to continue." });
    return null;
  }

  return { customer, session };
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

  if (!hasValidCsrf(request, session)) {
    sendCsrfFailure(response);
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
    // TODO: Add persistent sessions and stricter request auditing before scaling beyond one instance.
    if (request.method === "GET" && url.pathname === "/api/services") {
      const categories = await store.listCategories({ enabledOnly: true });
      sendJson(response, 200, { services: categories.map(exposeCategory) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(request);
      const limit = checkLoginRateLimit(request, body.email, "customer-register");
      if (limit.limited) {
        sendRateLimited(response);
        return;
      }
      const { errors, value } = validateRegistration(body);
      if (hasErrors(errors)) {
        recordLoginFailure(limit.keys);
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
        recordLoginFailure(limit.keys);
        sendJson(response, 409, { errors: { email: "An account already exists for this email." } });
        return;
      }

      const sessionId = createSession(customer.id);
      const session = getSession({ headers: { cookie: `tikka_session=${sessionId}` } });
      resetLoginFailures(limit.keys);
      sendJson(response, 201, exposeCustomerSession(customer, session), {
        "Set-Cookie": sessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      const limit = checkLoginRateLimit(request, body.email, "customer-login");
      if (limit.limited) {
        sendRateLimited(response);
        return;
      }
      const { errors, value } = validateLogin(body);
      if (hasErrors(errors)) {
        recordLoginFailure(limit.keys);
        sendJson(response, 400, { errors });
        return;
      }

      const customer = await store.findCustomerByEmail(value.email);
      if (!customer || !verifyPassword(value.password, customer.passwordHash)) {
        recordLoginFailure(limit.keys);
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      const sessionId = createSession(customer.id);
      const session = getSession({ headers: { cookie: `tikka_session=${sessionId}` } });
      resetLoginFailures(limit.keys);
      sendJson(response, 200, exposeCustomerSession(customer, session), {
        "Set-Cookie": sessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      const session = getSession(request);
      if (session && !hasValidCsrf(request, session)) {
        sendCsrfFailure(response);
        return;
      }
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
      const limit = checkLoginRateLimit(request, body.email, "admin-login");
      if (limit.limited) {
        sendRateLimited(response);
        return;
      }
      const { errors, value } = validateLogin(body);
      if (hasErrors(errors)) {
        recordLoginFailure(limit.keys);
        sendJson(response, 400, { errors });
        return;
      }

      const admin = await store.findAdminByEmail(credentials.email);
      if (value.email !== credentials.email) {
        recordLoginFailure(limit.keys);
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }
      if (!admin || !verifyPassword(value.password, admin.passwordHash)) {
        recordLoginFailure(limit.keys);
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      const sessionId = createAdminSession(admin.id);
      const session = getAdminSession({ headers: { cookie: `tikka_admin_session=${sessionId}` } });
      resetLoginFailures(limit.keys);
      sendJson(response, 200, exposeAdminSession(admin, session), {
        "Set-Cookie": adminSessionCookie(sessionId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      const session = getAdminSession(request);
      if (session && !hasValidCsrf(request, session)) {
        sendCsrfFailure(response);
        return;
      }
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
      sendJson(response, 200, exposeAdminSession(auth.admin, auth.session));
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

    if (request.method === "GET" && url.pathname === "/api/admin/workers") {
      if (!await requireAdmin(request, response, store)) return;
      sendJson(response, 200, { workers: (await store.listWorkers()).map(sanitizeWorker) });
      return;
    }

    const workerMatch = url.pathname.match(/^\/api\/admin\/workers\/([^/]+)$/);
    if (request.method === "GET" && workerMatch) {
      if (!await requireAdmin(request, response, store)) return;
      const worker = await store.findWorkerById(workerMatch[1]);
      if (!worker) { sendJson(response, 404, { error: "Worker not found." }); return; }
      sendJson(response, 200, { worker: sanitizeWorker(worker) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/workers") {
      if (!await requireAdmin(request, response, store)) return;
      const body = await readJsonBody(request);
      if (!String(body.name || "").trim() || !String(body.phone || "").trim()) { sendJson(response, 400, { error: "Name and phone are required." }); return; }
      const worker = await store.createWorker({ name: body.name.trim(), phone: body.phone.trim(), serviceArea: body.serviceArea, notes: body.notes, skills: body.skills, services: body.services });
      sendJson(response, 201, { worker: sanitizeWorker(worker) });
      return;
    }

    if (request.method === "POST" && workerMatch) {
      if (!await requireAdmin(request, response, store)) return;
      const worker = await store.updateWorker(workerMatch[1], await readJsonBody(request));
      sendJson(response, 200, { worker: sanitizeWorker(worker) });
      return;
    }

    const workerActionMatch = url.pathname.match(/^\/api\/admin\/workers\/([^/]+)\/(toggle-active|availability)$/);
    if (request.method === "POST" && workerActionMatch) {
      if (!await requireAdmin(request, response, store)) return;
      const worker = workerActionMatch[2] === "toggle-active"
        ? await store.toggleWorkerActive(workerActionMatch[1])
        : await store.updateWorkerAvailability(workerActionMatch[1], (await readJsonBody(request)).availabilityStatus);
      sendJson(response, 200, { worker: sanitizeWorker(worker) });
      return;
    }

    const workerAssignMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)\/assign-worker$/);
    if (request.method === "POST" && workerAssignMatch) {
      const auth = await requireAdmin(request, response, store); if (!auth) return;
      const body = await readJsonBody(request);
      if (!body.workerId) { sendJson(response, 400, { error: "Worker is required." }); return; }
      try {
        const result = await store.assignWorkerToRequest(workerAssignMatch[1], body.workerId, body.scheduledAt, auth.admin.id);
        sendJson(response, 200, { request: await exposeAdminRequestWithStore(result, store) });
      } catch (error) {
        if (error.code === "NOT_FOUND") { sendJson(response, 404, { error: "Request or worker not found." }); return; }
        if (error.code === "CONFLICT") { sendJson(response, 409, { error: error.message }); return; }
        throw error;
      }
      return;
    }

    const scheduleMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)\/schedule$/);
    if (request.method === "POST" && scheduleMatch) {
      const auth = await requireAdmin(request, response, store);
      if (!auth) return;
      const body = await readJsonBody(request);
      const { errors, value } = validateSchedule(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }
      try {
        const serviceRequest = await store.scheduleRequest(scheduleMatch[1], value.scheduledAt, auth.admin.id);
        sendJson(response, 200, { request: await exposeAdminRequestWithStore(serviceRequest, store) });
      } catch (error) {
        if (error.code === "NOT_FOUND") { sendJson(response, 404, { error: "Request not found." }); return; }
        if (error.code === "CONFLICT") { sendJson(response, 409, { error: error.message }); return; }
        throw error;
      }
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

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = await requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, exposeCustomerSession(auth.customer, auth.session));
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
          error: "Completion can only be confirmed after TIKKA marks the job completed."
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
      if (value.status === "ASSIGNED" && !existingRequest.assignedWorkerId) {
        sendJson(response, 409, { error: "Assign a worker before setting ASSIGNED." });
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
    console.error(`Request failed: ${request.method} ${url.pathname}: ${error.message}`);
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
    response.writeHead(302, { ...securityHeaders, Location: "/admin-login.html" });
    response.end();
    return;
  }

  if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    ...securityHeaders,
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
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    await ready;
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, store, url);
      return;
    }
    await serveStatic(request, response, url, store);
  });
  server.ready = ready;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const mode = process.env.NODE_ENV || "development";
  const storageDriver = process.env.TIKKA_STORAGE_DRIVER || (mode === "production" ? "postgres" : "json");
  let server;

  async function shutdown(signal) {
    console.log(`TIKKA server received ${signal}; shutting down.`);
    if (server) {
      server.close(async () => {
        await closePool();
        process.exit(0);
      });
      return;
    }
    await closePool();
    process.exit(0);
  }

  try {
    server = createApp();
    server.ready
      .then(() => {
        server.listen(port, () => {
          console.log(`TIKKA server started on port ${port}`);
          console.log(`Mode: ${mode}`);
          console.log(`Storage driver: ${storageDriver}`);
        });
      })
      .catch(async (error) => {
        console.error(`TIKKA startup failed: ${error.message}`);
        await closePool();
        process.exit(1);
      });

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error(`TIKKA startup failed: ${error.message}`);
    closePool().finally(() => process.exit(1));
  }
}

module.exports = {
  createApp
};
