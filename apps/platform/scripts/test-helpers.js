const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function makeTempDatabase(prefix = "tikka-test-") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    directory,
    dbPath: path.join(directory, "database.json"),
    cleanup() {
      const expectedParent = path.resolve(os.tmpdir());
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), expectedParent, "temporary database must stay directly under the OS temp directory");
      assert(path.basename(resolved).startsWith(prefix), "temporary database prefix changed unexpectedly");
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  };
}

async function listen(server) {
  await server.ready;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function close(server) {
  if (!server.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function request(port, method, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const hasRawBody = Object.prototype.hasOwnProperty.call(options, "rawBody");
    const payload = hasRawBody
      ? options.rawBody
      : Object.prototype.hasOwnProperty.call(options, "body")
        ? JSON.stringify(options.body)
        : null;
    const headers = {
      Accept: "application/json",
      ...(payload !== null ? {
        "Content-Type": options.contentType || "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...options.headers
    };
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"]?.[0]?.split(";")[0] || null;
        const isJson = String(res.headers["content-type"] || "").includes("application/json");
        let body = data;
        if (isJson) {
          try { body = data ? JSON.parse(data) : {}; }
          catch (error) { return reject(new Error(`Expected JSON response for ${method} ${pathname}: ${error.message}`)); }
        }
        resolve({ status: res.statusCode, headers: res.headers, cookie: setCookie, body });
      });
    });
    req.on("error", reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function assertStatus(response, expected, label) {
  assert.equal(response.status, expected, `${label}: response body ${JSON.stringify(response.body)}`);
}

function csrf(token) {
  return { "X-CSRF-Token": token };
}

function futureIso(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = {
  assertStatus,
  close,
  csrf,
  futureIso,
  listen,
  makeTempDatabase,
  request
};
