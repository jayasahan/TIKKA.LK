const assert = require("node:assert/strict");
const { after, before, describe, test } = require("node:test");

const { hashPassword, verifyPassword } = require("../lib/auth");
const { createJsonStore } = require("../lib/json-store");
const { makeTempDatabase } = require("./test-helpers");

let temporary;
let store;

before(() => {
  temporary = makeTempDatabase("tikka-json-contract-");
  store = createJsonStore({ dbPath: temporary.dbPath });
});

after(() => temporary.cleanup());

describe("JSON storage adapter contract", () => {
  test("seeds the service catalog and supports category administration", async () => {
    const seeded = await store.listCategories({ enabledOnly: true });
    assert.equal(seeded.length, 8);
    assert(seeded.some((category) => category.name === "Cleaning"));

    const created = await store.createCategory({ name: "Appliance Repair", code: "APR", icon: "APR", description: "Repair home appliances.", enabled: true });
    assert.equal((await store.findCategoryById(created.id)).name, "Appliance Repair");
    await assert.rejects(
      () => store.createCategory({ name: "appliance repair", code: "OTHER", description: "Duplicate", enabled: true }),
      (error) => error.code === "DUPLICATE" && error.field === "name"
    );
    await assert.rejects(
      () => store.createCategory({ name: "Other", code: "APR", description: "Duplicate", enabled: true }),
      (error) => error.code === "DUPLICATE" && error.field === "code"
    );

    const updated = await store.updateCategory(created.id, { name: "Appliance Service", code: "APS", icon: "APS", description: "Updated.", enabled: true }, { hasEnabled: true });
    assert.equal(updated.code, "APS");
    assert.equal((await store.toggleCategory(created.id)).enabled, false);
    assert.equal((await store.listCategories({ enabledOnly: true })).some((item) => item.id === created.id), false);
    await assert.rejects(() => store.updateCategory("missing", updated), (error) => error.code === "NOT_FOUND");
  });

  test("creates unique normalized customer records and configured admin credentials", async () => {
    const passwordHash = hashPassword("customer-test-password");
    const customer = await store.createCustomer({ name: "Customer One", phone: "+94770000001", email: "customer.one@example.test", passwordHash });
    assert.equal((await store.findCustomerByEmail(customer.email)).id, customer.id);
    assert.equal(verifyPassword("customer-test-password", (await store.findCustomerById(customer.id)).passwordHash), true);
    await assert.rejects(() => store.createCustomer({ ...customer, id: undefined }), (error) => error.code === "DUPLICATE");

    const helpers = { hashPassword, verifyPassword };
    const admin = await store.ensureConfiguredAdmin({ email: "admin@example.test", password: "first-password" }, helpers);
    assert.equal((await store.findAdminByEmail(admin.email)).id, admin.id);
    await store.ensureConfiguredAdmin({ email: admin.email, password: "replacement-password" }, helpers);
    assert.equal(verifyPassword("replacement-password", (await store.findAdminById(admin.id)).passwordHash), true);
  });

  test("manages worker records and rejects missing assignment targets", async () => {
    const worker = await store.createWorker({
      name: "Worker One", phone: "+94770000002", serviceArea: "Colombo",
      skills: ["Cleaning"], services: ["Cleaning"]
    });
    assert.equal(worker.active, true);
    assert.equal(worker.availabilityStatus, "AVAILABLE");
    const updated = await store.updateWorker(worker.id, { notes: "Uses company equipment", availabilityStatus: "BUSY" });
    assert.equal(updated.notes, "Uses company equipment");
    assert.equal(updated.availabilityStatus, "BUSY");
    assert.equal((await store.toggleWorkerActive(worker.id)).active, false);
    await assert.rejects(() => store.updateWorker("missing", { name: "Nobody" }), (error) => error.code === "NOT_FOUND");
  });

  test("enforces request scoping, scheduling, assignment, review, and metrics", async () => {
    const customers = await store.listCustomers();
    const customer = customers[0];
    const other = await store.createCustomer({
      name: "Customer Two", phone: "+94770000003", email: "customer.two@example.test",
      passwordHash: hashPassword("customer-two-password")
    });
    const activeWorker = await store.createWorker({ name: "Active Worker", phone: "+94770000004", active: true, skills: ["Cleaning"] });
    const inactiveWorker = await store.createWorker({ name: "Inactive Worker", phone: "+94770000005", active: false, skills: ["Cleaning"] });
    const request = await store.createRequest({
      customerId: customer.id, service: "Cleaning", title: "Clean apartment",
      description: "Clean all rooms.", customerName: customer.name, phone: customer.phone,
      email: customer.email, address: "Colombo 05", preferredDate: "2026-12-01",
      preferredTime: "10:30", photos: ["before.jpg"]
    });
    assert.equal(request.status, "NEW");
    assert.equal((await store.findCustomerRequestById(request.id, other.id)), null);
    assert.equal((await store.listCustomerRequests(customer.id)).length, 1);
    assert.equal((await store.listRequests({ query: request.reference.toLowerCase() })).length, 1);
    assert.equal((await store.listRequests({ query: "not present" })).length, 0);

    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    await assert.rejects(() => store.scheduleRequest(request.id, scheduledAt), (error) => error.code === "CONFLICT");
    await store.updateRequestStatus(request.id, "REVIEWING", "admin_test");
    assert.equal((await store.scheduleRequest(request.id, scheduledAt)).status, "SCHEDULED");
    await assert.rejects(() => store.assignWorkerToRequest(request.id, inactiveWorker.id, null, "admin_test"), (error) => error.code === "CONFLICT");
    const assigned = await store.assignWorkerToRequest(request.id, activeWorker.id, null, "admin_test");
    assert.equal(assigned.status, "ASSIGNED");
    assert.equal(assigned.assignedByAdminId, "admin_test");

    await store.updateRequestStatus(request.id, "IN_PROGRESS", "admin_test");
    await store.updateRequestStatus(request.id, "COMPLETED", "admin_test");
    assert.equal((await store.confirmRequest(request.id, customer.id)).status, "CONFIRMED");
    const review = await store.createReview({ requestId: request.id, customerId: customer.id, rating: 5, comment: "Excellent work." });
    assert.equal(review.workerId, activeWorker.id);
    await assert.rejects(
      () => store.createReview({ requestId: request.id, customerId: customer.id, rating: 4, comment: "Duplicate" }),
      (error) => error.code === "DUPLICATE"
    );
    assert.equal((await store.moderateReview(review.id, "hide", "Policy review", "admin_test")).hidden, true);
    const restored = await store.moderateReview(review.id, "restore", "Approved", "admin_test");
    assert.equal(restored.hidden, false);
    assert.equal(restored.moderation.length, 2);

    const metrics = await store.dashboardMetrics();
    assert(metrics.totalCustomers >= 2);
    assert(metrics.totalWorkers >= 3);
    assert(metrics.completedJobs >= 1);
  });
});
