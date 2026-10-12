CREATE TABLE IF NOT EXISTS service_request_attachments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_request_id TEXT REFERENCES service_requests(id) ON DELETE CASCADE,
  cloudinary_public_id TEXT NOT NULL UNIQUE,
  cloudinary_asset_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  width INTEGER,
  height INTEGER,
  format TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attached_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_service_request_attachments_pending ON service_request_attachments (customer_id, created_at) WHERE service_request_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_request_attachments_request ON service_request_attachments (service_request_id, created_at);
