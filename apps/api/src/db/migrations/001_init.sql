-- PRD §3.1 auth_db 스키마

CREATE TABLE IF NOT EXISTS clients (
  client_id         TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  logo_url          TEXT,
  theme_color       TEXT,
  allowed_origins   TEXT[] NOT NULL,
  default_redirect  TEXT NOT NULL,
  auto_provision    BOOLEAN NOT NULL DEFAULT true,
  onboarding_path   TEXT,
  secret_hash       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  name            TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 값이 있을 때만 유니크 (NULL 중복 허용 + 대소문자 정규화)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS identities (
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_at_link     TEXT,
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS identities_user_id_idx ON identities (user_id);

CREATE TABLE IF NOT EXISTS memberships (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',
  status        TEXT NOT NULL DEFAULT 'active',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS memberships_client_joined_idx
  ON memberships (client_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS deletion_queue (
  user_id       UUID PRIMARY KEY,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 조회 키는 provider_user_id(=sub). 이메일 조회 금지 규칙은 코드 계층에서 강제.
