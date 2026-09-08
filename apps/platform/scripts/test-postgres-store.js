const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", "..", ".env"),
  quiet: true
});

if (!process.env.DATABASE_URL) {
  console.log("PostgreSQL storage tests skipped: DATABASE_URL is not configured.");
  process.exit(0);
}

const { createPostgresStore } = require("../lib/postgres-store");
const { closePool, query } = require("../lib/postgres");

const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const customerEmail = `pg.customer.${suffix}@example.com`;
const created = {
  customerId: null,
  requestIds: [],
  workerId: null,
  reviewId: null
};

async function tableExists(name) {
  const result = await query(
    "SELECT to_regclass($1) AS table_name",
    [`public.${name}`]
  );
  return Boolean(result.rows[0].table_name);
}

async function cleanup() {
  if (created.reviewId) {
    await query("DELETE FROM review_moderation_events WHERE review_id = $1", [created.reviewId]);
    await query("DELETE FROM reviews WHERE id = $1", [created.reviewId]);
  }
  for (const requestId of created.requestIds) {
    await query("DELETE FROM service_request_photos WHERE service_request_id = $1", [requestId]);
    await query("DELETE FROM service_requests WHERE id = $1", [requestId]);
  }
  if (created.workerId) {
    await query("DELETE FROM worker_services WHERE worker_id = $1", [created.workerId]);
    await query("DELETE FROM worker_skills WHERE worker_id = $1", [created.workerId]);
    await query("DELETE FROM workers WHERE id = $1", [created.workerId]);
  }
  if (created.customerId) {
    await query("DELETE FROM customers WHERE id = $1", [created.customerId]);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  if (!(await tableExists("service_requests"))) {
    console.log("PostgreSQL storage tests skipped: migrations have not been applied.");
    return;
  }

  const store = createPostgresStore();

  const categories = await store.listCategories({ enabledOnly: true });
  assert(categories.some((category) => category.name === "Cleaning"), "expected seeded Cleaning category");

  const customer = await store.createCustomer({
    name: "PG Test Customer",
    phone: "+94770000000",
    email: customerEmail,
    passwordHash: "salt:hash"
  });
  created.customerId = customer.id;
  assert(customer.email === customerEmail, "customer create/read shape mismatch");
  assert((await store.findCustomerByEmail(customerEmail)).id === customer.id, "customer email lookup failed");

  const request = await store.createRequest({
    customerId: customer.id,
    service: "Cleaning",
    title: "PG adapter test request",
    description: "Verify request persistence.",
    customerName: "PG Test Customer",
    phone: "+94770000000",
    email: customerEmail,
    address: "Colombo",
    preferredDate: "2026-09-07",
    preferredTime: "10:30",
    photos: ["before.jpg"]
  });
  created.requestIds.push(request.id);
  assert(request.status === "NEW", "request did not start as NEW");
  assert(request.photos.includes("before.jpg"), "request photo filename was not persisted");

  const worker = await store.createWorker({
    name: "PG Test Worker",
    phone: "+94772222222",
    skills: ["Cleaning"],
    services: ["Cleaning"],
    serviceArea: "Colombo"
  });
  created.workerId = worker.id;
  const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await assertRejects(() => store.scheduleRequest(request.id, scheduledAt), "schedule should reject NEW requests");
  await store.updateRequestStatus(request.id, "REVIEWING", "admin_test");
  const scheduled = await store.scheduleRequest(request.id, scheduledAt);
  assert(scheduled.status === "SCHEDULED", "schedule did not set SCHEDULED");
  assert(scheduled.scheduledAt === scheduledAt, "scheduledAt was not persisted");
  const workerAssigned = await store.assignWorkerToRequest(request.id, worker.id, null, "admin_test");
  assert(workerAssigned.status === "ASSIGNED", "worker assignment did not set ASSIGNED");
  assert(workerAssigned.assignedWorkerId === worker.id, "worker assignment was not persisted");

  await store.updateRequestStatus(request.id, "IN_PROGRESS", "admin_test");
  const completed = await store.updateRequestStatus(request.id, "COMPLETED", "admin_test");
  assert(completed.status === "COMPLETED", "admin completion failed");
  await store.confirmRequest(request.id, customer.id);
  const review = await store.createReview({
    requestId: request.id,
    customerId: customer.id,
    rating: 5,
    comment: "Adapter test review."
  });
  created.reviewId = review.id;
  assert(review.rating === 5, "review create failed");
  assert(review.workerId === worker.id, "review should be attributed to assigned worker");

  const moderated = await store.moderateReview(review.id, "hide", "adapter test", "admin_test");
  assert(moderated.hidden === true, "review moderation failed");

  console.log("PostgreSQL storage adapter tests passed.");
}

async function assertRejects(callback, message) {
  try {
    await callback();
  } catch (error) {
    return;
  }
  throw new Error(message);
}

run()
  .catch(async (error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await closePool();
  });
