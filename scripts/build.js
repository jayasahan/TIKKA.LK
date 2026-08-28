const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "app.html",
  "provider.html",
  "styles.css",
  "script.js",
  "app.js",
  "provider.js",
  "server.js",
  "package.json"
];
const serverDirectories = ["lib"];
const directories = ["public", "data"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

for (const directory of directories) {
  fs.cpSync(path.join(root, directory), path.join(dist, directory), {
    recursive: true
  });
}

for (const directory of serverDirectories) {
  fs.cpSync(path.join(root, directory), path.join(dist, directory), {
    recursive: true
  });
}

console.log("Build complete: dist/");
