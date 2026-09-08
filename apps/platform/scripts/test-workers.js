const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJsonStore } = require("../lib/json-store");

const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tikka-workers-")), "db.json");
const store = createJsonStore({ dbPath });

(async () => {
  const worker = await store.createWorker({ name: "Test Worker", phone: "+94770000000", skills: ["Repairs"] });
  assert.equal((await store.listWorkers()).length, 1);
  assert.equal((await store.findWorkerById(worker.id)).name, "Test Worker");
  assert.equal((await store.updateWorker(worker.id, { notes: "Test note" })).notes, "Test note");
  assert.equal((await store.toggleWorkerActive(worker.id)).active, false);
  assert.equal((await store.updateWorkerAvailability(worker.id, "BUSY")).availabilityStatus, "BUSY");

  const activeWorker = await store.createWorker({ name: "Active Worker", phone: "+94770000001", skills: ["Repairs"] });
  const request = await store.createRequest({
    customerId: "customer_test",
    service: "Repairs",
    title: "Fix a handle",
    description: "Door handle is loose.",
    customerName: "Test Customer",
    phone: "+94770000002",
    email: "customer.worker.test@example.com",
    address: "Colombo",
    preferredDate: "2026-09-07",
    preferredTime: "10:30",
    photos: []
  });
  const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await assert.rejects(() => store.scheduleRequest(request.id, scheduledAt), /cannot be scheduled/);
  await store.updateRequestStatus(request.id, "REVIEWING", "admin_test");
  const scheduled = await store.scheduleRequest(request.id, scheduledAt);
  assert.equal(scheduled.status, "SCHEDULED");
  assert.equal(scheduled.scheduledAt, scheduledAt);
  const assigned = await store.assignWorkerToRequest(request.id, activeWorker.id, null, "admin_test");
  assert.equal(assigned.status, "ASSIGNED");
  assert.equal(assigned.assignedWorkerId, activeWorker.id);
  console.log("Worker storage tests passed.");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
