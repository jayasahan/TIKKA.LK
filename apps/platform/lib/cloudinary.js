const crypto = require("node:crypto");

const MAX_UPLOADS = 6;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const INCOMING_TRANSFORMATION = "c_limit,w_1600,h_1200,q_auto";

function getConfig() {
  const cloudName = String(process.env.TIKKA_CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.TIKKA_CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.TIKKA_CLOUDINARY_API_SECRET || "").trim();
  const folder = String(process.env.TIKKA_CLOUDINARY_FOLDER || "tikka/requests").trim();
  return { cloudName, apiKey, apiSecret, folder, configured: Boolean(cloudName && apiKey && apiSecret) };
}

function requireConfig() {
  const config = getConfig();
  if (!config.configured) throw new Error("Cloudinary is not configured. Set the TIKKA_CLOUDINARY_* environment variables.");
  return config;
}

function signParams(params, secret) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`)
    .join("&");
  return crypto.createHash("sha1").update(`${serialized}${secret}`).digest("hex");
}

function createUploadSignature(customerId, uploadId) {
  const config = requireConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${config.folder}/${customerId}/${uploadId}`;
  const params = { access_mode: "authenticated", public_id: publicId, timestamp, transformation: INCOMING_TRANSFORMATION, type: "authenticated" };
  return { cloudName: config.cloudName, apiKey: config.apiKey, timestamp, signature: signParams(params, config.apiSecret), publicId, uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, uploadParams: params, maxBytes: MAX_BYTES, allowedMimeTypes: [...ALLOWED_MIME_TYPES] };
}

function signedDeliveryUrl(publicId, format = "jpg") {
  const config = requireConfig();
  const signature = crypto.createHash("sha1").update(`${publicId}${config.apiSecret}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 8);
  return `https://res.cloudinary.com/${config.cloudName}/image/authenticated/s--${signature}--/${publicId}.${format || "jpg"}`;
}

async function destroyAsset(publicId) {
  if (!publicId) return;
  const config = requireConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp, type: "authenticated" }, config.apiSecret);
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), type: "authenticated", api_key: config.apiKey, signature });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`, { method: "POST", body });
  if (!response.ok) throw new Error(`Cloudinary cleanup failed with status ${response.status}.`);
}

function validateUploadMetadata(value) {
  const errors = {};
  if (!value || typeof value !== "object") return { errors: { photo: "Invalid photo metadata." } };
  if (typeof value.uploadId !== "string" || !/^upload_[a-f0-9]+$/.test(value.uploadId)) errors.uploadId = "Invalid upload reference.";
  if (typeof value.publicId !== "string" || value.publicId.length > 255) errors.publicId = "Invalid Cloudinary asset reference.";
  if (!ALLOWED_MIME_TYPES.has(value.mimeType)) errors.mimeType = "Only JPG, PNG, and WebP images are allowed.";
  if (!Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_BYTES) errors.bytes = "Each image must be 8 MB or smaller.";
  if (typeof value.fileName !== "string" || value.fileName.trim().length > 180) errors.fileName = "Invalid image filename.";
  return { errors };
}

module.exports = { ALLOWED_MIME_TYPES, INCOMING_TRANSFORMATION, MAX_BYTES, MAX_UPLOADS, createUploadSignature, destroyAsset, getConfig, signedDeliveryUrl, validateUploadMetadata };
