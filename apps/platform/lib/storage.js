const { createJsonStore } = require("./json-store");
const { createPostgresStore } = require("./postgres-store");

function createStorage(options = {}) {
  const defaultDriver = process.env.NODE_ENV === "production" ? "postgres" : "json";
  const driver = (options.driver || process.env.TIKKA_STORAGE_DRIVER || defaultDriver).trim().toLowerCase();

  if (driver === "json") {
    return createJsonStore({ dbPath: options.dbPath });
  }

  if (driver === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when TIKKA_STORAGE_DRIVER=postgres.");
    }
    return createPostgresStore();
  }

  throw new Error(`Unsupported TIKKA_STORAGE_DRIVER value: ${driver}. Use json or postgres.`);
}

module.exports = {
  createStorage
};
