const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");
const { resetSessions } = require("../lib/auth");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appHtml = fs.readFileSync(path.join(root, "app.html"), "utf8");
const providerHtml = fs.readFileSync(path.join(root, "provider.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const serviceData = JSON.parse(
  fs.readFileSync(path.join(root, "data", "services.json"), "utf8")
);

const requiredText = [
  "Someone for every job.",
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

if (!providerHtml.includes("data-provider-auth-form") || !providerHtml.includes("data-provider-jobs")) {
  console.error("Provider workflow UI is missing.");
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
          body: data ? JSON.parse(data) : {}
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

async function runEndToEnd() {
  resetSessions();
  const dbPath = path.join(os.tmpdir(), `tikka-test-${Date.now()}.json`);
  const server = createApp({ dbPath });
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
      `/api/operator/requests/${requestId}/assign`,
      { providerId: "provider-sunil", scheduledAt: "2026-09-01T10:30:00.000Z" },
      null,
      { "X-TIKKA-OPERATOR-TOKEN": "dev-operator-token" }
    );
    assertStatus(response, 200, "assign provider placeholder");
    assert(response.body.request.status === "ASSIGNED", "assigned request should be ASSIGNED");
    assert(response.body.request.assignedProvider.name === "Sunil Perera", "provider info missing");

    for (const status of ["ACCEPTED", "IN_PROGRESS", "COMPLETED"]) {
      response = await request(
        port,
        "POST",
        `/api/operator/requests/${requestId}/status`,
        { status },
        null,
        { "X-TIKKA-OPERATOR-TOKEN": "dev-operator-token" }
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
      `/api/operator/providers/${providerId}/state`,
      { state: "APPROVED" },
      null,
      { "X-TIKKA-OPERATOR-TOKEN": "dev-operator-token" }
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
      `/api/operator/requests/${providerJobId}/assign`,
      { providerId, scheduledAt: "2026-09-03T15:00:00.000Z" },
      null,
      { "X-TIKKA-OPERATOR-TOKEN": "dev-operator-token" }
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
