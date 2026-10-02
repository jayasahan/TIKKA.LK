import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AdminPage from "../../../src/pages/AdminPage.jsx";
import PublicPage from "../../../src/pages/PublicPage.jsx";
import CustomerPage from "../../../src/pages/CustomerPage.jsx";
import { AppErrorBoundary } from "../../../src/app/App.jsx";
import AppFailure from "../../../src/components/AppFailure.jsx";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { normalLifecycle, statusLabel, statusTone } from "../../../src/features/customer/status.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
const tests = [];
const container = document.getElementById("root");
let root;
let fixture;
let options;
let posts;
let reads;
let saved;
let release;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, label) => {
  if (Object.is(actual, expected)) return;
  if (actual instanceof Node || expected instanceof Node) throw new Error(`${label}: DOM nodes differ`);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
};
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const byLabel = (label) => {
  const target = [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === label);
  assert(target, `Missing button: ${label}`);
  return target;
};
const dialog = () => container.querySelector("dialog[open]");
const message = () => container.querySelector("main > .alert:not([hidden])");
// Response.text() and React effects can settle in later browser tasks.
// Poll observable UI; no artificial delays are introduced in the application.
const settle = async () => {
  for (let attempt = 0; attempt < 6; attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};
const click = async (target) => { await act(async () => { target.focus(); target.click(); }); await settle(); };
const cancel = async () => click(dialog().querySelector('button[type="button"]'));
const confirm = async () => click(dialog().querySelector('button[type="submit"]'));
const workerButton = (action) => byLabel(`${action}: Test Worker`);
const reviewButton = (action) => byLabel(`${action} review: TIK-001`);

window.fetch = async (url, init = {}) => {
  const method = init.method || "GET";
  if (options.customerMode) {
    if (method === "GET") {
      reads.push(url);
      if (url === "/api/auth/me") return options.loggedIn ? json({ customer: fixture.customer, csrfToken: "customer-csrf" }) : json({ error: "Please log in to continue." }, 401);
      if (url === "/api/services") return json({ services: [{ name: "Plumbing" }, { name: "Cleaning" }, { name: "Electrical" }, { name: "Painting" }] });
      if (url === "/api/requests") return json({ requests: fixture.jobs });
      throw new Error(`Unexpected customer GET ${url}`);
    }
    const payload = init.body === undefined ? undefined : JSON.parse(init.body);
    posts.push({ url, method, payload, credentials: init.credentials, headers: Object.fromEntries(init.headers) });
    if (url === "/api/auth/login") return json({ customer: fixture.customer, csrfToken: "customer-csrf" });
    if (url === "/api/requests") {
      const request = { id: "request-new", reference: "TIK-NEW", title: payload.title, service: payload.service, status: "NEW", customerId: fixture.customer.id, submittedAt: new Date().toISOString(), ...payload };
      fixture.jobs = [request, ...fixture.jobs];
      return json({ request, message: "Request submitted." }, 201);
    }
    throw new Error(`Unexpected customer mutation ${method} ${url}`);
  }
  if (method === "GET") {
    reads.push(url);
    if (saved && options.failRefresh) return json({ error: "Reload unavailable." }, 503);
    const payload = {
      "/api/admin/me": { admin: { id: "admin-1", name: "Test Admin" }, csrfToken: "test-csrf" },
      "/api/admin/dashboard": { dashboard: {} },
      "/api/admin/requests": { requests: fixture.jobs },
      "/api/admin/workers": { workers: fixture.workers },
      "/api/admin/customers": { customers: fixture.customers },
      "/api/admin/reviews": { reviews: fixture.reviews },
      "/api/admin/categories": { categories: [] }
    }[url];
    assert(payload, `Unexpected GET ${url}`);
    return json(payload);
  }
  const payload = init.body === undefined ? undefined : JSON.parse(init.body);
  posts.push({ url, method, payload, credentials: init.credentials, headers: Object.fromEntries(init.headers) });
  if (options.holdMutation) await new Promise((resolve) => { release = resolve; });
  if (options.networkFailure) throw new TypeError("Network unavailable");
  if (options.failMutation) return json(options.errorPayload || { error: "Mutation rejected." }, options.failMutation);
  const worker = fixture.workers[0];
  const review = fixture.reviews[0];
  let response;
  if (url === "/api/admin/workers/worker-1/availability") {
    assert(["AVAILABLE", "BUSY"].includes(payload.availabilityStatus), "UI must only offer legacy availability transitions");
    worker.availabilityStatus = payload.availabilityStatus;
    response = { worker };
  } else if (url === "/api/admin/workers/worker-1/toggle-active") {
    equal(payload, undefined, "Toggle has no payload, matching legacy");
    worker.active = !worker.active;
    response = { worker };
  } else if (url === "/api/admin/reviews/review-1/moderate") {
    assert(["hide", "restore"].includes(payload.action), "Backend only accepts hide/restore");
    review.hidden = payload.action === "hide";
    response = { review };
  } else throw new Error(`Unexpected mutation ${method} ${url}`);
  saved = true;
  return json(response);
};

async function mount(area, config = {}, changes = {}) {
  if (root) await act(async () => root.unmount());
  options = config;
  posts = []; reads = []; saved = false; release = null;
  fixture = {
    workers: [{ id: "worker-1", name: "Test Worker", phone: "+94770000000", skills: [], services: [], active: true, availabilityStatus: "AVAILABLE", completedJobs: 0, ...changes.worker }],
    customers: [{ id: "customer-1", name: "Test Customer" }],
    jobs: [{ id: "request-1", reference: "TIK-001", service: "Plumbing", customerId: "customer-1", status: "CONFIRMED" }],
    reviews: [{ id: "review-1", requestId: "request-1", reference: "TIK-001", customerId: "customer-1", rating: 5, comment: "Helpful service", hidden: false, ...changes.review }],
    customer: { id: "customer-1", name: "Test Customer", email: "customer@example.com", phone: "+94770000000" }
  };
  history.replaceState(null, "", `/#${area}`);
  root = createRoot(container);
  await act(async () => root.render(<StrictMode><AdminPage /></StrictMode>));
  await settle();
  assert(container.querySelector(".ops-table"), `Operations loaded under StrictMode: ${container.textContent}`);
  equal(posts.length, 0, "Rendering/effects must not mutate");
}

async function mountCustomer(config = {}, url = "/app.html?service=Plumbing#request") {
  if (root) await act(async () => root.unmount());
  options = { customerMode: true, ...config };
  posts = []; reads = []; saved = false;
  fixture = { customer: { id: "customer-1", name: "Test Customer", email: "customer@example.com", phone: "+94770000000" }, jobs: [{ id: "request-1", reference: "TIK-001", title: "Fix tap", service: "Plumbing", customerId: "customer-1", status: "COMPLETED", submittedAt: new Date().toISOString() }] };
  history.replaceState(null, "", url);
  root = createRoot(container);
  await act(async () => root.render(<StrictMode><CustomerPage /></StrictMode>));
  await settle();
}

function contract(url, payload) {
  equal(posts.length, 1, "One explicit mutation");
  equal(posts[0].url, url, "Endpoint");
  equal(posts[0].method, "POST", "Method");
  equal(posts[0].payload, payload, "Payload");
  equal(posts[0].credentials, "include", "Session credentials");
  equal(posts[0].headers["x-csrf-token"], "test-csrf", "CSRF token from session");
  assert(!posts[0].headers.authorization, "No bearer/authorization header");
}

function namedDialog(context) {
  const node = dialog();
  assert(node, "Confirmation is open");
  assert(container.querySelector(`#${CSS.escape(node.getAttribute("aria-labelledby"))}`)?.textContent.includes(context), "Contextual accessible dialog title");
  assert(container.querySelector(`#${CSS.escape(node.getAttribute("aria-describedby"))}`)?.textContent, "Accessible dialog description");
  assert(node.querySelector('button[type="submit"]').classList.contains("button--danger"), "Destructive confirm style");
  equal(document.activeElement.textContent, "Cancel", "Initial focus is safe cancel action");
  equal(posts.length, 0, "Opening a dialog must not mutate");
}

async function test(name, action) {
  try { await action(); tests.push({ name }); }
  catch (error) { tests.push({ name, error: error.stack || error.message }); }
}

async function main() {
  await test("Runtime application boundary catches a test-only render crash safely", async () => {
    if (root) await act(async () => root.unmount());
    function TestOnlyCrash() { throw new Error("TEST_ONLY_CRASH confidential_database_stack"); }
    root = createRoot(container);
    await act(async () => root.render(<AppErrorBoundary><TestOnlyCrash /></AppErrorBoundary>));
    assert(container.textContent.includes("Something went wrong."), "Boundary fallback renders");
    assert(!/TEST_ONLY_CRASH|confidential_database_stack|at TestOnlyCrash/.test(container.textContent), "No stack/details shown");
  });
  await test("Runtime route boundary uses the safe fallback instead of Router's stack UI", async () => {
    if (root) await act(async () => root.unmount());
    function TestOnlyCrash() { throw new Error("TEST_ONLY_ROUTE_CRASH confidential_database_stack"); }
    const testRouter = createMemoryRouter([{ path: "/", element: <TestOnlyCrash />, errorElement: <AppFailure /> }]);
    root = createRoot(container);
    await act(async () => root.render(<RouterProvider router={testRouter} />));
    assert(container.textContent.includes("Something went wrong."), "Route fallback renders");
    assert(!/TEST_ONLY_ROUTE_CRASH|confidential_database_stack/.test(container.textContent), "No route stack/details shown");
    testRouter.dispose();
  });
  await test("Public React structure and branded splash render", async () => {
    if (root) await act(async () => root.unmount());
    options = {};
    history.replaceState(null, "", "/#home");
    root = createRoot(container);
    await act(async () => root.render(<StrictMode><PublicPage /></StrictMode>));
    await settle();
    assert(container.querySelector(".page-splash"), "Branded splash exists");
    for (const id of ["main", "services", "how-it-works", "trust", "support"]) assert(container.querySelector(`#${id}`), `Public section #${id}`);
    assert(container.textContent.includes("Get a Job Done") || container.textContent.includes("Start a Request"), "Primary conversion CTA");
  });
  await test("Logged-out customer preserves service intent through login", async () => {
    await mountCustomer({ loggedIn: false });
    assert(container.querySelector(".customer-auth"), "Auth panel shown without content flash");
    const email = container.querySelector('input[name="email"]');
    const password = container.querySelector('input[name="password"]');
    await act(async () => { email.value = "customer@example.com"; email.dispatchEvent(new Event("input", { bubbles: true })); password.value = "password123"; password.dispatchEvent(new Event("input", { bubbles: true })); });
    await click(container.querySelector('button[type="submit"]'));
    assert(container.querySelector('select[name="service"]')?.value === "Plumbing", "Plumbing intent survives login");
    assert(window.location.hash === "#request", "Request destination survives login");
    assert(posts.filter((item) => item.url === "/api/auth/login").length === 1, "One login mutation");
  });
  await test("Customer request form retains Sri Lanka time guidance and disabled photo state", async () => {
    await mountCustomer({ loggedIn: true });
    assert(container.querySelector('input[name="photos"]')?.disabled, "Photo upload remains intentionally unavailable");
    assert(container.textContent.includes("Sri Lanka local time"), "Local-time guidance");
    assert(container.querySelector('button[type="submit"]')?.textContent.includes("Submit request"), "Request CTA");
  });
  await test("Worker availability AVAILABLE to BUSY, with CSRF and credentials", async () => {
    await mount("workers");
    const trigger = workerButton("Set busy");
    await click(trigger);
    assert(!dialog(), "Availability does not ask for confirmation");
    contract("/api/admin/workers/worker-1/availability", { availabilityStatus: "BUSY" });
    workerButton("Set available");
    assert(message()?.textContent === "Worker updated.", "Success feedback");
    assert(reads.filter((url) => url === "/api/admin/workers").length >= 2, "Reload after mutation");
    equal(document.activeElement, trigger, "Focus remains on action");
  });
  for (const state of ["BUSY", "UNAVAILABLE"]) await test(`Legacy ${state} to AVAILABLE action`, async () => {
    await mount("workers", {}, { worker: { availabilityStatus: state } });
    await click(workerButton("Set available"));
    contract("/api/admin/workers/worker-1/availability", { availabilityStatus: "AVAILABLE" });
    workerButton("Set busy");
  });
  await test("Deactivate confirmation cancellation and Escape restore focus", async () => {
    await mount("workers");
    const trigger = workerButton("Mark inactive");
    await click(trigger); namedDialog("Test Worker");
    assert(dialog().textContent.includes("no longer be available for new assignments"), "Explains consequence");
    await cancel(); assert(!dialog(), "Cancel closes dialog");
    equal(document.activeElement, trigger, "Cancel restores trigger focus");
    await click(trigger);
    await act(async () => dialog().dispatchEvent(new Event("cancel", { cancelable: true })));
    equal(document.activeElement, trigger, "Escape/cancel event restores focus");
    equal(posts.length, 0, "Neither cancellation mutated");
  });
  await test("Confirmed deactivation, busy guard, duplicate confirmation, focus", async () => {
    await mount("workers", { holdMutation: true });
    const trigger = workerButton("Mark inactive");
    await click(trigger); namedDialog("Test Worker");
    const form = dialog().querySelector("form");
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    contract("/api/admin/workers/worker-1/toggle-active", undefined);
    assert(trigger.disabled && trigger.textContent === "Updating...", "Busy action is disabled");
    assert(workerButton("Set busy").disabled, "Conflicting action disabled");
    await act(async () => release());
    workerButton("Mark active");
    equal(document.activeElement, trigger, "Focus restored after busy completes");
    assert(!dialog(), "Dialog closed");
  });
  await test("Inactive to active is immediate and has no destructive dialog", async () => {
    await mount("workers", {}, { worker: { active: false } });
    await click(workerButton("Mark active"));
    contract("/api/admin/workers/worker-1/toggle-active", undefined);
    assert(!dialog(), "Activation is routine");
    workerButton("Mark inactive");
  });
  await test("Same-tick availability double click sends one mutation", async () => {
    await mount("workers", { holdMutation: true });
    const trigger = workerButton("Set busy");
    await act(async () => { trigger.click(); trigger.click(); });
    equal(posts.length, 1, "Ref guard blocks stale event handler");
    await act(async () => release());
  });
  for (const kind of ["availability", "deactivation", "activation"]) {
    await test(`Failed worker ${kind} preserves data and exposes error`, async () => {
      await mount("workers", { failMutation: 400 }, { worker: { active: kind !== "activation" } });
      const count = reads.length;
      await click(workerButton(kind === "availability" ? "Set busy" : kind === "activation" ? "Mark active" : "Mark inactive"));
      if (kind === "deactivation") await confirm();
      equal(reads.length, count, "Failed mutation is not refreshed");
      assert(message()?.getAttribute("role") === "alert" && message().textContent === "Mutation rejected.", "Mutation error announced");
      assert(!workerButton(kind === "availability" ? "Set busy" : kind === "activation" ? "Mark active" : "Mark inactive").disabled, "Retry available");
    });
    await test(`Worker ${kind} saved with refresh failure keeps new state and warning`, async () => {
      await mount("workers", { failRefresh: true }, { worker: { active: kind !== "activation" } });
      await click(workerButton(kind === "availability" ? "Set busy" : kind === "activation" ? "Mark active" : "Mark inactive"));
      if (kind === "deactivation") await confirm();
      assert(message()?.classList.contains("alert--warning") && message().textContent.includes("change was saved"), "Saved versus refresh warning visible");
      workerButton(kind === "availability" ? "Set available" : kind === "activation" ? "Mark inactive" : "Mark active");
      equal(posts.length, 1, "No automatic mutation retry");
    });
  }
  await test("Hide review contextual dialog, Cancel, and focus restoration", async () => {
    await mount("reviews");
    const trigger = reviewButton("Hide");
    await click(trigger); namedDialog("TIK-001");
    assert(dialog().textContent.includes("Test Customer") && dialog().textContent.includes("Plumbing"), "Review/customer/service context");
    assert(dialog().textContent.includes("become hidden"), "Explains visibility consequence");
    await cancel(); equal(posts.length, 0, "Cancel hide does not moderate");
    equal(document.activeElement, trigger, "Cancel hide returns focus");
  });
  await test("Confirmed hide uses hidden response, one POST, and busy focus restoration", async () => {
    await mount("reviews", { holdMutation: true });
    const trigger = reviewButton("Hide");
    await click(trigger);
    const form = dialog().querySelector("form");
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    contract("/api/admin/reviews/review-1/moderate", { action: "hide" });
    assert(trigger.disabled && trigger.textContent === "Hiding...", "Hiding state");
    await act(async () => release());
    reviewButton("Restore");
    assert(container.querySelector("tbody").textContent.includes("Hidden"), "Backend hidden flag rendered");
    equal(document.activeElement, trigger, "Confirmed hide returns focus after update");
  });
  await test("Restore hidden review is immediate; same-tick duplicate is blocked", async () => {
    await mount("reviews", { holdMutation: true }, { review: { hidden: true } });
    const trigger = reviewButton("Restore");
    await act(async () => { trigger.click(); trigger.click(); });
    assert(!dialog(), "Restore does not require destructive confirmation");
    assert(trigger.textContent === "Restoring...", "Restore busy feedback");
    contract("/api/admin/reviews/review-1/moderate", { action: "restore" });
    await act(async () => release());
    reviewButton("Hide");
  });
  for (const hidden of [false, true]) {
    await test(`Failed review ${hidden ? "restore" : "hide"} preserves visibility`, async () => {
      await mount("reviews", { failMutation: 400, errorPayload: { errors: { action: "Choose hide or restore." } } }, { review: { hidden } });
      await click(reviewButton(hidden ? "Restore" : "Hide"));
      if (!hidden) await confirm();
      assert(message()?.textContent === "Choose hide or restore.", "Backend field error preserved");
      assert(!reviewButton(hidden ? "Restore" : "Hide").disabled, "Failed moderation can retry");
    });
    await test(`Review ${hidden ? "restore" : "hide"} saved with refresh failure`, async () => {
      await mount("reviews", { failRefresh: true }, { review: { hidden } });
      await click(reviewButton(hidden ? "Restore" : "Hide"));
      if (!hidden) await confirm();
      assert(message()?.classList.contains("alert--warning") && message().textContent.includes("change was saved"), "Refresh warning stays visible");
      reviewButton(hidden ? "Hide" : "Restore");
      equal(posts.length, 1, "Saved moderation not repeated automatically");
    });
  }
  for (const status of [401, 403, 404, 409, 422, 500, 503]) await test(`Moderation HTTP ${status} error is surfaced without refresh/retry`, async () => {
    await mount("reviews", { failMutation: status }, { review: { hidden: true } });
    await click(reviewButton("Restore"));
    assert(message()?.getAttribute("role") === "alert", "HTTP error announced");
    equal(posts.length, 1, "No POST retries");
  });
  await test("409 conflict feedback stays contextual and retryable", async () => {
    await mount("workers", { failMutation: 409, errorPayload: { error: "Worker cannot be updated in its current state." } });
    await click(workerButton("Set busy"));
    assert(message()?.textContent.includes("current state"), "Conflict context retained");
    assert(!workerButton("Set busy").disabled, "Retry enabled");
  });
  await test("422 validation stays contextual and retryable", async () => {
    await mount("reviews", { failMutation: 422, errorPayload: { errors: { action: "Choose hide or restore." } } }, { review: { hidden: true } });
    await click(reviewButton("Restore"));
    assert(message()?.textContent === "Choose hide or restore.", "Validation context retained");
    assert(!reviewButton("Restore").disabled, "Retry enabled");
  });
  await test("500 response cannot reveal database or stack details", async () => {
    await mount("reviews", { failMutation: 500, errorPayload: { error: "postgres database_password stack at server.js:1", errors: { action: "SQL SELECT secret" } } }, { review: { hidden: true } });
    await click(reviewButton("Restore"));
    assert(message()?.textContent === "TIKKA is temporarily unavailable. Please try again.", "Safe server failure");
    assert(!/postgres|database_password|server.js|SQL SELECT/.test(container.textContent), "Internal details suppressed");
    assert(!reviewButton("Restore").disabled, "Retry available");
  });
  await test("Network mutation failure leaves worker state unchanged", async () => {
    await mount("workers", { networkFailure: true });
    await click(workerButton("Set busy"));
    assert(message()?.textContent.includes("Unable to reach TIKKA"), "Network feedback");
    workerButton("Set busy");
  });
  await test("Admin lifecycle labels preserve legacy meanings", async () => {
    equal(normalLifecycle, ["NEW", "REVIEWING", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"], "Canonical lifecycle");
    equal(normalLifecycle.map((status) => statusLabel(status, "admin")), ["New", "Under review", "Scheduled", "Assigned", "In progress", "Completed", "Confirmed"], "Legacy admin labels");
    equal(statusLabel("NEW"), "Request Received", "Customer wording unchanged");
    equal(statusLabel("ASSIGNED"), "Technician Assigned", "Customer assignment wording unchanged");
    equal(statusTone("AVAILABLE"), "success", "Available legacy tone");
    equal(statusTone("BUSY"), "scheduled", "Busy legacy tone");
  });
}

main().then(async () => {
  if (root) await act(async () => root.unmount());
  await reportFetch("/results", { method: "POST", body: JSON.stringify({ tests }) });
}).catch((error) => reportFetch("/results", { method: "POST", body: JSON.stringify({ tests, error: error.stack || error.message }) }));
