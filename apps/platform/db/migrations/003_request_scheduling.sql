DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_requests'
      AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE service_requests ADD COLUMN scheduled_at TIMESTAMPTZ NULL;
  END IF;

  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.service_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status IN%';

  ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;

  IF constraint_name IS NOT NULL AND constraint_name <> 'service_requests_status_check' THEN
    EXECUTE format('ALTER TABLE service_requests DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE service_requests
    ADD CONSTRAINT service_requests_status_check
    CHECK (status IN (
      'NEW',
      'REVIEWING',
      'SCHEDULED',
      'ASSIGNED',
      'ACCEPTED',
      'IN_PROGRESS',
      'COMPLETED',
      'CONFIRMED',
      'CANCELLED',
      'REJECTED'
    ));
END $$;
