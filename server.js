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
const { createId, createRequestReference, createStore } = require("./lib/db");
const {
  hasErrors,
  serviceData,
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
const defaultAdminEmail = (process.env.TIKKA_ADMIN_EMAIL || "admin@tikka.lk").toLowerCase();
const defaultAdminPassword = process.env.TIKKA_ADMIN_PASSWORD || "tikka-admin-123";
const protectedAdminAssets = new Set(["/admin.html", "/admin.js"]);

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

function enabledCategories(database) {
  return (database.categories || []).filter((category) => category.enabled !== false);
}

function dashboardMetrics(database) {
  const requests = database.requests || [];
  return {
    totalCustomers: database.customers.length,
    totalProviders: database.providers.length,
    pendingProviderApprovals: database.providers.filter((item) => item.state === "PENDING_VERIFICATION").length,
    newJobRequests: requests.filter((item) => item.status === "NEW").length,
    activeJobs: requests.filter((item) => ["REVIEWING", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(item.status)).length,
    completedJobs: requests.filter((item) => ["COMPLETED", "CONFIRMED"].includes(item.status)).length,
    cancelledJobs: requests.filter((item) => item.status === "CANCELLED").length
  };
}

function ensureDefaultAdmin(store) {
  store.update((database) => {
    if (database.admins.length > 0) {
      return database.admins[0];
    }
    const admin = {
      id: createId("admin"),
      name: "TIKKA Admin",
      email: defaultAdminEmail,
      passwordHash: hashPassword(defaultAdminPassword),
      role: "admin",
      createdAt: new Date().toISOString()
    };
    database.admins.push(admin);
    return admin;
  });
}

function requireCustomer(request, response, store) {
  const session = getSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Please log in to continue." });
    return null;
  }

  const database = store.read();
  const customer = database.customers.find((item) => item.id === session.customerId);
  if (!customer) {
    sendJson(response, 401, { error: "Please log in to continue." });
    return null;
  }

  return { customer, database, session };
}

function requireProvider(request, response, store) {
  const session = getProviderSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Please log in as a service provider." });
    return null;
  }

  const database = store.read();
  const provider = database.providers.find((item) => item.id === session.providerId);
  if (!provider) {
    sendJson(response, 401, { error: "Please log in as a service provider." });
    return null;
  }

  return { provider, database, session };
}

function requireAdmin(request, response, store) {
  const database = store.read();
  const token = request.headers["x-tikka-operator-token"] || request.headers["X-TIKKA-OPERATOR-TOKEN"];
  if (token === "dev-operator-token") {
    const admin = database.admins[0];
    if (admin) {
      return { admin, database, session: { adminId: admin.id } };
    }
  }

  const session = getAdminSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Please log in as an admin." });
    return null;
  }

  const admin = database.admins.find((item) => item.id === session.adminId);
  if (!admin) {
    sendJson(response, 401, { error: "Please log in as an admin." });
    return null;
  }

  return { admin, database, session };
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
    if (request.method === "GET" && url.pathname === "/api/services") {
      const database = store.read();
      sendJson(response, 200, { services: enabledCategories(database).map(exposeCategory) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJsonBody(request);
      const { errors, value } = validateRegistration(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        if (database.customers.some((customer) => customer.email === value.email)) {
          return { duplicate: true };
        }
        const customer = {
          id: createId("customer"),
          name: value.name,
          phone: value.phone,
          email: value.email,
          passwordHash: hashPassword(value.password),
          createdAt: new Date().toISOString()
        };
        database.customers.push(customer);
        return { customer };
      });

      if (result.duplicate) {
        sendJson(response, 409, { errors: { email: "An account already exists for this email." } });
        return;
      }

      const sessionId = createSession(result.customer.id);
      sendJson(response, 201, { customer: sanitizeCustomer(result.customer) }, {
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

      const database = store.read();
      const customer = database.customers.find((item) => item.email === value.email);
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
      const body = await readJsonBody(request);
      const { errors, value } = validateLogin(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const database = store.read();
      const admin = database.admins.find((item) => item.email === value.email);
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
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { admin: sanitizeAdmin(auth.admin) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/dashboard") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { metrics: dashboardMetrics(auth.database) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/customers") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        customers: auth.database.customers.map(sanitizeCustomer)
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/providers") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        providers: auth.database.providers.map(sanitizeAdminProvider)
      });
      return;
    }

    const adminProviderMatch = url.pathname.match(/^\/api\/admin\/providers\/([^/]+)$/);
    if (request.method === "GET" && adminProviderMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const provider = auth.database.providers.find((item) => item.id === adminProviderMatch[1]);
      if (!provider) {
        sendJson(response, 404, { error: "Provider not found." });
        return;
      }
      sendJson(response, 200, { provider: sanitizeAdminProvider(provider) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/requests") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const status = url.searchParams.get("status") || "";
      const query = (url.searchParams.get("q") || "").trim().toLowerCase();
      const requests = auth.database.requests
        .filter((item) => (status ? item.status === status : true))
        .filter((item) => matchesSearch(item, query))
        .map((item) => exposeAdminRequest(item, auth.database));
      sendJson(response, 200, { requests });
      return;
    }

    const adminRequestMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)$/);
    if (request.method === "GET" && adminRequestMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const serviceRequest = auth.database.requests.find((item) => item.id === adminRequestMatch[1]);
      if (!serviceRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      sendJson(response, 200, { request: exposeAdminRequest(serviceRequest, auth.database) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/reviews") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        reviews: auth.database.reviews.map((review) => exposeAdminReview(review, auth.database))
      });
      return;
    }

    const moderateMatch = url.pathname.match(/^\/api\/admin\/reviews\/([^/]+)\/moderate$/);
    if (request.method === "POST" && moderateMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateModeration(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const review = database.reviews.find((item) => item.id === moderateMatch[1]);
        if (!review) {
          return { missing: true };
        }
        if (!Array.isArray(review.moderation)) {
          review.moderation = [];
        }
        review.hidden = value.action === "hide";
        review.moderation.push({
          action: value.action,
          note: value.note,
          adminId: auth.admin.id,
          at: new Date().toISOString()
        });
        return { review, database };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Review not found." });
        return;
      }
      sendJson(response, 200, { review: exposeAdminReview(result.review, result.database) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/categories") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, {
        categories: auth.database.categories.map(exposeCategory)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/categories") {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateCategory(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const code = value.code || value.name.slice(0, 2).toUpperCase();
        if (database.categories.some((item) => item.name.toLowerCase() === value.name.toLowerCase())) {
          return { duplicate: "name" };
        }
        if (database.categories.some((item) => item.code === code)) {
          return { duplicate: "code" };
        }
        const category = {
          id: createId("category"),
          name: value.name,
          code,
          icon: value.icon || code,
          description: value.description,
          enabled: value.enabled,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        database.categories.push(category);
        return { category };
      });

      if (result.duplicate) {
        sendJson(response, 409, { errors: { [result.duplicate]: "This category already exists." } });
        return;
      }
      sendJson(response, 201, { category: exposeCategory(result.category) });
      return;
    }

    const categoryMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (request.method === "POST" && categoryMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateCategory({ ...body, enabled: body.enabled });
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const category = database.categories.find((item) => item.id === categoryMatch[1]);
        if (!category) {
          return { missing: true };
        }
        const code = value.code || category.code;
        if (database.categories.some((item) => item.id !== category.id && item.name.toLowerCase() === value.name.toLowerCase())) {
          return { duplicate: "name" };
        }
        if (database.categories.some((item) => item.id !== category.id && item.code === code)) {
          return { duplicate: "code" };
        }
        category.name = value.name;
        category.code = code;
        category.icon = value.icon || category.icon;
        category.description = value.description;
        if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
          category.enabled = body.enabled !== false && body.enabled !== "false";
        }
        category.updatedAt = new Date().toISOString();
        return { category };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Category not found." });
        return;
      }
      if (result.duplicate) {
        sendJson(response, 409, { errors: { [result.duplicate]: "This category already exists." } });
        return;
      }
      sendJson(response, 200, { category: exposeCategory(result.category) });
      return;
    }

    const categoryToggleMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)\/toggle$/);
    if (request.method === "POST" && categoryToggleMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const result = store.update((database) => {
        const category = database.categories.find((item) => item.id === categoryToggleMatch[1]);
        if (!category) {
          return { missing: true };
        }
        category.enabled = category.enabled === false;
        category.updatedAt = new Date().toISOString();
        return { category };
      });
      if (result.missing) {
        sendJson(response, 404, { error: "Category not found." });
        return;
      }
      sendJson(response, 200, { category: exposeCategory(result.category) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/providers/register") {
      const body = await readJsonBody(request);
      const database = store.read();
      const { errors, value } = validateProviderRegistration(body, database.categories);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((db) => {
        if (db.providers.some((provider) => provider.email === value.email)) {
          return { duplicate: true };
        }
        const provider = {
          id: createId("provider"),
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
          qualifications: value.qualifications,
          state: "REGISTERED",
          verificationStatus: "Registered",
          rating: null,
          completedJobs: 0,
          createdAt: new Date().toISOString()
        };
        db.providers.push(provider);
        return { provider };
      });

      if (result.duplicate) {
        sendJson(response, 409, { errors: { email: "A provider account already exists for this email." } });
        return;
      }

      const sessionId = createProviderSession(result.provider.id);
      sendJson(response, 201, { provider: sanitizeProvider(result.provider) }, {
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

      const database = store.read();
      const provider = database.providers.find((item) => item.email === value.email);
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
      const auth = requireProvider(request, response, store);
      if (!auth) {
        return;
      }
      const result = store.update((database) => {
        const provider = database.providers.find((item) => item.id === auth.provider.id);
        if (provider.state !== "REGISTERED") {
          return { invalid: provider.state };
        }
        provider.state = "PENDING_VERIFICATION";
        provider.verificationStatus = "Pending verification";
        provider.verificationSubmittedAt = new Date().toISOString();
        return { provider };
      });

      if (result.invalid) {
        sendJson(response, 409, { error: "Verification has already been submitted." });
        return;
      }

      sendJson(response, 200, { provider: sanitizeProvider(result.provider) });
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
      const auth = requireProvider(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { provider: sanitizeProvider(auth.provider) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/providers/jobs") {
      const auth = requireProvider(request, response, store);
      if (!auth) {
        return;
      }
      const jobs = auth.database.requests
        .filter((item) => item.providerId === auth.provider.id)
        .map(exposeProviderJob);
      sendJson(response, 200, { jobs });
      return;
    }

    const providerJobMatch = url.pathname.match(/^\/api\/providers\/jobs\/([^/]+)\/(accept|decline|start|complete)$/);
    if (request.method === "POST" && providerJobMatch) {
      const auth = requireProvider(request, response, store);
      if (!auth) {
        return;
      }

      const action = providerJobMatch[2];
      const result = store.update((database) => {
        const job = database.requests.find(
          (item) => item.id === providerJobMatch[1] && item.providerId === auth.provider.id
        );
        if (!job) {
          return { missing: true };
        }

        const transitions = {
          accept: ["ASSIGNED", "ACCEPTED"],
          decline: ["ASSIGNED", "REJECTED"],
          start: ["ACCEPTED", "IN_PROGRESS"],
          complete: ["IN_PROGRESS", "COMPLETED"]
        };
        const [from, to] = transitions[action];
        if (job.status !== from) {
          return { invalid: job.status };
        }

        job.status = to;
        if (to === "COMPLETED") {
          const provider = database.providers.find((item) => item.id === auth.provider.id);
          provider.completedJobs = (provider.completedJobs || 0) + 1;
          job.completedAt = new Date().toISOString();
        }
        return { job };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Assigned job not found." });
        return;
      }
      if (result.invalid) {
        sendJson(response, 409, { error: "Invalid job transition for this provider." });
        return;
      }
      sendJson(response, 200, { job: exposeProviderJob(result.job) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      sendJson(response, 200, { customer: sanitizeCustomer(auth.customer) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests") {
      const auth = requireCustomer(request, response, store);
      if (!auth) {
        return;
      }

      const body = await readJsonBody(request);
      const { errors, value } = validateRequest(body, auth.database.categories);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const created = store.update((database) => {
        const service = (database.categories || serviceData).find((item) => item.name === value.service);
        const serviceRequest = {
          id: createId("request"),
          reference: createRequestReference(),
          customerId: auth.customer.id,
          serviceId: service.code,
          service: service.name,
          title: value.title,
          description: value.description,
          customerName: value.customerName,
          phone: value.phone,
          email: value.email,
          address: value.address,
          preferredDate: value.preferredDate,
          preferredTime: value.preferredTime,
          photos: value.photos,
          status: "NEW",
          providerId: null,
          scheduledAt: null,
          assignedByAdminId: null,
          assignedAt: null,
          submittedAt: new Date().toISOString()
        };
        database.requests.push(serviceRequest);
        return serviceRequest;
      });

      sendJson(response, 201, {
        message: "Request received.",
        explanation: "TIKKA will review the request and arrange a suitable skilled person.",
        request: exposeRequest(created, store.read())
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/requests") {
      const auth = requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const requests = auth.database.requests
        .filter((item) => item.customerId === auth.customer.id)
        .map((item) => exposeRequest(item, auth.database));
      sendJson(response, 200, { requests });
      return;
    }

    const requestMatch = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
    if (request.method === "GET" && requestMatch) {
      const auth = requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const serviceRequest = auth.database.requests.find(
        (item) => item.id === requestMatch[1] && item.customerId === auth.customer.id
      );
      if (!serviceRequest) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      sendJson(response, 200, { request: exposeRequest(serviceRequest, auth.database) });
      return;
    }

    const confirmMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/confirm$/);
    if (request.method === "POST" && confirmMatch) {
      const auth = requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const result = store.update((database) => {
        const serviceRequest = database.requests.find(
          (item) => item.id === confirmMatch[1] && item.customerId === auth.customer.id
        );
        if (!serviceRequest) {
          return { missing: true };
        }
        if (serviceRequest.status !== CUSTOMER_CONFIRMABLE_STATUS) {
          return { invalid: serviceRequest.status };
        }
        serviceRequest.status = "CONFIRMED";
        serviceRequest.confirmedAt = new Date().toISOString();
        return { serviceRequest, database };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (result.invalid) {
        sendJson(response, 409, {
          error: "Completion can only be confirmed after the provider marks the job completed."
        });
        return;
      }
      sendJson(response, 200, { request: exposeRequest(result.serviceRequest, result.database) });
      return;
    }

    const reviewMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/review$/);
    if (request.method === "POST" && reviewMatch) {
      const auth = requireCustomer(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateReview(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const serviceRequest = database.requests.find(
          (item) => item.id === reviewMatch[1] && item.customerId === auth.customer.id
        );
        if (!serviceRequest) {
          return { missing: true };
        }
        if (serviceRequest.status !== CUSTOMER_REVIEWABLE_STATUS) {
          return { invalid: true };
        }
        if (database.reviews.some((review) => review.requestId === serviceRequest.id)) {
          return { duplicate: true };
        }
        const review = {
          id: createId("review"),
          requestId: serviceRequest.id,
          customerId: auth.customer.id,
          providerId: serviceRequest.providerId,
          rating: value.rating,
          comment: value.comment,
          submittedAt: new Date().toISOString(),
          hidden: false,
          moderation: []
        };
        database.reviews.push(review);
        return { review };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (result.invalid) {
        sendJson(response, 409, { error: "Reviews are available after completion is confirmed." });
        return;
      }
      if (result.duplicate) {
        sendJson(response, 409, { error: "This request already has a review." });
        return;
      }
      sendJson(response, 201, { review: result.review });
      return;
    }

    const assignMatch = url.pathname.match(/^\/api\/(?:admin|operator)\/requests\/([^/]+)\/assign$/);
    if (request.method === "POST" && assignMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const currentDatabase = store.read();
      const { errors, value } = validateAssignment(body, currentDatabase);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const serviceRequest = database.requests.find((item) => item.id === assignMatch[1]);
        const provider = database.providers.find((item) => item.id === value.providerId);
        if (!serviceRequest) {
          return { missing: true };
        }
        if (!provider || provider.state !== "APPROVED") {
          return { providerNotApproved: true };
        }
        if (!["NEW", "REVIEWING"].includes(serviceRequest.status)) {
          return { invalid: serviceRequest.status };
        }
        serviceRequest.providerId = value.providerId;
        serviceRequest.scheduledAt = value.scheduledAt || null;
        serviceRequest.status = "ASSIGNED";
        serviceRequest.assignedByAdminId = auth.admin.id;
        serviceRequest.assignedAt = new Date().toISOString();
        return { serviceRequest, database };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (result.invalid) {
        sendJson(response, 409, { error: "This request cannot be assigned from its current status." });
        return;
      }
      if (result.providerNotApproved) {
        sendJson(response, 409, { error: "Only approved providers can be assigned jobs." });
        return;
      }
      sendJson(response, 200, { request: exposeAdminRequest(result.serviceRequest, result.database) });
      return;
    }

    const providerStateMatch = url.pathname.match(/^\/api\/(?:admin|operator)\/providers\/([^/]+)\/state$/);
    if (request.method === "POST" && providerStateMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateProviderState(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const provider = database.providers.find((item) => item.id === providerStateMatch[1]);
        if (!provider) {
          return { missing: true };
        }
        const allowed = PROVIDER_STATE_TRANSITIONS[provider.state] || [];
        if (!allowed.includes(value.state)) {
          return { invalid: true };
        }
        provider.state = value.state;
        provider.verificationStatus = value.state
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/^\w/, (character) => character.toUpperCase());
        provider.reviewedAt = new Date().toISOString();
        provider.reviewedByAdminId = auth.admin.id;
        if (value.state === "DISABLED") {
          provider.disabledAt = provider.reviewedAt;
        }
        if (value.state === "APPROVED") {
          provider.disabledAt = null;
        }
        return { provider };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Provider not found." });
        return;
      }
      if (result.invalid) {
        sendJson(response, 409, { error: "Invalid provider verification transition." });
        return;
      }
      sendJson(response, 200, { provider: sanitizeAdminProvider(result.provider) });
      return;
    }

    const statusMatch = url.pathname.match(/^\/api\/(?:admin|operator)\/requests\/([^/]+)\/status$/);
    if (request.method === "POST" && statusMatch) {
      const auth = requireAdmin(request, response, store);
      if (!auth) {
        return;
      }
      const body = await readJsonBody(request);
      const { errors, value } = validateStatus(body);
      if (hasErrors(errors)) {
        sendJson(response, 400, { errors });
        return;
      }

      const result = store.update((database) => {
        const serviceRequest = database.requests.find((item) => item.id === statusMatch[1]);
        if (!serviceRequest) {
          return { missing: true };
        }
        const allowed = OPERATOR_TRANSITIONS[serviceRequest.status] || [];
        if (!allowed.includes(value.status)) {
          return { invalid: true };
        }
        if (value.status === "ASSIGNED" && !serviceRequest.providerId) {
          return { needsProvider: true };
        }
        serviceRequest.status = value.status;
        if (value.status === "CANCELLED") {
          serviceRequest.cancelledAt = new Date().toISOString();
          serviceRequest.cancelledByAdminId = auth.admin.id;
        }
        return { serviceRequest, database };
      });

      if (result.missing) {
        sendJson(response, 404, { error: "Request not found." });
        return;
      }
      if (result.needsProvider) {
        sendJson(response, 409, { error: "Assign an approved provider before setting ASSIGNED." });
        return;
      }
      if (result.invalid) {
        sendJson(response, 409, { error: "Invalid status transition." });
        return;
      }
      sendJson(response, 200, { request: exposeAdminRequest(result.serviceRequest, result.database) });
      return;
    }

    sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Request failed." });
  }
}

function hasValidAdminSession(request, store) {
  const session = getAdminSession(request);
  if (!session) {
    return false;
  }
  const database = store.read();
  return database.admins.some((admin) => admin.id === session.adminId);
}

function serveStatic(request, response, url, store) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicRoot, safePath);

  if (protectedAdminAssets.has(url.pathname) && !hasValidAdminSession(request, store)) {
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
  const store = createStore(options.dbPath);
  ensureDefaultAdmin(store);

  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, store, url);
      return;
    }
    serveStatic(request, response, url, store);
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
