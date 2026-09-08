CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_area TEXT,
  notes TEXT,
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (availability_status IN ('AVAILABLE', 'BUSY', 'UNAVAILABLE')),
  active BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC(2,1),
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_skills (
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  PRIMARY KEY (worker_id, skill)
);

CREATE TABLE IF NOT EXISTS worker_services (
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  service_category_id TEXT NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (worker_id, service_category_id)
);

CREATE INDEX IF NOT EXISTS idx_workers_active ON workers (active);
CREATE INDEX IF NOT EXISTS idx_workers_availability ON workers (availability_status);
CREATE INDEX IF NOT EXISTS idx_worker_services_category ON worker_services (service_category_id);

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS assigned_worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_requests_assigned_worker_id ON service_requests (assigned_worker_id);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_worker_id ON reviews (worker_id);

INSERT INTO workers (id, name, phone, service_area, notes, rating, completed_jobs)
SELECT p.id, p.name, p.phone, p.service_area, p.description, p.rating, p.completed_jobs
FROM providers p
ON CONFLICT (id) DO NOTHING;

INSERT INTO worker_skills (worker_id, skill)
SELECT ps.provider_id, ps.skill
FROM provider_skills ps
JOIN workers w ON w.id = ps.provider_id
ON CONFLICT DO NOTHING;

INSERT INTO worker_services (worker_id, service_category_id)
SELECT psvc.provider_id, psvc.service_category_id
FROM provider_services psvc
JOIN workers w ON w.id = psvc.provider_id
ON CONFLICT DO NOTHING;

UPDATE service_requests sr
SET assigned_worker_id = sr.provider_id
WHERE sr.assigned_worker_id IS NULL
  AND sr.provider_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM workers w WHERE w.id = sr.provider_id);

UPDATE reviews r
SET worker_id = r.provider_id
WHERE r.worker_id IS NULL
  AND r.provider_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM workers w WHERE w.id = r.provider_id);
