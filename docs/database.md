# 데이터베이스 (SQLite)

auth 서버의 데이터는 SQLite 파일 하나(`/var/lib/321-auth/data/auth.db`)에 있다. 운영(Oracle k3s, namespace `auth`)에서는
PVC `authdata`가 이 디렉터리에 마운트된다. 사용자·로그인 수단·앱 클라이언트·회원 자격·삭제 큐·감사 로그와 함께, 예전에
Redis 에 있던 로그인 세션·관리자 세션·OAuth state 도 같은 파일에 있어 컨테이너가 재시작돼도 로그인이 유지된다.
요청 제한(throttler)은 원래부터 프로세스 메모리에 있다.

- 드라이버: Node 내장 `node:sqlite` (WAL, `foreign_keys=ON`, `busy_timeout=5000`)
- 스키마: `apps/api/src/db/migrations/*.sql`. 앱은 기동할 때 마이그레이션을 돌리지 않는다. 운영에서는 Pod 의 init container 가
  `node apps/api/dist/db/migrate.js` 로 순서대로 한 번씩 적용하고, `clients` 가 비어 있으면 앱을 띄우지 않는다.
- 타입 규칙: uuid → TEXT, 시각 → ISO 8601 UTC 텍스트(`2026-10-21T06:14:47.496Z`, `Date#toISOString()` 과 같음),
  boolean → 0/1, `text[]`/`jsonb` → JSON 텍스트. 세션 시각만 epoch 밀리초 정수.
- 앱 인스턴스는 하나만 띄운다 (연결 하나 + 트랜잭션 직렬화 전제). 운영 Deployment 는 replicas 1, `Recreate`.

## 운영 배포·백업·복원 (k3s)

운영 manifest 와 절차는 `bini59/homelab` 의 `apps/auth/auth.yaml`, `apps/auth/README.md` 에 있다. 배포는 그 저장소의 PR 병합이고
(Flux), 이 저장소의 workflow 는 이미지만 만든다. 예전 Docker Compose 명령은 더 이상 운영에 맞지 않는다.

- 백업: CronJob `auth-sqlite-backup` 이 매일 04:30 KST 에 `dist/db/backup.js`(SQLite backup API, 실행 중에도 안전)로
  `authdata/backups/auth-YYYYMMDD.db` 를 남기고 14일치를 유지한다. 수동 백업과 PVC 밖으로 꺼내는 명령은 homelab README 참고.
  `auth.db` 파일만 `cp` 하면 WAL 에 남은 최근 쓰기가 빠질 수 있으니 backup API 를 쓴다.
- 복원: Flux 를 잠시 멈추고(`flux suspend ks apps`) auth-app 을 0으로 내린 뒤, `-wal`/`-shm` 을 지우고 백업 파일을 `auth.db` 로
  덮어쓴다. 명령은 homelab README 참고.

## Postgres/Redis 에서 옮기기 (2026-10-27 완료)

- `apps/api/src/db/export-postgres.sql`: 운영 Postgres 에서 테이블 전체를 JSON 하나로 뽑는다 (읽기 전용).
- `apps/api/dist/db/import-postgres.js <export.json>`: 빈 SQLite 에 한 트랜잭션으로 넣고 행 수와 FK 를 검사한다.
  대상 테이블에 데이터가 있으면 거부한다.
- Redis 세션은 옮기지 않았다. 전환 뒤 사용자는 한 번 다시 로그인한다.

운영 전환은 homelab PR #9 로 끝났다. Postgres·Redis 와 그 PVC 는 롤백용으로 남아 있고, 롤백 절차와 주의점(전환 뒤 SQLite 에만
쓰인 변경)은 homelab `apps/auth/README.md` 에 있다.
