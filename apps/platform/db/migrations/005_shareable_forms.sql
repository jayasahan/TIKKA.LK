CREATE SEQUENCE IF NOT EXISTS tikka_shareable_form_number_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS shareable_forms (
  id TEXT PRIMARY KEY,
  form_number TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'TIKKA job request',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shareable_forms_enabled
  ON shareable_forms (enabled, created_at DESC);

CREATE TABLE IF NOT EXISTS shareable_form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES shareable_forms(id) ON DELETE CASCADE,
  edit_token TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_category_id TEXT REFERENCES service_categories(id) ON DELETE SET NULL,
  service_name_snapshot TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  preferred_date DATE,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'REVIEWED', 'CONVERTED', 'ARCHIVED')),
  converted_request_id TEXT REFERENCES service_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shareable_form_submissions_form_id
  ON shareable_form_submissions (form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shareable_form_submissions_status
  ON shareable_form_submissions (status, created_at DESC);
