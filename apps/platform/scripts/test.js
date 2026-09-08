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
  "Browse Services",
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

for (const removedBuiltAsset of ["provider.html", "provider.js"]) {
  if (buildJs.includes(`\"${removedBuiltAsset}\"`)) {
    console.error(`Build still includes removed provider asset: ${removedBuiltAsset}`);
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

const productionStorageDefault = childProcess.spawnSync(process.execPath, [
  "-e",
  "process.env.NODE_ENV='production'; process.env.TIKKA_STORAGE_DRIVER=''; process.env.DATABASE_URL=''; try { require('./lib/storage').createStorage(); process.exit(1); } catch (error) { console.log(error.message); }"
], { cwd: root, encoding: "utf8" });
if (!productionStorageDefault.stdout.includes("DATABASE_URL is required when TIKKA_STORAGE_DRIVER=postgres")) {
  console.error("Production storage must default to PostgreSQL when no driver is configured.");
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

function csrfHeader(token) {
  return { "X-CSRF-Token": token };
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
    assert(response.headers["x-content-type-options"] === "nosniff", "API responses must include nosniff");
    assert(response.headers["referrer-policy"] === "strict-origin-when-cross-origin", "API responses must include referrer policy");
    assert(response.headers["x-frame-options"] === "SAMEORIGIN", "API responses must include frame protection");

    response = await request(port, "GET", "/health");
    assertStatus(response, 200, "health endpoint");
    assert(response.body.status === "ok", "health endpoint should return safe ok status");
    assert(response.headers["x-content-type-options"] === "nosniff", "health response must include security headers");

    response = await request(port, "GET", "/");
    assertStatus(response, 200, "serve landing page");
    assert(response.headers["x-content-type-options"] === "nosniff", "static responses must include security headers");

    response = await request(port, "GET", "/provider.html");
    assertStatus(response, 404, "removed provider page");
    response = await request(port, "GET", "/provider.js");
    assertStatus(response, 404, "removed provider script");
    response = await request(port, "POST", "/api/providers/register", {
      name: "Kasun Jayawardena",
      phone: "+94775550123",
      email: "kasun.provider@example.com",
      password: "provider123"
    });
    assertStatus(response, 404, "removed provider registration API");
    response = await request(port, "POST", "/api/providers/login", {
      email: "kasun.provider@example.com",
      password: "provider123"
    });
    assertStatus(response, 404, "removed provider login API");
    response = await request(port, "GET", "/api/providers/me");
    assertStatus(response, 404, "removed provider session API");
    response = await request(port, "GET", "/api/providers/jobs");
    assertStatus(response, 404, "removed provider jobs API");

    response = await request(port, "POST", "/api/auth/register", {
      name: "Amali Silva",
      phone: "+94771234567",
      email: "amali@example.com",
      password: "password123"
    });
    assertStatus(response, 201, "customer registration");
    const customerCookie = response.cookie;
    let customerCsrf = response.body.csrfToken;
    assert(customerCsrf, "customer registration should return CSRF token");

    response = await request(port, "POST", "/api/auth/login", {
      email: "amali@example.com",
      password: "wrong-password"
    });
    assertStatus(response, 401, "failed customer login");
    response = await request(port, "POST", "/api/auth/login", {
      email: "amali@example.com",
      password: "wrong-password"
    });
    assertStatus(response, 401, "second failed customer login");
    response = await request(port, "POST", "/api/auth/login", {
      email: "amali@example.com",
      password: "wrong-password"
    });
    assertStatus(response, 401, "third failed customer login");
    response = await request(port, "POST", "/api/auth/login", {
      email: "amali@example.com",
      password: "wrong-password"
    });
    assertStatus(response, 401, "fourth failed customer login");
    response = await request(port, "POST", "/api/auth/login", {
      email: "amali@example.com",
      password: "password123"
    });
    assertStatus(response, 200, "successful login resets customer rate limit");
    response = await request(port, "POST", "/api/auth/login", {
      email: "amali@example.com",
      password: "wrong-password"
    });
    assertStatus(response, 401, "customer login remains usable after reset");

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
    assertStatus(response, 403, "customer protected POST without CSRF");

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
    }, customerCookie, { "X-CSRF-Token": "invalid" });
    assertStatus(response, 403, "customer protected POST with invalid CSRF");

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
    }, customerCookie, csrfHeader(customerCsrf));
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
    customerCsrf = response.body.csrfToken;
    assert(customerCsrf, "customer session restore should include CSRF token");

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
    let adminCsrf = response.body.csrfToken;
    assert(adminCsrf, "admin login should return CSRF token");
    assert(response.headers["set-cookie"][0].includes("HttpOnly"), "admin login should set HttpOnly cookie");
    assert(response.headers["set-cookie"][0].includes("SameSite=Lax"), "admin login should set SameSite=Lax cookie");
    assert(response.headers["set-cookie"][0].includes("Path=/"), "admin login should set root cookie path");
    assert(!response.headers["set-cookie"][0].includes("Secure"), "localhost development must not set Secure admin cookie");

    response = await request(port, "GET", "/api/admin/me", null, adminCookie);
    assertStatus(response, 200, "admin session restore");
    adminCsrf = response.body.csrfToken;
    assert(adminCsrf, "admin session restore should include CSRF token");
    response = await request(port, "GET", "/admin.html", null, adminCookie);
    assertStatus(response, 200, "authenticated admin page refresh");

    response = await request(port, "POST", "/api/admin/login", {
      email: process.env.TIKKA_ADMIN_EMAIL,
      password: "incorrect-password"
    });
    assertStatus(response, 401, "invalid admin login");

    for (let index = 0; index < 5; index += 1) {
      response = await request(port, "POST", "/api/admin/login", {
        email: "missing-admin@example.com",
        password: "incorrect-password"
      }, null, { "X-Forwarded-For": `203.0.113.${index + 1}` });
      assertStatus(response, 401, "failed admin login does not reveal account existence");
    }
    response = await request(port, "POST", "/api/admin/login", {
      email: "missing-admin@example.com",
      password: "incorrect-password"
    }, null, { "X-Forwarded-For": "203.0.113.99" });
    assertStatus(response, 429, "repeated failed admin login eventually rate limited");
    assert(response.body.error === "Too many attempts. Please try again later.", "rate limit message should be safe");

    response = await request(port, "POST", "/api/admin/workers", {
      name: "Test Operations Worker",
      phone: "+94774440000",
      serviceArea: "Colombo",
      skills: ["Cleaning"],
      services: ["Cleaning"]
    }, adminCookie);
    assertStatus(response, 403, "admin protected POST without CSRF");

    response = await request(port, "POST", "/api/admin/workers", {
      name: "Test Operations Worker",
      phone: "+94774440000",
      serviceArea: "Colombo",
      skills: ["Cleaning"],
      services: ["Cleaning"]
    }, adminCookie, { "X-CSRF-Token": "invalid" });
    assertStatus(response, 403, "admin protected POST with invalid CSRF");

    response = await request(port, "POST", "/api/admin/workers", {
      name: "Test Operations Worker",
      phone: "+94774440000",
      serviceArea: "Colombo",
      skills: ["Cleaning"],
      services: ["Cleaning"]
    }, adminCookie, csrfHeader(adminCsrf));
    assertStatus(response, 201, "admin creates worker");
    const workerId = response.body.worker.id;

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/schedule`,
      { scheduledAt: "not-a-date" },
      adminCookie,
      csrfHeader(adminCsrf)
    );
    assertStatus(response, 400, "reject invalid schedule date");

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/assign-worker`,
      { workerId },
      adminCookie,
      csrfHeader(adminCsrf)
    );
    assertStatus(response, 409, "prevent assignment before scheduling");

    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/status`,
      { status: "REVIEWING" },
      adminCookie,
      csrfHeader(adminCsrf)
    );
    assertStatus(response, 200, "transition to REVIEWING");

    const scheduledAt = futureIso();
    response = await request(
      port,
      "POST",
      `/api/admin/requests/${requestId}/schedule`,
      { scheduledAt },
      adminCookie,
      csrfHeader(adminCsrf)
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
      adminCookie,
      csrfHeader(adminCsrf)
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
        adminCookie,
        csrfHeader(adminCsrf)
      );
      assertStatus(response, 200, `transition to ${status}`);
    }

    response = await request(port, "POST", `/api/requests/${requestId}/confirm`, null, customerCookie);
    assertStatus(response, 403, "customer confirm without CSRF");
    response = await request(port, "POST", `/api/requests/${requestId}/confirm`, null, customerCookie, csrfHeader(customerCsrf));
    assertStatus(response, 200, "confirm completion");
    assert(response.body.request.status === "CONFIRMED", "confirmed request should be CONFIRMED");

    response = await request(port, "POST", `/api/requests/${requestId}/review`, {
      rating: 5,
      comment: "Clean and well coordinated."
    }, customerCookie, csrfHeader(customerCsrf));
    assertStatus(response, 201, "submit review");

    response = await request(port, "POST", "/api/admin/logout", null, adminCookie);
    assertStatus(response, 403, "admin logout without CSRF");
    response = await request(port, "POST", "/api/admin/logout", null, adminCookie, csrfHeader(adminCsrf));
    assertStatus(response, 200, "admin logout");
    response = await request(port, "GET", "/api/admin/me", null, adminCookie);
    assertStatus(response, 401, "logout invalidates admin session");
    response = await request(port, "POST", "/api/admin/login", {
      email: process.env.TIKKA_ADMIN_EMAIL,
      password: process.env.TIKKA_ADMIN_PASSWORD
    });
    assertStatus(response, 200, "admin login after logout");
    adminCookie = response.cookie;
    adminCsrf = response.body.csrfToken;

    response = await request(port, "POST", `/api/requests/${requestId}/review`, {
      rating: 4,
      comment: "Second review should fail."
    }, customerCookie, csrfHeader(customerCsrf));
    assertStatus(response, 409, "prevent duplicate review");

    response = await request(port, "POST", "/api/admin/providers/provider-test/state", { state: "APPROVED" }, adminCookie, csrfHeader(adminCsrf));
    assertStatus(response, 404, "removed admin provider approval API");
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
    console.log("Content, customer, admin, worker, and provider-removal tests passed.");
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
