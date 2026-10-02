const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { build } = require("esbuild"); // Already installed by Vite; no test dependencies.

async function run() {
  const root = path.resolve(__dirname, "../../..");
  const candidates = [process.env.TIKKA_TEST_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
  const browser = candidates.find((file) => fs.existsSync(file));
  if (!browser) throw new Error("React interaction tests need an installed Chromium browser. Set TIKKA_TEST_BROWSER to its executable; no browser is downloaded.");
  for (const file of ["src/services/api.js", "src/services/admin.js", "src/services/csrf.js", "src/features/auth/AdminAuthContext.jsx", "src/pages/AdminPage.jsx"]) {
    if (/localStorage|Bearer\s+/i.test(fs.readFileSync(path.join(root, file), "utf8"))) {
      throw new Error(`${file} must use session cookies, not persisted tokens.`);
    }
  }
  const bundle = await build({
    absWorkingDir: root, entryPoints: ["apps/platform/scripts/test-react-admin.browser.jsx"],
    bundle: true, write: false, platform: "browser", format: "iife",
    define: { "process.env.NODE_ENV": '"development"' }
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tikka-react-admin-test-"));
  let child;
  let timer;
  let complete;
  let fail;
  const result = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  const server = http.createServer((request, response) => {
    if (request.url === "/tests.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      response.end(bundle.outputFiles[0].contents);
    } else if (request.url === "/results" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        try { complete(JSON.parse(body)); } catch (error) { fail(error); }
        response.end("ok");
      });
    } else if (request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end('<!doctype html><html lang="en"><title>TIKKA isolated React tests</title><body><div id="root"></div><script src="/tests.js"></script></body></html>');
    } else { response.writeHead(404); response.end(); }
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, url], { windowsHide: true, stdio: "ignore" });
    child.once("error", fail);
    child.once("exit", (code) => fail(new Error(`Test browser exited before results (code ${code}).`)));
    timer = setTimeout(() => fail(new Error("React browser checks timed out after 45 seconds.")), 45000);
    const report = await result;
    for (const test of report.tests) console.log(`${test.error ? "FAIL" : "PASS"} ${test.name}${test.error ? `: ${test.error}` : ""}`);
    if (report.error || report.tests.some((test) => test.error)) throw new Error(report.error || "React admin interaction checks failed.");
    console.log(`React admin interaction checks passed (${report.tests.length}; StrictMode, mocked APIs, isolated browser).`);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    await new Promise((resolve) => server.close(resolve));
    // Delete only the unique profile created above; never touch a user browser profile.
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith("tikka-react-admin-test-")) {
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch { console.warn(`Temporary browser profile remains at ${profile}`); }
    }
  }
}

module.exports = { run };
