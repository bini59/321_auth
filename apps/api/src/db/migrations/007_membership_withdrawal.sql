-- Withdrawal is independent of administrative suspension.
ALTER TABLE memberships ADD COLUMN withdrawn_at TEXT;
ALTER TABLE memberships ADD COLUMN lifecycle_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN cleanup_id TEXT;
ALTER TABLE memberships ADD COLUMN cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_pending IN (0, 1));
