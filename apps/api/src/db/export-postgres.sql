-- 운영 Postgres → SQLite 이전용 내보내기. 사람이 운영 서버에서 실행한다 (docs/database.md 참고).
--   docker exec -i 321_auth-postgres-1 psql -qAt -U auth_svc -d auth_db < export-postgres.sql > auth-export.json
-- 결과는 테이블별 JSON 배열 하나. 세션/OAuth state(Redis)는 옮기지 않는다 (전환 후 한 번 다시 로그인).
SET TIME ZONE 'UTC';
SELECT json_build_object(
  'exported_at', now(),
  'clients',         COALESCE((SELECT json_agg(t ORDER BY t.client_id) FROM clients t), '[]'::json),
  'users',           COALESCE((SELECT json_agg(t ORDER BY t.created_at, t.id) FROM users t), '[]'::json),
  'identities',      COALESCE((SELECT json_agg(t ORDER BY t.linked_at) FROM identities t), '[]'::json),
  'memberships',     COALESCE((SELECT json_agg(t ORDER BY t.joined_at) FROM memberships t), '[]'::json),
  'deletion_queue',  COALESCE((SELECT json_agg(t ORDER BY t.requested_at) FROM deletion_queue t), '[]'::json),
  'deletion_acks',   COALESCE((SELECT json_agg(t ORDER BY t.acked_at) FROM deletion_acks t), '[]'::json),
  'admin_audit_log', COALESCE((SELECT json_agg(t ORDER BY t.id) FROM admin_audit_log t), '[]'::json)
)::text;
