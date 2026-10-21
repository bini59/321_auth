# 데이터베이스 (SQLite)

auth 서버의 데이터는 SQLite 파일 하나(`/var/lib/321-auth/data/auth.db`, docker 볼륨 `authdata`)에 있다.
사용자·로그인 수단·앱 클라이언트·회원 자격·삭제 큐·감사 로그와 함께, 예전에 Redis 에 있던
로그인 세션·관리자 세션·OAuth state 도 같은 파일에 있어 컨테이너가 재시작돼도 로그인이 유지된다.
요청 제한(throttler)은 원래부터 프로세스 메모리에 있다.

- 드라이버: Node 내장 `node:sqlite` (WAL, `foreign_keys=ON`, `busy_timeout=5000`)
- 스키마: `apps/api/src/db/migrations/*.sql` — 배포 때 `node apps/api/dist/db/migrate.js` 가 순서대로 한 번씩 적용
- 타입 규칙: uuid → TEXT, 시각 → ISO 8601 UTC 텍스트(`2026-10-21T06:14:47.496Z`, `Date#toISOString()` 과 같음),
  boolean → 0/1, `text[]`/`jsonb` → JSON 텍스트. 세션 시각만 epoch 밀리초 정수.
- 앱 인스턴스는 하나만 띄운다 (연결 하나 + 트랜잭션 직렬화 전제).

## 백업

실행 중에도 안전한 온라인 백업이다 (`sqlite3 .backup` 과 같은 SQLite backup API).

```bash
cd /home/ubuntu/03_personal/321_auth
mkdir -p ~/backup/321_auth
docker compose exec -T auth-app node apps/api/dist/db/backup.js /tmp/auth-backup.db
docker compose cp auth-app:/tmp/auth-backup.db ~/backup/321_auth/auth-$(date +%F).db
docker compose exec -T auth-app rm /tmp/auth-backup.db
```

호스트에 `sqlite3` 가 있으면 볼륨 파일에서 바로 떠도 된다.

```bash
sudo sqlite3 "$(docker volume inspect -f '{{.Mountpoint}}' 321_auth_authdata)/auth.db" \
  ".backup '/home/ubuntu/backup/321_auth/auth-$(date +%F).db'"
```

매일 백업은 위 세 줄을 cron 에 넣는다 (`%` 는 cron 에서 `\%` 로 이스케이프).
`auth.db` 파일만 `cp` 하면 WAL 에 남은 최근 쓰기가 빠질 수 있으니 위 방법을 쓴다.

## 복원

```bash
cd /home/ubuntu/03_personal/321_auth
docker compose stop auth-app
docker compose run --rm -v ~/backup/321_auth:/restore:ro --entrypoint sh auth-app -c \
  'rm -f /var/lib/321-auth/data/auth.db-wal /var/lib/321-auth/data/auth.db-shm && cp /restore/auth-YYYY-MM-DD.db /var/lib/321-auth/data/auth.db'
docker compose up -d auth-app --wait
```

## Postgres/Redis 에서 옮기기 (1회)

- `apps/api/src/db/export-postgres.sql`: 운영 Postgres 에서 테이블 전체를 JSON 하나로 뽑는다 (읽기 전용).
- `apps/api/dist/db/import-postgres.js <export.json>`: 빈 SQLite 에 한 트랜잭션으로 넣고 행 수와 FK 를 검사한다.
  대상 테이블에 데이터가 있으면 거부한다.
- Redis 세션은 옮기지 않는다. 전환 뒤 사용자는 한 번 다시 로그인한다.

전체 절차(백업 → 내보내기 → 가져오기 → 배포 → 확인 → 롤백)는 이 전환 PR 설명의 runbook 을 따른다.
배포 workflow 는 SQLite 에 `clients` 행이 없으면 재기동 전에 멈춘다.
