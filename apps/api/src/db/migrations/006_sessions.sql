-- Redis 에 있던 단기 상태. 프로세스가 재시작돼도 로그인이 유지되도록 같은 파일에 둔다.
-- 시각은 epoch 밀리초 (Redis 시절 createdAt/lastSeenAt 과 같은 값).

CREATE TABLE IF NOT EXISTS sessions (
  sid           TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  ua            TEXT NOT NULL DEFAULT '',
  ip            TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  sid         TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  ua          TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions (expires_at);

-- OAuth state 는 1회 소비 (DELETE ... RETURNING 으로 Redis GETDEL 과 같은 의미)
CREATE TABLE IF NOT EXISTS oauth_states (
  state       TEXT PRIMARY KEY,
  payload     TEXT NOT NULL CHECK (json_valid(payload)),
  expires_at  INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);
