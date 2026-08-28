const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checks = [
  ["index.html", /<main id="main">/, "index.html must include a main landmark"],
  ["app.html", /<main id="main">/, "app.html must include a main landmark"],
  ["provider.html", /<main id="main">/, "provider.html must include a main landmark"],
  ["index.html", /alt="TIKKA logo"/, "logo image must include alt text"],
  ["app.html", /data-request-form/, "customer request form must exist"],
  ["provider.html", /data-provider-auth-form/, "provider registration form must exist"],
  ["provider.html", /data-provider-jobs/, "provider dashboard must exist"],
  ["app.html", /type="file"/, "optional photo input must exist"],
  ["index.html", /aria-label="Primary navigation"/, "primary navigation needs an aria label"],
  ["app.html", /aria-label="Primary navigation"/, "customer navigation needs an aria label"],
  ["provider.html", /aria-label="Primary navigation"/, "provider navigation needs an aria label"],
  ["styles.css", /:focus-visible/, "styles.css must define visible focus states"],
  ["styles.css", /prefers-reduced-motion/, "styles.css must respect reduced motion"],
  ["script.js", /aria-expanded/, "mobile navigation must update aria-expanded"],
  ["server.js", /requireCustomer/, "API must require an authenticated customer"],
  ["server.js", /customerId === auth\.customer\.id/, "request access must be scoped to the current customer"],
  ["server.js", /CUSTOMER_CONFIRMABLE_STATUS/, "completion confirmation must enforce status"],
  ["server.js", /duplicate/, "review submission must prevent duplicates"],
  ["server.js", /requireProvider/, "provider routes must require provider authentication"],
  ["server.js", /providerId === auth\.provider\.id/, "provider jobs must be scoped to the assigned provider"],
  ["server.js", /Only approved providers can be assigned jobs/, "assignment must require approved providers"]
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
