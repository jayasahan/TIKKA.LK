const assert = require("node:assert/strict");
const { afterEach, describe, test } = require("node:test");

const {
  createAdminSession,
  createSession,
  destroySession,
  getAdminSession,
  getSession,
  hashPassword,
  resetSessions,
  verifyPassword
} = require("../lib/auth");
const {
  CUSTOMER_CONFIRMABLE_STATUS,
  CUSTOMER_REVIEWABLE_STATUS,
  JOB_STATUSES,
  OPERATOR_TRANSITIONS
} = require("../lib/constants");
const { createId, createRequestReference } = require("../lib/db");
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
} = require("../lib/validation");

afterEach(() => resetSessions());

describe("password and session primitives", () => {
  test("password hashes are salted and verify only the matching password", () => {
    const first = hashPassword("correct horse battery staple");
    const second = hashPassword("correct horse battery staple");
    assert.notEqual(first, second);
    assert.equal(verifyPassword("correct horse battery staple", first), true);
    assert.equal(verifyPassword("wrong password", first), false);
    assert.match(first, /^[a-f0-9]{32}:[a-f0-9]{64}$/);
  });

  test("customer and admin sessions remain separated", () => {
    const customerId = createSession("customer_1");
    const adminId = createAdminSession("admin_1");
    const customer = getSession({ headers: { cookie: `tikka_session=${customerId}; tikka_admin_session=${adminId}` } });
    const admin = getAdminSession({ headers: { cookie: `tikka_session=${customerId}; tikka_admin_session=${adminId}` } });
    assert.equal(customer.customerId, "customer_1");
    assert.equal(admin.adminId, "admin_1");
    assert.match(customer.csrfToken, /^[a-f0-9]{64}$/);
    assert.match(admin.csrfToken, /^[a-f0-9]{64}$/);
    assert.notEqual(customer.csrfToken, admin.csrfToken);
  });

  test("destroying a session immediately invalidates it", () => {
    const id = createSession("customer_1");
    const request = { headers: { cookie: `tikka_session=${id}` } };
    assert(getSession(request));
    destroySession(id);
    assert.equal(getSession(request), null);
  });
});

describe("identifier and reference generation", () => {
  test("IDs contain the requested namespace and sufficient random data", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId("test")));
    assert.equal(ids.size, 100);
    for (const id of ids) assert.match(id, /^test_[a-f0-9]{16}$/);
  });

  test("request references use the public TIKKA date format", () => {
    assert.match(createRequestReference(), /^TIKKA-\d{8}-[A-F0-9]{6}$/);
  });
});

describe("registration and login validation", () => {
  test("registration trims fields and normalizes email", () => {
    const result = validateRegistration({
      name: "  Test Customer  ", phone: " +94 77 123 4567 ",
      email: " Customer@Example.COM ", password: "password123"
    });
    assert.deepEqual(result.errors, {});
    assert.deepEqual(result.value, {
      name: "Test Customer", phone: "+94 77 123 4567",
      email: "customer@example.com", password: "password123"
    });
  });

  test("registration rejects invalid and oversized fields", () => {
    const result = validateRegistration({ name: "x".repeat(121), phone: "abc", email: "bad", password: "short" });
    assert.deepEqual(Object.keys(result.errors).sort(), ["email", "name", "password", "phone"]);
  });

  test("login requires both fields and normalizes the identifier", () => {
    assert.equal(hasErrors(validateLogin({}).errors), true);
    const valid = validateLogin({ email: " ADMIN@EXAMPLE.COM ", password: "secret" });
    assert.deepEqual(valid, { errors: {}, value: { email: "admin@example.com", password: "secret" } });
  });
});

describe("service request validation", () => {
  const categories = [
    { name: "Cleaning", enabled: true },
    { name: "Disabled", enabled: false }
  ];
  const validRequest = {
    service: "Cleaning", title: "Clean home", description: "Clean the entire apartment.",
    customerName: "Test Customer", phone: "+94770000000", email: "TEST@example.com",
    address: "Colombo", preferredDate: "2026-12-01", preferredTime: "10:30",
    photos: Array.from({ length: 8 }, (_, index) => ` photo-${index}.jpg `)
  };

  test("accepts an enabled category and caps photo metadata", () => {
    const result = validateRequest(validRequest, categories);
    assert.deepEqual(result.errors, {});
    assert.equal(result.value.email, "test@example.com");
    assert.equal(result.value.photos.length, 6);
    assert.equal(result.value.photos[0], "photo-0.jpg");
  });

  test("rejects disabled, unknown, and missing services", () => {
    assert(validateRequest({ ...validRequest, service: "Disabled" }, categories).errors.service);
    assert(validateRequest({ ...validRequest, service: "Unknown" }, categories).errors.service);
    assert(validateRequest({ ...validRequest, service: "" }, categories).errors.service);
  });

  test("rejects malformed contact details and overlong content", () => {
    const result = validateRequest({ ...validRequest, title: "x".repeat(141), description: "x".repeat(1201), phone: "abc", email: "bad" }, categories);
    assert.deepEqual(Object.keys(result.errors).sort(), ["description", "email", "phone", "title"]);
  });
});

describe("operational validation and lifecycle constants", () => {
  test("runtime status list and transition boundaries stay explicit", () => {
    assert.deepEqual(JOB_STATUSES, ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED", "CANCELLED", "REJECTED"]);
    assert.deepEqual(OPERATOR_TRANSITIONS.NEW, ["REVIEWING", "CANCELLED", "REJECTED"]);
    assert.deepEqual(OPERATOR_TRANSITIONS.ASSIGNED, ["IN_PROGRESS", "CANCELLED", "REJECTED"]);
    assert.deepEqual(OPERATOR_TRANSITIONS.COMPLETED, []);
    assert.equal(CUSTOMER_CONFIRMABLE_STATUS, "COMPLETED");
    assert.equal(CUSTOMER_REVIEWABLE_STATUS, "CONFIRMED");
  });

  test("status validation accepts only canonical runtime statuses", () => {
    for (const status of JOB_STATUSES) assert.deepEqual(validateStatus({ status }).errors, {});
    assert(validateStatus({ status: "ACCEPTED" }).errors.status);
    assert(validateStatus({ status: "completed" }).errors.status);
  });

  test("schedule validation accepts future dates and rejects invalid or past dates", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(validateSchedule({ scheduledAt: future }).value.scheduledAt, future);
    assert(validateSchedule({ scheduledAt: "not-a-date" }).errors.scheduledAt);
    assert(validateSchedule({ scheduledAt: new Date(Date.now() - 60_000).toISOString() }).errors.scheduledAt);
  });

  test("review validation enforces rating and comment boundaries", () => {
    assert.deepEqual(validateReview({ rating: "5", comment: "Excellent" }), { errors: {}, value: { rating: 5, comment: "Excellent" } });
    assert(validateReview({ rating: 0, comment: "" }).errors.rating);
    assert(validateReview({ rating: 6, comment: "x".repeat(601) }).errors.comment);
    assert(validateReview({ rating: 4.5, comment: "Good" }).errors.rating);
  });

  test("category validation normalizes codes and honors explicit disabling", () => {
    const result = validateCategory({ name: "Appliance Repair", code: "ar12", description: "Repair appliances", enabled: false });
    assert.deepEqual(result.errors, {});
    assert.equal(result.value.code, "AR12");
    assert.equal(result.value.enabled, false);
    assert(validateCategory({ name: "Test", code: "!", description: "Test" }).errors.code);
  });

  test("moderation accepts only hide and restore and caps notes", () => {
    assert.deepEqual(validateModeration({ action: " HIDE ", note: "ok" }).value, { action: "hide", note: "ok" });
    assert.equal(validateModeration({ action: "restore", note: "x".repeat(500) }).value.note.length, 400);
    assert(validateModeration({ action: "delete" }).errors.action);
  });
});
