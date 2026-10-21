-- PRD §3.1 auth_db 스키마 (SQLite)
-- 타입 규칙: uuid → TEXT, timestamptz → ISO 8601 UTC 텍스트(밀리초, Z), boolean → INTEGER 0/1,
-- text[] / jsonb → JSON 텍스트.

CREATE TABLE IF NOT EXISTS clients (
  client_id         TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  logo_url          TEXT,
  theme_color       TEXT,
  allowed_origins   TEXT NOT NULL CHECK (json_valid(allowed_origins) AND json_type(allowed_origins) = 'array'),
  default_redirect  TEXT NOT NULL,
  auto_provision    INTEGER NOT NULL DEFAULT 1 CHECK (auto_provision IN (0, 1)),
  onboarding_path   TEXT,
  secret_hash       TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS users (
  -- gen_random_uuid() 대응: UUID v4 텍스트
  id              TEXT PRIMARY KEY DEFAULT (
                    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
                    substr(lower(hex(randomblob(2))), 2) || '-' ||
                    substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
                    lower(hex(randomblob(6)))
                  ),
  email           TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  name            TEXT,
  avatar_url      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 값이 있을 때만 유니크 (NULL 중복 허용 + 대소문자 정규화)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS identities (
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_at_link     TEXT,
  linked_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, provider_user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS identities_user_id_idx ON identities (user_id);

CREATE TABLE IF NOT EXISTS memberships (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',
  status        TEXT NOT NULL DEFAULT 'active',
  joined_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at  TEXT,
  PRIMARY KEY (user_id, client_id)
) STRICT;

CREATE INDEX IF NOT EXISTS memberships_client_joined_idx
  ON memberships (client_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS deletion_queue (
  user_id       TEXT PRIMARY KEY,
  requested_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 조회 키는 provider_user_id(=sub). 이메일 조회 금지 규칙은 코드 계층에서 강제.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_client_id TEXT REFERENCES clients(client_id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_user_idx ON admin_audit_log (target_user_id, created_at DESC);
