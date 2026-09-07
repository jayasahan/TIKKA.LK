const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

process.env.TIKKA_ADMIN_EMAIL = "admin.test@example.com";
process.env.TIKKA_ADMIN_PASSWORD = "admin-test-password";

const { createApp } = require("../server");
const { resetSessions } = require("../lib/auth");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appHtml = fs.readFileSync(path.join(root, "app.html"), "utf8");
const providerHtml = fs.readFileSync(path.join(root, "provider.html"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const adminJs = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const buildJs = fs.readFileSync(path.join(root, "scripts", "build.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const serviceData = JSON.parse(
  fs.readFileSync(path.join(root, "data", "services.json"), "utf8")
);

const requiredText = [
  "Someone for every job",
  "Get a Job Done",
  "Become a Service Provider",
  "Tell us what you need.",
  "We find the right person.",
  "Get the job done.",
  "Qualified People",
  "Hassle-Free",
  "Transparent Fees"
];

const services = [
  "Cleaning",
  "Plumbing",
  "Electrical",
  "Repairs",
  "Painting",
  "Handyman",
  "Moving",
  "Gardening"
];

let failed = false;

for (const text of [...requiredText, ...services]) {
  if (!html.includes(text)) {
    console.error(`Missing required content: ${text}`);
    failed = true;
  }
}

for (const service of services) {
  const matchingService = serviceData.find((item) => item.name === service);
  if (!matchingService || !matchingService.code || !matchingService.description) {
    console.error(`Missing structured service data: ${service}`);
    failed = true;
  }
}

if (!html.includes("public/brand/tikka-logo.jpg")) {
  console.error("Official available brand asset is not used.");
  failed = true;
}

if (!css.includes("overflow-x: hidden")) {
  console.error("Global horizontal overflow guard is missing.");
  failed = true;
}

if (!appHtml.includes("data-request-form") || !appHtml.includes("data-request-list")) {
  console.error("Customer workflow UI is missing.");
  failed = true;
}

for (const requiredCustomerMarkup of [
  "data-dashboard-shell",
  "data-auth-shell",
  "data-active-requests",
  "data-upcoming-requests",
  "data-request-detail",
  "data-profile-summary",
  "Request a Service",
  "Assigned Technician"
]) {
  if (!appHtml.includes(requiredCustomerMarkup)) {
    console.error(`Customer dashboard is missing: ${requiredCustomerMarkup}`);
    failed = true;
  }
}

for (const requiredCustomerCode of [
  "loadCurrentUser",
  "renderDashboard",
  "renderActiveRequests",
  "renderRequestHistory",
  "renderRequestDetails",
  "submitServiceRequest",
  "confirmCompletion",
  "submitReview",
  "Request Received",
  "Technician Assigned"
]) {
  const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
  if (!appJs.includes(requiredCustomerCode)) {
    console.error(`Customer dashboard code is missing: ${requiredCustomerCode}`);
    failed = true;
  }
}

if (/independent provider|marketplace|assigned provider|service provider/i.test(appHtml)) {
  console.error("Provider marketplace language remains in the customer portal.");
  failed = true;
}

if (!providerHtml.includes("data-provider-auth-form") || !providerHtml.includes("data-provider-jobs")) {
  console.error("Provider workflow UI is missing.");
  failed = true;
}

if (!adminHtml.includes('data-ops-tab="workers"') || !adminHtml.includes('data-worker-form')) {
  console.error("Admin worker management UI is missing.");
  failed = true;
}

if (adminHtml.includes('data-ops-tab="providers"') || /Pending provider approvals|provider approval/i.test(adminHtml)) {
  console.error("Deprecated provider approval UI remains in the admin dashboard.");
  failed = true;
}

for (const requiredAdminCode of ["/api/admin/workers", "/assign-worker", "/schedule", "SCHEDULED", "data-toggle-worker", "data-moderate-review"]) {
  if (!adminJs.includes(requiredAdminCode)) {
    console.error(`Admin workflow is missing: ${requiredAdminCode}`);
    failed = true;
  }
}

for (const requiredBuiltAsset of ["admin-login.html", "admin.html", "admin.js"]) {
  if (!buildJs.includes(`\"${requiredBuiltAsset}\"`)) {
    console.error(`Build is missing admin asset: ${requiredBuiltAsset}`);
    failed = true;
  }
}

if (!adminJs.includes("error.status = response.status") || !adminJs.includes("error.status === 401 || error.status === 403")) {
  console.error("Admin bootstrap must redirect only for an unauthorized response.");
  failed = true;
}

const productionCookieFlags = childProcess.execFileSync(process.execPath, [
  "-e",
  "process.env.NODE_ENV='production'; const { adminSessionCookie } = require('./lib/auth'); console.log(adminSessionCookie('test').split(';').slice(1).join(';'))"
], { cwd: root, encoding: "utf8" });
if (!productionCookieFlags.includes("Secure")) {
  console.error("Production admin cookies must include Secure.");
  failed = true;
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function request(port, method, pathname, body, cookie, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"] ? res.headers["set-cookie"][0].split(";")[0] : cookie;
        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookie: setCookie,
          body: String(res.headers["content-type"] || "").includes("application/json")
            ? (data ? JSON.parse(data) : {})
            : data
        });
      });
    });

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function futureIso(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function runEndToEnd() {
  resetSessions();
  const dbPath = path.join(os.tmpdir(), `tikka-test-${Date.now()}.json`);
  const server = createApp({ dbPath, storageDriver: "json" });
  const port = await listen(server);

  try {
    let response = await request(port, "GET", "/api/services");
    assertStatus(response, 200, "browse services");
    assert(response.body.services.length === 8, "expected eight services");

    response = await request(port, "POST", "/api/auth/register", {
      name: "Amali Silva",
      phone: "+94771234567",
      email: "amali@example.com",
      password: "password123"
    });
    assertStatus(response, 201, "customer registration");
    const customerCookie = response.cookie;

    response = await request(port, "POST", "/api/requests", {
      service: "Cleaning",
      title: "Apartment cleaning",
      description: "Need a careful clean before moving in.",
      customerName: "Amali Silva",
      phone: "+94771234567",
      email: "amali@example.com",
      address: "Colombo 05",
      preferredDate: "2026-09-01",
      preferredTime: "10:30",
      photos: ["kitchen.jpg"]
    }, customerCookie);
    assertStatus(response, 201, "submit request");
    assert(response.body.message === "Request received.", "confirmation message missing");
    const requestId = response.body.request.id;

    response = await request(port, "GET", `/api/requests/${requestId}`, null, customerCookie);
    assertStatus(response, 200, "retrieve own request");
    assert(response.body.request.status === "NEW", "new request should start at NEW");
    assert(response.body.request.address === "Colombo 05", "customer request should expose service address");

    response = await request(port, "GET", "/api/auth/me", null, customerCookie);
    assertStatus(response, 200, "restore customer session");
    assert(response.body.customer.name === "Amali Silva", "session restore should include customer name");

    response = await request(port, "POST", "/api/auth/register", {
      name: "Different Customer",
      phone: "+94770000000",
      email: "other@example.com",
      password: "password123"
    });
    assertStatus(response, 201, "second customer registration");
    response = await request(port, "GET", `/api/requests/${requestId}`, null, response.cookie);
    assertStatus(response, 404, "server-side ownership protection");

    response = await request(
      port,
      "POST",
      "/api/admin/login",
      {
        email: process.env.TIKKA_ADMIN_EMAIL,
        password: process.env.TIKKA_ADMIN_PASSWORD
      }
    );
    assertStatus(response, 200, "admin login");
    let adminCookie = response.cookie;
    assert(response.headers["set-cookie"][0].includes("HttpOnly"), "admin login should set HttpOnly cookie");
    assert(response.headers["set-cookie"][0].includes("SameSite=Lax"), "admin login should set SameSite=Lax cookie");
    assert(response.headers["set-cookie"][0].includes("Path=/"), "admin login should set root cookie path");
    assert(!response.headers["set-cookie"][0].includes("Secure"), "localhost development must not set Secure admin cookie");

    response = await request(port, "GET", "/api/admin/me", null, adminCookie);
    assertStatus(response, 200, "admin session restore");
    response = await request(port, "GET", "/admin.html", null, adminCookie);
    assertStatus(response, 200, "authenticated admin page refresh");

    response = await request(port, "POST", "/api/admin/login", {
      email: process.env.TIKKA_ADMIN_EMAIL,
      password: "incorrect-password"
    });
    assertStatus(response, 401, "invalid admin login");

    response = await request(port, "POST", "/api/admin/workers", {
      name: "Test Operations Worker",
      phone: "+94774440000",
      serviceArea: "Colombo",
      skills: ["Cleaning"],
      services: ["Cleaning"]
    }, adminCookie);
    assertStatus(response, 201, "admin creates worker");
    const workerId = response.body.worker.id;

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/schedule`,
      { scheduledAt: "not-a-date" },
      adminCookie
    );
    assertStatus(response, 400, "reject invalid schedule date");

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/assign-worker`,
      { workerId },
      adminCookie
    );
    assertStatus(response, 409, "prevent assignment before scheduling");

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/status`,
      { status: "REVIEWING" },
      adminCookie
    );
    assertStatus(response, 200, "transition to REVIEWING");

    const scheduledAt = futureIso();
    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/schedule`,
      { scheduledAt },
      adminCookie
    );
    assertStatus(response, 200, "schedule request");
    assert(response.body.request.status === "SCHEDULED", "scheduled request should be SCHEDULED");
    assert(response.body.request.scheduledAt === scheduledAt, "scheduledAt should be stored");

    response = await request(port, "GET", `/api/requests/${requestId}`, null, customerCookie);
    assertStatus(response, 200, "customer can see scheduled request");
    assert(response.body.request.scheduledAt === scheduledAt, "customer response should include scheduledAt");

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/assign-worker`,
      { workerId },
      adminCookie
    );
    assertStatus(response, 200, "assign worker");
    assert(response.body.request.status === "ASSIGNED", "assigned request should be ASSIGNED");
    assert(response.body.request.assignedWorker.id === workerId, "worker info missing");

    response = await request(port, "GET", `/api/requests/${requestId}`, null, customerCookie);
    assertStatus(response, 200, "customer can see assigned worker");
    assert(response.body.request.assignedWorker.name === "Test Operations Worker", "customer response should include assigned TIKKA technician");

    for (const status of ["IN_PROGRESS", "COMPLETED"]) {
      response = await request(
        port,
        "POST",
        `/api/admin/requests/${requestId}/status`,
        { status },
        adminCookie
      );
      assertStatus(response, 200, `transition to ${status}`);
    }

    response = await request(port, "POST", `/api/requests/${requestId}/confirm`, null, customerCookie);
    assertStatus(response, 200, "confirm completion");
    assert(response.body.request.status === "CONFIRMED", "confirmed request should be CONFIRMED");

    response = await request(port, "POST", `/api/requests/${requestId}/review`, {
      rating: 5,
      comment: "Clean and well coordinated."
    }, customerCookie);
    assertStatus(response, 201, "submit review");

    response = await request(port, "POST", "/api/admin/logout", null, adminCookie);
    assertStatus(response, 200, "admin logout");
    response = await request(port, "GET", "/api/admin/me", null, adminCookie);
    assertStatus(response, 401, "logout invalidates admin session");
    response = await request(port, "POST", "/api/admin/login", {
      email: process.env.TIKKA_ADMIN_EMAIL,
      password: process.env.TIKKA_ADMIN_PASSWORD
    });
    assertStatus(response, 200, "admin login after logout");
    adminCookie = response.cookie;

    response = await request(port, "POST", `/api/requests/${requestId}/review`, {
      rating: 4,
      comment: "Second review should fail."
    }, customerCookie);
    assertStatus(response, 409, "prevent duplicate review");

    response = await request(port, "POST", "/api/providers/register", {
      name: "Kasun Jayawardena",
      phone: "+94775550123",
      email: "kasun.provider@example.com",
      password: "provider123",
      profilePhoto: "kasun.jpg",
      skills: ["Repairs", "Painting"],
      services: ["Repairs", "Painting"],
      serviceArea: "Colombo",
      description: "Careful repair and painting support.",
      experienceYears: 6,
      qualifications: "NVQ maintenance training"
    });
    assertStatus(response, 201, "provider registration");
    assert(response.body.provider.state === "REGISTERED", "provider should start as REGISTERED");
    const providerId = response.body.provider.id;
    const providerCookie = response.cookie;

    response = await request(port, "POST", "/api/providers/verification", null, providerCookie);
    assertStatus(response, 200, "provider verification submission");
    assert(response.body.provider.state === "PENDING_VERIFICATION", "provider should be pending verification");

    response = await request(
      port,
      "POST",
      `/api/admin/providers/${providerId}/state`,
      { state: "APPROVED" },
      adminCookie
    );
    assertStatus(response, 200, "admin approval");
    assert(response.body.provider.state === "APPROVED", "provider should be approved by operator");

    response = await request(port, "POST", "/api/providers/login", {
      email: "kasun.provider@example.com",
      password: "provider123"
    });
    assertStatus(response, 200, "provider login");
    const approvedProviderCookie = response.cookie;

    response = await request(port, "POST", "/api/requests", {
      service: "Repairs",
      title: "Fix pantry cupboard",
      description: "Cupboard hinge is loose and door is dropping.",
      customerName: "Amali Silva",
      phone: "+94771234567",
      email: "amali@example.com",
      address: "Nugegoda",
      preferredDate: "2026-09-03",
      preferredTime: "15:00",
      photos: []
    }, customerCookie);
    assertStatus(response, 201, "submit provider job request");
    const providerJobId = response.body.request.id;

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${providerJobId}/assign`,
      { providerId, scheduledAt: futureIso(8) },
      adminCookie
    );
    assertStatus(response, 200, "assign approved provider");
    assert(response.body.request.assignedProvider.id === providerId, "assigned provider mismatch");

    response = await request(port, "GET", "/api/providers/jobs", null, approvedProviderCookie);
    assertStatus(response, 200, "provider assigned jobs");
    assert(response.body.jobs.some((job) => job.id === providerJobId), "assigned job missing from provider dashboard");

    response = await request(port, "POST", "/api/providers/register", {
      name: "Other Provider",
      phone: "+94775550999",
      email: "other.provider@example.com",
      password: "provider123",
      skills: ["Cleaning"],
      services: ["Cleaning"],
      serviceArea: "Colombo",
      description: "Cleaning support.",
      experienceYears: 2,
      qualifications: "Cleaning experience"
    });
    assertStatus(response, 201, "other provider registration");
    response = await request(port, "GET", "/api/providers/jobs", null, response.cookie);
    assertStatus(response, 200, "other provider cannot list assigned job");
    assert(!response.body.jobs.some((job) => job.id === providerJobId), "unassigned provider should not see another job");

    for (const action of ["accept", "start", "complete"]) {
      response = await request(
        port,
        "POST",
        `/api/providers/jobs/${providerJobId}/${action}`,
        null,
        approvedProviderCookie
      );
      assertStatus(response, 200, `provider ${action}`);
    }
    assert(response.body.job.status === "COMPLETED", "provider should complete the job");

    response = await request(
      port,
      "POST",
      `/api/providers/jobs/${providerJobId}/start`,
      null,
      approvedProviderCookie
    );
    assertStatus(response, 409, "prevent invalid provider transition");
  } finally {
    await close(server);
    fs.rmSync(dbPath, { force: true });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStatus(response, expected, label) {
  assert(response.status === expected, `${label}: expected ${expected}, received ${response.status}`);
}

if (failed) {
  process.exit(1);
}

runEndToEnd()
  .then(() => {
    console.log("Content, customer workflow, and provider workflow tests passed.");
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
