require("dotenv").config({ path: require("node:path").resolve(process.cwd(), ".env") });

const { destroyAsset, getConfig } = require("../lib/cloudinary");
const { createStorage } = require("../lib/storage");
const { closePool } = require("../lib/postgres");

async function main() {
  if (!getConfig().configured) throw new Error("Cloudinary is not configured.");
  const store = createStorage();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const orphaned = await store.listOrphanAttachments(cutoff);
  let removed = 0;
  for (const attachment of orphaned) {
    try {
      await destroyAsset(attachment.publicId);
      await store.removeAttachment(attachment.id);
      removed += 1;
    } catch (error) {
      console.error(`Failed to clean ${attachment.publicId}: ${error.message}`);
    }
  }
  console.log(`Cloudinary cleanup complete: ${removed}/${orphaned.length} orphaned uploads removed.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
