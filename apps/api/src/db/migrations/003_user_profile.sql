ALTER TABLE users ADD COLUMN profile_completed_at TEXT;

ALTER TABLE users
  ADD COLUMN avatar_source TEXT NOT NULL DEFAULT 'provider'
  CONSTRAINT users_avatar_source_check CHECK (avatar_source IN ('provider', 'custom'));

UPDATE users
SET profile_completed_at = COALESCE(profile_completed_at, created_at);
