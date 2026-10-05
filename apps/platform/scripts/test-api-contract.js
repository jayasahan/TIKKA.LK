const assert = require("node:assert/strict");
const { after, before, describe, test } = require("node:test");

process.env.TIKKA_ADMIN_EMAIL = "api.admin@example.test";
process.env.TIKKA_ADMIN_PASSWORD = "api-admin-test-password";

const { createApp } = require("../server");
const { resetSessions } = require("../lib/auth");
const { assertStatus, close, csrf, futureIso, listen, makeTempDatabase, request } = require("./test-helpers");

let temporary;
let server;
let port;
let customer;
let secondCustomer;
let admin;
let workerId;
let requestId;

async function register(email, name = "API Customer") {
  const response = await request(port, "POST", "/api/auth/register", {
    body: { name, phone: "+94770000010", email, password: "customer-test-password" }
  });
  assertStatus(response, 201, `register ${email}`);
  return { cookie: response.cookie, csrf: response.body.csrfToken, body: response.body };
}

async function post(pathname, body, actor) {
  return request(port, "POST", pathname, { body, cookie: actor?.cookie, headers: actor ? csrf(actor.csrf) : {} });
}

before(async () => {
  resetSessions();
  temporary = makeTempDatabase("tikka-api-contract-");
  server = createApp({ dbPath: temporary.dbPath, storageDriver: "json" });
  port = await listen(server);
  customer = await register("api.customer@example.test", "Primary Customer");
  secondCustomer = await register("api.second@example.test", "Second Customer");
  const login = await request(port, "POST", "/api/admin/login", {
    body: { email: process.env.TIKKA_ADMIN_EMAIL, password: process.env.TIKKA_ADMIN_PASSWORD }
  });
  assertStatus(login, 200, "admin login fixture");
  admin = { cookie: login.cookie, csrf: login.body.csrfToken };
});

after(async () => {
  await close(server);
  resetSessions();
  temporary.cleanup();
});

describe("HTTP and authentication boundaries", () => {
  test("public responses have expected types and baseline security headers", async () => {
    for (const pathname of ["/health", "/api/services"]) {
      const response = await request(port, "GET", pathname);
      assertStatus(response, 200, pathname);
      assert.match(response.headers["content-type"], /^application\/json/);
      assert.equal(response.headers["x-content-type-options"], "nosniff");
      assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
      assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
    }
    const page = await request(port, "GET", "/");
    assertStatus(page, 200, "landing page");
    assert.match(page.headers["content-type"], /^text\/html/);
  });

  test("unknown APIs, static traversal, and removed surfaces stay unavailable", async () => {
    for (const pathname of ["/api/unknown", "/api/providers/me"]) {
      const response = await request(port, "GET", pathname);
      assertStatus(response, 404, pathname);
      assert.equal(response.body.error, "API route not found.");
    }
    for (const pathname of ["/unknown", "/assets/..%2F..%2Fserver.js", "/provider.html"]) {
      assertStatus(await request(port, "GET", pathname), 404, pathname);
    }
  });

  test("malformed JSON is rejected without terminating the server", async () => {
    const malformed = await request(port, "POST", "/api/auth/login", { rawBody: "{broken", contentType: "application/json" });
    assertStatus(malformed, 400, "malformed JSON");
    assert.equal(malformed.body.error, "Invalid JSON body.");
    assertStatus(await request(port, "GET", "/health"), 200, "server remains healthy");
  });

  test("protected route matrix rejects anonymous access", async () => {
    for (const pathname of [
      "/api/auth/me", "/api/requests", "/api/admin/me", "/api/admin/dashboard",
      "/api/admin/customers", "/api/admin/workers", "/api/admin/requests",
      "/api/admin/reviews", "/api/admin/categories"
    ]) {
      assertStatus(await request(port, "GET", pathname), 401, `anonymous ${pathname}`);
    }
  });

  test("customer and admin cookies cannot cross authorization domains", async () => {
    assertStatus(await request(port, "GET", "/api/admin/workers", { cookie: customer.cookie }), 401, "customer on admin route");
    assertStatus(await request(port, "GET", "/api/requests", { cookie: admin.cookie }), 401, "admin on customer route");
  });

  test("session responses are sanitized and never expose password hashes", async () => {
    const customerMe = await request(port, "GET", "/api/auth/me", { cookie: customer.cookie });
    const adminMe = await request(port, "GET", "/api/admin/me", { cookie: admin.cookie });
    assertStatus(customerMe, 200, "customer session");
    assertStatus(adminMe, 200, "admin session");
    assert.equal("passwordHash" in customerMe.body.customer, false);
    assert.equal("passwordHash" in adminMe.body.admin, false);
    assert(customerMe.body.csrfToken);
    assert(adminMe.body.csrfToken);
  });

  test("authenticated unsafe requests require the matching CSRF token", async () => {
    assertStatus(await request(port, "POST", "/api/auth/logout", { body: {}, cookie: customer.cookie }), 403, "missing customer CSRF");
    assertStatus(await request(port, "POST", "/api/admin/logout", { body: {}, cookie: admin.cookie, headers: csrf(customer.csrf) }), 403, "cross-session CSRF");
  });
});

describe("input validation and duplicate handling", () => {
  test("registration reports field errors and duplicate email safely", async () => {
    const invalid = await request(port, "POST", "/api/auth/register", {
      body: { name: "", phone: "bad", email: "bad", password: "short" }
    });
    assertStatus(invalid, 400, "invalid registration");
    assert.deepEqual(Object.keys(invalid.body.errors).sort(), ["email", "name", "password", "phone"]);
    const duplicate = await request(port, "POST", "/api/auth/register", {
      body: { name: "Duplicate", phone: "+94770000010", email: "API.CUSTOMER@example.test", password: "customer-test-password" },
      headers: { "X-Forwarded-For": "198.51.100.80" }
    });
    assertStatus(duplicate, 409, "duplicate registration");
    assert(duplicate.body.errors.email);
  });

  test("request creation rejects invalid fields and disabled categories", async () => {
    const invalid = await post("/api/requests", {
      service: "Unknown", title: "", description: "", customerName: "", phone: "bad",
      email: "bad", address: "", preferredDate: "", preferredTime: ""
    }, customer);
    assertStatus(invalid, 400, "invalid request");
    for (const field of ["service", "title", "description", "customerName", "phone", "email", "address", "preferredDate", "preferredTime"]) {
      assert(invalid.body.errors[field], `missing validation error for ${field}`);
    }
  });

  test("category creation validates and prevents duplicate names and codes", async () => {
    const invalid = await post("/api/admin/categories", { name: "Test", code: "!", description: "Test" }, admin);
    assertStatus(invalid, 400, "invalid category");
    const created = await post("/api/admin/categories", { name: "Appliance Repair", code: "APR", description: "Repair household appliances.", enabled: true }, admin);
    assertStatus(created, 201, "create category");
    const duplicateName = await post("/api/admin/categories", { name: "appliance repair", code: "AP2", description: "Duplicate.", enabled: true }, admin);
    assertStatus(duplicateName, 409, "duplicate category name");
    const duplicateCode = await post("/api/admin/categories", { name: "Other Appliance", code: "APR", description: "Duplicate.", enabled: true }, admin);
    assertStatus(duplicateCode, 409, "duplicate category code");
  });
});

describe("managed request lifecycle and ownership", () => {
  test("admin can create a worker and customer can create a request", async () => {
    const worker = await post("/api/admin/workers", {
      name: "Contract Worker", phone: "+94770000020", serviceArea: "Colombo",
      skills: ["Cleaning"], services: ["Cleaning"]
    }, admin);
    assertStatus(worker, 201, "create worker");
    workerId = worker.body.worker.id;

    const created = await post("/api/requests", {
      service: "Cleaning", title: "Clean test apartment", description: "Clean every room carefully.",
      customerName: "Primary Customer", phone: "+94770000010", email: "api.customer@example.test",
      address: "Colombo 05", preferredDate: "2026-12-01", preferredTime: "10:30",
      photos: ["before.jpg"]
    }, customer);
    assertStatus(created, 201, "create service request");
    requestId = created.body.request.id;
    assert.equal(created.body.request.status, "NEW");
    assert.equal("customerId" in created.body.request, false);
  });

  test("another customer cannot read, confirm, or review the request", async () => {
    assertStatus(await request(port, "GET", `/api/requests/${requestId}`, { cookie: secondCustomer.cookie }), 404, "foreign read");
    assertStatus(await post(`/api/requests/${requestId}/confirm`, {}, secondCustomer), 404, "foreign confirmation");
    assertStatus(await post(`/api/requests/${requestId}/review`, { rating: 5, comment: "Not mine" }, secondCustomer), 404, "foreign review");
  });

  test("invalid and out-of-order transitions are rejected", async () => {
    assertStatus(await post(`/api/admin/requests/${requestId}/status`, { status: "COMPLETED" }, admin), 409, "NEW to COMPLETED");
    assertStatus(await post(`/api/admin/requests/${requestId}/status`, { status: "UNKNOWN" }, admin), 400, "unknown status");
    assertStatus(await post(`/api/admin/requests/${requestId}/assign-worker`, { workerId }, admin), 409, "assign before schedule");
    assertStatus(await post(`/api/requests/${requestId}/confirm`, {}, customer), 409, "confirm before complete");
    assertStatus(await post(`/api/requests/${requestId}/review`, { rating: 5, comment: "Too early" }, customer), 409, "review before confirmed");
  });

  test("admin search, scheduling, assignment, and completion preserve response boundaries", async () => {
    assertStatus(await post(`/api/admin/requests/${requestId}/status`, { status: "REVIEWING" }, admin), 200, "start review");
    const past = await post(`/api/admin/requests/${requestId}/schedule`, { scheduledAt: new Date(Date.now() - 60_000).toISOString() }, admin);
    assertStatus(past, 400, "past schedule");
    const schedule = await post(`/api/admin/requests/${requestId}/schedule`, { scheduledAt: futureIso() }, admin);
    assertStatus(schedule, 200, "schedule request");
    const assigned = await post(`/api/admin/requests/${requestId}/assign-worker`, { workerId }, admin);
    assertStatus(assigned, 200, "assign worker");
    assert.equal(assigned.body.request.assignment.worker.id, workerId);

    const search = await request(port, "GET", "/api/admin/requests?q=primary%20customer&status=ASSIGNED", { cookie: admin.cookie });
    assertStatus(search, 200, "admin request search");
    assert.equal(search.body.requests.length, 1);
    assert.equal(search.body.requests[0].customer.email, "api.customer@example.test");
    assert.equal("passwordHash" in search.body.requests[0].customer, false);

    for (const status of ["IN_PROGRESS", "COMPLETED"]) {
      assertStatus(await post(`/api/admin/requests/${requestId}/status`, { status }, admin), 200, status);
    }
    assertStatus(await post(`/api/admin/requests/${requestId}/status`, { status: "CANCELLED" }, admin), 409, "completed is terminal for admin");
  });

  test("customer confirmation and one-review rule are enforced", async () => {
    const confirmed = await post(`/api/requests/${requestId}/confirm`, {}, customer);
    assertStatus(confirmed, 200, "confirm completed work");
    assert.equal(confirmed.body.request.status, "CONFIRMED");

    const invalid = await post(`/api/requests/${requestId}/review`, { rating: 6, comment: "" }, customer);
    assertStatus(invalid, 400, "invalid review");
    const created = await post(`/api/requests/${requestId}/review`, { rating: 5, comment: "Excellent work." }, customer);
    assertStatus(created, 201, "create review");
    assertStatus(await post(`/api/requests/${requestId}/review`, { rating: 4, comment: "Duplicate" }, customer), 409, "duplicate review");
  });

  test("admin review moderation validates actions and records visibility", async () => {
    const listing = await request(port, "GET", "/api/admin/reviews", { cookie: admin.cookie });
    assertStatus(listing, 200, "list reviews");
    const review = listing.body.reviews.find((item) => item.requestId === requestId);
    assert(review);
    assertStatus(await post(`/api/admin/reviews/${review.id}/moderate`, { action: "delete" }, admin), 400, "invalid moderation");
    const hidden = await post(`/api/admin/reviews/${review.id}/moderate`, { action: "hide" }, admin);
    assertStatus(hidden, 200, "hide review");
    assert.equal(hidden.body.review.hidden, true);
    assert.equal(hidden.body.review.moderation.at(-1).action, "hide");
    const restored = await post(`/api/admin/reviews/${review.id}/moderate`, { action: "restore" }, admin);
    assertStatus(restored, 200, "restore review");
    assert.equal(restored.body.review.hidden, false);
  });
});
