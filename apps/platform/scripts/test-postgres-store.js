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
const providerEmail = `pg.provider.${suffix}@example.com`;
const created = {
  customerId: null,
  providerId: null,
  requestId: null,
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
  if (created.requestId) {
    await query("DELETE FROM service_request_photos WHERE service_request_id = $1", [created.requestId]);
    await query("DELETE FROM service_requests WHERE id = $1", [created.requestId]);
  }
  if (created.providerId) {
    await query("DELETE FROM provider_services WHERE provider_id = $1", [created.providerId]);
    await query("DELETE FROM provider_skills WHERE provider_id = $1", [created.providerId]);
    await query("DELETE FROM providers WHERE id = $1", [created.providerId]);
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

  const provider = await store.createProvider({
    name: "PG Test Provider",
    phone: "+94771111111",
    email: providerEmail,
    passwordHash: "salt:hash",
    profileImage: "provider.jpg",
    skills: ["Cleaning"],
    services: ["Cleaning"],
    serviceArea: "Colombo",
    description: "PostgreSQL adapter test provider.",
    experienceYears: 3,
    qualifications: "Adapter test qualification"
  });
  created.providerId = provider.id;
  assert(provider.skills.includes("Cleaning"), "provider skills were not persisted");
  assert(provider.services.includes("Cleaning"), "provider services were not persisted");

  await store.submitProviderVerification(provider.id);
  const approvedProvider = await store.updateProviderState(provider.id, "APPROVED", "admin_test");
  assert(approvedProvider.state === "APPROVED", "provider state update failed");

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
  created.requestId = request.id;
  assert(request.status === "NEW", "request did not start as NEW");
  assert(request.photos.includes("before.jpg"), "request photo filename was not persisted");

  await store.assignProvider(request.id, provider.id, "2026-09-07T10:30:00.000Z", "admin_test");
  await store.providerJobAction(request.id, provider.id, "accept");
  await store.providerJobAction(request.id, provider.id, "start");
  const completed = await store.providerJobAction(request.id, provider.id, "complete");
  assert(completed.status === "COMPLETED", "provider completion failed");
  assert((await store.findProviderById(provider.id)).completedJobs === 1, "completed_jobs aggregate was not updated");

  await store.confirmRequest(request.id, customer.id);
  const review = await store.createReview({
    requestId: request.id,
    customerId: customer.id,
    rating: 5,
    comment: "Adapter test review."
  });
  created.reviewId = review.id;
  assert(review.rating === 5, "review create failed");
  assert((await store.findProviderById(provider.id)).rating === 5, "provider rating aggregate was not updated");

  const moderated = await store.moderateReview(review.id, "hide", "adapter test", "admin_test");
  assert(moderated.hidden === true, "review moderation failed");

  console.log("PostgreSQL storage adapter tests passed.");
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
