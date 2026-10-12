require("dotenv").config({ path: require("node:path").resolve(__dirname, "..", "..", "..", ".env"), quiet: true });

const assert = require("node:assert/strict");
const test = require("node:test");
const { bindUploadMetadata, createUploadSignature, getConfig } = require("../lib/cloudinary");

test("TIKKA Cloudinary configuration is present and signs isolated uploads", () => {
  const config = getConfig();
  assert.equal(config.configured, true, "Set all TIKKA_CLOUDINARY_* variables in .env or the deployment environment.");
  assert.ok(config.folder.startsWith("tikka/"), "Cloudinary assets must stay in the TIKKA folder.");

  const signature = createUploadSignature("customer_test", "upload_0123456789abcdef");
  assert.match(signature.signature, /^[a-f0-9]{40}$/);
  assert.equal(signature.uploadParams.type, "authenticated");
  assert.equal(signature.uploadParams.transformation, "c_limit,w_1600,h_1200,q_auto");
  assert.ok(signature.publicId.startsWith(`${config.folder}/customer_test/upload_`));
  const completed = bindUploadMetadata({ publicId: signature.publicId }, { publicId: "browser-controlled-value", bytes: 1024 });
  assert.equal(completed.publicId, signature.publicId);
  assert.equal(signature.maxBytes, 8 * 1024 * 1024);
});
