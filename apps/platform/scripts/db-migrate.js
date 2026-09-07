const fs = require("node:fs");
const path = require("node:path");
const { closePool, getPool } = require("../lib/postgres");

const migrationsDir = path.resolve(__dirname, "..", "db", "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(client) {
  const result = await client.query("SELECT filename FROM schema_migrations");
  return new Set(result.rows.map((row) => row.filename));
}

async function runMigration(client, filename) {
  const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    await client.query("COMMIT");
    console.log(`Applied migration: ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await appliedMigrations(client);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (!applied.has(file)) {
        await runMigration(client, file);
      }
    }

    console.log("Database migrations complete.");
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((error) => {
  console.error(`Database migration failed: ${error.message}`);
  process.exit(1);
});
