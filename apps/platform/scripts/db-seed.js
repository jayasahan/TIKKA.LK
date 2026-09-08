const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { closePool, query } = require("../lib/postgres");

const servicesPath = path.resolve(__dirname, "..", "data", "services.json");

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

async function seedServiceCategories() {
  const services = JSON.parse(fs.readFileSync(servicesPath, "utf8"));

  for (const service of services) {
    await query(
      `
        INSERT INTO service_categories (id, name, code, icon, description, enabled)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          icon = EXCLUDED.icon,
          description = EXCLUDED.description,
          enabled = true,
          updated_at = now()
      `,
      [
        createId("category"),
        service.name,
        service.code,
        service.icon || service.code,
        service.description
      ]
    );
  }

  console.log("Service category seed complete.");
}

seedServiceCategories()
  .catch((error) => {
    console.error(`Database seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
