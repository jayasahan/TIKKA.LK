const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const serverFiles = ["server.js", "package.json"];

// Vite has already produced the sole frontend output in dist/. Add only the
// Node runtime packaging required when that directory is deployed.
fs.mkdirSync(dist, { recursive: true });
for (const file of serverFiles) fs.copyFileSync(path.join(root, file), path.join(dist, file));
for (const directory of ["lib", "db"]) {
  fs.cpSync(path.join(root, directory), path.join(dist, directory), { recursive: true, force: true });
}
console.log("Build complete: React dist/ plus Node runtime.");
