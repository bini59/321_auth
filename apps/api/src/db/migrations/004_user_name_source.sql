ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name_source TEXT NOT NULL DEFAULT 'provider';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_name_source_check;

ALTER TABLE users
  ADD CONSTRAINT users_name_source_check
  CHECK (name_source IN ('provider', 'custom'));
