-- 삭제 큐 확인(ack)은 앱별로 기록한다. 한 앱의 ack 가 다른 앱의 삭제 신호를 지우면 안 된다.
CREATE TABLE IF NOT EXISTS deletion_acks (
  user_id    UUID NOT NULL REFERENCES deletion_queue (user_id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL REFERENCES clients (client_id) ON DELETE CASCADE,
  acked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
