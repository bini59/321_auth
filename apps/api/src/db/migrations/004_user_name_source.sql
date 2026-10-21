ALTER TABLE users
  ADD COLUMN name_source TEXT NOT NULL DEFAULT 'provider'
  CONSTRAINT users_name_source_check CHECK (name_source IN ('provider', 'custom'));
