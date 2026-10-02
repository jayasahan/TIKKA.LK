const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
// Deliberate test credentials; no production configuration/data is used.
process.env.TIKKA_ADMIN_EMAIL = "cutover.admin@example.test";
process.env.TIKKA_ADMIN_PASSWORD = "cutover-admin-test-only";
const { createApp } = require("../server");
const { createJsonStore } = require("../lib/json-store");
const { hashPassword } = require("../lib/auth");

const listen = async (server) => {
  await server.ready;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
async function fixture(store) {
  const customer = await store.createCustomer({ name: "QA Customer", phone: "+94770000000", email: "cutover.customer@example.test", passwordHash: hashPassword("cutover-customer-test-only") });
  const worker = await store.createWorker({ name: "QA Technician", phone: "+94770000001", serviceArea: "Colombo", skills: ["Plumbing", "Repairs"], services: ["Plumbing"] });
  await store.createWorker({ name: "QA Busy Worker", phone: "+94770000002", serviceArea: "Gampaha", availabilityStatus: "BUSY", skills: ["Cleaning"], services: ["Cleaning"] });
  const completed = await store.createRequest({ customerId: customer.id, customerName: customer.name, email: customer.email, phone: customer.phone, service: "Plumbing", title: "Kitchen tap repair", description: "Repair the leaking kitchen tap and check the water connection.", address: "QA test address, Colombo", preferredDate: "2026-11-02", preferredTime: "10:30", photos: [] });
  const scheduled = await store.createRequest({ customerId: customer.id, customerName: customer.name, email: customer.email, phone: customer.phone, service: "Cleaning", title: "Home cleaning", description: "Clean a small house after maintenance work.", address: "QA test address, Colombo", preferredDate: "2026-11-03", preferredTime: "09:00", photos: [] });
  const fresh = await store.createRequest({ customerId: customer.id, customerName: customer.name, email: customer.email, phone: customer.phone, service: "Repairs", title: "Repair cabinet door", description: "Repair the loose hinge on the cabinet door.", address: "QA test address, Colombo", preferredDate: "2026-11-04", preferredTime: "14:00", photos: [] });
  await store.update((db) => {
    for (const job of db.requests) {
      if (job.id === completed.id) { job.status = "COMPLETED"; job.assignedWorkerId = worker.id; job.scheduledAt = "2026-11-02T05:00:00.000Z"; job.reference = "TIKKA-QA-001"; }
      if (job.id === scheduled.id) { job.status = "SCHEDULED"; job.scheduledAt = "2026-11-03T03:30:00.000Z"; job.reference = "TIKKA-QA-002"; }
      if (job.id === fresh.id) job.reference = "TIKKA-QA-003";
    }
  });
  return { customer, worker, completed, fresh };
}

async function run({ visual = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tikka-r6-1-"));
  const store = createJsonStore({ dbPath: path.join(temp, "db.json") });
  const records = await fixture(store);
  const server = createApp({ store });
  const checks = [];
  let visualReport;
  try {
    const origin = await listen(server);
    const request = (url, init = {}) => fetch(`${origin}${url}`, { ...init, redirect: "manual" });
    const check = (name, condition) => { assert(condition, name); checks.push(name); };
    for (const route of ["/", "/app.html", "/app.html#requests", "/app.html?service=Plumbing#request", "/admin-login.html", "/admin.html", "/admin.html#requests"]) {
      const response = await request(route);
      check(`Direct document ${route}`, response.status === 200 && (await response.text()).includes('<div id="root"></div>'));
    }
    const document = await (await request("/")).text();
    for (const marker of ["<title>TIKKA", 'name="description"', 'rel="canonical"', 'name="robots"', 'lang="en"', 'name="viewport"']) check(`SEO ${marker}`, document.includes(marker));
    check("Public body is client rendered", !document.includes("Everyday help, handled properly"));
    const assets = [...document.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1]);
    for (const asset of [...assets, "/public/brand/tikka-logo.jpg", "/public/hero/plumbing.jpg", "/robots.txt", "/sitemap.xml"]) {
      const response = await request(asset);
      check(`Static ${asset}`, response.status === 200 && (await response.arrayBuffer()).byteLength > 0);
    }
    for (const route of ["/unknown-page", "/assets/missing.js", "/script.js", "/app.js", "/admin.js", "/forms.js", "/ui.js", "/assets/..%2F..%2Fserver.js"]) {
      check(`No universal fallback ${route}`, (await request(route)).status === 404);
    }
    let response = await request("/health");
    check("Backend health precedence", response.status === 200 && (await response.json()).status === "ok");
    response = await request("/api/services");
    check("Backend services precedence", response.status === 200 && (await response.json()).services.length === 8);
    for (const method of ["GET", "POST"]) {
      response = await request("/api/this-does-not-exist", { method });
      check(`Unknown ${method} API remains JSON 404`, response.status === 404 && response.headers.get("content-type").includes("application/json") && (await response.json()).error === "API route not found.");
    }
    response = await request("/api/admin/workers");
    check("Unauthenticated admin data refused", response.status === 401);
    const login = async (route, credentials) => {
      const response = await request(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
      assert.equal(response.status, 200);
      return { cookie: response.headers.get("set-cookie").split(";")[0], payload: await response.json() };
    };
    const admin = await login("/api/admin/login", { email: process.env.TIKKA_ADMIN_EMAIL, password: process.env.TIKKA_ADMIN_PASSWORD });
    const customer = await login("/api/auth/login", { email: records.customer.email, password: "cutover-customer-test-only" });
    check("Safe backend POST login works", Boolean(admin.payload.csrfToken && customer.payload.csrfToken));
    response = await request("/api/admin/workers", { headers: { Cookie: customer.cookie } });
    check("Customer session cannot authorize admin", response.status === 401);
    response = await request(`/api/admin/workers/${records.worker.id}/availability`, { method: "POST", headers: { Cookie: admin.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ availabilityStatus: "BUSY" }) });
    check("Backend CSRF remains enforced", response.status === 403);
    response = await request(`/api/admin/workers/${records.worker.id}/availability`, { method: "POST", headers: { Cookie: admin.cookie, "Content-Type": "application/json", "X-CSRF-Token": admin.payload.csrfToken }, body: JSON.stringify({ availabilityStatus: "BUSY" }) });
    check("Safe backend mutation passes preview with cookie/CSRF", response.status === 200 && (await response.json()).worker.availabilityStatus === "BUSY");
    await store.updateWorkerAvailability(records.worker.id, "AVAILABLE");
    response = await request("/", { method: "HEAD" });
    check("Production frontend remains served by Node", response.status === 200);
    for (const asset of assets.filter((item) => item.endsWith(".js"))) {
      const code = await (await request(asset)).text();
      check("Production bundle excludes test crash trigger and credential markers", !/TEST_ONLY_CRASH|TEST_ONLY_ROUTE_CRASH|cutover-admin-test-only|DATABASE_URL|TIKKA_ADMIN_PASSWORD|VITE_[A-Z_]*SECRET/.test(code));
    }
    console.log(`Production Node routing/security checks passed (${checks.length}).`);
    if (visual) {
      visualReport = await require("./test-react-visual").run({ origin, legacyOrigin: origin, admin, customer });
    }
    return { checks, visual: visualReport };
  } finally {
    await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
    if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith("tikka-r6-1-")) fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (require.main === module) run({ visual: process.argv.includes("--visual") }).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { run };
