ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_source TEXT NOT NULL DEFAULT 'provider';

UPDATE users
SET profile_completed_at = COALESCE(profile_completed_at, created_at);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_avatar_source_check;

ALTER TABLE users
  ADD CONSTRAINT users_avatar_source_check
  CHECK (avatar_source IN ('provider', 'custom'));
