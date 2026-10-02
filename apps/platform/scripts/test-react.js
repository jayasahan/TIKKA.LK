const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..", "..");
const platform = path.join(root, "apps", "platform");
const required = [
  "react/index.html",
  "src/main.jsx",
  "src/app/App.jsx",
  "src/app/router.jsx",
  "src/services/api.js",
  "src/services/csrf.js",
  "src/features/auth/CustomerAuthContext.jsx",
  "src/features/auth/AdminAuthContext.jsx",
  "apps/platform/vite.react.config.js"
];
let failed = false;

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing React foundation file: ${relative}`);
    failed = true;
  }
}

const api = fs.readFileSync(path.join(root, "src/services/api.js"), "utf8");
const router = fs.readFileSync(path.join(root, "src/app/router.jsx"), "utf8");
const publicPage = fs.readFileSync(path.join(root, "src/pages/PublicPage.jsx"), "utf8");
const reactHtml = fs.readFileSync(path.join(root, "react/index.html"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(platform, "package.json"), "utf8"));

for (const route of ["/", "/app.html", "/admin-login.html", "/admin.html"]) {
  if (!router.includes(`path: "${route}"`)) {
    console.error(`React router is missing ${route}`);
    failed = true;
  }
}
for (const text of ["credentials: \"include\"", "X-CSRF-Token"]) {
  if (!api.includes(text)) {
    console.error(`React API wrapper is missing ${text}`);
    failed = true;
  }
}
if (/localStorage|Bearer\s+/i.test(api)) {
  console.error("React API wrapper must not use localStorage or bearer tokens");
  failed = true;
}
if (/script\.js|ui\.js/.test(publicPage)) {
  console.error("React public page must not execute the legacy public scripts");
  failed = true;
}
for (const text of ["canonical", "description", "robots", "lang=\"en\""]) {
  if (!reactHtml.includes(text)) {
    console.error(`React document shell is missing ${text} metadata`);
    failed = true;
  }
}
if (!packageJson.scripts.build.includes("build:react") || !packageJson.scripts["build:react"]) {
  console.error("Production build must include the React build");
  failed = true;
}
if (!fs.existsSync(path.join(platform, "dist", "index.html"))) {
  console.warn("dist/ will be created by the production build");
}

if (failed) process.exit(1);
console.log("React foundation checks passed.");
require("./test-react-admin.js").run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
