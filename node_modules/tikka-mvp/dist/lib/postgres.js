const path = require("node:path");
const { Pool } = require("pg");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", "..", ".env"),
  quiet: true
});

let pool;

function databaseUrl() {
  return process.env.DATABASE_URL || "";
}

function sslConfig() {
  const sslMode = (process.env.PGSSLMODE || "").toLowerCase();

  if (sslMode === "disable") {
    return false;
  }

  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }

  if (process.env.NODE_ENV === "production") {
    return { rejectUnauthorized: false };
  }

  return false;
}

function createPool() {
  const connectionString = databaseUrl();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL operations.");
  }

  return new Pool({
    connectionString,
    ssl: sslConfig()
  });
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  closePool,
  getPool,
  query
};
