const crypto = require("node:crypto");

const sessions = new Map();
const isProduction = process.env.NODE_ENV === "production";

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, expectedHash] = storedPassword.split(":");
  const actualHash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function createSession(customerId) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, {
    customerId,
    csrfToken: crypto.randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString()
  });
  return sessionId;
}

function createAdminSession(adminId) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, {
    adminId,
    csrfToken: crypto.randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString()
  });
  return sessionId;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function getSession(request) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies.tikka_session;
  const session = sessionId ? sessions.get(sessionId) : null;
  return session ? { id: sessionId, ...session } : null;
}

function getAdminSession(request) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies.tikka_admin_session;
  const session = sessionId ? sessions.get(sessionId) : null;
  return session && session.adminId ? { id: sessionId, ...session } : null;
}

function cookieAttributes(maxAge) {
  return [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(isProduction ? ["Secure"] : [])
  ].join("; ");
}

function sessionCookie(sessionId) {
  return `tikka_session=${encodeURIComponent(sessionId)}; ${cookieAttributes(604800)}`;
}

function clearSessionCookie() {
  return `tikka_session=; ${cookieAttributes(0)}`;
}

function adminSessionCookie(sessionId) {
  return `tikka_admin_session=${encodeURIComponent(sessionId)}; ${cookieAttributes(604800)}`;
}

function clearAdminSessionCookie() {
  return `tikka_admin_session=; ${cookieAttributes(0)}`;
}

function resetSessions() {
  sessions.clear();
}

module.exports = {
  adminSessionCookie,
  clearAdminSessionCookie,
  clearSessionCookie,
  createAdminSession,
  createSession,
  destroySession,
  getAdminSession,
  getSession,
  hashPassword,
  resetSessions,
  sessionCookie,
  verifyPassword
};
