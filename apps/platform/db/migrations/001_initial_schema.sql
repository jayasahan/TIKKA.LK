CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_categories_enabled
  ON service_categories (enabled);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  profile_image_url TEXT,
  service_area TEXT NOT NULL,
  description TEXT NOT NULL,
  experience_years INTEGER NOT NULL CHECK (experience_years BETWEEN 0 AND 80),
  qualifications TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'REGISTERED'
    CHECK (state IN ('REGISTERED', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'DISABLED')),
  rating NUMERIC(2, 1),
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  verification_submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_admin_id TEXT,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_providers_state
  ON providers (state);

CREATE INDEX IF NOT EXISTS idx_providers_service_area
  ON providers (service_area);

CREATE TABLE IF NOT EXISTS provider_skills (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  PRIMARY KEY (provider_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_provider_skills_skill
  ON provider_skills (skill);

CREATE TABLE IF NOT EXISTS provider_services (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_category_id TEXT NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (provider_id, service_category_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_services_service_category_id
  ON provider_services (service_category_id);

CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_category_id TEXT REFERENCES service_categories(id) ON DELETE SET NULL,
  service_name_snapshot TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  service_address TEXT NOT NULL,
  preferred_date DATE,
  preferred_time TIME,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'REVIEWING', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CONFIRMED', 'CANCELLED', 'REJECTED')),
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  assigned_by_admin_id TEXT,
  assigned_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_admin_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_customer_id
  ON service_requests (customer_id);

CREATE INDEX IF NOT EXISTS idx_service_requests_provider_id
  ON service_requests (provider_id);

CREATE INDEX IF NOT EXISTS idx_service_requests_status_submitted_at
  ON service_requests (status, submitted_at);

CREATE INDEX IF NOT EXISTS idx_service_requests_service_category_id
  ON service_requests (service_category_id);

CREATE TABLE IF NOT EXISTS service_request_photos (
  id TEXT PRIMARY KEY,
  service_request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_request_photos_service_request_id
  ON service_request_photos (service_request_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_provider_id
  ON reviews (provider_id);

CREATE INDEX IF NOT EXISTS idx_reviews_customer_id
  ON reviews (customer_id);

CREATE INDEX IF NOT EXISTS idx_reviews_hidden_submitted_at
  ON reviews (hidden, submitted_at);

CREATE TABLE IF NOT EXISTS review_moderation_events (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  admin_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('hide', 'restore')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_moderation_events_review_id
  ON review_moderation_events (review_id);

CREATE INDEX IF NOT EXISTS idx_review_moderation_events_created_at
  ON review_moderation_events (created_at);
