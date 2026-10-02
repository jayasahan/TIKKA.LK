const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checks = [
  [path.join("..", "..", "react", "index.html"), /<main|id="root"/, "React document shell must have an application root"],
  ["styles.css", /:focus-visible/, "styles.css must define visible focus states"],
  ["styles.css", /prefers-reduced-motion/, "styles.css must respect reduced motion"],
  [path.join("..", "..", "src", "pages", "CustomerPage.jsx"), /data|Request a Service|RequestForm/, "React customer surface must remain present"],
  [path.join("..", "..", "src", "pages", "AdminPage.jsx"), /workers|Reviews|Categories/, "React operations surface must remain present"],
  ["server.js", /requireCustomer/, "API must require an authenticated customer"],
  ["server.js", /findCustomerRequestById\([^,]+,\s*auth\.customer\.id\)/, "request access must be scoped to the current customer"],
  ["server.js", /CUSTOMER_CONFIRMABLE_STATUS/, "completion confirmation must enforce status"],
  ["server.js", /This request already has a review/, "review submission must prevent duplicates"],
  ["server.js", /assignWorkerToRequest/, "admin must be able to assign internal workers"],
  ["lib/json-store.js", /Schedule the request before assigning a worker/, "worker assignment must follow scheduling"],
  ["lib/postgres.js", /new Pool/, "PostgreSQL module must use pg connection pooling"],
  ["db/migrations/001_initial_schema.sql", /CREATE TABLE IF NOT EXISTS service_requests/, "initial migration must create service requests"]
];

let failed = false;

for (const [file, pattern, message] of checks) {
  const contents = fs.readFileSync(path.join(root, file), "utf8");
  if (!pattern.test(contents)) {
    console.error(`${file}: ${message}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Lint checks passed.");
